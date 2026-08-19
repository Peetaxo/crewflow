import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStableDraftUuid } from './stable-draft-identity';

describe('createStableDraftUuid', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('allocates one stable UUID or fails closed when crypto is unavailable', () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'client-uuid-1') });

    expect(createStableDraftUuid()).toBe('client-uuid-1');

    vi.stubGlobal('crypto', undefined);

    expect(() => createStableDraftUuid()).toThrow('Stable draft UUID is unavailable');
  });
});
