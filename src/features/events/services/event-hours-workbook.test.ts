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
    expect(summary.data[3]).toEqual(['Jana Nová', 1, expect.objectContaining({ value: 5.5 })]);
    expect(summary.data[4][2]).toMatchObject({ value: 5.5 });
  });
});
