import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../app/providers/useAuth';
import { getApprovalInbox } from '../../features/shift-workflows/approval-inbox';
import { useShiftWorkflows } from '../../features/shift-workflows/useShiftWorkflows';
import { getCandidates, subscribeToCandidateChanges } from '../../features/recruitment/services/candidates.service';
import { useInvoicesQuery } from '../../features/invoices/queries/useInvoicesQuery';
import { useReceiptsQuery } from '../../features/receipts/queries/useReceiptsQuery';
import { useTimelogsQuery } from '../../features/timelogs/queries/useTimelogsQuery';
import { buildNavBadgeCounts } from './nav-badges';

export const useNavBadgeCounts = () => {
  const { currentProfileId } = useAuth();
  const workflows = useShiftWorkflows();
  const scope = workflows.scope;
  const rounds = workflows.ready && !workflows.query.isError ? workflows.query.data?.rounds : undefined;
  const timelogsQuery = useTimelogsQuery();
  const receiptsQuery = useReceiptsQuery();
  const invoicesQuery = useInvoicesQuery();
  const [candidates, setCandidates] = useState(() => getCandidates() ?? []);

  const loadData = useCallback(() => {
    setCandidates(getCandidates() ?? []);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => subscribeToCandidateChanges(loadData), [loadData]);

  const timelogs = useMemo(() => timelogsQuery.data ?? [], [timelogsQuery.data]);
  const receipts = useMemo(() => receiptsQuery.data ?? [], [receiptsQuery.data]);
  const invoices = useMemo(() => invoicesQuery.data ?? [], [invoicesQuery.data]);

  return useMemo(() => buildNavBadgeCounts({
    currentProfileId,
    role: scope.role,
    approvalCount: getApprovalInbox(timelogs, timelogs, rounds, scope).count,
    invoices,
    receipts,
    candidates,
  }), [candidates, currentProfileId, invoices, receipts, rounds, scope, timelogs]);
};
