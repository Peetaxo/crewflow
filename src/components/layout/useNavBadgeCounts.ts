import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../app/providers/useAuth';
import { getCandidates, subscribeToCandidateChanges } from '../../features/recruitment/services/candidates.service';
import { useInvoicesQuery } from '../../features/invoices/queries/useInvoicesQuery';
import { useReceiptsQuery } from '../../features/receipts/queries/useReceiptsQuery';
import { useTimelogsQuery } from '../../features/timelogs/queries/useTimelogsQuery';
import { buildNavBadgeCounts } from './nav-badges';

export const useNavBadgeCounts = () => {
  const { currentProfileId } = useAuth();
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
    timelogs,
    invoices,
    receipts,
    candidates,
  }), [candidates, currentProfileId, invoices, receipts, timelogs]);
};
