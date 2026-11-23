import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { createEventHoursFile } from './event-hours-workbook';
import { buildEventHoursReport, type EventHoursReport } from './event-hours-report';

const report: EventHoursReport = {
  event: { name: 'Výstava / Praha', job: 'V01' }, partial: true,
  generatedAt: '2026-11-20T13:05:00Z', hasSubmittedReports: true,
  progress: { expected: 1, submitted: 1, approved: 1, missingNames: [], hasExplicitRoster: true },
  roster: [{ name: 'Jana Nová', identified: true, statuses: ['approved'], unapprovedMinutes: 0, approvedMinutes: 330 }],
  people: [{ name: 'Jana Nová', minutes: 330, rate: 200, costs: { work: 1100, travel: 56, meals: 0, receipts: 14.5 }, shifts: [
    { date: '2026-11-18', from: 1320, to: 120, minutes: 240, work: 800, phase: 'provoz', note: '=1+1' },
    { date: '2026-11-19', from: 720, to: 810, minutes: 90, work: 300, phase: 'instal', note: '' },
  ] }],
};

async function readExport(input: EventHoursReport, sheetName = 'Směny a náklady') {
  const file = await createEventHoursFile(input);
  const zip = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const xml = (path: string) => new DOMParser().parseFromString(strFromU8(zip[path]), 'application/xml');
  const strings = [...xml('xl/sharedStrings.xml').querySelectorAll('si')].map(item => item.textContent);
  const workbook = xml('xl/workbook.xml');
  const sheetIndex = [...workbook.querySelectorAll('sheets sheet')].findIndex(s => s.getAttribute('name') === sheetName);
  expect(sheetIndex).toBeGreaterThanOrEqual(0);
  const sheet = xml(`xl/worksheets/sheet${sheetIndex + 1}.xml`);
  const rows = [...sheet.querySelectorAll('sheetData row')].map(row => {
    const values: (number | string | null)[] = [];
    for (const cell of row.querySelectorAll('c')) {
      const column = cell.getAttribute('r')!.charCodeAt(0) - 65;
      const raw = cell.querySelector('v')?.textContent;
      values[column] = cell.getAttribute('t') === 's' ? strings[Number(raw)] : raw == null ? null : Number(raw);
    }
    return values;
  });
  return { file, sheet, rows, strings, zip, workbook };
}

