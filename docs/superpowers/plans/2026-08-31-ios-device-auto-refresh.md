# Automatic iOS Device Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one repeatable project command that refreshes the merged `main` build in the preferred iOS Simulator and, when reachable, the paired iPhone over Wi-Fi.

**Architecture:** Keep configuration, preflight validation, command planning, status classification, and orchestration in a testable ESM module with an injected process runner. A thin CLI adapter performs real `git`, Vite, Capacitor, `xcodebuild`, `simctl`, and `devicectl` calls; `package.json` exposes the command and a root `AGENTS.md` makes post-merge refresh part of the repository workflow.

**Tech Stack:** Node.js ESM, Vitest, npm scripts, Capacitor 8, Xcode command-line tools, CoreSimulator `simctl`, CoreDevice `devicectl`.

---

## File structure

- Create `scripts/ios-device-refresh-lib.mjs`: configuration, pure validation helpers, command construction, orchestration, and summary formatting.
- Create `scripts/ios-device-refresh.mjs`: CLI argument parsing, `spawnSync` adapter, console output, and process exit status.
- Create `src/test/ios-device-refresh.test.ts`: unit and orchestration tests with a fake runner; no real devices are modified.
- Modify `package.json`: add full refresh and dry-run commands.
- Create `AGENTS.md`: require the full refresh after a verified merge into `main` and define the non-blocking unavailable-phone behavior.

### Task 1: Configuration, preflight, and summary helpers

**Files:**
- Create: `scripts/ios-device-refresh-lib.mjs`
- Create: `src/test/ios-device-refresh.test.ts`

- [ ] **Step 1: Write failing tests for defaults, environment overrides, preflight rules, and summaries**

Create `src/test/ios-device-refresh.test.ts` with these initial tests:

```ts
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
    expect(formatRefreshSummary({
      commit: 'abc1234',
      simulator: { state: 'updated' },
      phone: { state: 'waiting' },
    })).toContain('simulator: updated');
    expect(formatRefreshSummary({
      commit: 'abc1234',
      simulator: { state: 'updated' },
      phone: { state: 'waiting' },
    })).toContain('phone: waiting for installation');
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails because the module does not exist**

Run:

```bash
npx vitest run src/test/ios-device-refresh.test.ts --reporter=default
```

Expected: FAIL with an import error for `scripts/ios-device-refresh-lib.mjs`.

- [ ] **Step 3: Implement the configuration, preflight, status types, and summary formatter**

Create `scripts/ios-device-refresh-lib.mjs` with the following public foundation:

```js
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_REFRESH_CONFIG = Object.freeze({
  projectPath: 'ios/App/App.xcodeproj',
  scheme: 'App',
  bundleId: 'cz.nodu.app',
  simulatorId: 'B337323A-264B-4AAC-9236-BEAAB3701659',
  deviceId: '75DA6037-2430-56C9-A791-4DD552D102BA',
});

export const createRefreshConfig = (env = process.env) => ({
  ...DEFAULT_REFRESH_CONFIG,
  simulatorId: env.IOS_REFRESH_SIMULATOR_ID || DEFAULT_REFRESH_CONFIG.simulatorId,
  deviceId: env.IOS_REFRESH_DEVICE_ID || DEFAULT_REFRESH_CONFIG.deviceId,
  derivedDataRoot:
    env.IOS_REFRESH_DERIVED_DATA_ROOT || path.join(os.tmpdir(), 'crewflow-ios-device-refresh'),
});

export const assertMainPreflight = ({ branch, status, head, originHead }) => {
  if (branch !== 'main') {
    throw new Error('iOS refresh requires branch main');
  }
  if (status.trim() !== '') {
    throw new Error('iOS refresh requires a clean worktree');
  }
  if (head !== originHead) {
    throw new Error('iOS refresh requires main to match origin/main');
  }
};

export const detectPhoneTransport = (output) => {
  if (/transportType:\s*localNetwork/i.test(output)) return 'Wi-Fi';
  if (/transportType:\s*wired/i.test(output)) return 'USB';
  return null;
};

const statusText = {
  updated: 'updated',
  waiting: 'waiting for installation',
  failed: 'failed',
  pending: 'not attempted',
};

