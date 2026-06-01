'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';

export default function CreateUsernamePage() {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { token } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username) {
      setError('Username is required');
      return;
    }

    if (username.length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      setError('Username can only contain letters, numbers, underscores, and hyphens');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `http://localhost:4000/api/creators/${username}/create`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            walletAddress: '',
            displayName: displayName || username,
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create username');
      }

      router.push('/dashboard');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-50 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900">Create Your Profile</h1>
              <p className="text-gray-600 text-sm mt-2">Choose a unique username</p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-sm text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Username
                </label>
                <div className="flex items-center">
                  <span className="text-gray-500 px-4 py-2.5 bg-gray-50 border border-r-0 border-gray-300 rounded-l-lg text-sm">
                    supportme.app/
                  </span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase())}
                    placeholder="yourname"
                    className="flex-1 px-4 py-2.5 border border-l-0 border-gray-300 rounded-r-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Letters, numbers, underscores, and hyphens only (3+ characters)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Display Name (Optional)
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your Name"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition mt-6"
              >
                {loading ? 'Creating profile...' : 'Create Profile'}
              </button>
            </form>

            <p className="text-center text-gray-500 text-xs mt-6">
              You can change this later in your settings
            </p>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
