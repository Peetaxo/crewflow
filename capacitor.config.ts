import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cz.nodu.app',
  appName: 'nodu',
  webDir: 'dist',
  plugins: { PushNotifications: { presentationOptions: ['badge','sound','banner','list'] } },
};

export default config;
