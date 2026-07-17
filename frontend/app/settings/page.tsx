'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { HugeiconsIcon } from '@hugeicons/react';
import { CheckmarkCircleIcon } from '@hugeicons/core-free-icons';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Skeleton } from '@/components/Skeleton';
import { connectWallet } from '@/lib/wallet';
import { runWithdraw, runDeposit, anchorConfig, AnchorError } from '@/lib/anchor';
import { API_URL } from '@/lib/api';

interface Creator {
  id: number;
  userId: number;
  username: string;
  displayName: string;
  walletAddress: string;
  bio: string;
  avatarUrl: string;
}

// Human-readable copy for each phase/status the withdraw flow emits, so the
// panel can narrate progress rather than dumping raw SEP-24 status strings.
const WITHDRAW_STATUS_LABELS: Record<string, string> = {
  config: "Reading the anchor's details…",
  auth: 'Signing in to the anchor…',
  info: 'Checking withdrawal availability…',
  interactive: 'Opening the anchor…',
  pending: 'Waiting for the anchor…',
  incomplete: 'Complete the form in the anchor window…',
  pending_user_transfer_start: 'Sending your funds to the anchor…',
  'sending-payment': 'Confirm the payment in your wallet…',
  pending_anchor: 'Anchor is processing your payout…',
  pending_external: 'Payout is on its way to your bank…',
  completed: 'Withdrawal complete.',
};

const DEPOSIT_STATUS_LABELS: Record<string, string> = {
  config: "Reading the anchor's details…",
  auth: 'Signing in to the anchor…',
  info: 'Checking deposit availability…',
  interactive: 'Opening the anchor…',
  pending: 'Waiting for the anchor…',
  incomplete: 'Complete the form in the anchor window…',
  pending_user_transfer_start: 'Waiting for your funds to reach the anchor…',
  pending_anchor: 'Anchor is crediting your wallet…',
  pending_external: 'Anchor is processing your deposit…',
  completed: 'Deposit complete — funds are in your wallet.',
};