describe('event hours workbook', () => {
  it('writes valid SpreadsheetML font records for Excel on iPhone', async () => {
    const { zip } = await readExport(report);
    const styles = new DOMParser().parseFromString(strFromU8(zip['xl/styles.xml']), 'application/xml');
    const fonts = [...styles.querySelectorAll('fonts font')];
    expect(fonts.some(font => font.querySelector('b'))).toBe(true);
    for (const font of fonts) {
      const properties = [...font.children].map(property => property.localName);
      expect(properties).toEqual([...(font.querySelector('b') ? ['b'] : []), 'sz', 'color', 'name', 'family']);
    }
  });

  it('uses Excel-compatible format IDs and selects the visible pane below the frozen rows', async () => {
    const { sheet, zip } = await readExport(report);
    const styles = new DOMParser().parseFromString(strFromU8(zip['xl/styles.xml']), 'application/xml');
    const formatIds = [...styles.querySelectorAll('numFmts numFmt')].map(el => Number(el.getAttribute('numFmtId')));
    expect(formatIds.length).toBeGreaterThan(0);
    expect(formatIds.every(id => id >= 164)).toBe(true);
    const cellStyles = styles.querySelectorAll('cellXfs xf');
    for (const [address, code] of Object.entries({ A5: 'dd.mm.yyyy', D5: 'hh:mm', F5: '0.00', G5: '#,##0.00" Kč"' })) {
      const styleIndex = sheet.querySelector(`c[r="${address}"]`)?.getAttribute('s');
      expect(styleIndex).toBeTruthy();
      const formatId = cellStyles[Number(styleIndex)].getAttribute('numFmtId');
      expect(styles.querySelector(`numFmt[numFmtId="${formatId}"]`)?.getAttribute('formatCode')).toBe(code);
    }
    const pane = sheet.querySelector('sheetView pane');
    expect(pane?.getAttribute('topLeftCell')).toBe('A4');
    expect(pane?.getAttribute('activePane')).toBe('bottomLeft');
    expect(sheet.querySelector('selection[pane="bottomLeft"]')?.getAttribute('activeCell')).toBe('A4');
  });

  it.each([true, false])('keeps branded shifts, person subtotals and a final crew total (partial=%s)', async partial => {
    const { file, sheet, rows, strings, workbook, zip } = await readExport({ ...report, partial });
    expect(file.name).toBe(`Hodiny-V01-Výstava-Praha${partial ? '-průběžný' : ''}.xlsx`);
    expect([...workbook.querySelectorAll('sheets sheet')].map(s => s.getAttribute('name'))).toEqual(['Stav výkazů', 'Směny a náklady']);
    expect(Object.keys(zip).filter(path => /^xl\/media\/.*\.png$/.test(path))).toHaveLength(1);
    expect(sheet.querySelector('drawing')).toBeTruthy();
    expect(workbook.querySelector('definedName[name="_xlnm.Print_Titles"][localSheetId="1"]')?.textContent).toBe("'Směny a náklady'!$1:$3");
    expect(sheet.querySelector('pageSetup')?.getAttribute('fitToWidth')).toBe('1');
    expect(sheet.querySelector('pane')?.getAttribute('ySplit')).toBe('3');
    expect(strings).toContainEqual(expect.stringContaining(partial ? 'Průběžný rozpis' : 'Kompletní rozpis'));
    const header = rows.find(row => row[0] === 'Datum')!;
    expect(header).toEqual(['Datum', 'Typ práce', 'Poznámka', 'Od', 'Do', 'Hodiny', 'Práce', 'Cestovné', 'Účtenky', 'Náklady celkem']);
    const group = rows.findIndex(row => row[0] === 'Jana Nová');
    expect(rows[group + 1].slice(2, 7)).toEqual(['=1+1', 1320/1440, 120/1440, 4, 800]);
    expect(rows[group + 1].slice(7).every(v => v === null)).toBe(true);
    expect(sheet.querySelector(`c[r="C${group + 2}"] f`)).toBeNull();
    expect(rows[group + 3][0]).toBe('Celkem · Jana Nová');
    expect(rows[group + 3].slice(5)).toEqual([5.5, 1100, 56, 14.5, 1170.5]);
    expect(rows.at(-1)?.slice(5)).toEqual([5.5, 1100, 56, 14.5, 1170.5]);
    expect(sheet.querySelectorAll('c f').length).toBeGreaterThan(3);
  });

  it.each([
    { travel: 0, meals: 0, receipts: 0, labels: [], totals: [2200] },
    { travel: 42, meals: 0, receipts: 0, labels: ['Cestovné'], totals: [42, 2242] },
    { travel: 0, meals: 250, receipts: 0, labels: ['Stravné'], totals: [250, 2450] },
    { travel: 0, meals: 0, receipts: 75, labels: ['Účtenky'], totals: [75, 2275] },
    { travel: 42, meals: 250, receipts: 75, labels: ['Cestovné', 'Stravné', 'Účtenky'], totals: [42, 250, 75, 2567] },
    { travel: null, meals: 0, receipts: 0, labels: ['Cestovné'], totals: ['Neúplné', 'Neúplné'] },
  ])('shows only relevant or incomplete expenses and counts each once for the crew ($labels)', async ({ travel, meals, receipts, labels, totals }) => {
    const person = report.people[0];
    const { rows } = await readExport({ ...report, people: [
      { ...person, costs: { work: 1100, travel: 0, meals: 0, receipts: 0 } },
      { ...person, name: 'Petr Malý', costs: { work: 1100, travel, meals, receipts } },
    ] });
    expect(rows.find(row => row[0] === 'Datum')?.slice(7)).toEqual([...labels, 'Náklady celkem']);
    expect(rows.at(-1)?.slice(5)).toEqual([11, 2200, ...totals]);
    expect(rows.at(-1)?.[0]).toBe('Celkem za crew');
  });

  it('keeps missing costs, mixed rates, and estimated historical amounts identifiable', async () => {
    const person = report.people[0];
    const { rows, strings } = await readExport({ ...report, people: [
      { ...person, estimatedBilledCosts: true, rate: 'mixed', costs: { ...person.costs, work: null },
        shifts: person.shifts.map(s => ({ ...s, work: null })) },
    ] });
    expect(strings).toContain('Více sazeb');
    expect(rows.at(-1)?.[0]).toContain('odhad');
    expect(rows.at(-1)?.at(-1)).toBe('Neúplné');
    expect(rows.find(row => row.includes('=1+1'))?.[6]).toBe('Neúplné');
  });

  it('exports the first submitted hours, named missing assignments and zero approved totals', async () => {
    const input = buildEventHoursReport({ event: report.event, contractors: [], receipts: [],
      crewAssignments: [{ contractorProfileId: 'p', name: 'Petra' }, { contractorProfileId: 'q', name: 'Q. Nová' }],
      timelogs: [{ id: 1, contractorProfileId: 'p', status: 'pending_ch', km: 0,
        days: [{ d: '2026-11-20', f: '22:00', t: '01:00', type: 'provoz' }] }],
    });
    const { rows, strings } = await readExport({ ...input, generatedAt: '2026-11-20T13:05:00Z' }, 'Stav výkazů');
    expect(strings).toContainEqual(expect.stringMatching(/20\.\s*11\.\s*2026.*14:05/));
    expect(strings).toContainEqual(expect.stringMatching(/Odevzdalo.*1\s*\/\s*2/));
    expect(strings).toContainEqual(expect.stringMatching(/Schváleno.*0\s*\/\s*2/));
    expect(rows.find(row => row[0] === 'Petra')).toEqual(['Petra', 'Čeká na kontrolu CH', 3, 0]);
    expect(rows.find(row => row[0] === 'Q. Nová')).toEqual(['Q. Nová', 'Neodevzdáno', 0, 0]);
    expect(rows.at(-1)?.slice(2)).toEqual([3, 0]);
    const finance = await readExport(input);
    expect(finance.rows.at(-1)?.slice(5)).toEqual([0, 0, 0]);
    expect(finance.sheet.querySelectorAll('f')).toHaveLength(0);
  });

  it('labels every approval or billing stage and keeps unapproved hours out of pay', async () => {
    const statuses = ['draft', 'rejected', 'pending_crew_confirmation', 'pending_ch', 'pending_coo', 'approved', 'invoiced', 'paid'] as const;
    const input = buildEventHoursReport({ event: report.event, contractors: [], receipts: [], crewAssignments: [],
      timelogs: statuses.map((status, i) => ({ id: i, contractorProfileId: 'p' + i, status, km: 0,
        days: [{ d: '2026-11-20', f: '10:00', t: '12:00', type: 'provoz' }] })),
    });
    const { strings, rows, sheet } = await readExport(input, 'Stav výkazů');
    for (const label of ['Koncept · neodevzdáno', 'Vráceno k opravě', 'Čeká na potvrzení crew', 'Čeká na kontrolu CH',
      'Čeká na schválení COO', 'Schváleno k proplacení', 'Fakturováno', 'Zaplaceno']) expect(strings).toContain(label);
    expect(strings).toContainEqual(expect.stringContaining('Celkový počet přiřazených lidí není známý'));
    expect(strings).toContainEqual(expect.stringContaining('Podle dostupných výkazů'));
    expect(strings).not.toContainEqual(expect.stringContaining('Chybí odevzdání ·'));
    expect(rows.at(-1)?.slice(2)).toEqual([8, 6]);
    expect(sheet.querySelector('c[r="C12"] f')?.textContent).toBe('SUM(C4:C11)');
    const finance = await readExport(input);
    expect(finance.rows.at(-1)?.[5]).toBe(6);
  });

  it('marks the total of incomplete submitted hours while still showing the approved amount', async () => {
    const { rows } = await readExport({ ...report, roster: [
      ...report.roster, { name: 'Jan', statuses: ['pending_ch'], identified: true, approvedMinutes: 0, unapprovedMinutes: null },
    ] }, 'Stav výkazů');
    expect(rows.at(-1)?.slice(2)).toEqual(['Neúplné', 5.5]);
  });

  it('does not present zero hours or a zero payout for a historical approval with missing shift data', async () => {
    const input = buildEventHoursReport({ event: report.event, receipts: [], contractors: [],
      crewAssignments: [{ contractorProfileId: 'p', name: 'Petra' }],
      timelogs: [{ id: 1, contractorProfileId: 'p', status: 'approved', km: 0, days: [] }] });
    const { rows, strings } = await readExport(input);
    expect(rows.at(-1)?.slice(5)).toEqual(['Neúplné', 'Neúplné', 'Neúplné']);
    expect(strings).toContainEqual(expect.stringContaining('Chybí údaje o schválených směnách'));
  });
});
