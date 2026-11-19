import { describe, expect, it, vi } from 'vitest';
import writeXlsxFile, { type Sheet } from 'write-excel-file/browser';
import { createEventHoursFile } from './event-hours-workbook';
import type { EventHoursReport } from './event-hours-report';

vi.mock('write-excel-file/browser', () => ({
  default: vi.fn(() => ({ toBlob: async () => new Blob(['xlsx']) })),
}));

const report: EventHoursReport = {
  event: { name: 'Výstava / Praha', job: 'V01' },
  partial: true,
  people: [{ name: 'Jana Nová', minutes: 330, rate: 200, costs: { work: 1100, travel: 56, meals: 0, receipts: 14.5 }, shifts: [
    { date: '2026-11-18', from: 1320, to: 120, minutes: 240, phase: 'provoz', note: '=1+1' },
    { date: '2026-11-18', from: 720, to: 810, minutes: 90, phase: 'instal', note: '' },
  ] }],
};

describe('event hours workbook', () => {
  it.each([true, false])('labels both sheets and calculates person-days and total hours (partial=%s)', async partial => {
    const result = await createEventHoursFile({ ...report, partial });
    expect(result.name).toBe(`Hodiny-V01-Výstava-Praha${partial ? '-průběžný' : ''}.xlsx`);
    const [shifts, summary] = vi.mocked(writeXlsxFile).mock.lastCall![0] as Sheet<Blob>[];
    expect([shifts.sheet, summary.sheet]).toEqual(['Rozpis hodin', 'Souhrn']);
    for (const sheet of [shifts, summary]) {
      expect(sheet.data[1][0]).toMatchObject({ value: expect.stringContaining(partial ? 'Průběžný' : 'Kompletní') });
    }
    expect(shifts.data[3][1]).toMatchObject({ value: new Date('2026-11-18T00:00:00Z') });
    expect(shifts.data[3][6]).toMatchObject({ value: 4 });
    expect(shifts.data[3][7]).toMatchObject({ type: String, value: '=1+1' });
    expect(summary.data[3].slice(0, 3)).toMatchObject([{ value: 'Jana Nová' }, { value: 1 }, { value: 5.5 }]);
    expect(summary.data[4][2]).toMatchObject({ value: 5.5 });
  });

  it('aligns each heading with its data and separates people without merging their shifts', async () => {
    await createEventHoursFile({ ...report, people: [...report.people, { ...report.people[0], name: 'Petr Malý' }] });
    const [shifts, summary] = vi.mocked(writeXlsxFile).mock.lastCall![0] as Sheet<Blob>[];
    const alignments = ['left', 'center', 'center', 'left', 'center', 'center', 'right', 'left'];
    for (const row of [shifts.data[2], shifts.data[3]]) {
      expect(row.map(cell => (cell as { align: string }).align)).toEqual(alignments);
    }
    expect(shifts.data[4][0]).toMatchObject({ value: 'Jana Nová' });
    expect(shifts.data[5][0]).toMatchObject({ value: 'Petr Malý', topBorderStyle: 'thin' });
    expect(shifts.data[3][0]).not.toHaveProperty('rowSpan');
    expect(summary.data[5][2]).toMatchObject({ value: 11, align: 'right', fontWeight: 'bold' });
    expect(summary.data[3].slice(3).map(cell => (cell as { value: number }).value)).toEqual([200, 1100, 56, 14.5, 1170.5]);
    expect(summary.data[5].at(-1)).toMatchObject({ value: 2341, align: 'right', format: expect.stringContaining('Kč') });
    expect(shifts.showGridLines).toBe(false);
    expect(shifts.stickyRowsCount).toBe(3);
  });
  it('keeps known expenses visible when a rate is unknown and marks the total incomplete', async () => {
    const person = report.people[0];
    await createEventHoursFile({ ...report, people: [{ ...person, rate: null, costs: { ...person.costs, work: null } }] });
    const [, summary] = vi.mocked(writeXlsxFile).mock.lastCall![0] as Sheet<Blob>[];
    expect(summary.data[3][3]).toMatchObject({ value: 'Chybí sazba' });
    expect(summary.data[3][5]).toMatchObject({ value: 56 });
    expect(summary.data[4].at(-1)).toMatchObject({ value: 'Neúplné' });
  });
  it.each([
    { travel: 0, meals: 0, receipts: 0, labels: [], totals: [2200] },
    { travel: 42, meals: 0, receipts: 0, labels: ['Cestovné'], totals: [42, 2242] },
    { travel: 0, meals: 250, receipts: 0, labels: ['Stravné'], totals: [250, 2450] },
    { travel: 0, meals: 0, receipts: 75, labels: ['Účtenky'], totals: [75, 2275] },
    { travel: 42, meals: 250, receipts: 75, labels: ['Cestovné', 'Stravné', 'Účtenky'], totals: [42, 250, 75, 2567] },
    { travel: null, meals: 0, receipts: 0, labels: ['Cestovné'], totals: ['Neúplné', 'Neúplné'] },
  ])('includes event-wide expense columns for $labels and aligns their totals', async ({ travel, meals, receipts, labels, totals }) => {
    const person = report.people[0];
    await createEventHoursFile({ ...report, people: [
      { ...person, costs: { work: 1100, travel: 0, meals: 0, receipts: 0 } },
      { ...person, name: 'Petr Malý', costs: { work: 1100, travel, meals, receipts } },
    ] });
    const [shifts, summary] = vi.mocked(writeXlsxFile).mock.lastCall![0] as Sheet<Blob>[];
    const columns = summary.columns!.length;
    expect(summary.data[2].slice(4).map(cell => (cell as { value: string }).value))
      .toEqual(['Práce', ...labels, 'Náklady celkem']);
    for (const row of summary.data.slice(2, 6)) expect(row).toHaveLength(columns);
    expect(summary.data[5].slice(5).map(cell => (cell as { value: string | number }).value)).toEqual(totals);
    expect(summary.data[0].at(-1)).toMatchObject({ value: 'V01' });
    for (const sheet of [shifts, summary])
      expect(sheet.data[1][0]).toMatchObject({ value: labels.length ? expect.stringContaining('náhrady') : 'Průběžný rozpis · schválené hodiny' });
    expect((summary.data[6][0] as { value: string }).value.includes('Účtenky')).toBe(labels.includes('Účtenky'));
  });

});
