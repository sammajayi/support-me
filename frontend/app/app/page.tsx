'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import * as StellarSdk from '@stellar/stellar-sdk';
import { toast } from 'sonner';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ViewIcon,
  ViewOffSlashIcon,
  Share08Icon,
  Copy01Icon,
} from '@hugeicons/core-free-icons';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppNav } from '@/components/AppNav';
import { Skeleton } from '@/components/Skeleton';
import { usePrices } from '@/lib/usePrices';
import { formatUsd } from '@/lib/prices';
import { availableAssetCodes, getAsset } from '@/lib/assets';
import { runWithdraw, runDeposit, anchorConfig, AnchorError } from '@/lib/anchor';
import { API_URL } from '@/lib/api';

const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const server = new StellarSdk.Horizon.Server(HORIZON_URL);

// Human-readable copy for each phase the withdraw/deposit flows emit, so the
// hub can narrate progress instead of leaking raw SEP-24 status strings. Kept
// in sync with the labels the flows produce (see lib/anchor.js).
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
  pending_trust: `Add a trustline so your wallet can hold ${anchorConfig.assetCode}…`,
  'adding-trustline': 'Confirm the trustline in your wallet…',
  pending_user_transfer_start: 'Waiting for your funds to reach the anchor…',
  pending_anchor: 'Anchor is crediting your wallet…',
  pending_external: 'Anchor is processing your deposit…',
  completed: 'Deposit complete — funds are in your wallet.',
};

interface Creator {
  id: number;
  userId: number;
  username: string;
  displayName: string;
  walletAddress: string;
}

// The balance we hold per asset code, as a Horizon-precision string. `null`
// means "not loaded / no trustline" and renders as a dash.
type Balances = Record<string, string | null>;

