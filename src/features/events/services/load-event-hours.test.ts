import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadRemoteEventHours } from './load-event-hours';

const io = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('../../../lib/supabase', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  return { supabase: createClient('http://database.test', 'test-key', {
    global: { fetch: io.fetch }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }) };
});

const event = { name: 'Veletrh', job: 'JOB', supabaseId: 'selected-event' };
const day = (id: string) => ({ id, date: '2026-11-14', time_from: '23:00', time_to: '01:30', day_type: 'provoz', note: null });
const reports = [
  { id: 'a', updated_at: 'v1', status: 'approved', km: 10, captured: null, contractor_id: 'p1', profiles: { first_name: 'Eva', last_name: 'Malá', hourly_rate: 200 }, timelog_days: [day('a1'), day('a2'), day('a3')] },
  { id: 'b', updated_at: 'v1', status: 'pending_coo', contractor_id: 'p2', profiles: null, timelog_days: [] },
  { id: 'c', updated_at: 'v1', status: 'paid', km: 0, captured: { rate: 300, work: 750, km: 0, travel: 0, meals: 0, hours: 2.5 }, contractor_id: 'p3', profiles: { first_name: 'Jan', last_name: 'Malý', hourly_rate: 400 }, timelog_days: [day('c1')] },
];
const eventReceipts = [1, 2, 3].map(id => ({ id: String(id), contractor_id: 'p1', status: 'approved', amount: 11 }));
const roster = ['p1', 'p2', 'p3'].map(profile_id => ({ profile_id }));

function serve(options: { cap?: number; logs?: typeof reports; assignments?: typeof roster; receipts?: typeof eventReceipts; onRead?: (table: string, snapshot: number) => Response | void } = {}) {
  const { cap = 1000, logs = structuredClone(reports), assignments = structuredClone(roster), receipts = structuredClone(eventReceipts), onRead } = options;
  const urls: URL[] = [];
  let snapshot = 0;
  io.fetch.mockImplementation((input: string) => {
    const url = new URL(input);
    urls.push(url);
    const table = url.pathname.split('/').pop()!;
    const params = url.searchParams;
    if (table === 'events') snapshot++;
    const override = onRead?.(table, snapshot);
    if (override) return Promise.resolve(override);
    const paged = <T,>(rows: T[]) => {
      const offset = Number(params.get('offset') || 0);
      return rows.slice(offset, offset + Math.min(cap, Number(params.get('limit') || cap)));
    };
    const withDays = ({ timelog_days, ...log }: typeof reports[number]) => ({ ...log, day_count: [{ count: timelog_days.length }], days: timelog_days.slice(0, cap) });
    let data: unknown;
    if (table === 'events') {
      expect(params.get('id')).toBe('eq.' + event.supabaseId);
      data = { meal_allowance_enabled: true, receipts: receipts.slice(0, cap), receipt_count: [{ count: receipts.length }], name: event.name, job_number: event.job, updated_at: 'v1', roster_size: [{ count: assignments.length }], report_count: [{ count: logs.length }],
        assignments: assignments.slice(0, cap), reports: logs.slice(0, cap).map(withDays) };
    } else if (table === 'timelog_days') {
      expect(params.get('order')).toBe('id.asc');
      const log = logs.find(row => 'eq.' + row.id === params.get('timelog_id'));
      if (!log) throw new Error('Missing timelog scope');
      data = paged(log.timelog_days);
    } else {
      expect(params.get('event_id')).toBe('eq.' + event.supabaseId);
      if (table === 'event_assignments') {
        expect(params.get('order')).toBe('profile_id.asc');
        data = paged(assignments);
      } else if (table === 'receipts') {
        expect(params.get('order')).toBe('id.asc');
        data = paged(receipts);
      } else if (table === 'timelogs') {
        expect(params.get('order')).toBe('id.asc');
        expect(params.get('days.order')).toBe('id.asc');
        data = paged(logs).map(withDays);
      } else throw new Error('Unexpected table ' + table);
    }
    return Promise.resolve(new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } }));
  });
  return urls;
}

