import writeXlsxFile, { type CellObject, type Feature, type Row, type SheetData } from 'write-excel-file/browser';
import wordmarkUrl from '../../../../supabase/functions/generate-invoice-pdf/assets/nodu-wordmark.png?inline';
import { PHASE_CONFIG } from '../../../constants';
import { addCrewCosts, costCategories, emptyCrewCosts, totalCrewCosts } from './event-hours-costs';
import type { EventHoursReport } from './event-hours-report';

const SHEET_NAME = 'Směny a náklady';
const MONEY = '#,##0.00" Kč"';
const HOURS = '0.00';
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
// Light-theme colours from Nodu, shared by the screen and print layouts.
const ink = '#2F261F';
const muted = '#705E50';
const orange = '#FF800D';
const cream = '#FFEDE0';
const paper = '#FFFFFF';
const dateRange = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' });

type Column = { label: string; width: number; align: 'left' | 'center' | 'right' };
const label = (value: string): CellObject => ({ type: String, value });
const numeric = (value: number | null, format = MONEY): CellObject => value === null ? label('Neúplné') : { value, format };
const merged = (cell: CellObject, count: number): Row => [{ ...cell, columnSpan: count }, ...Array(count - 1).fill(null)];
const letter = (index: number) => String.fromCharCode(65 + index); // A through K in this layout
const left: CellObject = { align: 'left', indent: 1, alignVertical: 'center' };
const right: CellObject = { ...left, align: 'right' };

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

function excelFeatures(cached: Map<string, number>): Feature<Blob> {
  // The writer exposes sheet transforms for print setup and formula previews.
  // Cached numeric results also let mobile readers display an approved report immediately.
  return { files: { transform: {
    'xl/workbook.xml': {
      transform(xml) {
        const titles = `<definedName name="_xlnm.Print_Titles" localSheetId="0">'${SHEET_NAME}'!$1:$3</definedName>`;
        return xml.replace('<definedNames/>', `<definedNames>${titles}</definedNames>`);
      },
    },
    'xl/worksheets/sheet{id}.xml': {
      transformElementAttributes(tag, attrs) {
        if (tag === 'pageSetup') return { ...attrs, fitToWidth: 1, fitToHeight: 0 };
        if (tag === 'pageMargins') return { ...attrs, left: 0.3, right: 0.3, top: 0.4, bottom: 0.4 };
        return attrs;
      },
      transform(xml) {
        return xml.replace('<sheetViews>', '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews>')
          .replace(/<f>([^<]+)<\/f>/g, (element, formula: string) =>
            cached.has(formula) ? `${element}<v>${cached.get(formula)}</v>` : element);
      },
    },
  } } };
}

