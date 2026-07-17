'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { HugeiconsIcon } from '@hugeicons/react';
import { AlertCircleIcon } from '@hugeicons/core-free-icons';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="card-brutal p-8 max-w-md w-full text-center">
        <div className="flex justify-center mb-4">
          <div className="card-brutal bg-brand-yellow w-16 h-16 flex items-center justify-center">
            <HugeiconsIcon icon={AlertCircleIcon} size={32} strokeWidth={2} className="text-ink" />
          </div>
        </div>
        <h1 className="text-2xl font-extrabold text-ink mb-2">Something went wrong</h1>
        <p className="text-muted mb-6 font-medium">
          An unexpected error occurred. You can try again, or head back home.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="btn-brutal btn-brutal-primary"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="btn-brutal btn-brutal-white"
          >
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
