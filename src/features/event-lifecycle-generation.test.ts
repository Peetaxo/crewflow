import { describe, expect, it, vi } from 'vitest';
import { runLifecycleDataMutation } from './event-lifecycle-generation';

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe('lifecycle data mutation coordinator', () => {
  it('does not let a Crew lifecycle refresh overlap a failed timelog mutation reload', async () => {
    const failedReload = deferred<void>();
    const order: string[] = [];
    const timelogMutation = runLifecycleDataMutation(['timelog:1'], async () => {
      order.push('timelog-start');
      await failedReload.promise;
      order.push('timelog-reload-finished');
      throw new Error('write failed');
    });
    const crewMutation = runLifecycleDataMutation(['event:1'], async () => {
      order.push('crew-refresh');
    });

    await vi.waitFor(() => expect(order).toEqual(['timelog-start']));
    failedReload.resolve();
    await expect(timelogMutation).rejects.toThrow('write failed');
    await crewMutation;
    expect(order).toEqual(['timelog-start', 'timelog-reload-finished', 'crew-refresh']);
  });

  it('releases the shared lock after rejection so retries can run', async () => {
    await expect(runLifecycleDataMutation([], async () => { throw new Error('failed'); })).rejects.toThrow('failed');
    const retry = vi.fn();
    await runLifecycleDataMutation([], async () => { retry(); });
    expect(retry).toHaveBeenCalledOnce();
  });
});
