'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import * as StellarSdk from '@stellar/stellar-sdk';
import { toast } from 'sonner';
import { connectWallet } from '@/lib/wallet';
import { sendDonation, DonationError } from '@/lib/contract';
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
  const [sending, setSending] = useState(false);
  const [txStatus, setTxStatus] = useState<string | null>(null);

  const presets = ['1', '5', '10', '20'];

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
        toast.success('New donation received! 🎉');
      }
    };

    source.addEventListener('donation', handleDonation);

    return () => {
      source.removeEventListener('donation', handleDonation);
      source.close();
    };
  }, [creator?.walletAddress, userAddress]);

  const handleConnectWallet = async () => {
    setConnecting(true);
    try {
      const address = await connectWallet();
      setUserAddress(address);

      const account = await server.loadAccount(address);
      const xlm = account.balances.find((b) => b.asset_type === 'native');
      setBalance(parseFloat(xlm?.balance || '0').toFixed(4));
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
        amountXlm: donationAmount,
        memo: donationMessage,
        onStatus: setTxStatus,
      });

      // Record donation in database
      await fetch(`${API_URL}/api/donations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creatorUsername: creator.username,
          senderAddress: userAddress,
          amount: parseFloat(donationAmount),
          message: donationMessage,
          transactionHash: hash,
        }),
      });

      // Refresh balance
      try {
        const account = await server.loadAccount(userAddress);
        const xlm = account.balances.find((b) => b.asset_type === 'native');
        setBalance(parseFloat(xlm?.balance || '0').toFixed(4));
      } catch { }

      toast.success('🎉 Donation sent successfully!', {
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
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-50 py-10 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow border border-gray-200 p-8 mb-8 text-center">
            <Skeleton className="h-9 w-64 mx-auto mb-3" />
            <Skeleton className="h-5 w-32 mx-auto mb-6" />
            <div className="grid md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-gray-200">
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
              <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
                <Skeleton className="h-5 w-40 mb-4" />
                <Skeleton className="h-12 w-full" />
              </div>
            </div>
            <div className="md:col-span-2">
              <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
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
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-50 flex items-center justify-center px-4">
        <div className="text-center bg-white rounded-lg p-8 max-w-md shadow">
          <p className="text-red-600 font-semibold mb-4">{error || 'Creator not found'}</p>
          <Link href="/" className="text-indigo-600 hover:underline">
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
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-50 py-10 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Creator Header */}
        <div className="bg-white rounded-lg shadow border border-gray-200 p-8 mb-8 text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            {creator.displayName || creator.username}
          </h1>
          <p className="text-gray-600 text-xl mb-4">@{creator.username}</p>
          {creator.bio && <p className="text-gray-600 mb-6">{creator.bio}</p>}

          <div className="grid md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-gray-200">
            <div>
              <p className="text-gray-500 text-sm">Total Donations</p>
              <p className="text-2xl font-bold text-indigo-600">
                {donations.length}
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-sm">Total Received</p>
              <p className="text-2xl font-bold text-indigo-600">
                {donations.reduce((sum, d) => sum + d.amount, 0).toFixed(2)} XLM
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-sm">Average Donation</p>
              <p className="text-2xl font-bold text-indigo-600">
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
            <div className="bg-white rounded-lg shadow border border-gray-200 p-6 md:sticky md:top-8">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Support {creator.displayName || creator.username}</h2>

              {!userAddress ? (
                <button
                  onClick={handleConnectWallet}
                  disabled={connecting}
                  className="w-full py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60 font-semibold mb-4 transition"
                >
                  {connecting ? 'Connecting...' : 'Connect Wallet'}
                </button>
              ) : (
                <>
                  <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
                    <p className="text-gray-600">Wallet: {userAddress.slice(0, 8)}...</p>
                    <p className="text-indigo-600 font-semibold mt-1">{balance} XLM</p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Amount (XLM)
                      </label>
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={donationAmount}
                        onChange={(e) => setDonationAmount(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-black"
                      />
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      {presets.map((preset) => (
                        <button
                          key={preset}
                          onClick={() => setDonationAmount(preset)}
                          className={`py-2 rounded-lg font-semibold text-sm transition ${
                            donationAmount === preset
                              ? 'bg-indigo-600 text-white'
                              : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Message (Optional)
                      </label>
                      <textarea
                        value={donationMessage}
                        onChange={(e) => setDonationMessage(e.target.value)}
                        maxLength={28}
                        placeholder="Thanks for your work!"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm text-black"
                        rows={3}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        {donationMessage.length}/28
                      </p>
                    </div>

                    <button
                      onClick={handleSendDonation}
                      disabled={sending || !creator.walletAddress}
                      className="w-full py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60 font-semibold transition"
                    >
                      {sending ? 'Sending...' : 'Send Donation'}
                    </button>

                    {txStatus && STATUS_LABELS[txStatus] && (
                      <p className="text-sm text-gray-600 text-center animate-pulse">
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
            <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Recent Supporters</h2>
              {recentDonations.length === 0 ? (
                <p className="text-gray-600">Be the first to support this creator!</p>
              ) : (
                <div className="space-y-3">
                  {recentDonations.map((donation) => (
                    <div key={donation.id} className="flex items-start justify-between p-4 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900">
                          {donation.senderAddress.slice(0, 8)}...
                        </p>
                        {donation.message && (
                          <p className="text-sm text-gray-600 mt-1">"{donation.message}"</p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(donation.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <p className="font-bold text-indigo-600">
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
