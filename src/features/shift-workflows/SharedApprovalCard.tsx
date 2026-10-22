import React from 'react';
import { ArrowUpRight, CalendarDays, ChevronDown, Clock3, History, MessageSquare, Wallet } from 'lucide-react';
import type { Contractor, Event, Timelog } from '../../types';
import { KM_RATE } from '../../data';
import { calculateMealAllowance, calculateTotalHours, formatShortDate } from '../../utils';
import { Button } from '../../components/ui/button';
import StatusBadge from '../../components/shared/StatusBadge';
import type { ShiftApprovalGroup } from './shift-approval-groups';
import type { ShiftRoundAction } from './shift-round-history';

const moneyFormatter = new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 });
const displayMoney = (amount: number) => moneyFormatter.format(amount);
const displayHours = (hours: number) => `${hours.toLocaleString('cs-CZ', { maximumFractionDigits: 2 })} h`;

function reportPeriod(timelog: Timelog) {
  const dates = [...new Set(timelog.days.map((day) => day.d).filter(Boolean))].sort();
  if (!dates.length) return 'Termín není vyplněný';
  const last = dates[dates.length - 1];
  const range = dates.length === 1 ? formatShortDate(last) : `${formatShortDate(dates[0])} – ${formatShortDate(last)}`;
  return `${range} ${last.slice(0, 4)}`;
}

export function SharedApprovalCard({ group, contractors, events, canAct, onOpen, history = [] }: {
  group: ShiftApprovalGroup; contractors: Contractor[]; events: Event[]; canAct: boolean;
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
  const lastReturn = [...history].reverse().find((action) => action.action.includes('return'));
  const reason = lastReturn?.note;
  const returned = group.round.status === 'rejected';
  const hours = parts.reduce((sum, part) => sum + part.hours, 0);
  const amount = parts.reduce((sum, part) => sum + part.amount, 0);
  const partCount = group.round.eventIds.length;
  const returnReason = reason && <p className="text-sm leading-relaxed [overflow-wrap:anywhere]">Poslední důvod vrácení: {reason}
    {lastReturn?.eventId && <span className="mt-1 block text-xs opacity-80">{events.find((event) => event.supabaseId === lastReturn.eventId)?.name ?? 'Dotčená směna'}</span>}
  </p>;

  return <section aria-label={`Společný výkaz ${contractor?.name ?? ''}`} className="nodu-panel mb-4 overflow-hidden rounded-[24px] text-[color:var(--nodu-text)] sm:rounded-[28px]">
    <div className="p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[color:rgb(var(--nodu-accent-rgb)/0.1)] text-xs font-semibold text-[color:var(--nodu-accent)]">
            {contractor?.ii || contractor?.name.split(' ').map((part) => part[0]).slice(0, 2).join('') || 'CR'}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold leading-snug [overflow-wrap:anywhere]">{contractor?.name ?? 'Člen crew'}</h3>
            <p className="mt-0.5 text-xs text-[color:var(--nodu-text-soft)]">Společný výkaz · {partCount} {partCount === 1 ? 'část' : partCount < 5 ? 'části' : 'částí'}</p>
          </div>
        </div>
        <StatusBadge status={group.round.status} />
      </header>

      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(16rem,0.75fr)]">
      <div className="space-y-3">
        {parts.map(({ timelog, event, hours: partHours, meals, amount: partAmount }) => <div key={timelog.supabaseId ?? timelog.id}
          className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-text-rgb)/0.025)] p-3 sm:p-4">
          <div className="min-w-0 flex-1 basis-44">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              {event?.job && <span className="jn nodu-job-badge shrink-0">{event.job}</span>}
              <h4 className="min-w-0 text-base font-semibold leading-snug [overflow-wrap:anywhere]">{event?.name ?? 'Nedostupná směna'}</h4>
            </div>
            <div className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-[color:var(--nodu-text-soft)]">
              <CalendarDays size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{reportPeriod(timelog)}</span>
            </div>
            {(timelog.km > 0 || meals > 0) && <p className="mt-2 text-xs text-[color:var(--nodu-text-soft)]">
              {timelog.km > 0 && `Cestovné ${timelog.km.toLocaleString('cs-CZ')} km`}
              {timelog.km > 0 && meals > 0 && ' · '}
              {meals > 0 && `Stravné ${displayMoney(meals)}`}
            </p>}
          </div>
          {parts.length > 1 && <div className="text-right text-sm font-semibold tabular-nums">
            <div>{displayHours(partHours)}</div><div className="mt-0.5 text-xs font-normal text-[color:var(--nodu-text-soft)]">{displayMoney(partAmount)}</div>
          </div>}
        </div>)}
      </div>

      <section aria-label="Souhrn výkazu">
        <dl className="grid grid-cols-2 gap-3">
          <div className="min-w-0 rounded-2xl bg-[color:rgb(var(--nodu-text-rgb)/0.04)] px-3 py-3 sm:px-4">
            <dt className="flex items-center gap-1.5 text-xs text-[color:var(--nodu-text-soft)]"><Clock3 size={14} aria-hidden="true" />Celkem hodin</dt>
            <dd className="mt-1.5 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">{displayHours(hours)}</dd>
          </div>
          <div className="min-w-0 rounded-2xl bg-[color:rgb(var(--nodu-accent-rgb)/0.08)] px-3 py-3 sm:px-4">
            <dt className="flex items-center gap-1.5 text-xs text-[color:var(--nodu-text-soft)]"><Wallet size={14} aria-hidden="true" />Odměna celkem</dt>
            <dd className="mt-1.5 break-words text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">{displayMoney(amount)}</dd>
          </div>
        </dl>
      </section>
      </div>

      {returned && reason && <div className="mt-4 flex items-start gap-2 rounded-2xl border border-[color:var(--nodu-error-border)] bg-[color:var(--nodu-error-bg)] p-3 text-[color:var(--nodu-error-text)]">
        <MessageSquare size={16} className="mt-0.5 shrink-0" aria-hidden="true" />{returnReason}
      </div>}
      {!group.complete && <p role="alert" className="mt-4 rounded-2xl border border-[color:var(--nodu-warning-border)] bg-[color:var(--nodu-warning-bg)] p-3 text-sm text-[color:var(--nodu-warning-text)]">Chybí část společného výkazu. Obnovte data před rozhodnutím.</p>}
      <div className="mt-4 flex justify-end">
        <Button type="button" variant={canAct ? 'default' : 'outline'} disabled={!group.complete || !contractor || !parts.length}
          onClick={() => onOpen(group.timelogs[0])} className="h-11 w-full gap-2 rounded-xl px-4 text-sm sm:w-auto">
          {canAct ? 'Zkontrolovat celý výkaz' : 'Otevřít celý výkaz'}<ArrowUpRight size={16} aria-hidden="true" />
        </Button>
      </div>
    </div>

    {history.length > 0 && <details className="group/history border-t border-[color:var(--nodu-border)]">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3 text-xs font-medium text-[color:var(--nodu-text-soft)] transition hover:text-[color:var(--nodu-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--nodu-accent)] sm:px-5 [&::-webkit-details-marker]:hidden">
        <History size={14} aria-hidden="true" /><span>Historie schvalování</span>
        <ChevronDown size={15} aria-hidden="true" className="ml-auto transition-transform group-open/history:rotate-180" />
      </summary>
      <div className="space-y-3 px-4 pb-4 sm:px-5">
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
  </section>;
}
