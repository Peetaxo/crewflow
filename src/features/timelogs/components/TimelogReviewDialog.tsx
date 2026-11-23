import { useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import StatusBadge from '../../../components/shared/StatusBadge';
import { TimelogReportSummary } from '../../shift-workflows/timelog-evidence-presentation';
import { KM_RATE } from '../../../data';
import type { Event, Role, Timelog } from '../../../types';
import { calculateMealAllowance, calculateTotalHours } from '../../../utils';
import { canSeeTimelogNote } from '../services/timelog-permissions';
import { displayTimelogHours, displayTimelogMoney, timelogPeriod } from './timelog-summary-format';

type ReviewHeading = { person: string; event: Event };

export function TimelogReviewContent({ person, event, children, dismiss, onCloseAutoFocus }: ReviewHeading & {
  children: ReactNode;
  dismiss: () => void;
  onCloseAutoFocus?: ComponentProps<typeof DialogContent>['onCloseAutoFocus'];
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  return <DialogContent closeLabel="Zavřít kontrolu výkazu"
    className="max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto overscroll-contain p-4 sm:p-6"
    onOpenAutoFocus={e => { e.preventDefault(); heading.current?.focus({ preventScroll: true }); }}
    onKeyDown={e => {
      if (e.key === 'Escape' && !e.defaultPrevented && e.currentTarget.contains(e.target as Node)) {
        e.preventDefault();
        dismiss();
      }
    }}
    onCloseAutoFocus={onCloseAutoFocus}>
    <DialogHeader className="pr-10">
      <DialogTitle ref={heading} tabIndex={-1}>Kontrola výkazu</DialogTitle>
      <DialogDescription>{[person, event.name, event.job].filter(Boolean).join(' · ')}</DialogDescription>
    </DialogHeader>
    {children}
  </DialogContent>;
}

export function PersonReviewTrigger({ person, event, busy, openRound, renderReview }: ReviewHeading & {
  busy: boolean; openRound: () => boolean; renderReview: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const changeOpen = (next: boolean) => {
    if (!busy && (!next || !openRound())) setOpen(next);
  };
  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild><button type="button" className="min-h-11 rounded-md text-left hover:underline">{person}</button></DialogTrigger>
    {open && <TimelogReviewContent person={person} event={event} dismiss={() => changeOpen(false)}>{renderReview(() => setOpen(false))}</TimelogReviewContent>}
  </Dialog>;
}

export function TimelogReviewDetails({ report, event, rate, role, busy, onEdit, onApprove, onReturn, children }: {
  report: Timelog; event: Event; rate?: number; role: Role; busy: boolean;
  onEdit?: () => void; onApprove?: () => void; onReturn?: () => void; children?: ReactNode;
}) {
  const hours = calculateTotalHours(report.days);
  const mealsEnabled = Boolean(event.mealAllowanceEnabled);
  const meals = calculateMealAllowance(report.days, { enabled: mealsEnabled });
  const amount = rate == null ? null : hours * rate + report.km * KM_RATE + meals;
  return <>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm">{timelogPeriod(report)}</span><StatusBadge status={report.status} />
    </div>
    {children}
    <TimelogReportSummary days={report.days} km={report.km}
      note={canSeeTimelogNote(role) ? report.note : ''} mealAllowanceEnabled={mealsEnabled} mealAllowanceTotal={meals} />
    <p className="text-right text-sm font-semibold">{displayTimelogHours(hours)}{amount !== null && <> · {displayTimelogMoney(amount)}</>}</p>
    {(onEdit || onReturn || onApprove) && <DialogFooter className="flex-wrap">
      {onEdit && <Button variant="outline" disabled={busy} onClick={onEdit}>Upravit výkaz</Button>}
      {onReturn && <Button variant="outline" disabled={busy} onClick={onReturn}>Vrátit k opravě</Button>}
      {onApprove && <Button disabled={busy} onClick={onApprove}>{role === 'crewhead' ? 'Schválit a poslat COO' : 'Schválit výkaz'}</Button>}
    </DialogFooter>}
  </>;
}
