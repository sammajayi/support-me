'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import * as StellarSdk from '@stellar/stellar-sdk';
import { toast } from 'sonner';
import { HugeiconsIcon } from '@hugeicons/react';
import { PartyIcon } from '@hugeicons/core-free-icons';
import { connectWallet } from '@/lib/wallet';
import { sendDonation, DonationError } from '@/lib/contract';
import { availableAssetCodes, getAsset } from '@/lib/assets';
import { API_URL } from '@/lib/api';
import { Skeleton } from '@/components/Skeleton';

const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const server = new StellarSdk.Horizon.Server(HORIZON_URL);

const STATUS_LABELS: Record<string, string> = {
  building: 'Preparing transaction...',
  simulating: 'Simulating on the network...',
  'awaiting-signature': 'Waiting for wallet signature...',
  submitting: 'Submitting transaction...',
  pending: 'Confirming on the network...',
};

interface Creator {
  id: number;
  username: string;
  displayName: string;
  walletAddress: string;
  bio: string;
  donations: Donation[];
}

interface Donation {
  id: number | string;
  senderAddress: string;
  amount: number;
  currency: string;
  message: string;
  createdAt: string;
  transactionHash?: string;
}

export default function CreatorProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const [creator, setCreator] = useState<Creator | null>(null);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const [donationAmount, setDonationAmount] = useState('5');
  const [donationMessage, setDonationMessage] = useState('');
  const [assetCode, setAssetCode] = useState('XLM');
  const [sending, setSending] = useState(false);
  const [txStatus, setTxStatus] = useState<string | null>(null);

  const presets = ['1', '5', '10', '20'];
  const assetCodes = availableAssetCodes();

  useEffect(() => {
    const fetchCreator = async () => {
      try {
        const res = await fetch(`${API_URL}/api/creators/${username}`);
        if (!res.ok) {
          throw new Error('Creator not found');
        }
        const data = await res.json();
        setCreator(data);
        setDonations(data.donations || []);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    fetchCreator();
  }, [username]);

  // Subscribe to the backend's SSE stream so new on-chain donations for this
  // creator show up live for anyone viewing the page, without a refresh.
  useEffect(() => {
    if (!creator?.walletAddress) return;

    const source = new EventSource(`${API_URL}/api/events`);

    const handleDonation = (event: MessageEvent) => {
      let payload: {
        donor: string;
        creator: string;
        amount: string;
        memo: string;
        timestamp: number;
        txHash: string;
      };
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }

      if (payload.creator !== creator.walletAddress) return;

      setDonations((prev) => {
        if (prev.some((d) => d.transactionHash === payload.txHash)) return prev;
        const newDonation: Donation = {
          id: payload.txHash,
          senderAddress: payload.donor,
          amount: Number(payload.amount) / 1e7,
          currency: 'XLM',
          message: payload.memo,
          createdAt: new Date(payload.timestamp * 1000).toISOString(),
          transactionHash: payload.txHash,
        };
        return [newDonation, ...prev];
      });

      if (payload.donor !== userAddress) {
        toast.success('New donation received!', {
          icon: <HugeiconsIcon icon={PartyIcon} size={18} strokeWidth={1.5} />,
        });
      }
    };

    source.addEventListener('donation', handleDonation);

    return () => {
      source.removeEventListener('donation', handleDonation);
      source.close();
    };
  }, [creator?.walletAddress, userAddress]);

  // Read the connected wallet's balance for whichever asset is selected.
  // Falls back to '0.0000' when the wallet holds no trustline/balance for it.
  const loadAssetBalance = async (address: string, code: string) => {
    try {
      const account = await server.loadAccount(address);
      const match = account.balances.find(getAsset(code).balanceMatcher);
      return parseFloat((match as { balance?: string })?.balance || '0').toFixed(4);
    } catch {
      return null;
    }
  };

  const handleConnectWallet = async () => {
    setConnecting(true);
    try {
      const address = await connectWallet();
      setUserAddress(address);
      setBalance(await loadAssetBalance(address, assetCode));
      toast.success('Wallet connected!');
    } catch (err) {
      toast.error('Could not connect wallet', {
        description: (err as Error).message,
      });
    } finally {
      setConnecting(false);
    }
  };

  const handleSendDonation = async () => {
    if (!userAddress || !creator?.walletAddress) {
      toast.error('Cannot send donation', {
        description: 'Wallet not connected or creator wallet not set',
      });
      return;
    }

    setSending(true);
    setTxStatus('building');
    try {
      const { hash } = await sendDonation({
        donorAddress: userAddress,
        creatorAddress: creator.walletAddress,
        amount: donationAmount,
        assetCode,
        memo: donationMessage,
        onStatus: setTxStatus,
      });

      // Record donation in database, tagging it with the asset that was sent
      // so the dashboard and profile can show XLM vs USDC correctly.
      await fetch(`${API_URL}/api/donations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creatorUsername: creator.username,
          senderAddress: userAddress,
          amount: parseFloat(donationAmount),
          currency: assetCode,
          message: donationMessage,
          transactionHash: hash,
        }),
      });

      // Refresh balance for the asset just sent
      setBalance(await loadAssetBalance(userAddress, assetCode));

      toast.success('Donation sent successfully!', {
        icon: <HugeiconsIcon icon={PartyIcon} size={18} strokeWidth={1.5} />,
        description: (
          <a
            href={`https://stellar.expert/explorer/testnet/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            {hash.slice(0, 16)}…
          </a>
        ),
      });
      setDonationAmount('5');
      setDonationMessage('');
    } catch (err) {
      // Three distinct, user-facing error categories:
      // 'wallet' (not connected / signing rejected), 'simulation' (invalid
      // amount, insufficient balance, contract precondition), 'network'
      // (RPC/submission/confirmation failure).
      if (err instanceof DonationError) {
        const titles: Record<string, string> = {
          wallet: 'Wallet error',
          simulation: 'Transaction rejected',
          network: 'Network error',
        };
        toast.error(titles[err.type] || 'Donation failed', { description: err.message });
      } else {
        toast.error('Donation failed', { description: (err as Error).message });
      }
    } finally {
      setSending(false);
      setTxStatus(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background py-10 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="card-brutal p-8 mb-8 text-center">
            <Skeleton className="h-9 w-64 mx-auto mb-3" />
            <Skeleton className="h-5 w-32 mx-auto mb-6" />
            <div className="grid md:grid-cols-3 gap-4 mt-6 pt-6 border-t-2 border-ink">
              {[0, 1, 2].map((i) => (
                <div key={i}>
                  <Skeleton className="h-4 w-24 mx-auto mb-2" />
                  <Skeleton className="h-7 w-16 mx-auto" />
                </div>
              ))}
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="md:col-span-1">
              <div className="card-brutal p-6">
                <Skeleton className="h-5 w-40 mb-4" />
                <Skeleton className="h-12 w-full" />
              </div>
            </div>
            <div className="md:col-span-2">
              <div className="card-brutal p-6">
                <Skeleton className="h-5 w-40 mb-4" />
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !creator) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center card-brutal p-8 max-w-md">
          <p className="text-ink font-bold mb-4">{error || 'Creator not found'}</p>
          <Link href="/" className="text-primary hover:underline font-bold">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  const recentDonations = [...donations]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return (
    <div className="min-h-screen bg-background py-10 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Creator Header */}
        <div className="card-brutal p-8 mb-8 text-center">
          <h1 className="text-4xl font-extrabold text-ink mb-2 tracking-tight">
            {creator.displayName || creator.username}
          </h1>
          <p className="text-muted text-xl mb-4 font-bold">@{creator.username}</p>
          {creator.bio && <p className="text-ink/70 mb-6 font-medium">{creator.bio}</p>}

          <div className="grid md:grid-cols-3 gap-4 mt-6 pt-6 border-t-2 border-ink">
            <div>
              <p className="text-muted text-sm font-bold">Total Donations</p>
              <p className="text-2xl font-extrabold text-primary">
                {donations.length}
              </p>
            </div>
            <div>
              <p className="text-muted text-sm font-bold">Total Received</p>
              <p className="text-2xl font-extrabold text-primary">
                {donations.reduce((sum, d) => sum + d.amount, 0).toFixed(2)} XLM
              </p>
            </div>
            <div>
              <p className="text-muted text-sm font-bold">Average Donation</p>
              <p className="text-2xl font-extrabold text-primary">
                {donations.length > 0
                  ? (donations.reduce((sum, d) => sum + d.amount, 0) / donations.length).toFixed(2)
                  : 0} XLM
              </p>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Donation Card */}
          <div className="md:col-span-1">
            <div className="card-brutal p-6 md:sticky md:top-8">
              <h2 className="text-lg font-extrabold text-ink mb-4">Support {creator.displayName || creator.username}</h2>

              {!userAddress ? (
                <button
                  onClick={handleConnectWallet}
                  disabled={connecting}
                  className="btn-brutal btn-brutal-primary w-full mb-4"
                >
                  {connecting ? 'Connecting...' : 'Connect Wallet'}
                </button>
              ) : (
                <>
                  <div className="card-brutal bg-brand-lime p-3 mb-4 text-sm">
                    <p className="text-ink font-medium">Wallet: {userAddress.slice(0, 8)}...</p>
                    <p className="text-ink font-extrabold mt-1">
                      {balance ?? '0.0000'} {assetCode}
                    </p>
                  </div>

                  <div className="space-y-4">
                    {assetCodes.length > 1 && (
                      <div>
                        <label className="block text-sm font-bold text-ink mb-2">
                          Asset
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {assetCodes.map((code) => (
                            <button
                              key={code}
                              onClick={async () => {
                                setAssetCode(code);
                                if (userAddress) {
                                  setBalance(await loadAssetBalance(userAddress, code));
                                }
                              }}
                              className={`btn-brutal text-sm px-0 py-2 ${
                                assetCode === code ? 'btn-brutal-primary' : 'btn-brutal-white'
                              }`}
                            >
                              {code}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-bold text-ink mb-2">
                        Amount ({assetCode})
                      </label>
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={donationAmount}
                        onChange={(e) => setDonationAmount(e.target.value)}
                        className="input-brutal"
                      />
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      {presets.map((preset) => (
                        <button
                          key={preset}
                          onClick={() => setDonationAmount(preset)}
                          className={`btn-brutal text-sm px-0 py-2 ${
                            donationAmount === preset
                              ? 'btn-brutal-primary'
                              : 'btn-brutal-white'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-ink mb-2">
                        Message (Optional)
                      </label>
                      <textarea
                        value={donationMessage}
                        onChange={(e) => setDonationMessage(e.target.value)}
                        maxLength={28}
                        placeholder="Thanks for your work!"
                        className="input-brutal text-sm"
                        rows={3}
                      />
                      <p className="text-xs text-muted mt-1 font-medium">
                        {donationMessage.length}/28
                      </p>
                    </div>

                    <button
                      onClick={handleSendDonation}
                      disabled={sending || !creator.walletAddress}
                      className="btn-brutal btn-brutal-lime w-full"
                    >
                      {sending ? 'Sending...' : 'Send Donation'}
                    </button>

                    {txStatus && STATUS_LABELS[txStatus] && (
                      <p className="text-sm text-ink text-center animate-pulse font-bold">
                        {STATUS_LABELS[txStatus]}
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Recent Donors */}
          <div className="md:col-span-2">
            <div className="card-brutal p-6">
              <h2 className="text-lg font-extrabold text-ink mb-4">Recent Supporters</h2>
              {recentDonations.length === 0 ? (
                <p className="text-muted font-medium">Be the first to support this creator!</p>
              ) : (
                <div className="space-y-3">
                  {recentDonations.map((donation) => (
                    <div key={donation.id} className="flex items-start justify-between p-4 bg-background border-2 border-ink rounded-xl">
                      <div className="flex-1">
                        <p className="font-bold text-ink">
                          {donation.senderAddress.slice(0, 8)}...
                        </p>
                        {donation.message && (
                          <p className="text-sm text-muted mt-1 font-medium">"{donation.message}"</p>
                        )}
                        <p className="text-xs text-muted mt-1 font-medium">
                          {new Date(donation.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <p className="font-extrabold text-primary">
                        {donation.amount} {donation.currency}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