export default function AppHubPage() {
  const { user, token } = useAuth();
  const prices = usePrices();

  const [creator, setCreator] = useState<Creator | null>(null);
  const [loading, setLoading] = useState(true);
  const [balances, setBalances] = useState<Balances>({});
  const [balancesLoading, setBalancesLoading] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [showUsd, setShowUsd] = useState(false);
  const [copied, setCopied] = useState(false);

  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawStatus, setWithdrawStatus] = useState<string | null>(null);
  const [depositing, setDepositing] = useState(false);
  const [depositStatus, setDepositStatus] = useState<string | null>(null);

  // Stable across renders so the balance-loading effect below doesn't re-run in
  // a loop (availableAssetCodes returns a fresh array each call).
  const assetCodes = useMemo(() => availableAssetCodes(), []);
  const walletAddress = user?.walletAddress || '';

  // Resolve the creator profile tied to the signed-in wallet so we can show the
  // greeting and the shareable profile link.
  useEffect(() => {
    const fetchCreator = async () => {
      if (!user || !token) return;
      try {
        const res = await fetch(`${API_URL}/api/creators`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to load your profile');
        const creators: Creator[] = await res.json();
        setCreator(creators.find((c) => c.userId === user.id) || null);
      } catch (err) {
        toast.error('Could not load your profile', {
          description: (err as Error).message,
        });
      } finally {
        setLoading(false);
      }
    };
    fetchCreator();
  }, [user, token]);

  // Read on-chain balances for every supported asset in one account load, so
  // the aggregate figure reflects what's actually in the wallet.
  const loadBalances = useCallback(async () => {
    if (!walletAddress) return;
    setBalancesLoading(true);
    try {
      const account = await server.loadAccount(walletAddress);
      const next: Balances = {};
      for (const code of assetCodes) {
        const match = account.balances.find(getAsset(code).balanceMatcher);
        next[code] = match ? parseFloat((match as { balance?: string }).balance || '0').toFixed(4) : null;
      }
      setBalances(next);
    } catch {
      // No account yet (unfunded) or network hiccup: leave balances empty so
      // the UI shows dashes rather than a misleading zero.
      setBalances({});
    } finally {
      setBalancesLoading(false);
    }
  }, [walletAddress, assetCodes]);

  useEffect(() => {
    loadBalances();
  }, [loadBalances]);

  const profileUrl =
    creator && typeof window !== 'undefined'
      ? `${window.location.origin}/${creator.username}`
      : '';

  // Total portfolio value in USD across every asset we have a price for. Null
  // when we can't price anything, so we can fall back to the per-asset list.
  const totalUsd = (() => {
    if (!prices) return null;
    let sum = 0;
    let priced = false;
    for (const code of assetCodes) {
      const bal = balances[code];
      const price = prices[code];
      if (bal != null && price != null) {
        sum += parseFloat(bal) * price;
        priced = true;
      }
    }
    return priced ? sum : null;
  })();

  const copyProfile = async () => {
    if (!profileUrl) return;
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopied(true);
      toast.success('Profile link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy link');
    }
  };

  // Prefer the native share sheet (great on mobile); fall back to copying the
  // link on desktop browsers that don't implement the Web Share API.
  const shareProfile = async () => {
    if (!profileUrl) return;
    const shareData = {
      title: creator?.displayName || creator?.username || 'SupportMe',
      text: `Support ${creator?.displayName || creator?.username} on SupportMe`,
      url: profileUrl,
    };
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // User dismissed the share sheet — not an error worth surfacing.
      }
      return;
    }
    await copyProfile();
  };

  // Kick off the SEP-24 deposit. The interactive popup must open synchronously
  // inside runDeposit once the anchor returns the URL, so nothing blocking runs
  // before that on the UI side. Refresh balances afterward.
  const handleDeposit = async () => {
    if (!walletAddress) {
      toast.error('No wallet connected');
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
      const description = err instanceof AnchorError ? err.message : (err as Error).message;
      toast.error('Deposit failed', { description });
    } finally {
      setDepositing(false);
      setDepositStatus(null);
      loadBalances();
    }
  };

  const handleWithdraw = async () => {
    if (!walletAddress) {
      toast.error('No wallet connected');
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
      const description = err instanceof AnchorError ? err.message : (err as Error).message;
      toast.error('Withdrawal failed', { description });
    } finally {
      setWithdrawing(false);
      setWithdrawStatus(null);
      loadBalances();
    }
  };

  const greetingName = creator?.displayName || creator?.username || 'there';
  const busy = withdrawing || depositing;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background">
        <AppNav />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {loading ? (
            <Skeleton className="h-9 w-56 mb-8" />
          ) : (
            <h1 className="text-3xl sm:text-4xl font-extrabold text-ink mb-8 tracking-tight">
              Hey, {greetingName} 👋
            </h1>
          )}

          {/* Balance card */}
          <div className="card-brutal bg-brand-cyan p-6 sm:p-8 mb-8">
            <div className="flex items-center justify-between mb-4">
              <p className="text-ink text-sm font-bold uppercase tracking-wide">Balance</p>
              <div className="flex items-center gap-2">
                {totalUsd != null && (
                  <button
                    onClick={() => setShowUsd((v) => !v)}
                    className="btn-brutal btn-brutal-white text-xs px-3 py-1.5"
                    aria-pressed={showUsd}
                  >
                    {showUsd ? 'USD' : 'Crypto'}
                  </button>
                )}
                <button
                  onClick={() => setHidden((v) => !v)}
                  aria-label={hidden ? 'Show balance' : 'Hide balance'}
                  className="btn-brutal btn-brutal-white text-xs px-3 py-1.5 gap-1.5"
                >
                  <HugeiconsIcon
                    icon={hidden ? ViewIcon : ViewOffSlashIcon}
                    size={16}
                    strokeWidth={2}
                  />
                  {hidden ? 'Show' : 'Hide'}
                </button>
              </div>
            </div>

            {balancesLoading ? (
              <Skeleton className="h-12 w-48" />
            ) : hidden ? (
              <p className="text-4xl sm:text-5xl font-extrabold text-ink tabular-nums">••••••</p>
            ) : showUsd && totalUsd != null ? (
              <p className="text-4xl sm:text-5xl font-extrabold text-ink tabular-nums">
                ${totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            ) : (
              <div className="space-y-1">
                {assetCodes.map((code) => {
                  const bal = balances[code];
                  const usd = bal != null ? formatUsd(parseFloat(bal), code, prices) : null;
                  return (
                    <div key={code} className="flex items-baseline gap-3">
                      <span className="text-3xl sm:text-4xl font-extrabold text-ink tabular-nums">
                        {bal ?? '—'}
                      </span>
                      <span className="text-lg font-bold text-ink/70">{code}</span>
                      {usd && <span className="text-sm font-bold text-ink/60">{usd}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Profile link + share */}
          {creator && (
            <div className="card-brutal p-6 mb-8">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink mb-1">Your profile</p>
                  <Link
                    href={`/${creator.username}`}
                    className="font-mono text-sm text-primary hover:underline break-all"
                  >
                    {profileUrl || `/${creator.username}`}
                  </Link>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={copyProfile}
                    className="btn-brutal btn-brutal-white gap-1.5"
                    aria-label="Copy profile link"
                  >
                    <HugeiconsIcon icon={Copy01Icon} size={18} strokeWidth={2} />
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    onClick={shareProfile}
                    className="btn-brutal btn-brutal-primary gap-1.5"
                    aria-label="Share profile"
                  >
                    <HugeiconsIcon icon={Share08Icon} size={18} strokeWidth={2} />
                    Share
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Money actions */}
          <div className="card-brutal p-6">
            <h2 className="text-lg font-extrabold text-ink mb-1">Add funds &amp; cash out</h2>
            <p className="text-xs text-muted mb-4 font-medium">
              Move {anchorConfig.assetCode} between your bank and your wallet through{' '}
              <span className="font-mono">{anchorConfig.homeDomain}</span>.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <button
                  onClick={handleDeposit}
                  disabled={busy || !walletAddress}
                  className="btn-brutal btn-brutal-primary w-full"
                >
                  {depositing ? 'Adding funds…' : `Add ${anchorConfig.assetCode}`}
                </button>
                {depositStatus && (
                  <p className="text-sm text-ink mt-3 font-medium animate-pulse">
                    {DEPOSIT_STATUS_LABELS[depositStatus] || depositStatus}
                  </p>
                )}
              </div>
              <div>
                <button
                  onClick={handleWithdraw}
                  disabled={busy || !walletAddress}
                  className="btn-brutal btn-brutal-lime w-full"
                >
                  {withdrawing ? 'Withdrawing…' : `Cash out ${anchorConfig.assetCode}`}
                </button>
                {withdrawStatus && (
                  <p className="text-sm text-ink mt-3 font-medium animate-pulse">
                    {WITHDRAW_STATUS_LABELS[withdrawStatus] || withdrawStatus}
                  </p>
                )}
              </div>
            </div>
            <p className="text-xs text-muted mt-3 font-medium">
              Testnet sandbox — moves {anchorConfig.assetCode} against the SDF reference anchor
              with fake KYC, not real funds.
            </p>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
