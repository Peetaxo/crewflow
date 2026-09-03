#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { loadEnvFile } from 'node:process';

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
  try {
    loadEnvFile('.env.local');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const result = runIosDeviceRefresh({ run, dryRun });
  if (result.dryRun) {
    console.log(
      result.plan
        .map((step) => `${step.label}: ${step.executable} ${step.args.join(' ')}`)
        .join('\n'),
    );
  } else {
    console.log(`\n${formatRefreshSummary(result)}`);
  }
} catch (error) {
  if (error instanceof RefreshCommandError) {
    console.error(`\n${formatRefreshSummary(error.summary)}`);
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
