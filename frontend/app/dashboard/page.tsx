'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { HugeiconsIcon } from '@hugeicons/react';
import { PartyIcon } from '@hugeicons/core-free-icons';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppNav } from '@/components/AppNav';
import { Skeleton } from '@/components/Skeleton';
import { TipChart } from '@/components/TipChart';
import { usePrices } from '@/lib/usePrices';
import { formatUsd } from '@/lib/prices';
import { API_URL } from '@/lib/api';

const STELLAR_NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK || 'testnet';
const explorerTxUrl = (hash: string) =>
  `https://stellar.expert/explorer/${STELLAR_NETWORK}/tx/${hash}`;

interface Creator {
  id: number;
  userId: number;
  username: string;
  displayName: string;
  walletAddress: string;
}

interface Donation {
  id: number | string;
  senderAddress: string;
  amount: number;
  currency: string;
  message: string;
  transactionHash: string;
  createdAt: string;
}

export default function DashboardPage() {
  const { user, token } = useAuth();
  const [creator, setCreator] = useState<Creator | null>(null);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const prices = usePrices();

  useEffect(() => {
    const fetchCreator = async () => {
      if (!user || !token) return;

      try {
        const resCreators = await fetch(`${API_URL}/api/creators`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });

        if (!resCreators.ok) {
          throw new Error('Failed to fetch creators');
        }

        const creators: Creator[] = await resCreators.json();
        const userCreator = creators.find((c: Creator) => c.userId === user.id);

        if (!userCreator) {
          // User hasn't created profile yet
          setCreator(null);
          setLoading(false);
          return;
        }

        setCreator(userCreator);

        const resDonations = await fetch(
          `${API_URL}/api/donations?creatorUsername=${userCreator.username}`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );

        if (resDonations.ok) {
          const donationsData = await resDonations.json();
          setDonations(Array.isArray(donationsData) ? donationsData : []);
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    fetchCreator();
  }, [user, token]);

  // Subscribe to the backend's SSE stream so newly confirmed on-chain
  // donations show up here live, without needing to refresh the page.
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
          transactionHash: payload.txHash,
          createdAt: new Date(payload.timestamp * 1000).toISOString(),
        };
        return [newDonation, ...prev];
      });

      toast.success('New donation received!', {
        icon: <HugeiconsIcon icon={PartyIcon} size={18} strokeWidth={1.5} />,
      });
    };

    source.addEventListener('donation', handleDonation);

    return () => {
      source.removeEventListener('donation', handleDonation);
      source.close();
    };
  }, [creator?.walletAddress]);

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-background">
          <AppNav />
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <Skeleton className="h-9 w-40 mb-8" />

            <div className="grid md:grid-cols-2 gap-6 mb-8">
              {[0, 1].map((i) => (
                <div key={i} className="card-brutal p-6">
                  <Skeleton className="h-4 w-28 mb-3" />
                  <Skeleton className="h-8 w-24" />
                </div>
              ))}
            </div>

            <div className="card-brutal p-6 mb-8">
              <Skeleton className="h-5 w-32 mb-4" />
              <Skeleton className="h-48 w-full" />
            </div>

            <div className="card-brutal p-6">
              <Skeleton className="h-5 w-40 mb-4" />
              <div className="space-y-3">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  if (!creator) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-background flex items-center justify-center px-4">
          <div className="card-brutal bg-card p-10 text-center max-w-md">
            <h1 className="text-2xl font-extrabold text-ink mb-4">Complete Your Profile</h1>
            <p className="text-muted font-medium mb-6">You need to create a username first</p>
            <Link href="/auth/username" className="btn-brutal btn-brutal-primary">
              Create Username
            </Link>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  // Split lifetime volume by asset so the two headline cards reflect what was
  // actually received in each currency, rather than summing across them.
  const xlmVolume = donations
    .filter((d) => d.currency === 'XLM')
    .reduce((sum, d) => sum + d.amount, 0);
  const usdcVolume = donations
    .filter((d) => d.currency === 'USDC')
    .reduce((sum, d) => sum + d.amount, 0);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background">
        <AppNav />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <h1 className="text-4xl font-extrabold text-ink tracking-tight mb-8">Dashboard</h1>

          {error && (
            <div className="card-brutal bg-brand-pink p-4 mb-6 text-ink font-bold">
              {error}
            </div>
          )}

          {/* Volume by asset */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div className="card-brutal bg-brand-cyan p-6">
              <p className="text-ink text-sm font-bold uppercase tracking-wide">XLM Volume</p>
              <p className="text-4xl font-extrabold text-ink mt-2 tabular-nums">
                {xlmVolume.toFixed(2)} <span className="text-2xl">XLM</span>
              </p>
              {formatUsd(xlmVolume, 'XLM', prices) && (
                <p className="text-sm font-bold text-ink/70 mt-1">{formatUsd(xlmVolume, 'XLM', prices)}</p>
              )}
            </div>
            <div className="card-brutal bg-brand-lime p-6">
              <p className="text-ink text-sm font-bold uppercase tracking-wide">USDC Volume</p>
              <p className="text-4xl font-extrabold text-ink mt-2 tabular-nums">
                {usdcVolume.toFixed(2)} <span className="text-2xl">USDC</span>
              </p>
              {formatUsd(usdcVolume, 'USDC', prices) && (
                <p className="text-sm font-bold text-ink/70 mt-1">{formatUsd(usdcVolume, 'USDC', prices)}</p>
              )}
            </div>
          </div>

          {/* Earnings over time chart */}
          <div className="mb-8">
            <TipChart donations={donations} />
          </div>

          {/* Recent Donations */}
          <div className="card-brutal p-6">
            <h2 className="text-lg font-extrabold text-ink mb-4">Recent Donations</h2>
            {donations.length === 0 ? (
              <p className="text-muted font-medium">No donations yet. Share your profile link to get started!</p>
            ) : (
              <ul className="divide-y divide-ink/10">
                {donations.map((donation) => {
                  const hasHash = Boolean(donation.transactionHash);
                  const usd = formatUsd(donation.amount, donation.currency, prices);
                  const row = (
                    <div className="flex items-center gap-3 py-2.5">
                      <span className="text-sm font-extrabold text-primary whitespace-nowrap tabular-nums">
                        {donation.amount} {donation.currency}
                      </span>
                      {usd && (
                        <span className="text-xs text-muted whitespace-nowrap tabular-nums">{usd}</span>
                      )}
                      <span className="text-xs text-muted font-mono whitespace-nowrap">
                        {donation.senderAddress.slice(0, 6)}…{donation.senderAddress.slice(-4)}
                      </span>
                      {donation.message && (
                        <span className="text-sm text-ink font-medium truncate flex-1 min-w-0">
                          {donation.message}
                        </span>
                      )}
                      <span className="text-xs text-muted whitespace-nowrap ml-auto pl-2">
                        {new Date(donation.createdAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  );

                  return (
                    <li key={donation.id}>
                      {hasHash ? (
                        <a
                          href={explorerTxUrl(donation.transactionHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="View transaction on Stellar Expert"
                          className="block -mx-2 px-2 rounded hover:bg-accent-bg focus:bg-accent-bg focus:outline-none transition-colors"
                        >
                          {row}
                        </a>
                      ) : (
                        <div className="-mx-2 px-2">{row}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
