import type { QueryData } from '@supabase/supabase-js';
import type { Database } from '../../../lib/database.types';
import type { Event } from '../../../types';
import { normalizeMealSelection } from '../../../utils';
import { supabase } from '../../../lib/supabase';
import { APPROVED_HOURS_STATUSES } from '../../timelogs/services/timelog-approval-state';
import type { CapturedCosts } from './event-hours-costs';
import { buildEventHoursReport } from './event-hours-report';

const dayFields = 'id,date,time_from,time_to,day_type,note,meal,meals';
const receiptFields = 'id,contractor_id,status,amount';
// Select only the financial fields, never the supplier/customer identity in the billing snapshot.
const billingFields = 'rate:source_snapshot->hourly_rate,hours:source_snapshot->hours,work:source_snapshot->amount_hours,km:source_snapshot->km,travel:source_snapshot->amount_km,meals:source_snapshot->amount_meals';
const reportFields: string = `id,updated_at,status,km,contractor_id,profiles!timelogs_contractor_id_fkey(first_name,last_name,hourly_rate),
  captured:invoice_billing_sources(${billingFields}),
  day_count:timelog_days(count),days:timelog_days(${dayFields})`;
const eventHoursSelect: string = `name,job_number,meal_allowance_enabled,updated_at,
  receipts(${receiptFields}),receipt_count:receipts(count),
  assignments:event_assignments(profile_id),roster_size:event_assignments(count),report_count:timelogs(count),
  reports:timelogs(${reportFields})`;

type Client = NonNullable<typeof supabase>;
const readError = () => new Error('Nepodařilo se načíst aktuální hodiny akce. Zkuste to znovu.');
const incomplete = () => new Error('Server vrátil neúplná data. Rozpis hodin se nepodařilo vytvořit.');

type Tables = Database['public']['Tables'];
type Counts = { count: number }[];
type ReportRow = Pick<Tables['timelogs']['Row'], 'id' | 'updated_at' | 'status' | 'contractor_id' | 'km'> & {
  profiles: Pick<Tables['profiles']['Row'], 'first_name' | 'last_name' | 'hourly_rate'> | null;
  captured: CapturedCosts | null;
  day_count: Counts;
  days: Pick<Tables['timelog_days']['Row'], 'id' | 'date' | 'time_from' | 'time_to' | 'day_type' | 'meal' | 'meals' | 'note'>[];
};

const readReportPage = (client: Client, eventId: string, from: number, to: number) => client.from('timelogs').select(reportFields)
  .eq('event_id', eventId).order('id').order('id', { referencedTable: 'days' }).range(from, to)
  .overrideTypes<ReportRow[], { merge: false }>();
const readReceipts = (client: Client, eventId: string) => client.from('receipts').select(receiptFields)
  .eq('event_id', eventId).order('id');

// Compose the typed embeds separately: the full PostgREST select exceeds TypeScript's parser depth.
type Snapshot = Pick<Tables['events']['Row'], 'name' | 'job_number' | 'meal_allowance_enabled' | 'updated_at'> & {
  assignments: { profile_id: string }[]; roster_size: Counts;
  reports: ReportRow[]; report_count: Counts;
  receipts: QueryData<ReturnType<typeof readReceipts>>; receipt_count: Counts;
};

async function readEvent(client: Client, eventId: string) {
  // Order the row aliases specifically. Ordering a table name also orders its count embed.
  const { data, error } = await client.from('events').select(eventHoursSelect).eq('id', eventId)
    .order('profile_id', { referencedTable: 'assignments' })
    .order('id', { referencedTable: 'receipts' })
    .order('id', { referencedTable: 'reports' })
    .order('id', { referencedTable: 'reports.days' }).single().overrideTypes<Snapshot, { merge: false }>();
  if (error || !data) throw readError();
  return data;
}

