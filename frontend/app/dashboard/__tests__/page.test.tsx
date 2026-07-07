import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import DashboardPage from '@/app/dashboard/page';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  private listeners: Record<string, Array<(event: MessageEvent) => void>> = {};

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, cb: (event: MessageEvent) => void) {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(cb);
  }

  removeEventListener(type: string, cb: (event: MessageEvent) => void) {
    this.listeners[type] = (this.listeners[type] || []).filter((l) => l !== cb);
  }

  close() {}

  emit(type: string, data: unknown) {
    const event = { data: JSON.stringify(data) } as MessageEvent;
    (this.listeners[type] || []).forEach((cb) => cb(event));
  }
}

const mockUseAuth = vi.mocked(useAuth);

const creator = {
  id: 1,
  userId: 42,
  username: 'alice',
  displayName: 'Alice',
  walletAddress: 'GALICE',
};

const donation = {
  id: 1,
  senderAddress: 'GDONOR',
  amount: 5,
  currency: 'XLM',
  message: 'nice work',
  transactionHash: 'tx1',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

describe('DashboardPage', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      user: { id: 42, walletAddress: 'GALICE' },
      token: 'jwt-token',
      loading: false,
      loginWithWallet: vi.fn(),
      logout: vi.fn(),
    });
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('shows a skeleton while the dashboard data is loading', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {})); // never resolves

    const { container } = render(<DashboardPage />);

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('renders stats and recent donations once data has loaded', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse([creator]))
      .mockResolvedValueOnce(jsonResponse([donation]));

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByText('Dashboard')).toBeInTheDocument());

    expect(screen.getByText('Total Earned').nextElementSibling).toHaveTextContent('5.00 XLM');
    expect(screen.getByText('nice work')).toBeInTheDocument();
  });

  it('prompts profile creation when the user has no creator profile yet', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse([]));

    render(<DashboardPage />);

    await waitFor(() =>
      expect(screen.getByText('Complete Your Profile')).toBeInTheDocument()
    );
  });

  it('prepends a new donation received over SSE and shows a toast', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse([creator]))
      .mockResolvedValueOnce(jsonResponse([donation]));

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByText('Dashboard')).toBeInTheDocument());
    await waitFor(() => expect(FakeEventSource.instances.length).toBe(1));

    act(() => {
      FakeEventSource.instances[0].emit('donation', {
        donor: 'GNEWDONOR',
        creator: 'GALICE',
        amount: '30000000',
        memo: 'live tip',
        timestamp: 1700000000,
        txHash: 'tx-live',
      });
    });

    await waitFor(() => expect(screen.getByText('live tip')).toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledWith(
      'New donation received!',
      expect.objectContaining({ icon: expect.anything() })
    );
  });
});