export const formatRefreshSummary = ({ commit, simulator, phone }) => {
  const phoneTransport = phone.transport ? ` (${phone.transport})` : '';
  return [
    `main: ${commit}`,
    `simulator: ${statusText[simulator.state]}`,
    `phone: ${statusText[phone.state]}${phoneTransport}`,
  ].join('\n');
};
```

- [ ] **Step 4: Run the focused test and verify the helper tests pass**

Run:

```bash
npx vitest run src/test/ios-device-refresh.test.ts --reporter=default
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit the helper foundation**

```bash
git add scripts/ios-device-refresh-lib.mjs src/test/ios-device-refresh.test.ts
git commit -m "test: define iOS device refresh workflow"
```

### Task 2: Test-driven refresh orchestration

**Files:**
- Modify: `scripts/ios-device-refresh-lib.mjs`
- Modify: `src/test/ios-device-refresh.test.ts`

- [ ] **Step 1: Add failing orchestration tests with an injected runner**

Append tests that record commands without invoking Xcode:

```ts
import {
  RefreshCommandError,
  runIosDeviceRefresh,
} from '../../scripts/ios-device-refresh-lib.mjs';

const successfulPreflight = new Map([
  ['git branch --show-current', { status: 0, stdout: 'main\n', stderr: '' }],
  ['git status --porcelain', { status: 0, stdout: '', stderr: '' }],
  ['git rev-parse HEAD', { status: 0, stdout: 'abc123456\n', stderr: '' }],
  ['git rev-parse origin/main', { status: 0, stdout: 'abc123456\n', stderr: '' }],
]);

const makeRunner = (respond: (label: string) => { status: number; stdout?: string; stderr?: string }) => {
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
```

- [ ] **Step 2: Run the focused test and verify the new tests fail**

Run:

```bash
npx vitest run src/test/ios-device-refresh.test.ts --reporter=default
```

Expected: FAIL because `RefreshCommandError` and `runIosDeviceRefresh` are not exported.

- [ ] **Step 3: Add exact command planning and required/optional execution behavior**

Extend `scripts/ios-device-refresh-lib.mjs` with these command boundaries:

```js
const command = (label, target, executable, args) => ({
  label,
  target,
  executable,
  args,
});

export const createRefreshPlan = (config) => {
  const simulatorDerivedData = path.join(config.derivedDataRoot, 'simulator');
  const phoneDerivedData = path.join(config.derivedDataRoot, 'phone');
  const simulatorApp = path.join(
    simulatorDerivedData,
    'Build/Products/Debug-iphonesimulator/App.app',
  );
  const phoneApp = path.join(phoneDerivedData, 'Build/Products/Debug-iphoneos/App.app');

  return [
    command('Build web app', 'shared', 'npm', ['run', 'build']),
    command('Sync Capacitor iOS', 'shared', 'npx', ['cap', 'sync', 'ios']),
    command('Boot simulator', 'simulator', 'xcrun', [
      'simctl', 'bootstatus', config.simulatorId, '-b',
    ]),
    command('Build simulator app', 'simulator', 'xcodebuild', [
      '-project', config.projectPath,
      '-scheme', config.scheme,
      '-configuration', 'Debug',
      '-destination', `id=${config.simulatorId}`,
      '-derivedDataPath', simulatorDerivedData,
      'CODE_SIGNING_ALLOWED=NO',
      'build',
    ]),
    command('Install simulator app', 'simulator', 'xcrun', [
      'simctl', 'install', config.simulatorId, simulatorApp,
    ]),
    command('Launch simulator app', 'simulator', 'xcrun', [
      'simctl', 'launch', config.simulatorId, config.bundleId,
    ]),
    command('Probe phone availability', 'phoneProbe', 'xcrun', [
      'devicectl', 'device', 'info', 'details',
      '--device', config.deviceId,
      '--timeout', '8',
    ]),
    command('Build phone app', 'phone', 'xcodebuild', [
      '-project', config.projectPath,
      '-scheme', config.scheme,
      '-configuration', 'Debug',
      '-destination', `id=${config.deviceId}`,
      '-derivedDataPath', phoneDerivedData,
      '-allowProvisioningUpdates',
      'build',
    ]),
    command('Install phone app', 'phone', 'xcrun', [
      'devicectl', 'device', 'install', 'app',
      '--device', config.deviceId,
      '--timeout', '30',
      '--quiet',
      phoneApp,
    ]),
    command('Launch phone app', 'phone', 'xcrun', [
      'devicectl', 'device', 'process', 'launch',
      '--device', config.deviceId,
      '--terminate-existing',
      '--timeout', '15',
      '--quiet',
      config.bundleId,
    ]),
  ];
};

export class RefreshCommandError extends Error {
  constructor(step, result, summary) {
    super(`${step.label} failed${result.stderr ? `: ${result.stderr.trim()}` : ''}`);
    this.name = 'RefreshCommandError';
    this.step = step;
    this.result = result;
    this.summary = summary;
  }
}

const executeRequired = (run, step, summary) => {
  const result = run(step.executable, step.args);
  if (result.status !== 0) {
    if (step.target === 'simulator') summary.simulator = { state: 'failed' };
    if (step.target === 'phone') summary.phone = { state: 'failed' };
    throw new RefreshCommandError(step, result, summary);
  }
  return result;
};
```