export async function createEventHoursFile(report: EventHoursReport): Promise<File> {
  if (!report.people.length) throw new Error('Akce zatím nemá žádné schválené hodiny.');
  const costs = emptyCrewCosts();
  let minutes = 0;
  let firstDate = '', lastDate = '';
  for (const person of report.people) {
    addCrewCosts(costs, person.costs);
    minutes += person.minutes;
    for (const shift of person.shifts) {
      if (!firstDate || shift.date < firstDate) firstDate = shift.date;
      if (shift.date > lastDate) lastDate = shift.date;
    }
  }
  const visibleCosts = costCategories.filter(key => key === 'work' || costs[key] !== 0);
  const names = { work: 'Práce', travel: 'Cestovné', meals: 'Stravné', receipts: 'Účtenky' };
  const columns: Column[] = [
    { label: 'Datum', width: 17, align: 'left' }, { label: 'Typ práce', width: 13, align: 'left' },
    { label: 'Poznámka', width: 34, align: 'left' }, { label: 'Od', width: 9, align: 'center' },
    { label: 'Do', width: 9, align: 'center' }, { label: 'Hodiny', width: 12, align: 'right' },
    ...visibleCosts.map(key => ({ label: names[key], width: 17, align: 'right' as const })),
    { label: 'Náklady celkem', width: 21, align: 'right' },
  ];
  const count = columns.length;
  const lastCost = letter(count - 2);
  const cached = new Map<string, number>();
  const calculated = (formula: string, value: number | null, format = MONEY): CellObject => {
    if (value === null) return numeric(null);
    cached.set(formula, value);
    return { type: 'Formula', value: formula, format };
  };

  const period = [...new Set([firstDate, lastDate])].filter(Boolean)
    .map(date => dateRange.format(new Date(date))).join(' – ');
  const metadata = [report.event.job, period && `Směny ${period}`].filter(Boolean).join('  ·  ');
  const status = `${report.partial ? 'Průběžný' : 'Kompletní'} rozpis · schválené hodiny${visibleCosts.length > 1 ? ' a náhrady' : ''}`;
  const rows: SheetData = [
    [
      { height: 44 },
      ...merged({ ...left, ...label(report.event.name), fontWeight: 'bold', fontSize: 17, textColor: ink,
        wrap: true, height: textHeight(report.event.name, 41, 23, 44) }, 4),
      ...merged({ ...right, ...label(metadata), wrap: true, textColor: muted, fontWeight: 'bold',
        height: textHeight(metadata, columns.slice(5).reduce((sum, column) => sum + column.width, 0), 16, 44) }, count - 5),
    ],
    merged({ ...left, ...label(status), height: 23, fontWeight: 'bold',
      textColor: report.partial ? '#705016' : '#245E3A', backgroundColor: report.partial ? '#F9E6B3' : '#D7EEDC' }, count),
    columns.map(({ label: title, align }) => ({
      ...left, ...label(title), align, indent: align === 'center' ? 0 : 1, height: 25,
      fontWeight: 'bold', textColor: paper, backgroundColor: ink,
    })),
  ];

  const totalRow = (title: string, cells: CellObject[], grand = false): Row => {
    const style: CellObject = { fontWeight: 'bold', textColor: ink, backgroundColor: grand ? orange : '#F4EFEA',
      height: grand ? 32 : 27, topBorderStyle: 'thin', topBorderColor: grand ? '#C75E00' : '#D7C7B9' };
    return [...merged({ ...left, ...style, ...label(title), wrap: true,
      height: textHeight(title, 78, 16, grand ? 32 : 27) }, 5), ...cells.map(cell => ({ ...right, ...style, ...cell }))];
  };

  for (const person of report.people) {
    const head = rows.length + 1;
    const days = new Set(person.shifts.map(shift => shift.date)).size;
    const group: CellObject = { ...left, backgroundColor: cream, textColor: ink, fontWeight: 'bold', height: 28 };
    const rate = typeof person.rate === 'number'
      ? numeric(person.rate, '"Sazba "#,##0.00" Kč/h"')
      : label(person.rate === 'mixed' ? 'Více sazeb' : 'Chybí sazba');
    rows.push([
      ...merged({ ...group, ...label(person.name), fontSize: 12, leftBorderStyle: 'medium', leftBorderColor: orange,
        wrap: true, height: textHeight(person.name, 29, 17, 28) }, 2),
      { ...group, ...label(`${days} ${days === 1 ? 'den' : days >= 2 && days <= 4 ? 'dny' : 'dní'}`), textColor: muted, fontWeight: undefined },
      ...merged({ ...group, ...right, ...rate, textColor: muted }, count - 3),
    ]);

    for (const [index, shift] of person.shifts.entries()) {
      const r = rows.length + 1;
      // A log may have a frozen rate or an allocated rounding cent. In those cases
      // keep its reconciled shift amount instead of substituting the person's rate.
      const matchesRate = typeof person.rate === 'number' && shift.work !== null
        && Math.round(shift.minutes * Math.round(person.rate * 100) / 60) === Math.round(shift.work * 100);
      const work = matchesRate ? calculated(`ROUND(F${r}*ROUND($D$${head},2),2)`, shift.work) : numeric(shift.work);
      const cells: CellObject[] = [
        { value: new Date(shift.date), format: 'dd.mm.yyyy' },
        label(PHASE_CONFIG.find(p => p.type === shift.phase)?.label ?? ''),
        { ...label(shift.note), wrap: true, height: textHeight(shift.note, columns[2].width, 15, 23) },
        { value: shift.from / 1440, format: 'hh:mm' }, { value: shift.to / 1440, format: 'hh:mm' },
        calculated(`ROUND(MOD(E${r}-D${r},1)*1440,0)/60`, shift.minutes / 60, HOURS), work,
      ];
      rows.push(columns.map(({ align }, col) => ({
        align, alignVertical: 'center', indent: align === 'center' ? 0 : 1, textColor: ink,
        backgroundColor: index % 2 ? '#FBF8F5' : paper, ...cells[col],
      })));
    }

    const r = rows.length + 1;
    const subtotal = (col: string, sum: number | null, format?: string) =>
      calculated(`SUBTOTAL(9,${col}${head + 1}:${col}${r - 1})`, sum, format);
    rows.push(totalRow(`Celkem · ${person.name}${person.estimatedBilledCosts ? ' (odhad)' : ''}`, [
      subtotal('F', person.minutes / 60, HOURS), subtotal('G', person.costs.work),
      ...visibleCosts.filter(key => key !== 'work').map(key => numeric(person.costs[key])),
      calculated(`ROUND(SUM(G${r}:${lastCost}${r}),2)`, totalCrewCosts(person.costs)),
    ]));
    rows.push([{ height: 7 }]);
  }

  const isEstimate = report.people.some(p => p.estimatedBilledCosts);
  const notes = [];
  if (isEstimate) notes.push('U označených členů jsou dříve fakturované výkazy bez uloženého vyúčtování oceněné podle sazeb při exportu.');
  if (totalCrewCosts(costs) === null) notes.push('Neúplné částky vyžadují doplnění podkladů. Známé položky jsou uvedené samostatně.');
  for (const note of notes) rows.push(merged({ ...left, ...label(note), wrap: true, textColor: muted, height: 26 }, count));
  const end = rows.length;
  const grand = end + 1;
  // SUBTOTAL skips each person's nested SUBTOTAL. Expenses appear only once, in the person rows.
  rows.push(totalRow(isEstimate ? 'Celkem za crew (odhad)' : 'Celkem za crew', [
    calculated(`SUBTOTAL(9,F4:F${end})`, minutes / 60, HOURS),
    ...visibleCosts.map((key, index) => {
      const col = letter(6 + index), range = `${col}4:${col}${end}`;
      return calculated(key === 'work' ? `SUBTOTAL(9,${range})` : `ROUND(SUM(${range}),2)`, costs[key]);
    }),
    calculated(`ROUND(SUM(G${grand}:${lastCost}${grand}),2)`, totalCrewCosts(costs)),
  ], true));

  const wordmark = Uint8Array.from(atob(wordmarkUrl.split(',')[1]), char => char.charCodeAt(0));
  const blob = await writeXlsxFile([{
    sheet: SHEET_NAME, data: rows, columns, stickyRowsCount: 3, showGridLines: false, orientation: 'landscape',
    images: [{ content: new Blob([wordmark], { type: 'image/png' }), contentType: 'image/png', width: 91, height: 32,
      dpi: 96, anchor: { row: 1, column: 1 }, offsetX: 12, offsetY: 12, title: 'Nodu', description: 'Logo Nodu' }],
  }], { fontFamily: 'Arial', fontSize: 11, features: [excelFeatures(cached)] }).toBlob();
  const identifier = [report.event.job, report.event.name].filter(Boolean).join('-')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 120);
  const filename = ['Hodiny', identifier, report.partial ? 'průběžný' : ''].filter(Boolean).join('-') + '.xlsx';
  return new File([blob], filename, { type: XLSX_TYPE });
}