describe('event hours snapshot', () => {
  beforeEach(() => { io.fetch.mockReset(); });

  it('reads current shifts and roster in one request scoped by event UUID', async () => {
    const urls = serve();
    const report = await loadRemoteEventHours(event);
    expect(urls).toHaveLength(1);
    const selection = urls[0].searchParams.get('select');
    for (const alias of ['assignments:event_assignments(', 'reports:timelogs(', 'days:timelog_days(', 'hourly_rate', 'captured:invoice_billing_sources(', 'receipts(']) expect(selection).toContain(alias);
    expect(report.partial).toBe(true);
    expect(report.people.map(p => [p.name, p.minutes])).toEqual([['Eva Malá', 450], ['Jan Malý', 150]]);
  });

  it('fills missing roster, report and day pages beyond the server cap', async () => {
    const urls = serve({ cap: 1 });
    const report = await loadRemoteEventHours(event);
    expect(report.partial).toBe(true);
    expect(report.people.map(p => [p.name, p.minutes])).toEqual([['Eva Malá', 450], ['Jan Malý', 150]]);
    expect(report.people.map(p => p.costs)).toEqual([
      { work: 1500, travel: 56, meals: 0, receipts: 33 },
      { work: 750, travel: 0, meals: 0, receipts: 0 },
    ]);
    for (const [table, order] of [['assignments', 'profile_id.asc'], ['reports', 'id.asc'], ['reports.days', 'id.asc']]) {
      expect(urls[0].searchParams.get(table + '.order')).toBe(order);
    }
    for (const table of ['event_assignments', 'timelogs', 'timelog_days', 'receipts']) {
      expect(urls.some(url => url.pathname.endsWith('/' + table) && url.searchParams.get('offset') === '2')).toBe(true);
    }
  });

  it.each([['p3', false], ['p4', true]] as const)('checks a roster member appearing after the cap (%s)', async (profileId, partial) => {
    serve({ cap: 1, logs: [reports[0], reports[2]], assignments: [roster[0], { profile_id: profileId }] });
    expect((await loadRemoteEventHours(event)).partial).toBe(partial);
  });

  it('recovers when only nested days overflow', async () => {
    serve({ cap: 2, logs: [reports[0]], assignments: [roster[0]] });
    const report = await loadRemoteEventHours(event);
    expect(report.partial).toBe(false);
    expect(report.people[0].minutes).toBe(450);
  });

  it.each(['version', 'day', 'roster'] as const)('rejects a concurrent %s change even with identical counts', async change => {
    const logs = structuredClone(reports);
    const assignments = structuredClone(roster);
    serve({ cap: 2, logs, assignments, onRead: (table, snapshot) => {
      if (table !== 'events' || snapshot !== 2) return;
      if (change === 'version') logs[2].updated_at = 'v2';
      if (change === 'day') logs[0].timelog_days[2].time_to = '02:00';
      if (change === 'roster') assignments[2].profile_id = 'p4';
    } });
    await expect(loadRemoteEventHours(event)).rejects.toThrow(/změnil/i);
  });

  it('rejects a failed page without exporting a partial read', async () => {
    serve({ cap: 1, onRead: table => { if (table === 'timelogs') return new Response('{}', { status: 403 }); } });
    await expect(loadRemoteEventHours(event)).rejects.toThrow(/načíst/i);
  });

  it.each([{ page: [] }, { page: [{ profile_id: 'p1' }] }])('rejects a missing or repeated page', ({ page }) => {
    serve({ cap: 2, onRead: table => {
      if (table === 'event_assignments') return new Response(JSON.stringify(page));
    } });
    return expect(loadRemoteEventHours(event)).rejects.toThrow(/neúpln/i);
  });

  it('reports an initial read failure without falling back to older hours', async () => {
    io.fetch.mockResolvedValue(new Response('{}', { status: 403 }));
    await expect(loadRemoteEventHours(event)).rejects.toThrow(/načíst/i);
  });
});
