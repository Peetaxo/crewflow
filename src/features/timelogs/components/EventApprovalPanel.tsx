import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { CalendarDays, ChevronDown, ChevronRight, Inbox, Users } from 'lucide-react';
import StatusBadge from '../../../components/shared/StatusBadge';
import { Dialog } from '../../../components/ui/dialog';
import { TimelogReviewContent } from './TimelogReviewDialog';
import { Button } from '../../../components/ui/button';
import type { Event, Role, Timelog } from '../../../types';
import { calculateTotalHours, formatShortDate } from '../../../utils';
import { displayTimelogHours, timelogPeriod } from './timelog-summary-format';
import { eventApprovalDays, eventAttendance, eventReportRows, queueLabel,
  type ApprovalDay, type DayRow, type ReportRow, type RosterMember } from './event-approval-overview';

interface EventApprovalPanelProps {
  event: Event;
  reports: Timelog[];
  visibleReports: Timelog[];
  actionableIds: ReadonlySet<number>;
  personName: (report: Timelog) => string;
  assigneeName?: (report: Timelog) => string | null;
  roster: readonly RosterMember[] | null;
  reportsComplete?: boolean;
  includeHistory?: boolean;
  role: Role;
  bulkAction?: ReactNode;
  exportAction?: ReactNode;
  onExpandedChange?: (open: boolean) => void;
  onOpenReview?: (report: Timelog) => boolean;
  reviewBusy?: boolean;
  renderReview: (report: Timelog, close: () => void) => ReactNode;
}

function reviewIdentity(report: Timelog) {
  return JSON.stringify([report.supabaseId ?? report.id, report.eventSupabaseId ?? report.eid, report.contractorProfileId]);
}

function countReports(n: number, fresh = false) {
  const adjective = n === 1 ? 'nový' : n >= 2 && n <= 4 ? 'nové' : 'nových';
  const noun = n === 1 ? 'výkaz' : n >= 2 && n <= 4 ? 'výkazy' : 'výkazů';
  return `${n} ${fresh ? adjective + ' ' : ''}${noun}`;
}
const nextStep: Record<Role, string> = { crewhead: 'k předání COO', coo: 'ke schválení', crew: 'k vyřízení' };

function HistorySection({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <div className="border-t border-[color:var(--nodu-border)]">
    <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}
      className="flex min-h-11 w-full items-center gap-2 rounded-lg px-1 text-left text-xs font-semibold text-[color:var(--nodu-text-soft)] hover:text-[color:var(--nodu-text)] focus-visible:outline-[color:var(--nodu-accent)]">
      <ChevronDown size={15} aria-hidden="true" className={open ? 'rotate-180' : ''} />{title}
    </button>
    {open && <div id={id}>{children}</div>}
  </div>;
}

