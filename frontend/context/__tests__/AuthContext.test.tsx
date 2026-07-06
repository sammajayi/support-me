import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { connectWallet, disconnectWallet, signMessage } from '@/lib/wallet';

vi.mock('@/lib/wallet', () => ({
  connectWallet: vi.fn(),
  disconnectWallet: vi.fn(),
  signMessage: vi.fn(),
}));

const mockConnectWallet = vi.mocked(connectWallet);
const mockDisconnectWallet = vi.mocked(disconnectWallet);
const mockSignMessage = vi.mocked(signMessage);

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear();
    mockConnectWallet.mockReset();
    mockDisconnectWallet.mockReset().mockResolvedValue(undefined);
    mockSignMessage.mockReset();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('restores a session from localStorage on mount', async () => {
    localStorage.setItem('authToken', 'saved-token');
    localStorage.setItem('authUser', JSON.stringify({ id: 1, walletAddress: 'GABC' }));

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.token).toBe('saved-token');
    expect(result.current.user).toEqual({ id: 1, walletAddress: 'GABC' });
  });

  it('logs in with a wallet and persists the session', async () => {
    mockConnectWallet.mockResolvedValue('GABC');
    mockSignMessage.mockResolvedValue('signed-message');
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ message: 'sign this' }))
      .mockResolvedValueOnce(
        jsonResponse({
          user: { id: 1, walletAddress: 'GABC' },
          token: 'jwt-token',
          hasProfile: true,
        })
      );

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let loginResult;
    await act(async () => {
      loginResult = await result.current.loginWithWallet();
    });

    expect(loginResult).toEqual({
      user: { id: 1, walletAddress: 'GABC' },
      token: 'jwt-token',
      hasProfile: true,
    });
    expect(result.current.token).toBe('jwt-token');
    expect(result.current.user).toEqual({ id: 1, walletAddress: 'GABC' });
    expect(localStorage.getItem('authToken')).toBe('jwt-token');
  });

  it('throws when the sign-in challenge fails', async () => {
    mockConnectWallet.mockResolvedValue('GABC');
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'bad address' }, false));

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.loginWithWallet()).rejects.toThrow('bad address');
  });

  it('clears the session and disconnects the wallet on logout', async () => {
    localStorage.setItem('authToken', 'saved-token');
    localStorage.setItem('authUser', JSON.stringify({ id: 1, walletAddress: 'GABC' }));

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
    expect(localStorage.getItem('authToken')).toBeNull();
    expect(mockDisconnectWallet).toHaveBeenCalledTimes(1);
  });
});
