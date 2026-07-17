'use client';

import { ReactNode, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { TipJarLoader } from '@/components/TipJarLoader';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading, loginWithWallet } = useAuth();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  if (loading) {
    return <TipJarLoader />;
  }

  if (!user) {
    const handleConnect = async () => {
      setConnecting(true);
      setError('');
      try {
        await loginWithWallet();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setConnecting(false);
      }
    };

    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="card-brutal p-8 max-w-md w-full text-center">
          <h1 className="text-2xl font-extrabold text-ink mb-2">Connect Your Wallet</h1>
          <p className="text-muted font-medium mb-6">
            Sign in by connecting your Stellar wallet and approving a sign-in request.
          </p>
          {error && (
            <div className="card-brutal bg-brand-pink p-3 mb-4 text-sm font-bold text-ink">
              {error}
            </div>
          )}
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="btn-brutal btn-brutal-primary w-full"
          >
            {connecting ? 'Connecting...' : 'Connect Wallet'}
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
