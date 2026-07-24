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

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

// AppNav renders WalletMenu, which pulls in wallet/kit internals we don't need
// under test. Stub it to a marker so the nav renders without that machinery.
vi.mock('@/components/AppNav', () => ({
  AppNav: () => <nav data-testid="app-nav" />,
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

const withdrawal = {
  id: 1,
  amountIn: 12,
  amountOut: 11.5,
  fee: 0.5,
  currency: 'USDC',
  anchorTxId: 'anchor-1',
  stellarTxId: 'stellar-1',
  status: 'completed',
  createdAt: '2026-01-02T00:00:00.000Z',
};

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

// Route fetch by URL rather than call order. The dashboard now also fires
// `fetch('/api/prices')` (via usePrices), so an ordered mock queue would be
// consumed by the prices call. Any unmatched URL (including /api/prices)
// resolves to an empty-ish payload.
function mockFetchByUrl({
  creators,
  donations,
  withdrawals,
}: {
  creators?: unknown;
  donations?: unknown;
  withdrawals?: unknown;
}) {
  vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    // Check withdrawals before creators: both contain no overlapping substring,
    // but keep the donations/withdrawals checks ahead of the bare /api/creators.
    if (url.includes('/api/withdrawals')) return Promise.resolve(jsonResponse(withdrawals ?? []));
    if (url.includes('/api/creators')) return Promise.resolve(jsonResponse(creators ?? []));
    if (url.includes('/api/donations')) return Promise.resolve(jsonResponse(donations ?? []));
    return Promise.resolve(jsonResponse({ prices: {} }));
  });
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

  it('renders volume split and recent donations once data has loaded', async () => {
    mockFetchByUrl({ creators: [creator], donations: [donation] });

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByText('Dashboard')).toBeInTheDocument());

    // The single 5 XLM donation shows up as XLM volume, with USDC at zero.
    expect(screen.getByText('XLM Volume').nextElementSibling).toHaveTextContent('5 XLM');
    expect(screen.getByText('USDC Volume').nextElementSibling).toHaveTextContent('0 USDC');
    expect(screen.getByText('nice work')).toBeInTheDocument();

    // The creator loads, so the SSE effect subscribes. Wait for it here so the
    // effect runs while EventSource is still stubbed — otherwise it flushes
    // after afterEach tears the stub down and throws "EventSource is not defined".
    await waitFor(() => expect(FakeEventSource.instances.length).toBe(1));
  });

  it('renders withdrawals in the activity feed and the withdrawn total', async () => {
    mockFetchByUrl({ creators: [creator], donations: [donation], withdrawals: [withdrawal] });

    render(<DashboardPage />);

    await waitFor(() => expect(screen.getByText('Dashboard')).toBeInTheDocument());

    // The cash-out row shows a signed, negative amount and a "Withdraw" label.
    expect(screen.getByText('−12 USDC')).toBeInTheDocument();
    expect(screen.getByText('Withdraw')).toBeInTheDocument();

    // The Withdrawn card sums amountIn by asset.
    expect(screen.getByText('Withdrawn').parentElement).toHaveTextContent('12 USDC');

    // The tip still renders alongside it.
    expect(screen.getByText('nice work')).toBeInTheDocument();

    await waitFor(() => expect(FakeEventSource.instances.length).toBe(1));
  });

  it('prompts profile creation when the user has no creator profile yet', async () => {
    mockFetchByUrl({ creators: [] });

    render(<DashboardPage />);

    await waitFor(() =>
      expect(screen.getByText('Complete Your Profile')).toBeInTheDocument()
    );
  });

  it('prepends a new donation received over SSE and shows a toast', async () => {
    mockFetchByUrl({ creators: [creator], donations: [donation] });

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
