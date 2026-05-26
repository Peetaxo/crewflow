import { describe, expect, it } from 'vitest';

import {
  buildGrasonEventsImportSql,
  buildGrasonImportRows,
  parseGrasonShiftTitle,
} from '../../scripts/grason-events-import-utils.mjs';

describe('Grason event import utilities', () => {
  it('parses job number, event name, and phase from Grason shift titles', () => {
    expect(parseGrasonShiftTitle('ORL065 | Nadace Litvínov')).toMatchObject({
      jobNumber: 'ORL065',
      eventName: 'Nadace Litvínov',
      phase: 'provoz',
    });
    expect(parseGrasonShiftTitle('Elimon Fresh Festival Plzeň - instalace | ORL052')).toMatchObject({
      jobNumber: 'ORL052',
      eventName: 'Elimon Fresh Festival Plzeň',
      phase: 'instal',
    });
    expect(parseGrasonShiftTitle('RunCzech 1/2 Maraton KV - Mattoni Fotostěna - Stavba - BTL003')).toMatchObject({
      jobNumber: 'BTL003',
      eventName: 'RunCzech 1/2 Maraton KV - Mattoni Fotostěna',
      phase: 'instal',
    });
    expect(parseGrasonShiftTitle('KCG024 / ZAVOD MIRU')).toMatchObject({
      jobNumber: 'KCG024',
      eventName: 'ZAVOD MIRU',
      phase: 'provoz',
    });
    expect(parseGrasonShiftTitle('Dekoratér/ka')).toMatchObject({
      jobNumber: '',
      eventName: 'Dekoratér/ka',
      phase: 'provoz',
    });
  });

  it('groups May occurrences into event rows and keeps unique confirmed people with occurrence counts', () => {
    const rows = buildGrasonImportRows([
      { date: '2026-05-12', name: 'Marek Rebros', shiftTitle: 'Miss Agro / JTI001' },
      { date: '2026-05-12', name: 'Jaroslav Macháč', shiftTitle: 'Miss Agro / JTI001' },
      { date: '2026-05-12', name: 'Marek Rebros', shiftTitle: 'Miss Agro / JTI001' },
      { date: '2026-05-13', name: 'Tomáš Macášek', shiftTitle: 'Elimon Fresh Festival Plzeň - nakládka | ORL052' },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      sourceKey: '2026-05-12|Miss Agro / JTI001',
      date: '2026-05-12',
      sourceTitle: 'Miss Agro / JTI001',
      eventName: 'Miss Agro',
      jobNumber: 'JTI001',
      phase: 'provoz',
      confirmedCount: 2,
    });
    expect(rows[0].confirmedPeople).toEqual([
      { name: 'Jaroslav Macháč', occurrenceCount: 1 },
      { name: 'Marek Rebros', occurrenceCount: 2 },
    ]);
    expect(rows[1]).toMatchObject({
      eventName: 'Elimon Fresh Festival Plzeň',
      jobNumber: 'ORL052',
      phase: 'instal',
      confirmedCount: 1,
    });
  });

  it('generates SQL that imports events and matched Grason people as event crew assignments', () => {
    const sql = buildGrasonEventsImportSql([
      {
        sourceKey: '2026-05-12|Miss Agro / JTI001',
        sourceMonth: '2026-05',
        date: '2026-05-12',
        sourceTitle: 'Miss Agro / JTI001',
        eventName: 'Miss Agro',
        jobNumber: 'JTI001',
        phase: 'provoz',
        confirmedCount: 2,
        confirmedPeople: [
          { name: 'Jaroslav Macháč', occurrenceCount: 1 },
          { name: 'Marek Rebros', occurrenceCount: 2 },
        ],
      },
    ]);

    expect(sql).toContain('create table if not exists public.grason_event_confirmations');
    expect(sql).toContain('alter table public.grason_event_confirmations enable row level security');
    expect(sql).toContain('for select to authenticated');
    expect(sql).toContain('insert into public.events');
    expect(sql).toContain('inserted_event_ids as');
    expect(sql).toContain('upserted_event_ids as');
    expect(sql).toContain('inserted_event_assignments as');
    expect(sql).toContain('insert into public.event_assignments');
    expect(sql).toContain('where resolved_confirmations.profile_id is not null');
    expect(sql).toContain('insert into public.grason_event_confirmations');
    expect(sql).toContain('Miss Agro');
    expect(sql).toContain('JTI001');
    expect(sql).not.toContain("'Grason import: ' || incoming_events.source_title");
    expect(sql).not.toContain("' | potvrzeni: ' ||");
    expect(sql).not.toContain('insert into public.timelogs');
    expect(sql).not.toContain('insert into public.timelog_days');
    expect(sql).not.toContain('insert into public.invoices');
  });
});
