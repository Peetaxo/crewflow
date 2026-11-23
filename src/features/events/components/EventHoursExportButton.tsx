import { useEffect, useRef, useState } from 'react';
import { FileDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { appDataSource } from '../../../lib/app-config';
import { buildEventHoursReport, type EventHoursInput } from '../services/event-hours-report';
import { hasSubmittedEventHours } from '../services/event-hours-submission';
import { hasRemoteEventHours, loadRemoteEventHours } from '../services/load-event-hours';

type Detail = EventHoursInput & { event: EventHoursInput['event'] & { supabaseId?: string } };

export function EventHoursExportButton({ detail, availabilityFromDetail = false }: { detail: Detail; availabilityFromDetail?: boolean }) {
  const { event, timelogs } = detail;
  const { supabaseId } = event;
  const remote = appDataSource === 'supabase';
  const knownSubmitted = timelogs.some(hasSubmittedEventHours);
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
    if (remote && supabaseId && !availabilityFromDetail) {
      // A selected event may have older reports missing from the overview cache.
      setAvailability('checking');
      hasRemoteEventHours(supabaseId).then(
        submitted => { if (active) setAvailability(submitted ? 'available' : 'empty'); },
        () => { if (active) setAvailability('failed'); },
      );
    } else {
      setAvailability(knownSubmitted && (!remote || supabaseId) ? 'available' : 'empty');
    }
    return () => { active = false; };
  }, [remote, supabaseId, knownSubmitted, availabilityFromDetail, retry]);

  const exportHours = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const report = remote ? await loadRemoteEventHours(event) : buildEventHoursReport(detail);
      if (!mounted.current) return;
      if (!report.hasSubmittedReports) {
        if (remote) setAvailability('empty');
        toast.info('Na této akci zatím nikdo neodevzdal výkaz.');
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

  const available = availability === 'available';
  return <>
    <Button type="button" variant="secondary" size="sm" onClick={exportHours}
      className="border-[color:rgb(var(--nodu-accent-rgb)/0.2)] font-semibold text-[color:var(--nodu-text)] [&_svg]:text-[color:var(--nodu-accent)]"
      disabled={busy || !available} aria-busy={busy}
      title={available ? 'Stáhnout aktuální stav výkazů a schválené hodiny v Excelu' : 'Rozpis bude dostupný po odevzdání prvního výkazu.'}>
      <FileDown size={16} aria-hidden="true" />{busy ? 'Připravuji rozpis…' : 'Stáhnout rozpis hodin'}
    </Button>
    {remote && availability === 'failed' && <Button type="button" variant="ghost" size="sm"
      onClick={() => setRetry(value => value + 1)}>Znovu ověřit výkazy</Button>}
  </>;
}
