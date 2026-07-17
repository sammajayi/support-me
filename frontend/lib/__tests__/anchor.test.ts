import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as StellarSdk from '@stellar/stellar-sdk';
import { loadAnchorConfig, pollWithdraw, AnchorError } from '@/lib/anchor';

// The anchor module signs with the wallet; those paths aren't exercised here.
// We test the pure/network parts: TOML resolution + validation, and the
// status-polling loop, both with mocked I/O.
vi.mock('@/lib/wallet', () => ({
  signTransaction: vi.fn(),
}));

const GOOD_TOML = {
  TRANSFER_SERVER_SEP0024: 'https://anchor.example/sep24/',
  WEB_AUTH_ENDPOINT: 'https://anchor.example/auth',
  SIGNING_KEY: 'GSIGNINGKEY',
  CURRENCIES: [{ code: 'SRT', issuer: 'GISSUER' }],
};

describe('loadAnchorConfig', () => {
  afterEach(() => vi.restoreAllMocks());

  it('resolves endpoints and the asset issuer from the anchor TOML', async () => {
    vi.spyOn(StellarSdk.StellarToml.Resolver, 'resolve').mockResolvedValue(GOOD_TOML as never);

    const config = await loadAnchorConfig('anchor.example', 'SRT');

    expect(config.transferServer).toBe('https://anchor.example/sep24'); // trailing slash trimmed
    expect(config.webAuthEndpoint).toBe('https://anchor.example/auth');
    expect(config.assetIssuer).toBe('GISSUER');
    expect(config.assetCode).toBe('SRT');
  });

  it('throws an AnchorError when the anchor does not list the asset', async () => {
    vi.spyOn(StellarSdk.StellarToml.Resolver, 'resolve').mockResolvedValue({
      ...GOOD_TOML,
      CURRENCIES: [{ code: 'USDC', issuer: 'GOTHER' }],
    } as never);

    await expect(loadAnchorConfig('anchor.example', 'SRT')).rejects.toThrowError(AnchorError);
  });

  it('throws an AnchorError when SEP-24 is not advertised', async () => {
    vi.spyOn(StellarSdk.StellarToml.Resolver, 'resolve').mockResolvedValue({
      WEB_AUTH_ENDPOINT: 'https://anchor.example/auth',
      SIGNING_KEY: 'GSIGNINGKEY',
      CURRENCIES: [{ code: 'SRT', issuer: 'GISSUER' }],
    } as never);

    await expect(loadAnchorConfig('anchor.example', 'SRT')).rejects.toThrowError(/transfer server/i);
  });
});

describe('pollWithdraw', () => {
  const config = {
    transferServer: 'https://anchor.example/sep24',
    assetCode: 'SRT',
  } as never;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function txResponse(status: string) {
    return { ok: true, json: async () => ({ transaction: { status } }) } as Response;
  }

  it('emits each new status and stops at a terminal status', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(txResponse('pending_user_transfer_start'))
      .mockResolvedValueOnce(txResponse('pending_anchor'))
      .mockResolvedValueOnce(txResponse('completed'));

    const seen: string[] = [];
    const result = await pollWithdraw(config, 'token', 'txid', {
      onStatus: (s: string) => { seen.push(s); },
      intervalMs: 0,
    });

    expect(seen).toEqual(['pending_user_transfer_start', 'pending_anchor', 'completed']);
    expect(result.status).toBe('completed');
  });

  it('does not re-emit an unchanged status', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(txResponse('pending_anchor'))
      .mockResolvedValueOnce(txResponse('pending_anchor'))
      .mockResolvedValueOnce(txResponse('completed'));

    const seen: string[] = [];
    await pollWithdraw(config, 'token', 'txid', {
      onStatus: (s: string) => { seen.push(s); },
      intervalMs: 0,
    });

    expect(seen).toEqual(['pending_anchor', 'completed']);
  });

  it('propagates a throw from onStatus (e.g. the withdraw payment failing)', async () => {
    vi.mocked(fetch).mockResolvedValue(txResponse('pending_user_transfer_start'));

    await expect(
      pollWithdraw(config, 'token', 'txid', {
        onStatus: async () => { throw new Error('payment failed'); },
        intervalMs: 0,
      })
    ).rejects.toThrow('payment failed');
  });
});
