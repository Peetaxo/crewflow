import writeXlsxFile, { type Row, type SheetData } from 'write-excel-file/browser';
import { PHASE_CONFIG } from '../../../constants';
import type { EventHoursReport } from './event-hours-report';

const HOURS_FORMAT = '0.00';
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const weekday = new Intl.DateTimeFormat('cs-CZ', { weekday: 'short', timeZone: 'UTC' });

function sheetHeading(report: EventHoursReport, columns: string[]): SheetData {
  const title = [report.event.name, report.event.job].filter(Boolean).join(' / ');
  return [
    [{ value: title, columnSpan: columns.length, fontSize: 14, fontWeight: 'bold', height: 26 }],
    [{ value: report.partial ? 'Průběžný rozpis · pouze schválené hodiny' : 'Kompletní rozpis schválených hodin',
      columnSpan: columns.length, fontWeight: 'bold', textColor: report.partial ? '#994600' : '#256045', height: 21 }],
    columns.map(value => ({ value, fontWeight: 'bold', backgroundColor: '#253342', textColor: '#FFFFFF', height: 22 })),
  ];
}

export async function createEventHoursFile(report: EventHoursReport): Promise<File> {
  if (!report.people.length) throw new Error('Akce zatím nemá žádné schválené hodiny.');
  const shifts = sheetHeading(report, ['Jméno', 'Datum', 'Den', 'Typ práce', 'Od', 'Do', 'Počet hodin', 'Poznámka']);
  const summary = sheetHeading(report, ['Jméno', 'Odpracované dny', 'Celkem hodin']);
  let totalMinutes = 0;
  for (const person of report.people) {
    for (const shift of person.shifts) {
      const date = new Date(shift.date + 'T00:00:00Z');
      shifts.push([
        person.name, { value: date, format: 'dd.mm.yyyy' }, weekday.format(date),
        PHASE_CONFIG.find(p => p.type === shift.phase)?.label ?? '',
        { value: shift.from / 1440, format: 'hh:mm' }, { value: shift.to / 1440, format: 'hh:mm' },
        { value: shift.minutes / 60, format: HOURS_FORMAT }, { type: String, value: shift.note, wrap: true },
      ]);
    }
    const days = new Set(person.shifts.map(shift => shift.date)).size;
    summary.push([person.name, days, { value: person.minutes / 60, format: HOURS_FORMAT }]);
    totalMinutes += person.minutes;
  }
  const total: Row = [{ value: 'Celkem za akci', fontWeight: 'bold' }, null,
    { value: totalMinutes / 60, format: HOURS_FORMAT, fontWeight: 'bold' }];
  summary.push(total);

  const nameWidth = report.people.reduce((width, person) => Math.max(width, Math.min(55, person.name.length + 3)), 28);
  const blob = await writeXlsxFile([
    { sheet: 'Rozpis hodin', data: shifts, columns: [nameWidth, 14, 8, 13, 8, 8, 14, 32].map(width => ({ width })), stickyRowsCount: 3, orientation: 'landscape' },
    { sheet: 'Souhrn', data: summary, columns: [nameWidth, 22, 21].map(width => ({ width })), stickyRowsCount: 3 },
  ]).toBlob();
  const identifier = [report.event.job, report.event.name].filter(Boolean).join('-')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 120);
  const filename = ['Hodiny', identifier, report.partial ? 'průběžný' : ''].filter(Boolean).join('-') + '.xlsx';
  return new File([blob], filename, { type: XLSX_TYPE });
}
