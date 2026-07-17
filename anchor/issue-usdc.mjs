// Issue local testnet USDC so the anchor can actually settle.
//
// Given a funded issuer and a funded distribution account, this:
//   1. establishes a USDC trustline on the distribution account, and
//   2. mints USDC from the issuer to the distribution account.
//
// After this, the distribution account holds USDC (so deposits can pay out)
// and can receive USDC (so withdrawals can be collected). TESTNET, DEV ONLY.
//
// Usage: node issue-usdc.mjs <ISSUER_SECRET> <DISTRIBUTION_SECRET>
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// @stellar/stellar-sdk is installed in the sibling frontend/ workspace, not in
// anchor/ (which has no node_modules of its own). Resolve its path from there,
// then dynamic-import it — which works whether the SDK ships as ESM or CJS.
const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const sdk = await import(pathToFileURL(require.resolve('@stellar/stellar-sdk')).href);
const { Horizon, Keypair, Asset, Operation, TransactionBuilder, BASE_FEE, Networks } = sdk;

const [issuerSecret, distSecret] = process.argv.slice(2);
if (!issuerSecret || !distSecret) {
  console.error('Usage: node issue-usdc.mjs <ISSUER_SECRET> <DISTRIBUTION_SECRET>');
  process.exit(1);
}

const HORIZON = 'https://horizon-testnet.stellar.org';
const MINT_AMOUNT = '1000000'; // plenty for dev
const server = new Horizon.Server(HORIZON);

const issuer = Keypair.fromSecret(issuerSecret);
const dist = Keypair.fromSecret(distSecret);
const usdc = new Asset('USDC', issuer.publicKey());

async function submit(sourceKp, buildOps, label) {
  const account = await server.loadAccount(sourceKp.publicKey());
  const builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  });
  buildOps(builder);
  const tx = builder.setTimeout(180).build();
  tx.sign(sourceKp);
  try {
    const res = await server.submitTransaction(tx);
    console.log(`  ✓ ${label} (${res.hash})`);
  } catch (err) {
    const codes = err?.response?.data?.extras?.result_codes;
    // A pre-existing trustline makes changeTrust a harmless no-op; tolerate it.
    if (label.includes('trustline') && JSON.stringify(codes || '').includes('op_')) {
      console.log(`  ℹ ${label} skipped (${JSON.stringify(codes)})`);
      return;
    }
    console.error(`  ✗ ${label} failed:`, JSON.stringify(codes || err.message));
    throw err;
  }
}

console.log('Issuing local testnet USDC...');
console.log(`  issuer:       ${issuer.publicKey()}`);
console.log(`  distribution: ${dist.publicKey()}`);

await submit(
  dist,
  (b) => b.addOperation(Operation.changeTrust({ asset: usdc })),
  'distribution USDC trustline',
);
await submit(
  issuer,
  (b) =>
    b.addOperation(
      Operation.payment({ destination: dist.publicKey(), asset: usdc, amount: MINT_AMOUNT }),
    ),
  `mint ${MINT_AMOUNT} USDC to distribution`,
);

console.log('Done. Distribution account now holds USDC and can settle.');
