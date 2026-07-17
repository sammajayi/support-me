'use client';

import { TipJar } from './TipJar';

/**
 * App-wide loading state: the animated tip jar instead of a plain spinner.
 * Use for full-screen / centered loading. Content-shaped skeletons (dashboard,
 * settings, profile) intentionally keep their layout-mirroring skeletons.
 */
export function TipJarLoader({ fullScreen = true }: { fullScreen?: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading"
      className={`flex flex-col items-center justify-center ${
        fullScreen ? 'min-h-screen bg-background px-4' : 'py-12'
      }`}
    >
      <TipJar widthClass="w-[150px]" />
    </div>
  );
}
