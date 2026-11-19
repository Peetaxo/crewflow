import writeXlsxFile, { type CellObject, type Row, type SheetData } from 'write-excel-file/browser';
import { PHASE_CONFIG } from '../../../constants';
import type { EventHoursReport } from './event-hours-report';

const HOURS_FORMAT = '0.00';
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const weekday = new Intl.DateTimeFormat('cs-CZ', { weekday: 'short', timeZone: 'UTC' });
const ink = '#18354C';
const header = '#204660';
const paleBlue = '#EEF4F7';
const white = '#FFFFFF';

type Column = { label: string; width: number; align: 'left' | 'center' | 'right' };
const position = (align: Column['align']): CellObject => ({
  align, alignVertical: 'center', indent: align === 'center' ? undefined : 1,
});

// Widths are expressed in Excel character units. Leave room for padding and word wrapping.
function textHeight(text: string, width: number, lineHeight: number, minimum: number) {
  const usable = Math.max(1, Math.floor(width * 0.85) - 3);
  let lines = 0;
  for (const paragraph of text.split(/\r\n|\r|\n/)) {
    let used = 0;
    lines++;
    for (const word of paragraph.trim().split(/\s+/)) {
      if (used && used + word.length + 1 > usable) { lines++; used = 0; }
      const length = used + (used ? 1 : 0) + word.length;
      lines += Math.max(0, Math.ceil(length / usable) - 1);
      used = length ? (length - 1) % usable + 1 : 0;
    }
  }
  return Math.min(409, Math.max(minimum, 8 + lines * lineHeight));
}

function sheetHeading(report: EventHoursReport, columns: Column[]): SheetData {
  const hasJob = Boolean(report.event.job);
  const titleColumns = hasJob ? columns.slice(0, -1) : columns;
  const titleWidth = titleColumns.reduce((total, column) => total + column.width, 0);
  const title: Row = [{
    ...position('left'), value: report.event.name, columnSpan: titleColumns.length, wrap: true,
    height: textHeight(report.event.name, titleWidth * 0.63, 23, 37),
    fontSize: 17, fontWeight: 'bold', textColor: ink,
  }];
  if (hasJob) {
    while (title.length < columns.length - 1) title.push(null);
    title.push({ ...position('right'), value: report.event.job, fontWeight: 'bold', textColor: '#456277', wrap: true,
      height: textHeight(report.event.job, columns[columns.length - 1].width, 15, 37) });
  }
  return [
    title,
    [{ ...position('left'), value: report.partial ? 'Průběžný rozpis · pouze schválené hodiny' : 'Kompletní rozpis schválených hodin',
      columnSpan: columns.length, height: 24, fontWeight: 'bold',
      backgroundColor: report.partial ? '#FFF1D8' : '#E2F1E8', textColor: report.partial ? '#795014' : '#24593C' }],
    columns.map(column => ({
      ...position(column.align), value: column.label, height: 27, fontWeight: 'bold', backgroundColor: header, textColor: white,
    })),
  ];
}

export async function createEventHoursFile(report: EventHoursReport): Promise<File> {
  if (!report.people.length) throw new Error('Akce zatím nemá žádné schválené hodiny.');
  const nameWidth = report.people.reduce((width, person) => Math.max(width, Math.min(42, person.name.length + 5)), 24);
  const shiftsColumns: Column[] = [
    { label: 'Jméno', width: nameWidth, align: 'left' }, { label: 'Datum', width: 15, align: 'center' },
    { label: 'Den', width: 7, align: 'center' }, { label: 'Typ práce', width: 14, align: 'left' },
    { label: 'Od', width: 9, align: 'center' }, { label: 'Do', width: 9, align: 'center' },
    { label: 'Počet hodin', width: 15, align: 'right' }, { label: 'Poznámka', width: 33, align: 'left' },
  ];
  const summaryColumns: Column[] = [
    { label: 'Jméno', width: nameWidth, align: 'left' }, { label: 'Odpracované dny', width: 21, align: 'right' },
    { label: 'Celkem hodin', width: 18, align: 'right' },
  ];
  const shifts = sheetHeading(report, shiftsColumns);
  const summary = sheetHeading(report, summaryColumns);
  let totalMinutes = 0;
  for (const [personIndex, person] of report.people.entries()) {
    const backgroundColor = personIndex % 2 === 0 ? white : paleBlue;
    const nameHeight = textHeight(person.name, nameWidth, 16, 24);
    for (const [index, shift] of person.shifts.entries()) {
      const date = new Date(shift.date + 'T00:00:00Z');
      const border: CellObject = index === 0 && personIndex > 0 ? { topBorderStyle: 'thin', topBorderColor: '#B7C9D3' } : {};
      const cells: CellObject[] = [
        { value: person.name, fontWeight: index === 0 ? 'bold' : undefined, wrap: true,
          height: Math.max(nameHeight, textHeight(shift.note, shiftsColumns[7].width, 16, 24)) },
        { value: date, format: 'dd.mm.yyyy' }, { value: weekday.format(date) },
        { value: PHASE_CONFIG.find(p => p.type === shift.phase)?.label ?? '' },
        { value: shift.from / 1440, format: 'hh:mm' }, { value: shift.to / 1440, format: 'hh:mm' },
        { value: shift.minutes / 60, format: HOURS_FORMAT, fontWeight: 'bold' },
        { type: String, value: shift.note, wrap: true },
      ];
      shifts.push(cells.map((cell, i) => ({ ...position(shiftsColumns[i].align), textColor: ink, backgroundColor, ...border, ...cell })));
    }
    const days = new Set(person.shifts.map(shift => shift.date)).size;
    const values: CellObject[] = [
      { value: person.name, height: nameHeight, wrap: true }, { value: days }, { value: person.minutes / 60, format: HOURS_FORMAT, fontWeight: 'bold' },
    ];
    summary.push(values.map((cell, i) => ({ ...position(summaryColumns[i].align), textColor: ink, backgroundColor, ...cell })));
    totalMinutes += person.minutes;
  }
  const total: CellObject = { fontWeight: 'bold', height: 32, textColor: white, backgroundColor: header, fontSize: 12 };
  summary.push([
    { ...position('left'), ...total, value: 'Celkem za akci', columnSpan: 2 }, null,
    { ...position('right'), ...total, value: totalMinutes / 60, format: HOURS_FORMAT },
  ]);

  const blob = await writeXlsxFile([
    { sheet: 'Rozpis hodin', data: shifts, columns: shiftsColumns, stickyRowsCount: 3, showGridLines: false, orientation: 'landscape' },
    { sheet: 'Souhrn', data: summary, columns: summaryColumns, stickyRowsCount: 3, showGridLines: false },
  ], { fontFamily: 'Arial', fontSize: 11 }).toBlob();
  const identifier = [report.event.job, report.event.name].filter(Boolean).join('-')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 120);
  const filename = ['Hodiny', identifier, report.partial ? 'průběžný' : ''].filter(Boolean).join('-') + '.xlsx';
  return new File([blob], filename, { type: XLSX_TYPE });
}
