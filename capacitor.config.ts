import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cz.nodu.app',
  appName: 'nodu',
  webDir: 'dist',
  // Native bridge debug logs can include invitation URLs from getLaunchUrl.
  loggingBehavior: 'none',
  plugins: { PushNotifications: { presentationOptions: ['badge','sound','banner','list'] } },
};

export default config;
