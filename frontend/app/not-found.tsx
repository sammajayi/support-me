import Link from 'next/link';
import { HugeiconsIcon } from '@hugeicons/react';
import { Compass01Icon } from '@hugeicons/core-free-icons';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="card-brutal p-8 max-w-md w-full text-center">
        <div className="flex justify-center mb-4">
          <div className="card-brutal bg-brand-yellow w-16 h-16 flex items-center justify-center">
            <HugeiconsIcon icon={Compass01Icon} size={32} strokeWidth={2} className="text-ink" />
          </div>
        </div>
        <h1 className="text-2xl font-extrabold text-ink mb-2">Page not found</h1>
        <p className="text-muted mb-6 font-medium">
          The page you&apos;re looking for doesn&apos;t exist or may have moved.
        </p>
        <Link href="/" className="btn-brutal btn-brutal-primary">
          Go Home
        </Link>
      </div>
    </div>
  );
}
