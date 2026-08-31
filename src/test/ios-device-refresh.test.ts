import { describe, expect, it } from 'vitest';

import {
  assertMainPreflight,
  createRefreshConfig,
  detectPhoneTransport,
  formatRefreshSummary,
} from '../../scripts/ios-device-refresh-lib.mjs';

describe('iOS device refresh configuration', () => {
  it('uses the project simulator and paired iPhone by default', () => {
    expect(createRefreshConfig({})).toMatchObject({
      projectPath: 'ios/App/App.xcodeproj',
      scheme: 'App',
      bundleId: 'cz.nodu.app',
      simulatorId: 'B337323A-264B-4AAC-9236-BEAAB3701659',
      deviceId: '75DA6037-2430-56C9-A791-4DD552D102BA',
    });
  });

  it('allows device selectors and derived data storage to be overridden', () => {
    expect(createRefreshConfig({
      IOS_REFRESH_SIMULATOR_ID: 'sim-override',
      IOS_REFRESH_DEVICE_ID: 'phone-override',
      IOS_REFRESH_DERIVED_DATA_ROOT: '/tmp/custom-refresh',
    })).toMatchObject({
      simulatorId: 'sim-override',
      deviceId: 'phone-override',
      derivedDataRoot: '/tmp/custom-refresh',
    });
  });
});

describe('iOS device refresh preflight', () => {
  it('accepts only a clean synchronized main checkout', () => {
    expect(() => assertMainPreflight({
      branch: 'main',
      status: '',
      head: 'abc123',
      originHead: 'abc123',
    })).not.toThrow();
  });

  it.each([
    [{ branch: 'feature/work', status: '', head: 'abc', originHead: 'abc' }, 'branch main'],
    [{ branch: 'main', status: ' M package.json', head: 'abc', originHead: 'abc' }, 'clean worktree'],
    [{ branch: 'main', status: '', head: 'abc', originHead: 'def' }, 'origin/main'],
  ])('rejects unsafe state %#', (state, message) => {
    expect(() => assertMainPreflight(state)).toThrow(message);
  });
});

describe('iOS device refresh summary', () => {
  it('maps CoreDevice transport output to a user-facing connection', () => {
    expect(detectPhoneTransport('transportType: localNetwork')).toBe('Wi-Fi');
    expect(detectPhoneTransport('transportType: wired')).toBe('USB');
    expect(detectPhoneTransport('')).toBeNull();
  });

  it('reports simulator success and a waiting phone separately', () => {
    const summary = formatRefreshSummary({
      commit: 'abc1234',
      simulator: { state: 'updated' },
      phone: { state: 'waiting' },
    });

    expect(summary).toContain('simulator: updated');
    expect(summary).toContain('phone: waiting for installation');
  });
});
