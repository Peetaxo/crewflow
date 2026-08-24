import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppDataBootstrap, { AUTHENTICATED_LOADING_INTRO_MS } from './AppDataBootstrap';

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const mockAuthState = {
  currentProfileId: 'profile-1' as string | null,
  currentUserId: 'user-1' as string | null,
  isAuthRequired: true,
  isAuthenticated: true,
  isLoading: false,
  role: 'crew' as 'crew' | 'coo',
};

let prefersReducedMotion = true;

const runtimeConfig = vi.hoisted(() => ({
  appDataSource: 'supabase' as 'local' | 'supabase',
}));

const mocks = vi.hoisted(() => ({
  bootstrap: vi.fn<() => Promise<void>>(),
}));

vi.mock('../../lib/app-config', () => ({
  get appDataSource() {
    return runtimeConfig.appDataSource;
  },
}));

vi.mock('./initial-app-data-bootstrap', () => ({
  bootstrapInitialAppData: mocks.bootstrap,
}));

vi.mock('./useAuth', () => ({
  useAuth: () => mockAuthState,
}));

describe('AppDataBootstrap', () => {
  beforeEach(() => {
    runtimeConfig.appDataSource = 'supabase';
    prefersReducedMotion = true;
    Object.assign(mockAuthState, {
      currentProfileId: 'profile-1',
      currentUserId: 'user-1',
      isAuthRequired: true,
      isAuthenticated: true,
      isLoading: false,
      role: 'crew',
    });
    mocks.bootstrap.mockReset().mockResolvedValue(undefined);
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: query === '(prefers-reduced-motion: reduce)' && prefersReducedMotion,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps one loading mark mounted from auth metadata into data bootstrap', async () => {
    const attempt = createDeferred<void>();
    mocks.bootstrap.mockReturnValueOnce(attempt.promise);
    mockAuthState.isLoading = true;

    const view = render(
      <AppDataBootstrap>
        <div>Ready dashboard</div>
      </AppDataBootstrap>,
    );

    const loadingMark = screen.getByRole('status', { name: 'Připravuji aplikaci' });
    expect(mocks.bootstrap).not.toHaveBeenCalled();

    mockAuthState.isLoading = false;
    view.rerender(
      <AppDataBootstrap>
        <div>Ready dashboard</div>
      </AppDataBootstrap>,
    );

    await waitFor(() => expect(mocks.bootstrap).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('status', { name: 'Připravuji aplikaci' })).toBe(loadingMark);

    await act(async () => { attempt.resolve(); });
    expect(await screen.findByText('Ready dashboard')).toBeInTheDocument();
  });

  it('waits for the outward-ray intro when bootstrap finishes early', async () => {
    vi.useFakeTimers();
    prefersReducedMotion = false;

    render(
      <AppDataBootstrap>
        <div>Ready dashboard</div>
      </AppDataBootstrap>,
    );

    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByText('Ready dashboard')).not.toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(AUTHENTICATED_LOADING_INTRO_MS - 1); });
    expect(screen.queryByText('Ready dashboard')).not.toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.getByText('Ready dashboard')).toBeInTheDocument();
  });

  it('reveals immediately when bootstrap finishes after the outward-ray intro', async () => {
    vi.useFakeTimers();
    prefersReducedMotion = false;
    const attempt = createDeferred<void>();
    mocks.bootstrap.mockReturnValueOnce(attempt.promise);

    render(
      <AppDataBootstrap>
        <div>Ready dashboard</div>
      </AppDataBootstrap>,
    );

    act(() => { vi.advanceTimersByTime(AUTHENTICATED_LOADING_INTRO_MS); });
    await act(async () => { attempt.resolve(); });

    expect(screen.getByText('Ready dashboard')).toBeInTheDocument();
  });

  it('does not impose the intro minimum again for a later role scope', async () => {
    vi.useFakeTimers();
    prefersReducedMotion = false;
    const cooAttempt = createDeferred<void>();
    mocks.bootstrap
      .mockResolvedValueOnce(undefined)
      .mockReturnValueOnce(cooAttempt.promise);

    const view = render(
      <AppDataBootstrap>
        <div>Ready dashboard</div>
      </AppDataBootstrap>,
    );

    await act(async () => { await Promise.resolve(); });
    act(() => { vi.advanceTimersByTime(AUTHENTICATED_LOADING_INTRO_MS); });
    expect(screen.getByText('Ready dashboard')).toBeInTheDocument();

    mockAuthState.role = 'coo';
    view.rerender(
      <AppDataBootstrap>
        <div>Ready dashboard</div>
      </AppDataBootstrap>,
    );
    await act(async () => { await Promise.resolve(); });
    expect(mocks.bootstrap).toHaveBeenCalledTimes(2);

    await act(async () => { cooAttempt.resolve(); });
    expect(screen.getByText('Ready dashboard')).toBeInTheDocument();
  });

  it('skips the artificial minimum when reduced motion is requested', async () => {
    prefersReducedMotion = true;

    render(
      <AppDataBootstrap>
        <div>Ready dashboard</div>
      </AppDataBootstrap>,
    );

    expect(await screen.findByText('Ready dashboard')).toBeInTheDocument();
  });

  it('cancels a delayed reveal after unmount', async () => {
    vi.useFakeTimers();
    prefersReducedMotion = false;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const view = render(
      <AppDataBootstrap>
        <div>Ready dashboard</div>
      </AppDataBootstrap>,
    );

    await act(async () => { await Promise.resolve(); });
    view.unmount();
    act(() => { vi.advanceTimersByTime(AUTHENTICATED_LOADING_INTRO_MS); });

    expect(consoleError).not.toHaveBeenCalled();
  });

  it('keeps children hidden until all initial data commits', async () => {
    const attempt = createDeferred<void>();
    mocks.bootstrap.mockReturnValueOnce(attempt.promise);

    render(
      <AppDataBootstrap>
        <div>Ready dashboard</div>
      </AppDataBootstrap>,
    );

    expect(screen.getByRole('status', { name: 'Připravuji aplikaci' })).toBeInTheDocument();
    expect(screen.queryByText('Ready dashboard')).not.toBeInTheDocument();

    await act(async () => { attempt.resolve(); });
    expect(await screen.findByText('Ready dashboard')).toBeInTheDocument();
  });

  it('shows a generic retry state without raw Supabase text', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.bootstrap
      .mockRejectedValueOnce(new Error('new row violates row-level security'))
      .mockResolvedValueOnce(undefined);

    try {
      render(
        <AppDataBootstrap>
          <div>Ready dashboard</div>
        </AppDataBootstrap>,
      );

      expect(await screen.findByText('Data aplikace se nepodařilo načíst.')).toBeInTheDocument();
      expect(screen.queryByText('new row violates row-level security')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Zkusit znovu' }));
      expect(await screen.findByText('Ready dashboard')).toBeInTheDocument();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('ignores completion from the previous role scope', async () => {
    const crewAttempt = createDeferred<void>();
    const cooAttempt = createDeferred<void>();
    mocks.bootstrap
      .mockReturnValueOnce(crewAttempt.promise)
      .mockReturnValueOnce(cooAttempt.promise);

    const view = render(
      <AppDataBootstrap>
        <div>Ready dashboard</div>
      </AppDataBootstrap>,
    );
    await waitFor(() => expect(mocks.bootstrap).toHaveBeenCalledTimes(1));

    mockAuthState.role = 'coo';
    view.rerender(
      <AppDataBootstrap>
        <div>Ready dashboard</div>
      </AppDataBootstrap>,
    );
    await waitFor(() => expect(mocks.bootstrap).toHaveBeenCalledTimes(2));

    await act(async () => { crewAttempt.resolve(); });
    expect(screen.queryByText('Ready dashboard')).not.toBeInTheDocument();

    await act(async () => { cooAttempt.resolve(); });
    expect(await screen.findByText('Ready dashboard')).toBeInTheDocument();
  });

  it('renders local data immediately without starting Supabase bootstrap', () => {
    runtimeConfig.appDataSource = 'local';

    render(
      <AppDataBootstrap>
        <div>Ready dashboard</div>
      </AppDataBootstrap>,
    );

    expect(screen.getByText('Ready dashboard')).toBeInTheDocument();
    expect(mocks.bootstrap).not.toHaveBeenCalled();
  });

  it('ignores an in-flight completion after unmount', async () => {
    const attempt = createDeferred<void>();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.bootstrap.mockReturnValueOnce(attempt.promise);
    const view = render(
      <AppDataBootstrap>
        <div>Ready dashboard</div>
      </AppDataBootstrap>,
    );
    await waitFor(() => expect(mocks.bootstrap).toHaveBeenCalledTimes(1));

    view.unmount();
    await act(async () => { attempt.resolve(); });

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
