'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { TipJarLoader } from '@/components/TipJarLoader';

export default function DonatePage() {
  const router = useRouter();

  useEffect(() => {
    router.push('/');
  }, [router]);

  return <TipJarLoader />;
}

