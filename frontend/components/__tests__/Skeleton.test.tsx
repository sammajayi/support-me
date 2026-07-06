import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Skeleton } from '@/components/Skeleton';

describe('Skeleton', () => {
  it('renders a pulsing placeholder element', () => {
    const { container } = render(<Skeleton />);
    const el = container.firstChild as HTMLElement;
    expect(el).toBeInTheDocument();
    expect(el.className).toContain('animate-pulse');
  });

  it('merges the provided className', () => {
    const { container } = render(<Skeleton className="h-4 w-10" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('h-4');
    expect(el.className).toContain('w-10');
  });
});
