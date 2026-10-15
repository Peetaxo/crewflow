import { z } from 'zod';
import { appDataSource } from '../../lib/app-config';
import { getLocalAppState } from '../../lib/app-data';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { billingUuid } from './contract';
import type { BillingActor } from './billing-actors';
import { usePrivateInvoiceQuery } from './useBillingScope';
const names = z.array(z.object({ id: billingUuid, user_id: billingUuid.nullable(), first_name: z.string(), last_name: z.string() }).strict());
async function readBillingActors(): Promise<BillingActor[]> {
  if (appDataSource === 'local') return getLocalAppState().contractors.map(({ profileId, userId, name }) => ({ profileId, userId, name }));
  if (!isSupabaseConfigured || !supabase) throw new Error('Jména nejsou dostupná.');
  // Existing profile RLS limits this minimal name projection to this identity.
  const { data, error } = await supabase.from('profiles').select('id,user_id,first_name,last_name');
  if (error) throw error;
  return names.parse(data).map((p) => ({ profileId: p.id, userId: p.user_id, name: `${p.first_name} ${p.last_name}`.trim() }));
}
export function useBillingActors() { return usePrivateInvoiceQuery('invoice-billing-actors', readBillingActors).query; }