- [ ] **Step 4: Implement preflight and the orchestrator using the planned commands**

Add the following functions to the same module:

```js
const capture = (run, executable, args) => {
  const result = run(executable, args, { capture: true });
  if (result.status !== 0) {
    throw new Error(`${[executable, ...args].join(' ')} failed`);
  }
  return result.stdout.trim();
};

const readPreflight = (run) => ({
  branch: capture(run, 'git', ['branch', '--show-current']),
  status: capture(run, 'git', ['status', '--porcelain']),
  head: capture(run, 'git', ['rev-parse', 'HEAD']),
  originHead: capture(run, 'git', ['rev-parse', 'origin/main']),
});

export const runIosDeviceRefresh = ({
  run,
  env = process.env,
  dryRun = false,
}) => {
  const config = createRefreshConfig(env);
  const plan = createRefreshPlan(config);
  if (dryRun) return { dryRun: true, plan };

  const preflight = readPreflight(run);
  assertMainPreflight(preflight);
  const summary = {
    commit: preflight.head.slice(0, 7),
    simulator: { state: 'pending' },
    phone: { state: 'pending' },
  };

  for (const step of plan.filter((item) => item.target === 'shared')) {
    executeRequired(run, step, summary);
  }
  for (const step of plan.filter((item) => item.target === 'simulator')) {
    executeRequired(run, step, summary);
  }
  summary.simulator = { state: 'updated' };

  const probe = plan.find((item) => item.target === 'phoneProbe');
  const probeResult = run(probe.executable, probe.args, { capture: true });
  if (probeResult.status !== 0) {
    summary.phone = { state: 'waiting' };
    return summary;
  }

  for (const step of plan.filter((item) => item.target === 'phone')) {
    executeRequired(run, step, summary);
  }
  summary.phone = {
    state: 'updated',
    transport: detectPhoneTransport(probeResult.stdout),
  };
  return summary;
};
```

- [ ] **Step 5: Run the focused test and verify all orchestration cases pass**

Run:

```bash
npx vitest run src/test/ios-device-refresh.test.ts --reporter=default
```

Expected: PASS, 12 tests. The fake runner must show no real `xcodebuild`, `simctl`, or `devicectl` side effects.

- [ ] **Step 6: Commit the orchestration**

```bash
git add scripts/ios-device-refresh-lib.mjs src/test/ios-device-refresh.test.ts
git commit -m "feat: orchestrate iOS device refresh"
```

### Task 3: CLI, npm commands, and persistent project workflow

**Files:**
- Create: `scripts/ios-device-refresh.mjs`
- Modify: `package.json`
- Create: `AGENTS.md`

- [ ] **Step 1: Create the thin CLI adapter**

Create `scripts/ios-device-refresh.mjs`:

