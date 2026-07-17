import { NextResponse } from 'next/server';

// Server-side price proxy. Keeps the CoinGecko API key out of the browser
// bundle: the client calls this route, and this route calls CoinGecko with the
// secret key. Best-effort — on any failure it returns the stablecoin values so
// the UI still shows something sensible.

const COINGECKO_IDS: Record<string, string> = {
  XLM: 'stellar',
};

const STABLE_USD: Record<string, number> = {
  USDC: 1,
  USDT: 1,
};

const SUPPORTED = [...Object.keys(COINGECKO_IDS), ...Object.keys(STABLE_USD)];

// Cache upstream responses briefly so a burst of dashboard loads doesn't hammer
// CoinGecko (and stays comfortably inside the free-tier rate limit).
export const revalidate = 60;

export async function GET() {
  const prices: Record<string, number> = {};
  for (const code of SUPPORTED) {
    if (code in STABLE_USD) prices[code] = STABLE_USD[code];
  }

  const ids = SUPPORTED.map((c) => COINGECKO_IDS[c]).filter(Boolean);
  if (ids.length === 0) return NextResponse.json({ prices });

  const key = process.env.COINGECKO_API_KEY;
  // The demo key uses the public host with an auth header; without a key the
  // same public endpoint still works at a lower rate limit.
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`;

  try {
    const res = await fetch(url, {
      headers: {
        accept: 'application/json',
        ...(key ? { 'x-cg-demo-api-key': key } : {}),
      },
      next: { revalidate: 60 },
    });

    if (res.ok) {
      const json = await res.json();
      for (const code of SUPPORTED) {
        const id = COINGECKO_IDS[code];
        if (id && json[id]?.usd != null) prices[code] = json[id].usd;
      }
    }
  } catch {
    // Network/rate-limit failure — fall through with whatever we have.
  }

  return NextResponse.json({ prices });
}
