import React from 'react';
import type { Contractor, Event, Role, Timelog } from '../../types';
import { KM_RATE } from '../../data';
import { calculateMealAllowance, calculateTotalHours, formatCurrency, formatShortDate } from '../../utils';
import StatusBadge from '../../components/shared/StatusBadge';
import type { ShiftApprovalGroup } from './shift-approval-groups';
import type { ShiftRoundAction } from './shift-round-history';

export function SharedApprovalCard({ group, contractors, events, role, onOpen, history = [] }: {
  group: ShiftApprovalGroup; contractors: Contractor[]; events: Event[]; role: Role;
  onOpen: (timelog: Timelog) => void; history?: ShiftRoundAction[];
}) {
  const contractor = contractors.find((person) => person.profileId === group.round.contractorProfileId);
  const parts = group.timelogs.map((timelog) => {
    const event = timelog.eventSupabaseId
      ? events.find((item) => item.supabaseId === timelog.eventSupabaseId)
      : events.find((item) => item.id === timelog.eid);
    const hours = calculateTotalHours(timelog.days);
    const meals = calculateMealAllowance(timelog.days, { enabled: Boolean(event?.mealAllowanceEnabled) });
    return { timelog, event, hours, meals, amount: hours * (contractor?.rate ?? 0) + timelog.km * KM_RATE + meals };
  });
  const actionable = (role === 'crewhead' && group.round.status === 'pending_ch')
    || (role === 'coo' && group.round.status === 'pending_coo')
    || (role === 'crew' && group.round.status === 'pending_crew_confirmation');
  const lastReturn = [...history].reverse().find((action) => action.action.includes('return'));
  const reason = lastReturn?.note || group.round.note;
  return <section aria-label={`Společný výkaz ${contractor?.name ?? ''}`} className="mb-3 rounded-[24px] border border-[var(--nodu-border)] bg-white p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-semibold">{contractor?.name ?? 'Člen crew'}</h3>
      <StatusBadge status={group.round.status} />
    </div>
    <p className="mt-1 text-xs text-[var(--nodu-text-soft)]">Jeden společný výkaz · {group.round.eventIds.length} {group.round.eventIds.length === 1 ? 'část' : group.round.eventIds.length < 5 ? 'části' : 'částí'}</p>
    <div className="my-3 space-y-3">
      {parts.map(({ timelog, event, hours, meals, amount }) => <div key={timelog.supabaseId ?? timelog.id} className="border-t border-[var(--nodu-border)] pt-2 text-sm">
        <div className="font-medium">{event?.name ?? 'Nedostupná směna'}</div>
        <div className="text-xs text-[var(--nodu-text-soft)]">{event?.job} · {timelog.days.map((day) => formatShortDate(day.d)).join(', ')}</div>
        <div>{hours.toFixed(1)} h · {timelog.km} km · Jídlo {formatCurrency(meals)} · {formatCurrency(amount)}</div>
      </div>)}
    </div>
    <p className="font-semibold">Celkem {parts.reduce((sum, part) => sum + part.hours, 0).toFixed(1)} h · {formatCurrency(parts.reduce((sum, part) => sum + part.amount, 0))}</p>
    {reason && <p className="mt-2 text-sm">Poslední důvod vrácení: {reason}
      {lastReturn?.eventId && ` · ${events.find((event) => event.supabaseId === lastReturn.eventId)?.name ?? 'Dotčená směna'}`}
    </p>}
    {history.length > 0 && <details className="mt-2 text-xs"><summary>Historie schvalování</summary><ol>{history.map((action) => <li key={action.id}>
      {new Date(action.createdAt).toLocaleString('cs-CZ')} · {action.label} · {action.note}
      {action.eventId && ` · ${events.find((event) => event.supabaseId === action.eventId)?.name ?? 'Dotčená směna'}`}
    </li>)}</ol></details>}
    {!group.complete && <p role="alert" className="mt-2 text-sm">Chybí část společného výkazu. Obnovte data před rozhodnutím.</p>}
    <button type="button" disabled={!group.complete || !contractor || !parts.length}
      onClick={() => onOpen(group.timelogs[0])} className="mt-3 rounded-xl border border-[var(--nodu-border)] px-4 py-2 text-sm font-medium">
      {actionable ? 'Zkontrolovat celý výkaz' : 'Otevřít celý výkaz'}
    </button>
  </section>;
}
