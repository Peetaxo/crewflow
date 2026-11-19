import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { createEventHoursFile } from './event-hours-workbook';
import type { EventHoursReport } from './event-hours-report';

const report: EventHoursReport = {
  event: { name: 'Výstava / Praha', job: 'V01' }, partial: true,
  people: [{ name: 'Jana Nová', minutes: 330, rate: 200, costs: { work: 1100, travel: 56, meals: 0, receipts: 14.5 }, shifts: [
    { date: '2026-11-18', from: 1320, to: 120, minutes: 240, work: 800, phase: 'provoz', note: '=1+1' },
    { date: '2026-11-19', from: 720, to: 810, minutes: 90, work: 300, phase: 'instal', note: '' },
  ] }],
};

async function readExport(input: EventHoursReport) {
  const file = await createEventHoursFile(input);
  const zip = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const xml = (path: string) => new DOMParser().parseFromString(strFromU8(zip[path]), 'application/xml');
  const strings = [...xml('xl/sharedStrings.xml').querySelectorAll('si')].map(item => item.textContent);
  const sheet = xml('xl/worksheets/sheet1.xml');
  const rows = [...sheet.querySelectorAll('sheetData row')].map(row => {
    const values: (number | string | null)[] = [];
    for (const cell of row.querySelectorAll('c')) {
      const column = cell.getAttribute('r')!.charCodeAt(0) - 65;
      const raw = cell.querySelector('v')?.textContent;
      values[column] = cell.getAttribute('t') === 's' ? strings[Number(raw)] : raw == null ? null : Number(raw);
    }
    return values;
  });
  return { file, sheet, rows, strings, zip, workbook: xml('xl/workbook.xml') };
}

describe('event hours workbook', () => {
  it.each([true, false])('exports one branded sheet with shifts, person subtotals and a final crew total (partial=%s)', async partial => {
    const { file, sheet, rows, strings, workbook, zip } = await readExport({ ...report, partial });
    expect(file.name).toBe(`Hodiny-V01-Výstava-Praha${partial ? '-průběžný' : ''}.xlsx`);
    expect([...workbook.querySelectorAll('sheets sheet')].map(s => s.getAttribute('name'))).toEqual(['Směny a náklady']);
    expect(Object.keys(zip).filter(path => /^xl\/media\/.*\.png$/.test(path))).toHaveLength(1);
    expect(sheet.querySelector('drawing')).toBeTruthy();
    expect(workbook.querySelector('definedName[name="_xlnm.Print_Titles"]')?.textContent).toBe("'Směny a náklady'!$1:$3");
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
});
