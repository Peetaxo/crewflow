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
