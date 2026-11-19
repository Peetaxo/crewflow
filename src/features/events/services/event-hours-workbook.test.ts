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
  people: [{ name: 'Jana Nová', minutes: 330, shifts: [
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
    expect(summary.data[3]).toMatchObject([{ value: 'Jana Nová' }, { value: 1 }, { value: 5.5 }]);
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
    expect(shifts.showGridLines).toBe(false);
    expect(shifts.stickyRowsCount).toBe(3);
  });
});
