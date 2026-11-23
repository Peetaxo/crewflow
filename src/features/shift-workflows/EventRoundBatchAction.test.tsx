import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Event, Timelog } from '../../types';
import type { ShiftWorkflowScope } from './shift-workflows.contract';
import { ShiftWorkflowError } from './shift-workflows.contract';
import { localCanonicalReport } from './approval-inbox';
import { localShiftWorkflowId } from './shift-workflows.local';
import { EventRoundBatchAction } from './EventRoundBatchAction';

const io = vi.hoisted(() => ({ reload: vi.fn(), reports: vi.fn(), write: vi.fn(), refresh: vi.fn(), quote: vi.fn(), local: vi.fn(), update: vi.fn() }));
vi.mock('./useShiftWorkflows', () => ({ useShiftWorkflows: () => ({ scope, ready: true, scopeKey: JSON.stringify(scope), reload: io.reload, query: { isError: false } }) }));
vi.mock('../timelogs/services/timelogs.service', () => ({ loadTimelogsSnapshot: io.reports, updateTimelogStatuses: io.update }));
vi.mock('./shift-evidence-write', () => ({ writeShiftEvidenceBatch: io.write, refreshShiftEvidence: io.refresh }));
vi.mock('../invoice-billing/service', () => ({ billingService: { quote: io.quote } }));
vi.mock('../invoice-billing/BillingFinancePreview', () => ({ BillingFinancePreview: ({ finance }) => <div>{finance.totalAmount} Kč za výkaz</div> }));
vi.mock('../../lib/app-data', async importOriginal => ({ ...await importOriginal<typeof import('../../lib/app-data')>(), getLocalAppState: io.local }));
const id = (i: number) => '00000000-0000-4000-8000-' + String(i).padStart(12, '0');
const time = '2026-11-23T10:00:00.123456Z';
let scope: ShiftWorkflowScope;
function fixture(local = false) {
  const event = { id: 1, supabaseId: id(1), name: 'Konference' } as Event;
  const entries = ['Eva', 'Jan'].map((name, i) => {
    const report: Timelog = { id: i + 2, eid: 1, supabaseId: local ? undefined : id(i + 2), eventSupabaseId: local ? undefined : id(1),
      contractorProfileId: local ? name : id(10 + i), updatedAt: local ? undefined : time, status: scope.role === 'coo' ? 'pending_coo' : 'pending_ch',
      days: [{ d: '2026-11-23', f: '08:00', t: '12:00', type: 'provoz' }], km: 0, note: '' };
    const shown = local ? localCanonicalReport(report) : report;
    if (scope.role === 'coo') report.approvals = [{ id: id(70+i), timelogId: shown.supabaseId, status: 'pending', supersededAt: null,
      approverProfileId: scope.profileId, approverUserId: scope.userId, updatedAt: time }] as Timelog['approvals'];
    shown.approvals = report.approvals;
    const round = { id: id(20+i), workflowId: null, eventIds: [shown.eventSupabaseId!], timelogIds: [shown.supabaseId!],
      contractorProfileId: shown.contractorProfileId!, updatedAt: time, status: scope.role === 'coo' ? 'pending_coo' as const : 'pending_ch' as const, note: '' };
    return { name, report, group: { round, timelogs: [shown], complete: true } };
  });
  const reports = entries.map(e => e.report);
  io.reports.mockResolvedValue(reports);
  io.reload.mockResolvedValue({ rounds: entries.map(e => e.group.round), workflows: [], assignedEventIds: [] });
  io.local.mockReturnValue({ events: [event], timelogs: reports, contractors: entries.map(e=>({ profileId: e.report.contractorProfileId, name: e.name, rate: 250 })),
    eventCrewAssignments: [], invoices: [] });
  io.quote.mockImplementation(async ([tid]) => {
    const i = entries.findIndex(e => e.report.supabaseId === tid);
    return { id: id(80+i), timelogIds: [tid], preview: { totalAmount: 1000, reports: [{ timelogId: tid, eventId: id(1), status: 'pending_coo',
      contractorId: entries[i].report.contractorProfileId, reportUpdatedAt: time }] } };
  });
  return { event, entries, label: 'Vybrané výkazy' };
}
beforeEach(() => { vi.resetAllMocks(); scope = { source: 'supabase', role: 'coo', profileId: id(48), userId: id(45) }; });

it('previews each immutable remote quote then retries only unconfirmed rounds with the same request', async () => {
  const props = fixture();
  io.write.mockResolvedValueOnce({}).mockRejectedValueOnce(new ShiftWorkflowError('ambiguous', 'Bez odpovědi.')).mockResolvedValueOnce({});
  render(<EventRoundBatchAction {...props} />);
  fireEvent.click(screen.getByRole('button', { name: props.label }));
  const confirm = await screen.findByRole('button', { name: /potvrdit schválení/i });
  expect(screen.getAllByText('1000 Kč za výkaz')).toHaveLength(2);
  expect(io.quote.mock.calls.map(([ids]) => ids)).toEqual([[id(2)], [id(3)]]);
  expect(io.write).not.toHaveBeenCalled();
  fireEvent.click(confirm);
  const retry = await screen.findByRole('button', { name: /opakovat/i });
  expect(screen.getByText(/1\s*\/\s*2/)).toBeVisible();
  expect(screen.getByText('Schváleno k proplacení')).toBeVisible();
  expect(screen.getByText('Výsledek čeká na ověření')).toBeVisible();
  fireEvent.click(retry);
  await waitFor(() => expect(io.refresh).toHaveBeenCalled());
  const commands = io.write.mock.calls.map(([, command]) => command);
  expect(commands.map(c => c.billingQuoteId)).toEqual([id(80), id(81), id(81)]);
  expect(commands[2]).toEqual(commands[1]);
});

