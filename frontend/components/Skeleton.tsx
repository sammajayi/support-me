export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md border-2 border-ink/10 bg-ink/10 ${className}`} />;
}
