'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppNav } from '@/components/AppNav';
import { Skeleton } from '@/components/Skeleton';
import { cancelSubscription, DonationError } from '@/lib/contract';
import { API_URL } from '@/lib/api';

interface Subscription {
  id: number;
  creatorId: number;
  creator: { username: string; displayName: string | null; avatarUrl: string | null };
  supporterAddress: string;
  token: string;
  amount: number;
  intervalSecs: number;
  onChainId: number;
  nextChargeAt: string;
  active: boolean;
  lastChargeTxHash: string | null;
  lastChargedAt: string | null;
  lastError: string | null;
}

function formatInterval(intervalSecs: number): string {
  const days = Math.round(intervalSecs / 86400);
  if (days === 7) return 'weekly';
  if (days === 30) return 'monthly';
  return `every ${days} day${days === 1 ? '' : 's'}`;
}

function SubscriptionsList() {
  const { user, token } = useAuth();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  useEffect(() => {
    if (!user?.walletAddress) return;
    fetch(`${API_URL}/api/subscriptions?supporterAddress=${encodeURIComponent(user.walletAddress)}`)
      .then((res) => res.json())
      .then(setSubscriptions)
      .catch(() => toast.error('Could not load your subscriptions'))
      .finally(() => setLoading(false));
  }, [user?.walletAddress]);

  const handleCancel = async (subscription: Subscription) => {
    if (!user?.walletAddress) return;
    setCancellingId(subscription.id);
    try {
      await cancelSubscription({
        supporterAddress: user.walletAddress,
        subscriptionId: subscription.onChainId,
      });

      await fetch(`${API_URL}/api/subscriptions/${subscription.id}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      setSubscriptions((prev) =>
        prev.map((s) => (s.id === subscription.id ? { ...s, active: false } : s))
      );
      toast.success('Subscription cancelled');
    } catch (err) {
      if (err instanceof DonationError) {
        toast.error('Could not cancel subscription', { description: err.message });
      } else {
        toast.error('Could not cancel subscription', { description: (err as Error).message });
      }
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppNav />
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-10 space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
            Subscriptions
          </h1>
          <p className="mt-1 text-sm text-muted font-medium">
            Recurring donations you&apos;ve started from creator profiles.
          </p>
        </div>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : subscriptions.length === 0 ? (
          <div className="card-brutal p-8 text-center">
            <p className="text-muted font-medium">
              You don&apos;t have any recurring donations yet. Start one from a creator&apos;s
              profile page.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {subscriptions.map((subscription) => (
              <div key={subscription.id} className="card-brutal p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/${subscription.creator.username}`}
                    className="font-extrabold text-ink hover:text-primary truncate block"
                  >
                    {subscription.creator.displayName || subscription.creator.username}
                  </Link>
                  <p className="text-sm text-muted font-medium truncate">
                    {subscription.amount} {subscription.token}{' '}
                    <span>· {formatInterval(subscription.intervalSecs)}</span>
                  </p>
                  <p className="text-xs text-muted font-medium mt-0.5">
                    {subscription.active
                      ? `Next charge ${new Date(subscription.nextChargeAt).toLocaleDateString()}`
                      : 'Cancelled'}
                  </p>
                  {subscription.lastError && (
                    <p className="text-xs text-red-600 font-bold mt-0.5">
                      Last charge failed — {subscription.lastError}
                    </p>
                  )}
                </div>

                {subscription.active && (
                  <button
                    onClick={() => handleCancel(subscription)}
                    disabled={cancellingId === subscription.id}
                    className="text-sm font-bold text-ink/60 hover:text-ink underline underline-offset-2 shrink-0"
                  >
                    {cancellingId === subscription.id ? 'Cancelling…' : 'Cancel'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SubscriptionsPage() {
  return (
    <ProtectedRoute>
      <SubscriptionsList />
    </ProtectedRoute>
  );
}
