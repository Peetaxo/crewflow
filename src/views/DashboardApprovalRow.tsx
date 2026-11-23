import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogTrigger } from '../components/ui/dialog';
import { useAppContext } from '../context/useAppContext';
import { KM_RATE } from '../data';
import { TimelogReviewContent, TimelogReviewDetails } from '../features/timelogs/components/TimelogReviewDialog';
import { displayTimelogMoney } from '../features/timelogs/components/timelog-summary-format';
import { useTimelogApprovalActions } from '../features/timelogs/hooks/useTimelogApprovalActions';
import { canEditTimelog } from '../features/timelogs/services/timelog-permissions';
import type { Contractor, Event, Timelog } from '../types';
import { calculateMealAllowance, calculateTotalHours } from '../utils';

interface DashboardApprovalRowProps {
  timelog: Timelog;
  event: Event;
  contractor: Contractor;
  isMobile: boolean;
  currentProfileId: string | null;
  reviewSelection: (ids: number[]) => boolean;
}

export default function DashboardApprovalRow({ timelog, event, contractor, isMobile, currentProfileId, reviewSelection }: DashboardApprovalRowProps) {
  const { role, setEditingTimelog } = useAppContext();
  const [reviewed, setReviewed] = useState<Timelog | null>(null);
  const report = reviewed ?? timelog;
  const openSharedReview = (ids: number[]) => {
    const routed = reviewSelection(ids);
    if (routed) setReviewed(null);
    return routed;
  };
  const actions = useTimelogApprovalActions({
    currentProfileId, timelogs: [report], reviewSelection: openSharedReview,
    onSuccess: () => setReviewed(null),
  });
  const hours = calculateTotalHours(report.days);
  const mealsEnabled = Boolean(event.mealAllowanceEnabled);
  const meals = calculateMealAllowance(report.days, { enabled: mealsEnabled });
  const total = hours * contractor.rate + report.km * KM_RATE + meals;

  const changeOpen = (next: boolean) => {
    if (actions.isPending) return;
    try {
      if (next && openSharedReview([timelog.id])) return;
      setReviewed(next ? structuredClone(timelog) : null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Výkaz se nepodařilo otevřít.');
    }
  };

  return (
    <Dialog open={Boolean(reviewed)} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={isMobile ? 'nodu-management-overview-row' : 'nodu-dashboard-row flex w-full items-center gap-3 rounded-[20px] border-b px-3 py-3 text-left transition-colors last:border-0'}
        >
          <span aria-hidden="true" className={isMobile ? 'av h-9 w-9 text-[11px]' : 'av h-8 w-8 text-[10px]'} style={{ backgroundColor: contractor.bg, color: contractor.fg }}>
            {contractor.ii}
          </span>
          <span className="min-w-0 flex-1">
            <strong className="nodu-dashboard-row-title">{contractor.name}</strong>
            <span className="nodu-dashboard-row-meta mt-1 gap-2">
              <span>{event.name}</span>
              {!isMobile && <span className="jn nodu-job-badge">{event.job}</span>}
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className={isMobile ? 'nodu-management-overview-value' : 'nodu-dashboard-row-value'}>{hours.toFixed(1)}h</span>
            {!isMobile && <span className="block text-[11px] text-[color:var(--nodu-text-soft)]">{displayTimelogMoney(total)}</span>}
          </span>
          {!isMobile && <span aria-hidden="true" className="nodu-dashboard-action"><ChevronRight size={14} /></span>}
        </button>
      </DialogTrigger>
      {reviewed && <TimelogReviewContent person={contractor.name} event={event} dismiss={() => changeOpen(false)}>
        <TimelogReviewDetails report={reviewed} event={event} role={role} busy={actions.isPending}
          rate={contractor.hasKnownRate === false ? undefined : contractor.rate}
          onEdit={canEditTimelog(reviewed, role) ? () => { setReviewed(null); setEditingTimelog(reviewed); } : undefined}
          onReturn={() => actions.execute([reviewed.id], 'rej')}
          onApprove={() => actions.execute([reviewed.id], role === 'crewhead' ? 'ch' : 'coo')} />
        {actions.dialog}
      </TimelogReviewContent>}
    </Dialog>
  );
}