export default function SettingsPage() {
  const { user, token, logout } = useAuth();
  const [creator, setCreator] = useState<Creator | null>(null);
  const [walletAddress, setWalletAddress] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawStatus, setWithdrawStatus] = useState<string | null>(null);
  const [depositing, setDepositing] = useState(false);
  const [depositStatus, setDepositStatus] = useState<string | null>(null);

  useEffect(() => {
    const fetchCreator = async () => {
      if (!user || !token) return;

      try {
        const res = await fetch(`${API_URL}/api/creators`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });

        if (!res.ok) {
          throw new Error('Failed to fetch creators');
        }

        const creators: Creator[] = await res.json();
        const userCreator = creators.find((c: Creator) => c.userId === user.id);

        if (userCreator) {
          setCreator(userCreator);
          setWalletAddress(userCreator.walletAddress || '');
          setDisplayName(userCreator.displayName || '');
          setBio(userCreator.bio || '');
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    fetchCreator();
  }, [user, token]);

  const handleConnectWallet = async () => {
    try {
      setError('');
      const address = await connectWallet();
      setWalletAddress(address);
      toast.success('Wallet connected successfully!');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSave = async () => {
    if (!creator) return;

    setUpdating(true);
    setError('');

    try {
      const res = await fetch(
        `${API_URL}/api/creators/${creator.username}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            walletAddress,
            displayName,
            bio,
          }),
        }
      );

      if (!res.ok) {
        throw new Error('Failed to update profile');
      }

      toast.success('Profile updated successfully!');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUpdating(false);
    }
  };

  // Kick off the full SEP-24 withdraw against the configured anchor. The popup
  // must open synchronously inside this click handler, so runWithdraw opens it
  // as soon as the anchor returns the interactive URL — don't await anything
  // blocking before that point on the UI side.
  const handleWithdraw = async () => {
    if (!walletAddress) {
      toast.error('Connect your payout wallet first');
      return;
    }
    setWithdrawing(true);
    setWithdrawStatus('config');
    try {
      const result = await runWithdraw(walletAddress, {
        onStatus: (phase: string) => setWithdrawStatus(phase),
      });
      if (!result) {
        toast('Withdrawal cancelled');
      } else if (result.status === 'completed') {
        toast.success('Withdrawal complete — funds are on their way to your bank.');
      } else {
        toast(`Withdrawal ended with status: ${result.status}`);
      }
    } catch (err) {
      if (err instanceof AnchorError) {
        toast.error('Withdrawal failed', { description: err.message });
      } else {
        toast.error('Withdrawal failed', { description: (err as Error).message });
      }
    } finally {
      setWithdrawing(false);
      setWithdrawStatus(null);
    }
  };

  // Kick off the full SEP-24 deposit. Same popup-timing rule as withdraw: the
  // popup opens synchronously once the anchor returns the interactive URL. On
  // the testnet sandbox this is how you mint test SRT into the wallet (fake KYC
  // in the popup), so there's a funded balance to later cash out.
  const handleDeposit = async () => {
    if (!walletAddress) {
      toast.error('Connect your payout wallet first');
      return;
    }
    setDepositing(true);
    setDepositStatus('config');
    try {
      const result = await runDeposit(walletAddress, {
        onStatus: (phase: string) => setDepositStatus(phase),
      });
      if (!result) {
        toast('Deposit cancelled');
      } else if (result.status === 'completed') {
        toast.success(`Deposit complete — ${anchorConfig.assetCode} credited to your wallet.`);
      } else {
        toast(`Deposit ended with status: ${result.status}`);
      }
    } catch (err) {
      if (err instanceof AnchorError) {
        toast.error('Deposit failed', { description: err.message });
      } else {
        toast.error('Deposit failed', { description: (err as Error).message });
      }
    } finally {
      setDepositing(false);
      setDepositStatus(null);
    }
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-background py-10 px-4">
          <div className="max-w-2xl mx-auto">
            <Skeleton className="h-9 w-40 mb-8" />

            <div className="card-brutal p-8 space-y-6">
              <div>
                <Skeleton className="h-5 w-40 mb-4" />
                <div className="space-y-4">
                  <div>
                    <Skeleton className="h-4 w-24 mb-2" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                  <div>
                    <Skeleton className="h-4 w-16 mb-2" />
                    <Skeleton className="h-24 w-full" />
                  </div>
                </div>
              </div>

              <div className="border-t-2 border-ink pt-6">
                <Skeleton className="h-5 w-44 mb-4" />
                <Skeleton className="h-4 w-32 mb-2" />
                <Skeleton className="h-10 w-full" />
              </div>

              <div className="flex gap-4 pt-6 border-t-2 border-ink">
                <Skeleton className="h-10 w-full" />
              </div>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background py-10 px-4">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-extrabold text-ink mb-8 tracking-tight">Settings</h1>

          {error && (
            <div className="card-brutal bg-brand-pink p-4 mb-6 text-ink font-bold">
              {error}
            </div>
          )}

          {creator ? (
            <div className="card-brutal p-8 space-y-6">
              <div>
                <h2 className="text-lg font-extrabold text-ink mb-4">Profile Information</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-ink mb-2">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="input-brutal"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-ink mb-2">
                      Bio
                    </label>
                    <textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Tell people about yourself..."
                      rows={4}
                      className="input-brutal"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t-2 border-ink pt-6">
                <h2 className="text-lg font-extrabold text-ink mb-4">Wallet Connection</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-ink mb-2">
                      Stellar Wallet Address
                    </label>
                    <div className="flex gap-3">
                      <input
                        type="text"
                        value={walletAddress}
                        onChange={(e) => setWalletAddress(e.target.value)}
                        placeholder="GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                        className="input-brutal flex-1 font-mono text-sm"
                      />
                      <button
                        onClick={handleConnectWallet}
                        className="btn-brutal btn-brutal-lime whitespace-nowrap"
                      >
                        Connect Wallet
                      </button>
                    </div>
                    <p className="text-xs text-muted mt-2 flex items-center gap-1 font-medium">
                      {walletAddress ? (
                        <>
                          <HugeiconsIcon icon={CheckmarkCircleIcon} size={14} strokeWidth={2} className="text-ink" />
                          Wallet connected
                        </>
                      ) : (
                        'Connect your Freighter wallet to receive tips'
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Fiat on/off-ramp via a Stellar anchor (SEP-24). Add funds
                  (deposit) mints the asset into the wallet; Cash out (withdraw)
                  sends it back to a bank. Both need a connected wallet. On
                  testnet this hits the SDF reference anchor and moves SRT, not
                  real money. */}
              <div className="border-t-2 border-ink pt-6">
                <h2 className="text-lg font-extrabold text-ink mb-1">Add Funds &amp; Cash Out</h2>
                <p className="text-xs text-muted mb-4 font-medium">
                  Move {anchorConfig.assetCode} between your bank and your wallet through{' '}
                  <span className="font-mono">{anchorConfig.homeDomain}</span>.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <button
                      onClick={handleDeposit}
                      disabled={depositing || withdrawing || !walletAddress}
                      className="btn-brutal btn-brutal-primary w-full"
                    >
                      {depositing ? 'Adding funds…' : `Add ${anchorConfig.assetCode}`}
                    </button>
                    {depositStatus && (
                      <p className="text-sm text-ink mt-3 flex items-center gap-2 font-medium animate-pulse">
                        {DEPOSIT_STATUS_LABELS[depositStatus] || depositStatus}
                      </p>
                    )}
                  </div>
                  <div>
                    <button
                      onClick={handleWithdraw}
                      disabled={withdrawing || depositing || !walletAddress}
                      className="btn-brutal btn-brutal-lime w-full"
                    >
                      {withdrawing ? 'Withdrawing…' : `Cash out ${anchorConfig.assetCode}`}
                    </button>
                    {withdrawStatus && (
                      <p className="text-sm text-ink mt-3 flex items-center gap-2 font-medium animate-pulse">
                        {WITHDRAW_STATUS_LABELS[withdrawStatus] || withdrawStatus}
                      </p>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted mt-3 font-medium">
                  Testnet sandbox — moves {anchorConfig.assetCode} against the SDF reference
                  anchor with fake KYC, not real funds. Add {anchorConfig.assetCode} first,
                  then you have a balance to cash out.
                </p>
              </div>

              <div className="flex gap-4 pt-6 border-t-2 border-ink">
                <button
                  onClick={handleSave}
                  disabled={updating}
                  className="btn-brutal btn-brutal-primary flex-1"
                >
                  {updating ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          ) : (
            <div className="card-brutal p-8 text-center">
              <p className="text-muted mb-4 font-medium">You need to create a username first</p>
              <a href="/auth/username" className="text-primary hover:underline font-bold">
                Go to Create Username
              </a>
            </div>
          )}

          {/* Logout Button */}
          <div className="mt-8 flex justify-end">
            <button
              onClick={() => {
                logout();
                window.location.href = '/';
              }}
              className="btn-brutal btn-brutal-white"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
