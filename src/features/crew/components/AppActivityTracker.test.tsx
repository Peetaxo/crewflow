import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppActivityTracker from './AppActivityTracker';

const mocks = vi.hoisted(() => ({ record: vi.fn(), auth: { isAuthRequired: true, isAuthenticated: true, isDevSession: false, currentUserId: 'user-a' } }));
vi.mock('../../../app/providers/useAuth', () => ({ useAuth: () => mocks.auth }));
vi.mock('../services/crew-activity.service', () => ({ recordMyActivity: mocks.record }));

describe('foreground activity tracking', () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.clearAllMocks();
    mocks.auth = { isAuthRequired: true, isAuthenticated: true, isDevSession: false, currentUserId: 'user-a' };
    mocks.record.mockResolvedValue(undefined);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });
  afterEach(() => { vi.useRealTimers(); });
  it('records open and interactions at most once a minute, without idle/background heartbeats', async () => {
    const view = render(<AppActivityTracker />);
    await act(async () => {});
    expect(mocks.record).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(document); fireEvent.keyDown(document);
    expect(mocks.record).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(60_001));
    expect(mocks.record).toHaveBeenCalledTimes(1);
    await act(async () => { fireEvent.pointerDown(document); });
    expect(mocks.record).toHaveBeenCalledTimes(2);
    act(() => vi.advanceTimersByTime(60_001));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    fireEvent(window, new Event('focus')); fireEvent.pointerDown(document);
    expect(mocks.record).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    await act(async () => { fireEvent(document, new Event('visibilitychange')); });
    expect(mocks.record).toHaveBeenCalledTimes(3);
    view.unmount(); act(() => vi.advanceTimersByTime(60_001)); fireEvent.pointerDown(document);
    expect(mocks.record).toHaveBeenCalledTimes(3);
  });
  it.each(['anonymous', 'local', 'dev'] as const)('skips %s sessions', (kind) => {
    if (kind === 'anonymous') mocks.auth.isAuthenticated = false;
    if (kind === 'local') mocks.auth.isAuthRequired = false;
    if (kind === 'dev') mocks.auth.isDevSession = true;
    render(<AppActivityTracker />); fireEvent.pointerDown(document);
    expect(mocks.record).not.toHaveBeenCalled();
  });
});
