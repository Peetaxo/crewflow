import { describe, expect, it } from 'vitest';

import {
  RefreshCommandError,
  assertMainPreflight,
  createRefreshConfig,
  detectPhoneTransport,
  formatRefreshSummary,
  runIosDeviceRefresh,
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

const successfulPreflight = new Map([
  ['git branch --show-current', { status: 0, stdout: 'main\n', stderr: '' }],
  ['git status --porcelain', { status: 0, stdout: '', stderr: '' }],
  ['git rev-parse HEAD', { status: 0, stdout: 'abc123456\n', stderr: '' }],
  ['git rev-parse origin/main', { status: 0, stdout: 'abc123456\n', stderr: '' }],
]);

const makeRunner = (
  respond: (label: string) => { status: number; stdout?: string; stderr?: string },
) => {
  const calls: string[] = [];
  return {
    calls,
    run(command: string, args: string[]) {
      const label = [command, ...args].join(' ');
      calls.push(label);
      return successfulPreflight.get(label) ?? respond(label);
    },
  };
};

describe('iOS device refresh orchestration', () => {
  it('updates the simulator and skips a currently unavailable phone', () => {
    const runner = makeRunner((label) => ({
      status: label.includes('devicectl device info details') ? 1 : 0,
      stdout: '',
      stderr: '',
    }));

    const result = runIosDeviceRefresh({ run: runner.run });

    expect(result.simulator.state).toBe('updated');
    expect(result.phone.state).toBe('waiting');
    expect(runner.calls.some((call) => call.includes('simctl install'))).toBe(true);
    expect(runner.calls.some((call) => call.includes('devicectl device install app'))).toBe(false);
  });

  it('builds, installs, and launches on an available phone', () => {
    const runner = makeRunner((label) => ({
      status: 0,
      stdout: label.includes('devicectl device info details')
        ? 'transportType: localNetwork\n'
        : '',
      stderr: '',
    }));

    const result = runIosDeviceRefresh({ run: runner.run });

    expect(result).toMatchObject({
      simulator: { state: 'updated' },
      phone: { state: 'updated', transport: 'Wi-Fi' },
    });
    expect(runner.calls.some((call) => call.includes('devicectl device install app'))).toBe(true);
    expect(runner.calls.some((call) => call.includes('devicectl device process launch'))).toBe(true);
  });

  it('fails when an available phone cannot be installed', () => {
    const runner = makeRunner((label) => ({
      status: label.includes('devicectl device install app') ? 1 : 0,
      stdout: '',
      stderr: label.includes('device install app') ? 'install failed' : '',
    }));

    expect(() => runIosDeviceRefresh({ run: runner.run })).toThrow(RefreshCommandError);
    try {
      runIosDeviceRefresh({ run: runner.run });
    } catch (error) {
      expect((error as InstanceType<typeof RefreshCommandError>).summary.phone.state).toBe('failed');
    }
  });

  it('returns a complete command plan in dry-run mode without executing commands', () => {
    const runner = makeRunner(() => ({ status: 0, stdout: '', stderr: '' }));

    const result = runIosDeviceRefresh({ run: runner.run, dryRun: true });

    expect(runner.calls).toEqual([]);
    expect(result.plan.some((step) => step.label === 'Build web app')).toBe(true);
    expect(result.plan.some((step) => step.label === 'Install phone app')).toBe(true);
  });
});