it.each(['crewhead', 'coo'] as const)('sends reviewed local %s rounds through the same writer with canonical targets', async role => {
  scope = { ...scope, source: 'local', role };
  const props = fixture(true);
  render(<EventRoundBatchAction {...props} />);
  fireEvent.click(screen.getByRole('button', { name: props.label }));
  fireEvent.click(await screen.findByRole('button', { name: /potvrdit (předání|schválení)/i }));
  await waitFor(() => expect(io.write).toHaveBeenCalledTimes(2));
  expect(io.write.mock.calls[0][1]).toMatchObject({ action: role === 'coo' ? 'approve' : 'handoff',
    roundId: id(20), targets: [{ id: localShiftWorkflowId('timelog', 2) }] });
  expect(io.quote).not.toHaveBeenCalled();
});

it('stops before confirmation when local hours change without updating a version', async () => {
  scope = { ...scope, source: 'local', role: 'crewhead' };
  const props = fixture(true);
  io.reports.mockResolvedValue(props.entries.map(({ report }) => ({ ...report, km: 300 })));
  render(<EventRoundBatchAction {...props} />);
  fireEvent.click(screen.getByRole('button', { name: props.label }));
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(io.write).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: /potvrdit předání/i })).toBeNull();
});

it.each(['scope', 'membership', 'quote'] as const)('rejects changed %s before a financial confirmation', async change => {
  const props = fixture();
  if (change === 'scope') io.reports.mockResolvedValue(props.entries.map(({report}) => ({ ...report, approvals: [] })));
  if (change === 'membership') io.reload.mockResolvedValue({ rounds: props.entries.map(({group}) => ({ ...group.round, eventIds: [id(1), id(99)] })),
    workflows: [], assignedEventIds: [] });
  if (change === 'quote') io.quote.mockResolvedValue({ id: id(80), timelogIds: [id(99)], preview: { totalAmount: 900, reports: [] } });
  render(<EventRoundBatchAction {...props} />);
  fireEvent.click(screen.getByRole('button', { name: props.label }));
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(io.write).not.toHaveBeenCalled();
});

it('shows a combined total and commits legacy and independent rounds only after one confirmation', async () => {
  const props = fixture();
  const legacyReport = { ...props.entries[0].report, id: 90, supabaseId: id(90), contractorProfileId: id(91), approvals: [] };
  const legacyEntries = [{ name: 'Klára', report: legacyReport }];
  const reports = [...props.entries.map(e => e.report), legacyReport];
  io.reports.mockResolvedValue(reports);
  io.quote.mockImplementation(async ([tid]) => {
    const report = reports.find(r => r.supabaseId === tid)!;
    return { id: id(100 + report.id), timelogIds: [tid], preview: { totalAmount: tid === id(90) ? 3000 : 1000,
      reports: [{ timelogId: tid, eventId: id(1), contractorId: report.contractorProfileId, status: 'pending_coo', reportUpdatedAt: time }] } };
  });
  render(<EventRoundBatchAction {...props} legacyEntries={legacyEntries} />);
  fireEvent.click(screen.getByRole('button', { name: props.label }));
  const confirm = await screen.findByRole('button', { name: /potvrdit schválení/i });
  expect(screen.getByText(/Celkem k proplacení.*5\s*000/)).toBeVisible();
  expect(io.update).not.toHaveBeenCalled();
  fireEvent.click(confirm);
  await waitFor(() => expect(io.update).toHaveBeenCalledTimes(1));
  expect(io.update.mock.calls[0]).toMatchObject([[90], 'coo', { billingApproval: { quoteId: id(190), targets: [{ id: id(90) }] } }]);
  expect(io.write).toHaveBeenCalledTimes(2);
});

it('retires a financial review permanently when the authenticated actor changes', async () => {
  const props = fixture();
  const initial = scope;
  const screenView = render(<EventRoundBatchAction {...props} />);
  fireEvent.click(screen.getByRole('button', { name: props.label }));
  await screen.findByRole('button', { name: /potvrdit schválení/i });
  scope = { ...scope, userId: id(90) };
  screenView.rerender(<EventRoundBatchAction {...props} />);
  scope = initial;
  screenView.rerender(<EventRoundBatchAction {...props} />);
  expect(screen.queryByRole('button', { name: /potvrdit schválení/i })).toBeNull();
  expect(io.write).not.toHaveBeenCalled();
});

it('rejects a reviewed name/report attached to another persisted round', async () => {
  const props = fixture();
  const [a, b] = props.entries;
  const entries = [{ ...b, group: { ...a.group, timelogs: b.group.timelogs } }];
  render(<EventRoundBatchAction {...props} entries={entries} />);
  fireEvent.click(screen.getByRole('button', { name: props.label }));
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(io.quote).not.toHaveBeenCalled();
});
