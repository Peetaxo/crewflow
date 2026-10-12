import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCrewActivity } from './useCrewActivity';

const mocks = vi.hoisted(() => ({ read: vi.fn(), auth: { currentUserId: 'a', currentProfileId: 'profile-a', role: 'crewhead', isAuthRequired: true } }));
vi.mock('../../app/providers/useAuth', () => ({ useAuth: () => mocks.auth }));
vi.mock('./services/crew-activity.service', () => ({ readCrewActivity: mocks.read }));

describe('crew activity reads', () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.clearAllMocks();
    mocks.auth = { currentUserId: 'a', currentProfileId: 'profile-a', role: 'crewhead', isAuthRequired: true };
    mocks.read.mockResolvedValue({ 'profile-a': '2026-10-12T10:00:00Z' });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });
  afterEach(() => { vi.useRealTimers(); Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); });
  it('retires stale reads on identity change and immediately removes previous activity', async () => {
    let finish: (value: Record<string, string>) => void;
    mocks.read.mockImplementationOnce(() => new Promise<Record<string, string>>((resolve) => { finish = resolve; }));
    const view = renderHook(() => useCrewActivity(true));
    const signal = mocks.read.mock.calls[0][0] as AbortSignal;
    mocks.auth = { ...mocks.auth, currentUserId: 'b', currentProfileId: 'profile-b' };
    mocks.read.mockResolvedValue({ 'profile-b': '2026-10-12T11:00:00Z' });
    view.rerender();
    expect(signal.aborted).toBe(true);
    expect(view.result.current.data).toEqual({});
    await act(async () => { finish!({ 'profile-a': '2026-10-12T10:00:00Z' }); });
    expect(view.result.current.data).toEqual({ 'profile-b': '2026-10-12T11:00:00Z' });
  });
  it('does not poll hidden pages and refreshes when returning to the foreground', async () => {
    const view = renderHook(() => useCrewActivity(true));
    await act(async () => {});
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    await act(async () => { vi.advanceTimersByTime(120_000); });
    expect(mocks.read).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    await act(async () => { fireEvent(document, new Event('visibilitychange')); });
    expect(mocks.read).toHaveBeenCalledTimes(2);
    view.unmount();
    act(() => vi.advanceTimersByTime(120_000));
    expect(mocks.read).toHaveBeenCalledTimes(2);
  });
  it('reports a read error instead of inventing missing activity', async () => {
    mocks.read.mockRejectedValue(new Error('offline'));
    const view = renderHook(() => useCrewActivity(true));
    await act(async () => {});
    expect(view.result.current.status).toBe('error');
    expect(view.result.current.data).toEqual({});
  });
});
