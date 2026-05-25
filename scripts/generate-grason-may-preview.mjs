import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { buildGrasonImportRows } from './grason-events-import-utils.mjs';

const SOURCE_MONTH = '2026-05';
const EXPORT_DIR_NAME = 'grason_roster_2026_06_30';

function findGrasonExportDir() {
  const candidates = [
    process.env.GRASON_EXPORT_DIR,
    resolve(process.cwd(), '../outputs', EXPORT_DIR_NAME),
    resolve(process.cwd(), '../../../outputs', EXPORT_DIR_NAME),
    resolve('/Users/peetax/Projekty/outputs', EXPORT_DIR_NAME),
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`Grason export directory was not found. Tried: ${candidates.join(', ')}`);
  return found;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function phaseLabel(phase) {
  if (phase === 'instal') return 'Instal';
  if (phase === 'deinstal') return 'Deinstal';
  return 'Provoz';
}

function phaseClass(phase) {
  if (phase === 'instal') return 'phase-install';
  if (phase === 'deinstal') return 'phase-deinstall';
  return 'phase-run';
}

const grasonDir = findGrasonExportDir();
const outputDir = resolve(process.cwd(), 'supabase/generated');
const [scrape, users, report] = await Promise.all([
  readJson(resolve(grasonDir, `scrape-${SOURCE_MONTH}.json`)),
  readJson(resolve(grasonDir, 'users.json')),
  readJson(resolve(outputDir, 'grason-may-events-import-report.json')),
]);

const rows = buildGrasonImportRows(scrape.occurrences ?? [], {
  sourceMonth: SOURCE_MONTH,
  users,
});
const uniqueConfirmations = rows.reduce((sum, row) => sum + row.confirmedPeople.length, 0);
const duplicateOccurrences = (scrape.occurrences ?? []).length - uniqueConfirmations;

const tableRows = rows.map((row) => `
      <tr>
        <td>${escapeHtml(row.date)}</td>
        <td>
          <strong>${escapeHtml(row.eventName)}</strong>
          <span>${escapeHtml(row.sourceTitle)}</span>
        </td>
        <td>${escapeHtml(row.jobNumber || '-')}</td>
        <td><mark class="${phaseClass(row.phase)}">${phaseLabel(row.phase)}</mark></td>
        <td>${row.confirmedCount}</td>
        <td>${escapeHtml(row.confirmedPeople.map((person) => person.name).join(', '))}</td>
      </tr>`).join('\n');

const html = `<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Grason květen 2026 import preview</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #241f1a;
      --muted: #756d64;
      --line: #e4ddd4;
      --surface: #fffaf4;
      --panel: #ffffff;
      --accent: #bf4f20;
      --green: #1d6f54;
      --blue: #2f5c9c;
      --red: #a13e3e;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--surface);
      color: var(--ink);
      font: 14px/1.45 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main { max-width: 1280px; margin: 0 auto; padding: 32px; }
    header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-end; margin-bottom: 24px; }
    h1 { margin: 0; font-size: 28px; line-height: 1.1; letter-spacing: 0; }
    p { margin: 6px 0 0; color: var(--muted); }
    .status { color: var(--green); font-weight: 700; }
    .cards { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; margin-bottom: 20px; }
    .card { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 14px; }
    .card span { display: block; color: var(--muted); font-size: 12px; }
    .card strong { display: block; margin-top: 4px; font-size: 22px; }
    table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
    th, td { padding: 10px 12px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
    th { position: sticky; top: 0; background: #f6efe6; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
    td span { display: block; margin-top: 2px; color: var(--muted); font-size: 12px; }
    tr:last-child td { border-bottom: 0; }
    mark { display: inline-flex; min-width: 70px; justify-content: center; border-radius: 999px; padding: 3px 8px; color: white; font: inherit; font-size: 12px; font-weight: 700; }
    .phase-install { background: var(--blue); }
    .phase-run { background: var(--green); }
    .phase-deinstall { background: var(--red); }
    .note { margin: 18px 0; padding: 12px 14px; border: 1px solid var(--line); background: #fff; border-radius: 8px; color: var(--muted); }
    @media (max-width: 980px) {
      main { padding: 18px; }
      header { display: block; }
      .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      table { font-size: 12px; }
      th, td { padding: 8px; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>Grason květen 2026 import preview</h1>
        <p>Akce + potvrzení lidé. Bez timelogů, hodin a faktur.</p>
      </div>
      <p class="status">Import SQL spuštěn proti Supabase Staff</p>
    </header>
    <section class="cards" aria-label="Souhrn importu">
      <div class="card"><span>Grason potvrzení</span><strong>${scrape.occurrences.length}</strong></div>
      <div class="card"><span>Unikátní potvrzení</span><strong>${uniqueConfirmations}</strong></div>
      <div class="card"><span>Akce / den</span><strong>${rows.length}</strong></div>
      <div class="card"><span>NODU řádky v backupu</span><strong>${report.existingMayEventRows}</strong></div>
      <div class="card"><span>Shoda job/název</span><strong>${report.matchedByJobOrJobAndName}</strong></div>
      <div class="card"><span>Ke kontrole / nové</span><strong>${report.unmatchedRows + report.fuzzyNameOnlyMatches}</strong></div>
    </section>
    <p class="note">Poznámka: ${duplicateOccurrences} duplicitní výskyty stejného člověka ve stejné Grason akci se v metadata tabulce drží jako jeden potvrzený člověk s occurrenceCount. PowerApps zůstává zdroj pro timelog z komentáře a fakturu.</p>
    <table>
      <thead>
        <tr>
          <th>Datum</th>
          <th>Akce</th>
          <th>Job</th>
          <th>Fáze</th>
          <th>Lidé</th>
          <th>Potvrzení lidé</th>
        </tr>
      </thead>
      <tbody>
${tableRows}
      </tbody>
    </table>
  </main>
</body>
</html>
`;

function svgText(text, x, y, options = {}) {
  const size = options.size ?? 15;
  const weight = options.weight ?? 500;
  const color = options.color ?? '#241f1a';
  return `<text x="${x}" y="${y}" fill="${color}" font-family="Inter, Arial, sans-serif" font-size="${size}" font-weight="${weight}">${escapeHtml(text)}</text>`;
}

const previewRows = rows.slice(0, 14);
const rowSvgs = previewRows.map((row, index) => {
  const y = 230 + index * 40;
  return `
  <rect x="40" y="${y - 24}" width="1120" height="38" fill="${index % 2 ? '#fffaf4' : '#ffffff'}" stroke="#e4ddd4"/>
  ${svgText(row.date, 58, y, { size: 13, color: '#756d64' })}
  ${svgText(row.eventName.slice(0, 52), 170, y, { size: 14, weight: 700 })}
  ${svgText(row.jobNumber || '-', 600, y, { size: 13, color: '#756d64' })}
  ${svgText(phaseLabel(row.phase), 730, y, { size: 13, color: '#756d64' })}
  ${svgText(String(row.confirmedCount), 850, y, { size: 13, weight: 700 })}
  ${svgText(row.confirmedPeople.map((person) => person.name).join(', ').slice(0, 46), 920, y, { size: 12, color: '#756d64' })}`;
}).join('\n');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="820" viewBox="0 0 1200 820">
  <rect width="1200" height="820" fill="#fffaf4"/>
  ${svgText('Grason květen 2026 import preview', 40, 62, { size: 30, weight: 800 })}
  ${svgText('Akce + potvrzení lidé. Bez timelogů, hodin a faktur.', 40, 92, { size: 16, color: '#756d64' })}
  <rect x="40" y="124" width="175" height="72" rx="8" fill="#fff" stroke="#e4ddd4"/>
  ${svgText('Grason potvrzení', 58, 152, { size: 12, color: '#756d64' })}
  ${svgText(String(scrape.occurrences.length), 58, 181, { size: 26, weight: 800 })}
  <rect x="230" y="124" width="175" height="72" rx="8" fill="#fff" stroke="#e4ddd4"/>
  ${svgText('Unikátní potvrzení', 248, 152, { size: 12, color: '#756d64' })}
  ${svgText(String(uniqueConfirmations), 248, 181, { size: 26, weight: 800 })}
  <rect x="420" y="124" width="175" height="72" rx="8" fill="#fff" stroke="#e4ddd4"/>
  ${svgText('Akce / den', 438, 152, { size: 12, color: '#756d64' })}
  ${svgText(String(rows.length), 438, 181, { size: 26, weight: 800 })}
  <rect x="610" y="124" width="175" height="72" rx="8" fill="#fff" stroke="#e4ddd4"/>
  ${svgText('Shoda job/název', 628, 152, { size: 12, color: '#756d64' })}
  ${svgText(String(report.matchedByJobOrJobAndName), 628, 181, { size: 26, weight: 800 })}
  <rect x="800" y="124" width="175" height="72" rx="8" fill="#fff" stroke="#e4ddd4"/>
  ${svgText('Fuzzy', 818, 152, { size: 12, color: '#756d64' })}
  ${svgText(String(report.fuzzyNameOnlyMatches), 818, 181, { size: 26, weight: 800 })}
  <rect x="990" y="124" width="170" height="72" rx="8" fill="#fff" stroke="#e4ddd4"/>
  ${svgText('Nové / review', 1008, 152, { size: 12, color: '#756d64' })}
  ${svgText(String(report.unmatchedRows), 1008, 181, { size: 26, weight: 800 })}
  <rect x="40" y="206" width="1120" height="34" fill="#f6efe6" stroke="#e4ddd4"/>
  ${svgText('Datum', 58, 228, { size: 12, weight: 700, color: '#756d64' })}
  ${svgText('Akce', 170, 228, { size: 12, weight: 700, color: '#756d64' })}
  ${svgText('Job', 600, 228, { size: 12, weight: 700, color: '#756d64' })}
  ${svgText('Fáze', 730, 228, { size: 12, weight: 700, color: '#756d64' })}
  ${svgText('Lidé', 850, 228, { size: 12, weight: 700, color: '#756d64' })}
  ${svgText('Potvrzení lidé', 920, 228, { size: 12, weight: 700, color: '#756d64' })}
${rowSvgs}
  ${svgText('Plný seznam všech 63 řádků je v HTML preview.', 40, 790, { size: 14, color: '#756d64' })}
</svg>
`;

await mkdir(outputDir, { recursive: true });
const htmlPath = resolve(outputDir, 'grason-may-events-preview.html');
const svgPath = resolve(outputDir, 'grason-may-events-preview.svg');
await Promise.all([
  writeFile(htmlPath, html, 'utf8'),
  writeFile(svgPath, svg, 'utf8'),
]);

console.log(JSON.stringify({
  htmlPath,
  svgPath,
  rows: rows.length,
  occurrences: scrape.occurrences.length,
  uniqueConfirmations,
}, null, 2));
