import * as StellarSdk from '@stellar/stellar-sdk';
import { signTransaction as signWithWallet } from './wallet';
import { sacContractId } from './assets';

const RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
const CONTRACT_ID = process.env.NEXT_PUBLIC_DONATION_CONTRACT_ID;
const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;
// Stellar's network targets a ~5s ledger close time; used only to translate
// a subscription's charge interval into an approval expiration window.
const APPROX_SECONDS_PER_LEDGER = 5;

const server = new StellarSdk.rpc.Server(RPC_URL);

// Error types the UI can distinguish between:
// - 'wallet'     wallet not connected / user rejected or failed to sign
// - 'simulation' bad input, insufficient balance, contract precondition failure
// - 'network'    RPC/network unreachable, submission or confirmation failure
export class DonationError extends Error {
  constructor(type, message, cause) {
    super(message);
    this.type = type;
    this.cause = cause;
  }
}

/**
 * Shared build → simulate → sign → submit → poll pipeline for a single
 * contract invocation, used by every function below. Centralizes the
 * status-callback stages and error typing so `sendDonation`, `subscribe`,
 * `approveAllowance`, and `cancelSubscription` all fail the same way.
 *
 * @param {object} params
 * @param {string} params.contractId defaults to the donation contract
 * @param {string} params.method
 * @param {unknown[]} params.args pre-built ScVal arguments
 * @param {string} params.signerAddress
 * @param {(status: string) => void} [params.onStatus]
 * @returns {Promise<{ hash: string, returnValue: unknown }>}
 */
async function callContract({ contractId = CONTRACT_ID, method, args, signerAddress, onStatus }) {
  if (!contractId) {
    throw new DonationError(
      'simulation',
      'Donation contract is not configured (missing NEXT_PUBLIC_DONATION_CONTRACT_ID).'
    );
  }

  onStatus?.('building');

  let account;
  try {
    account = await server.getAccount(signerAddress);
  } catch (err) {
    throw new DonationError(
      'network',
      'Could not load your account from the Stellar network. Check your connection and try again.',
      err
    );
  }

  const contract = new StellarSdk.Contract(contractId);

  let tx;
  try {
    tx = new StellarSdk.TransactionBuilder(account, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(60)
      .build();
  } catch (err) {
    throw new DonationError('simulation', `Failed to build the ${method} transaction.`, err);
  }

  onStatus?.('simulating');

  let prepared;
  try {
    prepared = await server.prepareTransaction(tx);
  } catch (err) {
    const message = /insufficient|underfunded/i.test(err?.message || '')
      ? 'Insufficient balance or allowance to complete this action.'
      : err?.message || 'The transaction could not be simulated. Check the amount and try again.';
    throw new DonationError('simulation', message, err);
  }

  onStatus?.('awaiting-signature');

  let signedResult;
  try {
    signedResult = await signWithWallet(prepared.toXDR(), signerAddress);
  } catch (err) {
    throw new DonationError(
      'wallet',
      'Signing was cancelled or failed. Please approve the transaction in your wallet.',
      err
    );
  }

  const signedTx = StellarSdk.TransactionBuilder.fromXDR(
    signedResult.signedTxXdr,
    NETWORK_PASSPHRASE
  );

  onStatus?.('submitting');

  let sendResponse;
  try {
    sendResponse = await server.sendTransaction(signedTx);
  } catch (err) {
    throw new DonationError('network', 'Failed to submit the transaction to the network.', err);
  }

  if (sendResponse.status === 'ERROR') {
    throw new DonationError('network', 'The network rejected the transaction.', sendResponse);
  }

  onStatus?.('pending');

  const hash = sendResponse.hash;
  let getResponse = await server.getTransaction(hash);
  const start = Date.now();
  while (getResponse.status === 'NOT_FOUND' && Date.now() - start < 30000) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    getResponse = await server.getTransaction(hash);
  }

  if (getResponse.status === 'SUCCESS') {
    onStatus?.('success');
    const returnValue = getResponse.returnValue
      ? StellarSdk.scValToNative(getResponse.returnValue)
      : undefined;
    return { hash, returnValue };
  }

  if (getResponse.status === 'NOT_FOUND') {
    throw new DonationError(
      'network',
      'Timed out waiting for confirmation. Check Stellar Explorer for the latest status.',
      { hash }
    );
  }

  throw new DonationError('network', 'Transaction failed on the network.', getResponse);
}

/**
 * Calls the deployed `donate` Soroban contract, which both transfers the
 * donated XLM from donor to creator and records the donation on-chain.
 *
 * @param {object} params
 * @param {string} params.donorAddress
 * @param {string} params.creatorAddress
 * @param {string|number} params.amount amount in whole units of the asset
 * @param {string} [params.assetCode] 'XLM' (default) or 'USDC'
 * @param {string} params.memo
 * @param {(status: string) => void} [params.onStatus] called with
 *   'building' | 'simulating' | 'awaiting-signature' | 'submitting' | 'pending' | 'success'
 * @returns {Promise<{ hash: string }>}
 */
