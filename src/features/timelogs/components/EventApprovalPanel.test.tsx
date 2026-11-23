import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useState, type ComponentProps } from 'react';
import type { Event, Timelog, TimelogApproval } from '../../../types';
import { EventApprovalPanel } from './EventApprovalPanel';

const event: Event = { id: 1, name: 'Podzimní festival', job: 'FEST026', startDate: '2026-11-14', endDate: '2026-11-16',
  city: 'Praha', filled: 20, needed: 20, client: 'Festival', status: 'past' };

function approval(id: number, status: 'approved' | 'pending'): TimelogApproval {
  return { id: String(id), timelogId: String(id), approvalRoundId: `round-${id}`, approverProfileId: 'coo',
    approverUserId: 'user', requestedByProfileId: 'ch', requestedByUserId: 'ch-user', status, supersededAt: null,
    requestedAt: status === 'pending' ? '2026-11-18T09:00:00Z' : '2026-11-16T10:00:00Z',
    resolvedAt: status === 'approved' ? '2026-11-17T10:00:00Z' : null, updatedAt: '2026-11-18T10:00:00Z', note: '' };
}
const day = (d: string, f = '09:00', t = '13:00'): Timelog['days'][number] => ({ d, f, t, type: 'provoz' });
const reports: Timelog[] = Array.from({ length: 20 }, (_, index) => {
  const id = index + 1;
  const done = id <= 18;
  const days = done ? [day('2026-11-14'), day('2026-11-16')] : [day('2026-11-16')];
  if (id === 19) days.push(day('2026-11-16', '14:00', '16:00'), day('2026-11-15'));
  return { id, eid: 1, contractorProfileId: `crew-${id}`, days, km: 0, note: '',
    status: done ? 'approved' : 'pending_coo', approvals: [approval(id, done ? 'approved' : 'pending')] };
});
const name = (report: Timelog) => `Osoba ${report.id}`;
const roster = reports.map(report => ({ contractorProfileId: report.contractorProfileId!, name: name(report) }));
const incoming = reports.slice(-2);
function mount(overrides: Partial<ComponentProps<typeof EventApprovalPanel>> = {}) {
  const props: ComponentProps<typeof EventApprovalPanel> = {
    event, reports, visibleReports: incoming, roster, role: 'coo', actionableIds: new Set([19, 20]), personName: name,
    includeHistory: true, renderReview: report => <div>Celoakční výkaz {report.id} · {report.days.length} položky</div>,
    bulkAction: <button>Schválit pro fakturaci (2)</button>, exportAction: <button>Stáhnout XLSX</button>, ...overrides,
  };
  return render(<EventApprovalPanel {...props} />);
}
function expand() { fireEvent.click(screen.getByRole('button', { name: 'Otevřít akci Podzimní festival' })); }
function review(n: number, root: HTMLElement = document.body) {
  return within(root).getByRole('button', { name: `Otevřít celý výkaz – Osoba ${n}` });
}

