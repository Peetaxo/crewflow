import { useEffect, useRef, useState } from 'react';
import { FileDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { appDataSource } from '../../../lib/app-config';
import { hasApprovedHours } from '../../timelogs/services/timelog-approval-state';
import { buildEventHoursReport, type EventHoursInput } from '../services/event-hours-report';
import { hasRemoteEventHours, loadRemoteEventHours } from '../services/load-event-hours';

type Detail = EventHoursInput & { event: EventHoursInput['event'] & { supabaseId?: string } };

export function EventHoursExportButton({ detail }: { detail: Detail }) {
  const { event, timelogs } = detail;
  const { supabaseId } = event;
  const remote = appDataSource === 'supabase';
  const knownApproved = timelogs.some(log => hasApprovedHours(log) && log.days.length > 0);
  const [availability, setAvailability] = useState<'checking' | 'available' | 'empty' | 'failed'>('checking');
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    // The overview cache may omit older reports. Check the selected event directly.
    if (remote && supabaseId) {
      setAvailability('checking');
      hasRemoteEventHours(supabaseId).then(
        approved => { if (active) setAvailability(approved ? 'available' : 'empty'); },
        () => { if (active) setAvailability('failed'); },
      );
    }
    return () => { active = false; };
  }, [remote, supabaseId, knownApproved, retry]);

  const exportHours = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const report = remote ? await loadRemoteEventHours(event) : buildEventHoursReport(detail);
      if (!mounted.current) return;
      if (!report.people.length) {
        if (remote) setAvailability('empty');
        toast.info('Akce zatím nemá žádné schválené hodiny.');
        return;
      }
      const [{ createEventHoursFile }, { saveEventHoursFile }] = await Promise.all([
        import('../services/event-hours-workbook'), import('../services/save-event-hours-file'),
      ]);
      const file = await createEventHoursFile(report);
      if (mounted.current) await saveEventHoursFile(file);
    } catch (error) {
      if (mounted.current) toast.error(error instanceof Error ? error.message : 'Rozpis hodin se nepodařilo stáhnout.');
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const available = remote ? availability === 'available' : knownApproved;
  return <>
    <Button type="button" variant="outline" size="sm" onClick={exportHours}
      disabled={busy || !available} aria-busy={busy}
      title={available ? 'Excel se schválenými hodinami, odměnami a náhradami crew za tuto akci' : 'Rozpis bude dostupný po schválení prvního výkazu.'}>
      <FileDown size={16} aria-hidden="true" />{busy ? 'Připravuji rozpis…' : 'Stáhnout rozpis hodin'}
    </Button>
    {remote && availability === 'failed' && <Button type="button" variant="ghost" size="sm"
      onClick={() => setRetry(value => value + 1)}>Znovu ověřit schválení</Button>}
  </>;
}