interface RowProps {
  role: Role;
  assigneeName?: EventApprovalPanelProps['assigneeName'];
  onReview: (row: ReportRow, trigger: HTMLButtonElement) => void;
}
function ReportButton({ row, role, assigneeName, onReview }: RowProps & { row: ReportRow | DayRow }) {
  const descriptionId = useId();
  const { report, name, bucket, newInQueue } = row;
  const actionable = bucket === 'mine';
  const shifts = 'shifts' in row ? row.shifts : undefined;
  const hours = calculateTotalHours(shifts ?? report.days);
  const times = shifts?.map(shift => shift.f && shift.t ? `${shift.f}–${shift.t}` : null).filter(Boolean);
  const assignee = bucket === 'waiting' && (report.status === 'pending_ch' || report.status === 'pending_coo')
    ? assigneeName?.(report) : null;
  const waitingLabel = report.status === 'pending_ch' ? 'Čeká na CH' : report.status === 'pending_coo' ? 'Čeká na COO' : undefined;
  const status = actionable ? queueLabel[role] : waitingLabel;
  return <button type="button" aria-haspopup="dialog" onClick={e => onReview(row, e.currentTarget)} aria-label={`Otevřít celý výkaz – ${name}`}
    aria-describedby={`${descriptionId}-status ${descriptionId}-hours`} data-queue-row={actionable || undefined}
    className="grid min-h-12 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-xl px-2.5 py-2 text-left hover:bg-[color:rgb(var(--nodu-accent-rgb)/0.065)] focus-visible:outline-[color:var(--nodu-accent)] sm:grid-cols-[minmax(0,1fr)_auto_auto]">
    <span className="min-w-0">
      <span className="block text-sm font-semibold leading-snug [overflow-wrap:anywhere]">{name}</span>
      <span className="mt-0.5 block text-[11px] text-[color:var(--nodu-text-soft)]">
        {times?.length ? times.join(' · ') : shifts ? '' : timelogPeriod(report)}
        {assignee && <span className="block">Schvaluje: {assignee}</span>}
      </span>
    </span>
    <span id={`${descriptionId}-status`} className="row-start-2 flex flex-wrap items-center gap-1.5 sm:col-start-2 sm:row-start-1">
      <StatusBadge status={actionable ? 'decision' : report.status} label={status} />
      {newInQueue && <span className="inline-flex items-center gap-1 text-xs font-semibold text-[color:var(--nodu-text)]"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--nodu-accent)]" />Nově ve frontě</span>}
    </span>
    <span id={`${descriptionId}-hours`} className="col-start-2 row-start-1 flex items-center gap-2 whitespace-nowrap text-xs font-semibold tabular-nums sm:col-start-3">
      {displayTimelogHours(hours)} <ChevronRight size={15} aria-hidden="true" className="text-[color:var(--nodu-text-soft)]" />
    </span>
  </button>;
}

function ReportList({ rows, ...rowProps }: RowProps & { rows: (ReportRow | DayRow)[] }) {
  const active = rows.filter(row => row.bucket !== 'approved');
  const approved = rows.filter(row => row.bucket === 'approved');
  const list = (entries: typeof rows) => <div className="divide-y divide-[color:var(--nodu-border)]">
    {entries.map(row => <ReportButton key={reviewIdentity(row.report)} row={row} {...rowProps} />)}
  </div>;
  return <>
    {list(active)}
    {approved.length > 0 && <HistorySection title={`Schválené výkazy (${approved.length})`}>{list(approved)}</HistorySection>}
  </>;
}

const dayFormatter = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' });
function DaySection({ day, ...rowProps }: RowProps & { day: ApprovalDay }) {
  const date = day.date && new Date(day.date);
  const label = date && Number.isFinite(date.valueOf()) ? dayFormatter.format(date) : 'Bez vyplněného data';
  return <section aria-label={label} className="overflow-hidden rounded-[16px] border border-[color:var(--nodu-border)]">
    <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 bg-[color:rgb(var(--nodu-text-rgb)/0.035)] px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="text-sm font-semibold tabular-nums">{label}</h3>
        {day.pending > 0 && <StatusBadge status="decision" label={`${queueLabel[rowProps.role]} (${day.pending})`} />}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {day.pending > 0 && <strong className="text-sm tabular-nums">{displayTimelogHours(day.pendingHours)} k vyřízení</strong>}
        <span className="text-[11px] text-[color:var(--nodu-text-soft)]">{countReports(day.totalReports)} · {displayTimelogHours(day.hours)} celkem</span>
      </div>
    </header>
    <div className="px-1">
      {day.allApproved
        ? day.rows.map(row => <ReportButton key={reviewIdentity(row.report)} row={row} {...rowProps} />)
        : <ReportList rows={day.rows} {...rowProps} />}
    </div>
  </section>;
}

function DaysView({ rows, reports, ...rowProps }: RowProps & { rows: ReportRow[]; reports: Timelog[] }) {
  const days = eventApprovalDays(rows, reports);
  const active = days.filter(day => day.rows.some(row => row.bucket !== 'approved'));
  const history = days.filter(day => day.rows.every(row => row.bucket === 'approved'));
  const historyLabel = history.every(day => day.allApproved) ? 'Schválené dny' : 'Ostatní dny';
  const sections = (items: ApprovalDay[]) => items.map(day => <DaySection key={day.date} day={day} {...rowProps} />);
  return <div className="space-y-2">
    {sections(active)}
    {history.length > 0 && <HistorySection title={`${historyLabel} (${history.length})`}>
      <div className="space-y-2">{sections(history)}</div>
    </HistorySection>}
  </div>;
}

