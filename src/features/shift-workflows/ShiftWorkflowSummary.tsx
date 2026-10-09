import { useContext } from 'react';
import { Link2 } from 'lucide-react';
import type { Event } from '../../types';
import { ShiftWorkflowManagementContext } from './ShiftWorkflowManagementContext';
import { shiftWorkflowEventId } from './shift-workflows.selection';
import { getCrewWorkflowMembers } from './shift-workflows.management';

export default function ShiftWorkflowSummary({ event }: { event: Event }) {
  const context = useContext(ShiftWorkflowManagementContext);
  if (!context?.data || (context.scope.source === 'supabase' && !event.supabaseId)) return null;
  const id = shiftWorkflowEventId(event, context.scope.source);
  const members = getCrewWorkflowMembers(context.data, context.scope, context.profileId, id);
  if (!members.length) return null;
  return <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--nodu-accent-soft)] px-3 py-1 text-xs font-medium text-[var(--nodu-text-soft)]">
    <Link2 size={12} />Společná evidence: {members.map(({ event: member }) => member.name).join(', ')}
  </p>;
}
