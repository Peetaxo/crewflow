import { useContext } from 'react';
import { Link2 } from 'lucide-react';
import type { Event } from '../../types';
import { ShiftWorkflowManagementContext } from './ShiftWorkflowManagementContext';
import { shiftWorkflowEventId } from './shift-workflows.selection';

export default function ShiftWorkflowSummary({ event }: { event: Event }) {
  const context = useContext(ShiftWorkflowManagementContext);
  if (!context?.data || (context.scope.source === 'supabase' && !event.supabaseId)) return null;
  const id = shiftWorkflowEventId(event, context.scope.source);
  const workflow = context.data.snapshot.workflows.find((w) => w.eventIds.includes(id));
  if (!workflow) return null;
  const count = workflow.eventIds.length;
  return <button type="button" disabled={context.loading} onClick={() => context.open(workflow.id)}
    className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--nodu-accent-soft)] px-3 py-1 text-xs font-medium text-[var(--nodu-text-soft)] hover:text-[var(--nodu-accent)]">
    <Link2 size={12} />Propojeno: {count} {count === 1 ? 'směna' : count < 5 ? 'směny' : 'směn'}
  </button>;
}
