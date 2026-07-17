import * as StellarSdk from '@stellar/stellar-sdk';
import { signTransaction as signWithWallet } from './wallet';
import { sacContractId } from './assets';

const RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
const CONTRACT_ID = process.env.NEXT_PUBLIC_DONATION_CONTRACT_ID;
const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;

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
  if (!CONTRACT_ID) {
    throw new DonationError(
      'simulation',
      'Donation contract is not configured (missing NEXT_PUBLIC_DONATION_CONTRACT_ID).'
    );
  }

  onStatus?.('building');

  let account;
  try {
    account = await server.getAccount(donorAddress);
  } catch (err) {
    throw new DonationError(
      'network',
      'Could not load your account from the Stellar network. Check your connection and try again.',
      err
    );
  }

  let tokenId;
  try {
    tokenId = sacContractId(assetCode);
  } catch (err) {
    throw new DonationError('simulation', err.message, err);
  }
  const amountStroops = BigInt(Math.round(parseFloat(amount) * 1e7));
  const contract = new StellarSdk.Contract(CONTRACT_ID);

  let tx;
  try {
    tx = new StellarSdk.TransactionBuilder(account, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        contract.call(
          'donate',
          StellarSdk.nativeToScVal(donorAddress, { type: 'address' }),
          StellarSdk.nativeToScVal(creatorAddress, { type: 'address' }),
          StellarSdk.nativeToScVal(tokenId, { type: 'address' }),
          StellarSdk.nativeToScVal(amountStroops, { type: 'i128' }),
          StellarSdk.nativeToScVal(memo || '', { type: 'string' })
        )
      )
      .setTimeout(60)
      .build();
  } catch (err) {
    throw new DonationError('simulation', 'Failed to build the donation transaction.', err);
  }

  onStatus?.('simulating');

  let prepared;
  try {
    prepared = await server.prepareTransaction(tx);
  } catch (err) {
    const message = /insufficient|underfunded/i.test(err?.message || '')
      ? 'Insufficient balance to complete this donation.'
      : err?.message || 'The transaction could not be simulated. Check the amount and try again.';
    throw new DonationError('simulation', message, err);
  }

  onStatus?.('awaiting-signature');

  let signedResult;
  try {
    signedResult = await signWithWallet(prepared.toXDR(), donorAddress);
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
    return { hash };
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