export async function sendDonation({ donorAddress, creatorAddress, amount, assetCode = 'XLM', memo, onStatus }) {
  let tokenId;
  try {
    tokenId = sacContractId(assetCode);
  } catch (err) {
    throw new DonationError('simulation', err.message, err);
  }
  const amountStroops = BigInt(Math.round(parseFloat(amount) * 1e7));

  const { hash } = await callContract({
    method: 'donate',
    signerAddress: donorAddress,
    args: [
      StellarSdk.nativeToScVal(donorAddress, { type: 'address' }),
      StellarSdk.nativeToScVal(creatorAddress, { type: 'address' }),
      StellarSdk.nativeToScVal(tokenId, { type: 'address' }),
      StellarSdk.nativeToScVal(amountStroops, { type: 'i128' }),
      StellarSdk.nativeToScVal(memo || '', { type: 'string' }),
    ],
    onStatus,
  });

  return { hash };
}

/**
 * Grants the donation contract a SAC allowance so `charge_subscription` can
 * later draw `amount` per interval via `transfer_from`, without a fresh
 * wallet signature for every charge. Approves enough for `periodsToApprove`
 * charges at once (default 12); once it runs low the supporter can approve
 * again from the Subscriptions page.
 *
 * @param {object} params
 * @param {string} params.supporterAddress
 * @param {string|number} params.amount amount charged per interval, in whole units
 * @param {string} [params.assetCode] 'XLM' (default) or 'USDC'
 * @param {number} params.intervalSecs seconds between charges
 * @param {number} [params.periodsToApprove] how many charges' worth of allowance to grant (default 12)
 * @param {(status: string) => void} [params.onStatus]
 * @returns {Promise<{ hash: string }>}
 */
export async function approveAllowance({
  supporterAddress,
  amount,
  assetCode = 'XLM',
  intervalSecs,
  periodsToApprove = 12,
  onStatus,
}) {
  let tokenId;
  try {
    tokenId = sacContractId(assetCode);
  } catch (err) {
    throw new DonationError('simulation', err.message, err);
  }
  if (!CONTRACT_ID) {
    throw new DonationError(
      'simulation',
      'Donation contract is not configured (missing NEXT_PUBLIC_DONATION_CONTRACT_ID).'
    );
  }

  let latestLedger;
  try {
    ({ sequence: latestLedger } = await server.getLatestLedger());
  } catch (err) {
    throw new DonationError('network', 'Could not read the current ledger from the network.', err);
  }

  const expirationLedger =
    latestLedger + Math.ceil((intervalSecs * periodsToApprove) / APPROX_SECONDS_PER_LEDGER);
  const amountStroops = BigInt(Math.round(parseFloat(amount) * periodsToApprove * 1e7));

  const { hash } = await callContract({
    contractId: tokenId,
    method: 'approve',
    signerAddress: supporterAddress,
    args: [
      StellarSdk.nativeToScVal(supporterAddress, { type: 'address' }),
      StellarSdk.nativeToScVal(CONTRACT_ID, { type: 'address' }),
      StellarSdk.nativeToScVal(amountStroops, { type: 'i128' }),
      StellarSdk.nativeToScVal(expirationLedger, { type: 'u32' }),
    ],
    onStatus,
  });

  return { hash };
}

/**
 * Starts a recurring donation by calling the donation contract's
 * `subscribe`. Must be called after `approveAllowance` has granted a
 * sufficient allowance — `subscribe` only records the schedule, it does
 * not move funds.
 *
 * @param {object} params
 * @param {string} params.supporterAddress
 * @param {string} params.creatorAddress
 * @param {string|number} params.amount amount charged per interval, in whole units
 * @param {string} [params.assetCode] 'XLM' (default) or 'USDC'
 * @param {number} params.intervalSecs seconds between charges
 * @param {(status: string) => void} [params.onStatus]
 * @returns {Promise<{ hash: string, subscriptionId: number }>}
 */
export async function subscribe({
  supporterAddress,
  creatorAddress,
  amount,
  assetCode = 'XLM',
  intervalSecs,
  onStatus,
}) {
  let tokenId;
  try {
    tokenId = sacContractId(assetCode);
  } catch (err) {
    throw new DonationError('simulation', err.message, err);
  }
  const amountStroops = BigInt(Math.round(parseFloat(amount) * 1e7));

  const { hash, returnValue } = await callContract({
    method: 'subscribe',
    signerAddress: supporterAddress,
    args: [
      StellarSdk.nativeToScVal(supporterAddress, { type: 'address' }),
      StellarSdk.nativeToScVal(creatorAddress, { type: 'address' }),
      StellarSdk.nativeToScVal(tokenId, { type: 'address' }),
      StellarSdk.nativeToScVal(amountStroops, { type: 'i128' }),
      StellarSdk.nativeToScVal(BigInt(intervalSecs), { type: 'u64' }),
    ],
    onStatus,
  });

  return { hash, subscriptionId: returnValue != null ? Number(returnValue) : undefined };
}

/**
 * Cancels a recurring donation via the donation contract's
 * `cancel_subscription`, which also zeroes the remaining on-chain
 * allowance in the same transaction.
 *
 * @param {object} params
 * @param {string} params.supporterAddress
 * @param {number} params.subscriptionId
 * @param {(status: string) => void} [params.onStatus]
 * @returns {Promise<{ hash: string }>}
 */
export async function cancelSubscription({ supporterAddress, subscriptionId, onStatus }) {
  const { hash } = await callContract({
    method: 'cancel_subscription',
    signerAddress: supporterAddress,
    args: [
      StellarSdk.nativeToScVal(supporterAddress, { type: 'address' }),
      StellarSdk.nativeToScVal(BigInt(subscriptionId), { type: 'u64' }),
    ],
    onStatus,
  });

  return { hash };
}
