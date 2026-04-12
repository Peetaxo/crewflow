export type AppDataSource = 'local' | 'supabase';

const rawDataSource = import.meta.env.VITE_APP_DATA_SOURCE;

export const appDataSource: AppDataSource =
  rawDataSource === 'supabase' ? 'supabase' : 'local';