describe('EventApprovalPanel', () => {
  it('prioritizes two incoming reports and keeps 18 approved people collapsed while reviewing the entire person', () => {
    const onExpandedChange = vi.fn();
    mount({ onExpandedChange });
    expect(screen.getByText('2 nové výkazy ke schválení')).toBeVisible();
    expect(screen.getByText('20 / 20')).toBeVisible();
    expect(screen.getByText('18 / 20')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Lidé' })).toBeNull();
    expect(screen.queryByText('Osoba 19')).toBeNull();
    expand();
    expect(onExpandedChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole('button', { name: 'Schválit pro fakturaci (2)' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Stáhnout XLSX' })).toBeVisible();
    expect(review(19)).toHaveTextContent('Nově ve frontě');
    expect(review(20)).toHaveTextContent('Nově ve frontě');
    expect(screen.queryByText('Osoba 1')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Schválené výkazy (18)' }));
    expect(review(1)).toBeVisible();
    fireEvent.click(review(19));
    const dialog = screen.getByRole('dialog', { name: 'Kontrola výkazu' });
    expect(dialog).toHaveAccessibleDescription('Osoba 19 · Podzimní festival · FEST026');
    expect(within(dialog).getByText('Celoakční výkaz 19 · 3 položky')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Zavřít kontrolu výkazu' }));
    expect(review(19)).toBeVisible();
    expect(review(1)).toBeVisible();
  });

  it('leads with affected days, counts each report once per day, and opens the same whole-person review', () => {
    mount();
    expand();
    fireEvent.click(screen.getByRole('button', { name: 'Dny' }));
    const affected = screen.getByRole('region', { name: '16. 11. 2026' });
    const other = screen.getByRole('region', { name: '15. 11. 2026' });
    expect(affected.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(affected).getByText('Ke schválení COO (2)')).toBeVisible();
    expect(within(affected).getByText('10 h k vyřízení')).toBeVisible();
    expect(within(affected).getByText(/82 h celkem/)).toBeVisible();
    expect(review(19, affected)).toHaveTextContent('6 h');
    expect(review(19, other)).toHaveTextContent('4 h');
    expect(screen.queryByText('Osoba 1')).toBeNull();
    expect(screen.getByRole('button', { name: 'Schválené dny (1)' })).toBeVisible();
    expect(within(affected).getByRole('button', { name: 'Schválené výkazy (18)' })).toBeVisible();
    fireEvent.click(review(19, affected));
    const dialog = screen.getByRole('dialog', { name: 'Kontrola výkazu' });
    expect(dialog).toHaveAccessibleDescription('Osoba 19 · Podzimní festival · FEST026');
    expect(within(dialog).getByText('Celoakční výkaz 19 · 3 položky')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Zavřít kontrolu výkazu' }));
    expect(screen.getByRole('button', { name: 'Dny', pressed: true })).toBeVisible();
  });

  it.each(['Lidé', 'Dny'])('returns directly to the same %s queue as the approved count goes from 18 to 19 to 20', mode => {
    function EventInbox() {
      const [items, setItems] = useState(reports);
      const pending = items.filter(item => item.status === 'pending_coo');
      return <EventApprovalPanel event={event} reports={items} visibleReports={pending}
        actionableIds={new Set(pending.map(item => item.id))} personName={name} roster={roster} role="coo" includeHistory
        renderReview={report => <button onClick={() => setItems(current => current.map(item => item.id === report.id
          ? { ...item, status: 'approved', approvedAt: '2026-11-19T10:00:00Z' } : item))}>Schválit osobu {report.id}</button>} />;
    }
    render(<EventInbox />);
    expand();
    fireEvent.click(screen.getByRole('button', { name: mode }));
    expect(screen.getByText('18 / 20')).toBeVisible();
    fireEvent.click(screen.getAllByRole('button', { name: 'Otevřít celý výkaz – Osoba 19' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Schválit osobu 19' }));
    expect(screen.getByRole('button', { name: mode, pressed: true })).toBeVisible();
    expect(screen.getByText('19 / 20')).toBeVisible();
    expect(screen.getByText('1 nový výkaz ke schválení')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Otevřít celý výkaz – Osoba 19' })).toBeNull();
    fireEvent.click(review(20));
    fireEvent.click(screen.getByRole('button', { name: 'Schválit osobu 20' }));
    expect(screen.getByRole('button', { name: mode, pressed: true })).toBeVisible();
    expect(screen.getAllByText('20 / 20')).toHaveLength(2);
    expect(screen.getByText('Všechny výkazy schváleny')).toBeVisible();
    expect(screen.queryByText(/nový výkaz ke schválení/)).toBeNull();
  });

  it('prioritizes CH handoffs received after an approval above earlier pending people and days', () => {
    const logs: Timelog[] = [
      { ...reports[18], status: 'pending_ch', days: [day('2026-11-15')], submittedAt: '2026-11-16T09:00:00Z' },
      { ...reports[19], status: 'pending_ch', days: [day('2026-11-16')], submittedAt: '2026-11-18T09:00:00Z' },
    ];
    mount({ reports: [...reports.slice(0, 18), ...logs], visibleReports: logs, role: 'crewhead' });
    expect(screen.getByText('2 výkazy k předání COO')).toBeVisible();
    expect(screen.getByText('1 nově ve frontě')).toBeVisible();
    expand();
    expect(review(20).compareDocumentPosition(review(19)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dny' }));
    const latest = screen.getByRole('region', { name: '16. 11. 2026' });
    const earlier = screen.getByRole('region', { name: '15. 11. 2026' });
    expect(latest.compareDocumentPosition(earlier) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows full daily hours without adding another approver’s reports to the filtered list or marking the whole date approved', () => {
    const other = { ...reports[0], id: 21, status: 'pending_ch' as const, days: [day('2026-11-14'), day('2026-11-16')] };
    mount({ reports: [...reports, other] });
    expand();
    fireEvent.click(screen.getByRole('button', { name: 'Dny' }));
    const affected = screen.getByRole('region', { name: '16. 11. 2026' });
    expect(within(affected).getByText('10 h k vyřízení')).toBeVisible();
    expect(within(affected).getByText(/86 h celkem/)).toBeVisible();
    expect(screen.queryByText('Osoba 21')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Schválené dny (1)' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Ostatní dny (1)' })).toBeVisible();
  });

  it('keeps the same persisted report through a numeric ID remap and closes review if the UUID or owner changes', () => {
    const original = incoming.map(report => ({ ...report, supabaseId: 'stable-' + report.id }));
    const realName = (report: Timelog) => report.contractorProfileId === 'crew-19' ? 'Věra' : 'Jiří';
    const panel = (items: Timelog[]) => <EventApprovalPanel event={event} reports={items} visibleReports={items}
      actionableIds={new Set(items.map(item => item.id))} personName={realName} roster={roster} role="coo"
      renderReview={report => <p>Kontrola osoby {realName(report)}, {report.supabaseId}, {report.id}</p>} />;
    const { rerender } = render(panel(original));
    expand();
    fireEvent.click(screen.getByRole('button', { name: 'Dny' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Otevřít celý výkaz – Věra' })[0]);
    expect(screen.getByText('Kontrola osoby Věra, stable-19, 19')).toBeVisible();
    const remapped = [{ ...original[1], id: 19 }, { ...original[0], id: 30 }];
    rerender(panel(remapped));
    expect(screen.getByText('Kontrola osoby Věra, stable-19, 30')).toBeVisible();
    rerender(panel([remapped[0], { ...remapped[1], contractorProfileId: 'crew-20' }]));
    expect(screen.getByRole('button', { name: 'Dny', pressed: true })).toBeVisible();
    expect(screen.queryByText(/Kontrola osoby/)).toBeNull();
    rerender(panel(remapped));
    fireEvent.click(screen.getAllByRole('button', { name: 'Otevřít celý výkaz – Věra' })[0]);
    rerender(panel([remapped[0], { ...remapped[1], supabaseId: 'replacement' }]));
    expect(screen.getByRole('button', { name: 'Dny', pressed: true })).toBeVisible();
    expect(screen.queryByText(/Kontrola osoby/)).toBeNull();
  });

  it.each(['Lidé', 'Dny'])('opens the authoritative round directly from %s while keeping the event list active', mode => {
    const onOpenReview = vi.fn((report: Timelog) => report.id === 19);
    mount({ onOpenReview });
    expand();
    fireEvent.click(screen.getByRole('button', { name: mode }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Otevřít celý výkaz – Osoba 19' })[0]);
    expect(onOpenReview).toHaveBeenCalledWith(incoming[0]);
    expect(screen.getByRole('button', { name: mode, pressed: true })).toBeVisible();
    expect(screen.queryByText(/Celoakční výkaz/)).toBeNull();
    fireEvent.click(review(20));
    expect(screen.getByRole('button', { name: 'Zavřít kontrolu výkazu' })).toBeVisible();
  });

  it('keeps filtered results separate from attendance and only identifies missing people on complete data', () => {
    const knownRoster = [...roster, { contractorProfileId: 'missing', name: 'Eva Nová' }];
    const { unmount } = mount({ visibleReports: [incoming[0]], roster: knownRoster, includeHistory: false });
    expect(screen.getByText('1 nový výkaz ke schválení')).toBeVisible();
    expect(screen.getByText('20 / 21')).toBeVisible();
    expect(screen.getByText(/Eva Nová/)).toBeVisible();
    expand();
    expect(screen.queryByText('Osoba 20')).toBeNull();
    expect(screen.queryByRole('button', { name: /Schválené výkazy/ })).toBeNull();
    unmount();
    mount({ roster: knownRoster, reportsComplete: false });
    expect(screen.queryByText(/Eva Nová/)).toBeNull();
    expect(screen.getByText(/Údaje o obsazení a výkazech nejsou úplné/)).toBeVisible();
  });

  it('distinguishes draft, returned, assigned elsewhere and missing without guessing submission times from edits', () => {
    const mixed: Timelog[] = [
      { ...reports[0], id: 1, status: 'pending_ch', updatedAt: '2026-11-19T09:00:00Z', approvals: [] },
      { ...reports[1], id: 2, status: 'draft' }, { ...reports[2], id: 3, status: 'rejected' },
      { ...reports[3], id: 4, status: 'pending_coo' }, reports[4],
    ];
    mount({ reports: mixed, visibleReports: mixed, roster: roster.slice(0, 6), role: 'crewhead', actionableIds: new Set([1]),
      assigneeName: () => 'Anna COO', bulkAction: null, includeHistory: false });
    expect(screen.getByText('4 / 6')).toBeVisible();
    expect(screen.getByText(/Osoba 6/)).toBeVisible();
    expand();
    expect(review(1)).toHaveTextContent('Ke kontrole CH');
    expect(review(1)).not.toHaveTextContent('Nově ve frontě');
    expect(review(2)).toHaveTextContent('Koncept');
    expect(review(3)).toHaveTextContent('Vráceno k opravě');
    expect(review(4)).toHaveTextContent('Anna COO');
    expect(screen.queryByRole('button', { name: /celý výkaz – Osoba 6/ })).toBeNull();
  });
});