```js
#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

import {
  RefreshCommandError,
  formatRefreshSummary,
  runIosDeviceRefresh,
} from './ios-device-refresh-lib.mjs';

const dryRun = process.argv.slice(2).includes('--dry-run');

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : ['inherit', 'pipe', 'pipe'],
  });

  if (!options.capture) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }

  return {
    status: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || result.error?.message || '',
  };
};

try {
  const result = runIosDeviceRefresh({ run, dryRun });
  if (result.dryRun) {
    console.log(result.plan.map((step) => `${step.label}: ${step.executable} ${step.args.join(' ')}`).join('\n'));
  } else {
    console.log('\n' + formatRefreshSummary(result));
  }
} catch (error) {
  if (error instanceof RefreshCommandError) {
    console.error('\n' + formatRefreshSummary(error.summary));
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
```

- [ ] **Step 2: Expose full and dry-run npm commands**

Add these entries to the `scripts` object in `package.json` next to the existing Capacitor commands:

```json
"ios:refresh:devices": "node scripts/ios-device-refresh.mjs",
"ios:refresh:devices:dry-run": "node scripts/ios-device-refresh.mjs --dry-run"
```

- [ ] **Step 3: Persist the post-merge requirement for future agent sessions**

Create root `AGENTS.md`:

```md
# Project workflow

## iOS development installations

After a successful merge into `main`, first verify the merged code and synchronize local `main` with `origin/main`. Then run:

```bash
npm run ios:refresh:devices
```

Report the simulator and physical iPhone results separately. An unavailable paired iPhone is non-blocking and must be reported as waiting for installation. A build, signing, installation, or launch failure on an available device is blocking and must not be reported as updated. This command updates local development installations only; it is not a production deployment.
```

- [ ] **Step 4: Verify dry-run output without touching either device**

Run:

```bash
npm run ios:refresh:devices:dry-run
```

Expected: exit 0 and a printed plan containing `Build web app`, `Install simulator app`, and `Install phone app`. It must not boot, install, or launch anything.

- [ ] **Step 5: Verify the full command fails closed on the feature branch before any build**

Run:

```bash
npm run ios:refresh:devices
```

Expected: non-zero exit with `iOS refresh requires branch main`. Confirm that output does not contain Vite or Xcode build output.

- [ ] **Step 6: Run the focused tests and static checks**

Run:

```bash
npx vitest run src/test/ios-device-refresh.test.ts --reporter=default
npx eslint src/test/ios-device-refresh.test.ts
npx tsc --noEmit
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit the CLI and workflow rule**

```bash
git add AGENTS.md package.json scripts/ios-device-refresh.mjs
git commit -m "chore: automate iOS development refresh"
```

### Task 4: Full verification and post-merge device acceptance

**Files:**
- Verify only; no tracked file changes expected.

- [ ] **Step 1: Run the complete test suite in the feature worktree**

Run:

```bash
./node_modules/.bin/vitest run --reporter=default
```

Expected: 95 test files pass, including the new iOS refresh tests, with zero failures.

- [ ] **Step 2: Verify production build compatibility**

Ensure the ignored `.env.local` used by the current `main` checkout is available in the feature worktree without printing its contents. Then run:

```bash
npm run build
npx cap sync ios
git status --short
```

Expected: build and Capacitor sync exit 0; only intentional tracked implementation or plan files appear in status.

- [ ] **Step 3: Review and integrate through the normal branch completion flow**

Use `superpowers:requesting-code-review`, fix verified findings, then use `superpowers:finishing-a-development-branch`. Merge only after the user selects an integration option and the merged result passes the complete test suite.

- [ ] **Step 4: Run the real refresh from clean synchronized `main`**

After integration, run:

```bash
npm run ios:refresh:devices
```

Expected when the iPhone is reachable over Wi-Fi:

```text
main: abc1234
simulator: updated
phone: updated (Wi-Fi)
```

Expected when the iPhone is unavailable:

```text
main: abc1234
simulator: updated
phone: waiting for installation
```

- [ ] **Step 5: Verify the installed app surfaces**

For the Simulator, capture a UI snapshot or screenshot showing that `cz.nodu.app` launched. For an available iPhone, confirm that `devicectl device process launch` exited 0. Report both results separately and do not describe a waiting phone as updated.