export function EventApprovalPanel({ event, reports, visibleReports, actionableIds, personName, assigneeName, roster,
  reportsComplete = true, includeHistory = false, role, bulkAction, exportAction, onExpandedChange, onOpenReview, reviewBusy = false, renderReview }: EventApprovalPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState<'people' | 'days'>('people');
  const [selection, setSelection] = useState<{ key: string; wasActionable: boolean } | null>(null);
  const panel = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const detailId = useId();
  const rows = useMemo(() => eventReportRows(reports, visibleReports, actionableIds, personName, includeHistory),
    [reports, visibleReports, actionableIds, personName, includeHistory]);
  const attendance = useMemo(() => eventAttendance(reports, roster, reportsComplete), [reports, roster, reportsComplete]);
  const pending = rows.filter(row => row.bucket === 'mine');
  const mine = pending.length;
  const fresh = pending.filter(row => row.newInQueue).length;
  const waiting = rows.filter(row => row.bucket === 'waiting').length;
  const unfinished = rows.filter(row => row.bucket === 'unfinished').length;
  const matches = selection ? rows.filter(row => reviewIdentity(row.report) === selection.key) : [];
  const selected = matches.length === 1 && (!selection?.wasActionable || matches[0].bucket === 'mine') ? matches[0] : null;
  const restoreFocus = () => requestAnimationFrame(() => {
    const previous = triggerRef.current;
    const fallback = panel.current?.querySelector<HTMLButtonElement>('button[data-queue-row]')
      ?? panel.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
    (previous?.isConnected && previous.getClientRects().length ? previous : fallback)?.focus({ preventScroll: true });
  });
  useEffect(() => {
    if (selection && !selected) {
      setSelection(null);
    }
  }, [selection, selected]);
  const suffix = attendance.complete ? ` / ${attendance.expected}` : '';
  const missingNames = attendance.missing.map(person => person.name || 'Člen crew');
  const draftNames = attendance.drafts.map(personName);
  const nameList = (names: string[]) => expanded || names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
  const rowProps: RowProps = { role, assigneeName, onReview: (row, trigger) => {
    if (onOpenReview?.(row.report)) return;
    triggerRef.current = trigger;
    setSelection({ key: reviewIdentity(row.report), wasActionable: row.bucket === 'mine' });
  } };
  const closeReview = () => { if (!reviewBusy) setSelection(null); };
  const toggle = () => {
    setExpanded(!expanded);
    setSelection(null);
    onExpandedChange?.(!expanded);
  };

  return <section ref={panel} aria-label={`Schvalování akce ${event.name}`} className="nodu-panel min-w-0 rounded-[20px] p-3 text-[color:var(--nodu-text)] sm:p-4">
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-2">
      {mine > 0 && <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border-l-[3px] border-[color:var(--nodu-accent)] bg-[color:var(--nodu-accent-soft)] px-3 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Inbox size={17} aria-hidden="true" className="shrink-0 text-[color:var(--nodu-accent)]" />
          <div>
            <p className="text-sm font-semibold leading-snug tracking-[-0.015em] sm:text-base">{countReports(mine, mine === fresh)} {nextStep[role]}</p>
            {fresh > 0 && fresh < mine && <p className="text-xs text-[color:var(--nodu-text-soft)]">{fresh} nově ve frontě</p>}
          </div>
        </div>
        <span className="text-xs font-semibold tabular-nums">{displayTimelogHours(pending.reduce((hours, row) => hours + calculateTotalHours(row.report.days), 0))} k vyřízení</span>
      </div>}
      <div className="min-w-0">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          {event.job && <span className="jn nodu-job-badge">{event.job}</span>}
          {mine === 0 && (waiting ? <StatusBadge status="pending" label={`Ve schvalování (${waiting})`} />
            : unfinished ? <StatusBadge status="needs_review" label={`K doplnění (${unfinished})`} />
            : attendance.complete && attendance.expected > 0 && attendance.approved === attendance.expected
              ? <StatusBadge status="approved" label="Všechny výkazy schváleny" /> : null)}
        </div>
        <h2 className="text-base font-semibold leading-tight tracking-[-0.02em] [overflow-wrap:anywhere] sm:text-lg">{event.name}</h2>
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-[color:var(--nodu-text-soft)]">
          {event.startDate && <><CalendarDays size={12} aria-hidden="true" />{formatShortDate(event.startDate)}{event.endDate && event.endDate !== event.startDate && ` – ${formatShortDate(event.endDate)}`}<span aria-hidden="true">·</span></>}
          <span>{countReports(reports.length)}</span>
        </p>
      </div>
      <Button type="button" size="sm" variant="outline" aria-expanded={expanded} aria-controls={detailId}
        aria-label={`${expanded ? 'Zavřít' : 'Otevřít'} akci ${event.name}`} onClick={toggle}
        className="h-11 gap-1.5 px-2.5 text-xs sm:px-3">
        <span>{expanded ? 'Zavřít' : 'Otevřít'}</span><ChevronDown size={15} aria-hidden="true" className={expanded ? 'rotate-180' : ''} />
      </Button>
      <div className="col-span-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t border-[color:var(--nodu-border)] pt-2">
        <dl aria-label="Účast za celou akci" className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
          <div className="flex items-baseline gap-1.5"><dt className="text-[color:var(--nodu-text-soft)]">Odevzdáno</dt><dd className="font-semibold tabular-nums">{attendance.submitted}{suffix}</dd></div>
          <div className="flex items-baseline gap-1.5"><dt className="text-[color:var(--nodu-text-soft)]">Schváleno</dt><dd className="font-semibold tabular-nums">{attendance.approved}{suffix}</dd></div>
        </dl>
      </div>
      {!attendance.complete && <p className="col-span-2 text-[11px] text-[color:var(--nodu-text-soft)]">Údaje o obsazení a výkazech nejsou úplné.</p>}
      {missingNames.length > 0 && <p className="col-span-2 text-xs text-[color:var(--nodu-text-soft)]"><strong className="font-semibold">Bez výkazu ({missingNames.length})</strong> · {nameList(missingNames)}</p>}
      {draftNames.length > 0 && <p className="col-span-2 text-xs text-[color:var(--nodu-text-soft)]"><strong className="font-semibold">Neodeslaný koncept ({draftNames.length})</strong> · {nameList(draftNames)}</p>}
    </header>
    {expanded && <div id={detailId} className="mt-3 space-y-3 border-t border-[color:var(--nodu-border)] pt-3">
      <Dialog open={Boolean(selected)} onOpenChange={open => { if (!open) closeReview(); }}>
        {selected && <TimelogReviewContent person={selected.name} event={event} dismiss={closeReview} onCloseAutoFocus={e => {
          e.preventDefault();
          if (!document.querySelector('[role="dialog"][data-state="open"]')) restoreFocus();
        }}>
          {renderReview(selected.report, closeReview)}
        </TimelogReviewContent>}
      </Dialog>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div aria-label="Přehled akce" role="group" className="inline-flex rounded-[16px] border border-[color:var(--nodu-border)] bg-[color:var(--nodu-paper-strong)] p-1">
            {(['people', 'days'] as const).map(mode => {
              const Icon = mode === 'people' ? Users : CalendarDays;
              return <Button key={mode} type="button" variant={view === mode ? 'secondary' : 'ghost'} aria-pressed={view === mode}
                onClick={() => setView(mode)} className="h-11 gap-1.5 px-3 text-xs"><Icon aria-hidden="true" />{mode === 'people' ? 'Lidé' : 'Dny'}</Button>;
            })}
          </div>
          {(bulkAction || exportAction) && <div className="flex max-w-full flex-wrap items-center gap-2">{bulkAction}{exportAction}</div>}
        </div>
        {view === 'people' ? <ReportList rows={rows} {...rowProps} /> : <DaysView rows={rows} reports={reports} {...rowProps} />}
        {!rows.length && <p className="px-1 py-2 text-sm text-[color:var(--nodu-text-soft)]">Pro toto zobrazení tu nejsou žádné výkazy.</p>}
      </div>
    </div>}
  </section>;
}
