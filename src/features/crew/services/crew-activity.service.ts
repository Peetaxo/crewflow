import { appDataSource } from '../../../lib/app-config';
import { supabase } from '../../../lib/supabase';

export const recordMyActivity = async (signal: AbortSignal) => {
  if (appDataSource !== 'supabase' || !supabase) return;
  const { error } = await supabase.rpc('record_my_activity').abortSignal(signal);
  if (error) throw new Error(error.message);
};

export const readCrewActivity = async (signal: AbortSignal): Promise<Record<string, string>> => {
  if (appDataSource !== 'supabase' || !supabase) return {};
  const { data, error } = await supabase.from('profile_activity').select('profile_id,last_active_at').abortSignal(signal);
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((row) => [row.profile_id, row.last_active_at]));
};
