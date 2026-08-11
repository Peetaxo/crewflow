import os from 'node:os';
import { spawnSync } from 'node:child_process';

const allowedPlatforms = new Set(['ios', 'android']);
const requestedPlatforms = process.argv.slice(2);
const platforms = requestedPlatforms.length > 0 ? requestedPlatforms : ['ios'];
const invalidPlatform = platforms.find((platform) => !allowedPlatforms.has(platform));

if (invalidPlatform) {
  console.error(`Unsupported Capacitor platform: ${invalidPlatform}`);
  console.error('Use one of: ios, android');
  process.exit(1);
}

const getLocalDevHost = () => {
  const interfaces = os.networkInterfaces();
  const preferredInterfaceNames = ['en0', 'en1', 'bridge100'];
  const entries = Object.entries(interfaces);
  const orderedEntries = [
    ...preferredInterfaceNames
      .filter((name) => interfaces[name])
      .map((name) => [name, interfaces[name]]),
    ...entries.filter(([name]) => !preferredInterfaceNames.includes(name)),
  ];

  for (const [, addresses] of orderedEntries) {
    const address = addresses?.find((item) => item.family === 'IPv4' && !item.internal);

    if (address) {
      return address.address;
    }
  }

  return '127.0.0.1';
};

const host = process.env.MOBILE_DEV_HOST || '127.0.0.1';
const port = process.env.MOBILE_DEV_PORT || '8085';
const devServerUrl = process.env.CAPACITOR_DEV_SERVER_URL || `http://${host}:${port}`;
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';

console.log(`Using Capacitor live server: ${devServerUrl}`);
console.log(`Local network host available for real devices: ${getLocalDevHost()}`);

for (const platform of platforms) {
  console.log(`Syncing ${platform} with live server...`);

  const result = spawnSync(npxCommand, ['cap', 'sync', platform], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CAPACITOR_DEV_SERVER_URL: devServerUrl,
    },
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
