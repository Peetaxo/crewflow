export type AppDataSource = 'local' | 'supabase';

export const resolveAppDataSource = (rawDataSource: unknown): AppDataSource => (
  String(rawDataSource ?? '').trim().toLowerCase() === 'local' ? 'local' : 'supabase'
);

export const appDataSource: AppDataSource = resolveAppDataSource(import.meta.env.VITE_APP_DATA_SOURCE);

export const isLocalDataEnabled = appDataSource === 'local';
