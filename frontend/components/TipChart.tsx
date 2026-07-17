'use client';

import { useMemo, useState } from 'react';

interface Donation {
  amount: number;
  currency: string;
  createdAt: string;
}

type RangeKey = '7d' | '30d' | '3m' | 'all';

const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: '3m', label: '3 months', days: 90 },
  { key: 'all', label: 'All time', days: null },
];

// How many buckets to split the selected window into. Each bucket becomes one
// bar; we show both the tip volume (bar height) and the count (label).
const BUCKETS = 12;

interface Bucket {
  start: number;
  volume: number;
  count: number;
}

function buildBuckets(donations: Donation[], days: number | null): { buckets: Bucket[]; unit: string } {
  const now = Date.now();
  const dayMs = 86_400_000;

  // Determine the window start. "All time" spans from the earliest donation.
  let startMs: number;
  if (days) {
    startMs = now - days * dayMs;
  } else if (donations.length) {
    startMs = Math.min(...donations.map((d) => new Date(d.createdAt).getTime()));
  } else {
    startMs = now - 7 * dayMs;
  }

  const span = Math.max(now - startMs, dayMs);
  const bucketMs = span / BUCKETS;
  const buckets: Bucket[] = Array.from({ length: BUCKETS }, (_, i) => ({
    start: startMs + i * bucketMs,
    volume: 0,
    count: 0,
  }));

  for (const d of donations) {
    const t = new Date(d.createdAt).getTime();
    if (t < startMs) continue;
    const idx = Math.min(BUCKETS - 1, Math.floor((t - startMs) / bucketMs));
    buckets[idx].volume += d.amount;
    buckets[idx].count += 1;
  }

  const unit = bucketMs >= 20 * dayMs ? 'mo' : bucketMs >= 2 * dayMs ? 'wk' : 'day';
  return { buckets, unit };
}

function bucketLabel(start: number): string {
  return new Date(start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function TipChart({ donations }: { donations: Donation[] }) {
  const [range, setRange] = useState<RangeKey>('30d');

  const { buckets, windowVolume, windowCount } = useMemo(() => {
    const days = RANGES.find((r) => r.key === range)?.days ?? null;
    const { buckets } = buildBuckets(donations, days);
    return {
      buckets,
      windowVolume: buckets.reduce((s, b) => s + b.volume, 0),
      windowCount: buckets.reduce((s, b) => s + b.count, 0),
    };
  }, [donations, range]);

  const maxVolume = Math.max(...buckets.map((b) => b.volume), 1);

  return (
    <div className="card-brutal p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-extrabold text-ink">Tips over time</h2>
          <p className="text-sm text-muted font-medium">
            {windowCount} tip{windowCount === 1 ? '' : 's'} ·{' '}
            <span className="text-primary font-bold">{windowVolume.toFixed(2)} XLM</span>
          </p>
        </div>
        <div className="relative">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as RangeKey)}
            aria-label="Filter tips by time range"
            className="btn-brutal btn-brutal-white text-sm pr-9 pl-3 py-2 appearance-none cursor-pointer"
          >
            {RANGES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink font-extrabold text-xs">
            ▾
          </span>
        </div>
      </div>

      {windowCount === 0 ? (
        <p className="text-muted font-medium py-8 text-center">No tips in this window yet.</p>
      ) : (
        <div className="flex items-end gap-1.5 h-40" role="img" aria-label="Tip volume over time">
          {buckets.map((b, i) => {
            const pct = (b.volume / maxVolume) * 100;
            return (
              <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                {b.count > 0 && (
                  <div className="absolute -top-1 opacity-0 group-hover:opacity-100 transition text-[10px] font-bold bg-ink text-background px-1.5 py-0.5 rounded whitespace-nowrap z-10 pointer-events-none">
                    {b.volume.toFixed(2)} XLM · {b.count}×
                  </div>
                )}
                <div
                  className="w-full border-2 border-ink rounded-t-md bg-brand-lime transition-all"
                  style={{ height: `${Math.max(pct, b.volume > 0 ? 4 : 0)}%` }}
                />
              </div>
            );
          })}
        </div>
      )}

      {windowCount > 0 && (
        <div className="flex justify-between mt-2 text-[10px] text-muted font-medium font-mono">
          <span>{bucketLabel(buckets[0].start)}</span>
          <span>{bucketLabel(buckets[buckets.length - 1].start)}</span>
        </div>
      )}
    </div>
  );
}
