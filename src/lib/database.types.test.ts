import { describe, expectTypeOf, it } from 'vitest';
import type { QueryData, SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from './database.types';

type ApprovalFunctions = Database['public']['Functions'];

describe('targeted approval database function contracts', () => {
  it('models SQL jsonb mutation returns as generated Json types', () => {
    expectTypeOf<ApprovalFunctions['handoff_timelogs_for_approval_atomic']['Returns']>()
      .toEqualTypeOf<Json>();
    expectTypeOf<ApprovalFunctions['resolve_timelog_approvals_atomic']['Returns']>()
      .toEqualTypeOf<Json>();
  });
});

// This helper is never called; its builders verify the installed SDK without making requests.
function schemaContractQueries(client: SupabaseClient<Database>) {
  const clients = client.from('clients').insert({ name: 'Production client' }).select('id,name');
  const events = client.from('events').insert({ name: 'Production event' }).select('id,name');
  const profiles = client.from('profiles').insert({}).select('id,user_id');
  const assignments = client.from('event_assignments').insert({ event_id: 'event-id', profile_id: 'profile-id' });
  const timelogs = client.from('timelogs').insert({ event_id: 'event-id', contractor_id: 'profile-id' });
  const receipts = client.from('receipts').insert({ contractor_id: 'profile-id', name: 'Travel' });
  const updates = client.from('clients').update({ city: null, name: 'Updated name' });
  const sequence = client.rpc('next_self_billing_invoice_sequence', {
    p_invoice_year: 2026,
    p_supplier_profile_id: 'profile-id',
  });
  const mutation = client.rpc('handoff_timelogs_for_approval_atomic', { p_targets: [] });
  const activity = client.rpc('record_my_activity');
  const workflows = client.rpc('read_shift_workflows');
  const profileActivity = client.from('profiles').select('profile_activity(last_active_at)');
  client.from('profiles').insert({ user_id: null, hourly_rate: 250 });
  client.from('invoice_approval_documents').insert({ document_name: 'Approval document' });
  client.from('invoice_items').insert({ invoice_id: 'invoice-id', job_number: 'JOB1' });
  client.from('fleet_vehicles').insert({ slug: 'van', name: 'Van', plate: 'ABC123', type: 'van', inspection_valid_until: '2027-01-01' });
  const relationships = client.from('event_assignments').select('events(id,name),profiles(id)');

  // @ts-expect-error A client name has no database default.
  client.from('clients').insert({});
  // @ts-expect-error Both assignment identities are required.
  client.from('event_assignments').insert({ event_id: 'event-id' });
  // @ts-expect-error Billing group IDs are assigned by the caller, with no SQL default.
  client.from('billing_groups').insert({ name: 'Group' });
  // @ts-expect-error Invoice items require a job number even when amounts use defaults.
  client.from('invoice_items').insert({ invoice_id: 'invoice-id' });
  // @ts-expect-error Fleet inspection dates have no database default.
  client.from('fleet_vehicles').insert({ slug: 'van', name: 'Van', plate: 'ABC123', type: 'van' });
  // @ts-expect-error Updates cannot introduce unknown columns.
  client.from('clients').update({ invented_column: true });
  // @ts-expect-error Roles must belong to the database enum.
  client.from('user_roles').insert({ user_id: 'user-id', role: 'admin' });
  // @ts-expect-error RPC arguments retain their SQL scalar types.
  client.rpc('next_self_billing_invoice_sequence', { p_invoice_year: '2026', p_supplier_profile_id: 'profile-id' });
  // @ts-expect-error Required RPC arguments cannot be omitted.
  client.rpc('handoff_timelogs_for_approval_atomic', {});
  // @ts-expect-error Only declared tables are available through the typed client.
  client.from('invented_table');

  return { clients, events, profiles, assignments, timelogs, receipts, updates, sequence, mutation, activity, workflows, profileActivity, relationships };
}

type ContractQueries = ReturnType<typeof schemaContractQueries>;

describe('installed Supabase SDK database contract', () => {
  it('infers table projections, relationship projections, and RPC results', () => {
    expectTypeOf<QueryData<ContractQueries['clients']>>().toEqualTypeOf<Array<{ id: string; name: string }>>();
    expectTypeOf<QueryData<ContractQueries['events']>>().toEqualTypeOf<Array<{ id: string; name: string }>>();
    expectTypeOf<QueryData<ContractQueries['profiles']>>().toEqualTypeOf<Array<{ id: string; user_id: string | null }>>();
    expectTypeOf<QueryData<ContractQueries['relationships']>>().toEqualTypeOf<Array<{
      events: { id: string; name: string };
      profiles: { id: string };
    }>>();
    expectTypeOf<QueryData<ContractQueries['profileActivity']>>().toEqualTypeOf<Array<{
      profile_activity: { last_active_at: string } | null;
    }>>();
    expectTypeOf<QueryData<ContractQueries['sequence']>>().toEqualTypeOf<number>();
    expectTypeOf<QueryData<ContractQueries['workflows']>>().toEqualTypeOf<Exclude<Json, null>>();
    expectTypeOf<QueryData<ContractQueries['mutation']>>().toEqualTypeOf<Exclude<Json, null>>();
    expectTypeOf<Awaited<ContractQueries['activity']>['data']>().toEqualTypeOf<undefined | null>();
  });
});
