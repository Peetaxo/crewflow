import os from 'node:os';
import path from 'node:path';

export const DEFAULT_REFRESH_CONFIG = Object.freeze({
  projectPath: 'ios/App/App.xcodeproj',
  scheme: 'App',
  bundleId: 'cz.nodu.app',
  simulatorId: 'B337323A-264B-4AAC-9236-BEAAB3701659',
  deviceId: '75DA6037-2430-56C9-A791-4DD552D102BA',
  deviceDestinationId: '00008110-000C284E2299801E',
});

export const createRefreshConfig = (env = process.env) => ({
  ...DEFAULT_REFRESH_CONFIG,
  developmentTeam: env.IOS_REFRESH_DEVELOPMENT_TEAM?.trim() || null,
  simulatorId: env.IOS_REFRESH_SIMULATOR_ID || DEFAULT_REFRESH_CONFIG.simulatorId,
  deviceId: env.IOS_REFRESH_DEVICE_ID || DEFAULT_REFRESH_CONFIG.deviceId,
  deviceDestinationId:
    env.IOS_REFRESH_DEVICE_DESTINATION_ID || DEFAULT_REFRESH_CONFIG.deviceDestinationId,
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
      'simctl',
      'bootstatus',
      config.simulatorId,
      '-b',
    ]),
    command('Build simulator app', 'simulator', 'xcodebuild', [
      '-project',
      config.projectPath,
      '-scheme',
      config.scheme,
      '-configuration',
      'Debug',
      '-destination',
      `id=${config.simulatorId}`,
      '-derivedDataPath',
      simulatorDerivedData,
      'CODE_SIGNING_ALLOWED=NO',
      'build',
    ]),
    command('Install simulator app', 'simulator', 'xcrun', [
      'simctl',
      'install',
      config.simulatorId,
      simulatorApp,
    ]),
    command('Launch simulator app', 'simulator', 'xcrun', [
      'simctl',
      'launch',
      config.simulatorId,
      config.bundleId,
    ]),
    command('Probe phone availability', 'phoneProbe', 'xcrun', [
      'devicectl',
      'device',
      'info',
      'details',
      '--device',
      config.deviceId,
      '--timeout',
      '8',
    ]),
    command('Build phone app', 'phone', 'xcodebuild', [
      '-project',
      config.projectPath,
      '-scheme',
      config.scheme,
      '-configuration',
      'Debug',
      '-destination',
      `id=${config.deviceDestinationId}`,
      '-derivedDataPath',
      phoneDerivedData,
      '-allowProvisioningUpdates',
      ...(config.developmentTeam ? [`DEVELOPMENT_TEAM=${config.developmentTeam}`] : []),
      'build',
    ]),
    command('Install phone app', 'phone', 'xcrun', [
      'devicectl',
      'device',
      'install',
      'app',
      '--device',
      config.deviceId,
      '--timeout',
      '30',
      '--quiet',
      phoneApp,
    ]),
    command('Launch phone app', 'phone', 'xcrun', [
      'devicectl',
      'device',
      'process',
      'launch',
      '--device',
      config.deviceId,
      '--terminate-existing',
      '--timeout',
      '15',
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
