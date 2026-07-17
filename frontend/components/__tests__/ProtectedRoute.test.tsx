import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/context/AuthContext';

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

const mockUseAuth = vi.mocked(useAuth);

describe('ProtectedRoute', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
  });

  it('shows a loading state while auth is initializing', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      token: null,
      loading: true,
      loginWithWallet: vi.fn(),
      logout: vi.fn(),
    });

    render(
      <ProtectedRoute>
        <div>Secret content</div>
      </ProtectedRoute>
    );

    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
    expect(screen.queryByText('Secret content')).not.toBeInTheDocument();
  });

  it('prompts to connect a wallet when there is no user', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      token: null,
      loading: false,
      loginWithWallet: vi.fn(),
      logout: vi.fn(),
    });

    render(
      <ProtectedRoute>
        <div>Secret content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Connect Your Wallet')).toBeInTheDocument();
    expect(screen.queryByText('Secret content')).not.toBeInTheDocument();
  });

  it('calls loginWithWallet when the connect button is clicked', async () => {
    const loginWithWallet = vi.fn().mockResolvedValue({});
    mockUseAuth.mockReturnValue({
      user: null,
      token: null,
      loading: false,
      loginWithWallet,
      logout: vi.fn(),
    });

    render(
      <ProtectedRoute>
        <div>Secret content</div>
      </ProtectedRoute>
    );

    fireEvent.click(screen.getByRole('button', { name: /connect wallet/i }));

    await waitFor(() => expect(loginWithWallet).toHaveBeenCalledTimes(1));
  });

  it('renders children when a user is authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 1, walletAddress: 'GABC' },
      token: 'jwt',
      loading: false,
      loginWithWallet: vi.fn(),
      logout: vi.fn(),
    });

    render(
      <ProtectedRoute>
        <div>Secret content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Secret content')).toBeInTheDocument();
  });
});
