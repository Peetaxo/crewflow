import React from 'react';
import { ArrowUpRight, ChevronDown, History, MessageSquare } from 'lucide-react';
import type { Contractor, Event, Timelog } from '../../types';
import { KM_RATE } from '../../data';
import { calculateMealAllowance, calculateTotalHours } from '../../utils';
import { Button } from '../../components/ui/button';
import StatusBadge from '../../components/shared/StatusBadge';
import type { ShiftApprovalGroup } from './shift-approval-groups';
import type { ShiftRoundAction } from './shift-round-history';

import { TimelogSummaryCard } from '../timelogs/components/TimelogSummaryCard';
import { displayTimelogHours, displayTimelogMoney, timelogPeriod } from '../timelogs/components/timelog-summary-format';

export function SharedApprovalCard({ group, contractors, events, canAct, onOpen, history = [], showPerson = true }: {
  group: ShiftApprovalGroup; contractors: Contractor[]; events: Event[]; canAct: boolean;
  onOpen: (timelog: Timelog) => void; history?: ShiftRoundAction[]; showPerson?: boolean;
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
  const lastReturn = [...history].reverse().find((action) => action.action.includes('return'));
  const reason = lastReturn?.note;
  const returned = group.round.status === 'rejected';
  const hours = parts.reduce((sum, part) => sum + part.hours, 0);
  const amount = parts.reduce((sum, part) => sum + part.amount, 0);
  const partCount = group.round.eventIds.length;
  const returnReason = reason && <p className="text-sm leading-relaxed [overflow-wrap:anywhere]">Poslední důvod vrácení: {reason}
    {lastReturn?.eventId && <span className="mt-1 block text-xs opacity-80">{events.find((event) => event.supabaseId === lastReturn.eventId)?.name ?? 'Dotčená směna'}</span>}
  </p>;

  return <TimelogSummaryCard label={`Společný výkaz ${contractor?.name ?? ''}`}
    person={showPerson ? { name: contractor?.name ?? 'Člen crew', initials: contractor?.ii } : undefined}
    metadata={partCount > 1 ? `Společný výkaz · ${partCount} ${partCount < 5 ? 'části' : 'částí'}` : undefined}
    status={<StatusBadge status={group.round.status} />} hours={hours} amount={amount}
    entries={parts.map(({ timelog, event, hours: partHours, meals, amount: partAmount }) => ({
      id: timelog.supabaseId ?? String(timelog.id), name: event?.name ?? 'Nedostupná směna', job: event?.job,
      period: timelogPeriod(timelog), client: event?.client,
      supplement: (timelog.km > 0 || meals > 0) && <p className="mt-1 text-[11px] text-[color:var(--nodu-text-soft)]">
        {timelog.km > 0 && `Cestovné ${timelog.km.toLocaleString('cs-CZ')} km`}
        {timelog.km > 0 && meals > 0 && ' · '}
        {meals > 0 && `Stravné ${displayTimelogMoney(meals)}`}
      </p>,
      totals: parts.length > 1 && <div className="text-right text-xs font-semibold tabular-nums">
        <div>{displayTimelogHours(partHours)}</div><div className="mt-0.5 text-[11px] font-normal text-[color:var(--nodu-text-soft)]">{displayTimelogMoney(partAmount)}</div>
      </div>,
    }))}
    control={<Button type="button" variant={canAct ? 'default' : 'outline'} disabled={!group.complete || !contractor || !parts.length}
      aria-label={canAct ? 'Zkontrolovat celý výkaz' : 'Otevřít celý výkaz'}
      onClick={() => onOpen(group.timelogs[0])} className="h-11 gap-1.5 rounded-xl px-3 text-xs">
      {canAct ? 'Zkontrolovat' : 'Otevřít'}<ArrowUpRight size={14} aria-hidden="true" />
    </Button>}
  >
    {returned && reason && <div className="mt-2 flex items-start gap-2 rounded-xl border border-[color:var(--nodu-error-border)] bg-[color:var(--nodu-error-bg)] p-2 text-[color:var(--nodu-error-text)]">
      <MessageSquare size={14} className="mt-0.5 shrink-0" aria-hidden="true" />{returnReason}
    </div>}
    {!group.complete && <p role="alert" className="mt-2 rounded-xl border border-[color:var(--nodu-warning-border)] bg-[color:var(--nodu-warning-bg)] p-2 text-xs text-[color:var(--nodu-warning-text)]">Chybí část společného výkazu. Obnovte data před rozhodnutím.</p>}

    {history.length > 0 && <details className="group/history mt-2 border-t border-[color:var(--nodu-border)]">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 py-2 text-xs font-medium text-[color:var(--nodu-text-soft)] transition hover:text-[color:var(--nodu-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--nodu-accent)] [&::-webkit-details-marker]:hidden">
        <History size={14} aria-hidden="true" /><span>Historie schvalování</span>
        <ChevronDown size={15} aria-hidden="true" className="ml-auto transition-transform group-open/history:rotate-180" />
      </summary>
      <div className="space-y-3 pb-2">
        {!returned && reason && <div className="rounded-xl bg-[color:rgb(var(--nodu-text-rgb)/0.04)] p-3 text-[color:var(--nodu-text-soft)]">{returnReason}</div>}
        <ol className="space-y-3 border-l border-[color:var(--nodu-border)] pl-4 text-xs text-[color:var(--nodu-text-soft)]">
          {history.map((action) => <li key={action.id} className="space-y-1 [overflow-wrap:anywhere]">
            <div className="font-semibold text-[color:var(--nodu-text)]">{action.label}</div>
            <time dateTime={action.createdAt} className="block text-[11px]">{new Date(action.createdAt).toLocaleString('cs-CZ')}</time>
            {action.note && <p>{action.note}</p>}
            {action.eventId && <p>{events.find((event) => event.supabaseId === action.eventId)?.name ?? 'Dotčená směna'}</p>}
          </li>)}
        </ol>
      </div>
    </details>}
  </TimelogSummaryCard>;
}
