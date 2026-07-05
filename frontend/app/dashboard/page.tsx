'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Skeleton } from '@/components/Skeleton';
import { API_URL } from '@/lib/api';

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

      toast.success('New donation received! 🎉');
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
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-50 py-10 px-4">
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
              <Skeleton className="h-9 w-40" />
              <Skeleton className="h-10 w-28" />
            </div>

            <div className="grid md:grid-cols-3 gap-6 mb-8">
              {[0, 1, 2].map((i) => (
                <div key={i} className="bg-white rounded-lg shadow p-6 border border-gray-200">
                  <Skeleton className="h-4 w-28 mb-3" />
                  <Skeleton className="h-8 w-16" />
                </div>
              ))}
            </div>

            <div className="bg-white rounded-lg shadow p-6 border border-gray-200 mb-8">
              <Skeleton className="h-5 w-32 mb-4" />
              <Skeleton className="h-10 w-full" />
            </div>

            <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
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
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-50 flex items-center justify-center px-4">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Complete Your Profile</h1>
            <p className="text-gray-600 mb-6">You need to create a username first</p>
            <Link href="/auth/username" className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700">
              Create Username
            </Link>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  const totalDonations = donations.reduce((sum, d) => sum + d.amount, 0);
  const profileUrl = `${window.location.origin}/${creator.username}`;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-50 py-10 px-4">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            <Link
              href="/settings"
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 text-center"
            >
              Settings
            </Link>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-700">
              {error}
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
              <p className="text-gray-600 text-sm font-medium">Total Donations</p>
              <p className="text-3xl font-bold text-indigo-600 mt-2">{donations.length}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
              <p className="text-gray-600 text-sm font-medium">Total Earned</p>
              <p className="text-3xl font-bold text-indigo-600 mt-2">{totalDonations.toFixed(2)} XLM</p>
            </div>
            <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
              <p className="text-gray-600 text-sm font-medium">Average Donation</p>
              <p className="text-3xl font-bold text-indigo-600 mt-2">
                {donations.length > 0 ? (totalDonations / donations.length).toFixed(2) : 0} XLM
              </p>
            </div>
          </div>

          {/* Profile Link */}
          <div className="bg-white rounded-lg shadow p-6 border border-gray-200 mb-8">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Your Profile</h2>
            <div className="flex flex-col sm:flex-row gap-4">
              <input
                type="text"
                value={profileUrl}
                readOnly
                className="flex-1 min-w-0 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(profileUrl);
                  toast.success('Profile URL copied to clipboard!');
                }}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
              >
                Copy
              </button>
            </div>
          </div>

          {/* Recent Donations */}
          <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Recent Donations</h2>
            {donations.length === 0 ? (
              <p className="text-gray-600">No donations yet. Share your profile link to get started!</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left px-4 py-3 text-sm font-semibold text-gray-600">Sender</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-gray-600">Amount</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-gray-600">Message</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold text-gray-600">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {donations.map((donation) => (
                      <tr key={donation.id} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {donation.senderAddress.slice(0, 10)}...
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-indigo-600">
                          {donation.amount} {donation.currency}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {donation.message || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {new Date(donation.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
