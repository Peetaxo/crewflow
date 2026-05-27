import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { appDataSource } from './app-config';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

if (!isSupabaseConfigured && appDataSource === 'supabase') {
  console.error('Supabase environment variables are missing. Local backup data is disabled; configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.');
}

export const supabase = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;