async function fillPages<T>(
  rows: T[], count: number | undefined, key: (row: T) => string,
  read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  if (count === undefined || !Number.isSafeInteger(count) || rows.length > count) throw incomplete();
  while (rows.length < count) {
    const { data, error } = await read(rows.length, Math.min(count, rows.length + 500) - 1);
    if (error || !data) throw readError();
    if (!data.length || rows.length + data.length > count) throw incomplete();
    rows.push(...data);
  }
  if (new Set(rows.map(key)).size !== count) throw incomplete();
}

async function fillSnapshot(client: Client, eventId: string, snapshot: Snapshot) {
  await fillPages(snapshot.receipts, snapshot.receipt_count[0]?.count, row => row.id,
    (from, to) => readReceipts(client, eventId).range(from, to));
  await fillPages(snapshot.assignments, snapshot.roster_size[0]?.count, row => row.profile_id,
    (from, to) => client.from('event_assignments').select('profile_id').eq('event_id', eventId)
      .order('profile_id').range(from, to));
  await fillPages(snapshot.reports, snapshot.report_count[0]?.count, row => row.id,
    (from, to) => readReportPage(client, eventId, from, to));
  for (const report of snapshot.reports) {
    await fillPages(report.days, report.day_count[0]?.count, row => row.id,
      (from, to) => client.from('timelog_days').select(dayFields).eq('timelog_id', report.id)
        .order('id').range(from, to));
  }
}

export async function loadRemoteEventHours(event: Pick<Event, 'name' | 'job' | 'supabaseId'>) {
  if (!supabase || !event.supabaseId) throw new Error('Pro tuto akci se nepodařilo načíst schválené hodiny.');
  const data = await readEvent(supabase, event.supabaseId);
  if (data.receipts.length !== data.receipt_count[0]?.count
    || data.assignments.length !== data.roster_size[0]?.count
    || data.reports.length !== data.report_count[0]?.count
    || data.reports.some(log => log.days.length !== log.day_count[0]?.count)) {
    // Only oversized events span transactions. Require two matching ordered reads,
    // including roster identities, report versions and the actual shift values.
    await fillSnapshot(supabase, event.supabaseId, data);
    const verification = await readEvent(supabase, event.supabaseId);
    await fillSnapshot(supabase, event.supabaseId, verification);
    if (JSON.stringify(data) !== JSON.stringify(verification)) {
      throw new Error('Údaje akce se během načítání změnily. Zkuste to znovu.');
    }
  }

  const timelogs = data.reports.map(log => ({
    id: log.id, status: log.status, contractorProfileId: log.contractor_id, km: log.km, captured: log.captured,
    days: log.days.map(day => ({
      d: day.date, f: day.time_from ?? '', t: day.time_to ?? '', type: day.day_type, note: day.note ?? '', meals: normalizeMealSelection(day),
    })),
  }));
  return buildEventHoursReport({
    event: { name: data.name, job: data.job_number || event.job, mealAllowanceEnabled: data.meal_allowance_enabled },
    receipts: data.receipts.map(row => ({ contractorProfileId: row.contractor_id, status: row.status, amount: row.amount })),
    timelogs,
    crewAssignments: data.assignments.map(row => ({ contractorProfileId: row.profile_id, name: '' })),
    contractors: data.reports.map(log => ({
      profileId: log.contractor_id, rate: log.profiles?.hourly_rate ?? null, name: [log.profiles?.first_name, log.profiles?.last_name].filter(Boolean).join(' '),
    })),
  });
}

export async function hasRemoteEventHours(eventId: string): Promise<boolean> {
  if (!supabase) throw new Error('Nepodařilo se ověřit schválení hodin.');
  const { data, error } = await supabase.from('timelogs').select('id,timelog_days!inner(id)')
    .eq('event_id', eventId).in('status', APPROVED_HOURS_STATUSES)
    .limit(1).limit(1, { referencedTable: 'timelog_days' });
  if (error) throw new Error('Nepodařilo se ověřit schválení hodin.');
  return Boolean(data?.length);
}
