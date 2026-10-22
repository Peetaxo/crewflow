import React from 'react';
import { CalendarDays } from 'lucide-react';
import { displayTimelogHours, displayTimelogMoney } from './timelog-summary-format';

interface SummaryEntry {
  id: string;
  name?: string;
  job?: string;
  period: string;
  client?: string;
  supplement?: React.ReactNode;
  totals?: React.ReactNode;
}

/** Presentation shared by original reports and persisted approval rounds. */
export function TimelogSummaryCard({ label, person, metadata, status, entries, hours, amount, control, children }: {
  label: string;
  person?: { name: string; initials?: string };
  metadata?: string;
  status: React.ReactNode;
  entries: SummaryEntry[];
  hours: number;
  amount: number;
  control?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return <section aria-label={label} className="nodu-panel mb-3 min-w-0 overflow-hidden rounded-[18px] text-[color:var(--nodu-text)] sm:rounded-[20px]">
    <div className="p-3 sm:px-4">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        {person ? <div className="flex min-w-0 flex-1 items-center gap-2">
          <div aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[color:rgb(var(--nodu-accent-rgb)/0.1)] text-[10px] font-semibold text-[color:var(--nodu-accent)]">{person.initials || person.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</div>
          <h3 className="text-xs font-semibold [overflow-wrap:anywhere]">{person.name}</h3>
        </div> : <span className="text-[11px] text-[color:var(--nodu-text-soft)]">{metadata ?? 'Výkaz práce'}</span>}
        {status}
      </header>
      {person && metadata && <p className="mt-1 text-[11px] text-[color:var(--nodu-text-soft)]">{metadata}</p>}
      <div className="mt-2 space-y-2">
        {entries.map((entry) => <div key={entry.id} className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <div className="min-w-0 flex-1 basis-40">
            {(entry.name || entry.job) && <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {entry.job && <span className="jn nodu-job-badge shrink-0">{entry.job}</span>}
              {entry.name && <h4 className="min-w-0 text-sm font-semibold leading-snug [overflow-wrap:anywhere]">{entry.name}</h4>}
            </div>}
            <div className="mt-1 flex items-start gap-1.5 text-[11px] leading-relaxed text-[color:var(--nodu-text-soft)]">
              <CalendarDays size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{entry.period}{entry.client && ` · ${entry.client}`}</span>
            </div>
            {entry.supplement}
          </div>
          {entry.totals}
        </div>)}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--nodu-border)] pt-2">
        <section aria-label="Souhrn výkazu" className="min-w-0 flex-1">
          <dl className="flex flex-wrap gap-x-5 gap-y-1">
            <div><dt className="text-[10px] text-[color:var(--nodu-text-soft)]">Celkem hodin</dt><dd className="text-base font-semibold leading-snug tabular-nums">{displayTimelogHours(hours)}</dd></div>
            <div><dt className="text-[10px] text-[color:var(--nodu-text-soft)]">Odměna celkem</dt><dd className="text-base font-semibold leading-snug tabular-nums">{displayTimelogMoney(amount)}</dd></div>
          </dl>
        </section>
        {control}
      </div>
      {children}
    </div>
  </section>;
}
