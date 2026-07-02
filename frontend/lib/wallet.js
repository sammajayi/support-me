import { StellarWalletsKit, Networks } from '@creit.tech/stellar-wallets-kit';
import { FreighterModule } from '@creit.tech/stellar-wallets-kit/modules/freighter';
import { xBullModule } from '@creit.tech/stellar-wallets-kit/modules/xbull';
import { AlbedoModule } from '@creit.tech/stellar-wallets-kit/modules/albedo';
import { RabetModule } from '@creit.tech/stellar-wallets-kit/modules/rabet';
import { LobstrModule } from '@creit.tech/stellar-wallets-kit/modules/lobstr';

const NETWORK_PASSPHRASE = Networks.TESTNET;

let initialized = false;

const ensureInit = () => {
  if (initialized) return;

  StellarWalletsKit.init({
    network: NETWORK_PASSPHRASE,
    modules: [
      new FreighterModule(),
      new xBullModule(),
      new AlbedoModule(),
      new RabetModule(),
      new LobstrModule(),
    ],
  });

  initialized = true;
};

// Opens the built-in wallet picker modal (Freighter, xBull, Albedo, Rabet, Lobstr)
// and returns the connected public address.
const connectWallet = async () => {
  ensureInit();
  const { address } = await StellarWalletsKit.authModal();
  return address;
};

const disconnectWallet = async () => {
  if (!initialized) return;
  await StellarWalletsKit.disconnect();
};

// Signs an XDR transaction using whichever wallet the user picked in the modal.
const signTransaction = async (xdr, address) => {
  ensureInit();
  return await StellarWalletsKit.signTransaction(xdr, {
    address,
    networkPassphrase: NETWORK_PASSPHRASE,
  });
};

export { connectWallet, disconnectWallet, signTransaction };
