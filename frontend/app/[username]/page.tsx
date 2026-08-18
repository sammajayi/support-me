import type { Metadata } from 'next';
import { API_URL } from '@/lib/api';
import CreatorProfileClient from './CreatorProfileClient';

type ParamsPromise = Promise<{ username: string }>;

interface CreatorSummary {
  username: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
}

// Server-side only, purely for building link-preview metadata — the client
// component does its own fetch (with live SSE updates) for the actual page.
async function fetchCreatorSummary(username: string): Promise<CreatorSummary | null> {
  try {
    const res = await fetch(`${API_URL}/api/creators/${username}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: ParamsPromise }): Promise<Metadata> {
  const { username } = await params;
  const creator = await fetchCreatorSummary(username);

  if (!creator) {
    return { title: 'Creator not found — SupportMe' };
  }

  const name = creator.displayName || creator.username;
  const description = creator.bio?.trim() || `Support ${name} with a tip on SupportMe.`;
  const title = `${name} (@${creator.username}) on SupportMe`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'profile',
      images: creator.avatarUrl ? [{ url: creator.avatarUrl }] : undefined,
    },
    twitter: {
      card: creator.avatarUrl ? 'summary' : 'summary_large_image',
      title,
      description,
      images: creator.avatarUrl ? [creator.avatarUrl] : undefined,
    },
  };
}

export default function CreatorProfilePage({ params }: { params: ParamsPromise }) {
  return <CreatorProfileClient params={params} />;
}
