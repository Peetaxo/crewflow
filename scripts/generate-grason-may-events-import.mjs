import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  buildGrasonEventsImportSql,
  buildGrasonImportReport,
  buildGrasonImportRows,
  buildGrasonSafetyCheckSql,
} from './grason-events-import-utils.mjs';

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
  if (!found) {
    throw new Error(`Grason export directory was not found. Tried: ${candidates.join(', ')}`);
  }

  return found;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

const grasonDir = findGrasonExportDir();
const scrapePath = resolve(grasonDir, `scrape-${SOURCE_MONTH}.json`);
const usersPath = resolve(grasonDir, 'users.json');
const backupPath = resolve(process.cwd(), 'src/backup/data-backup.json');
const outputDir = resolve(process.cwd(), 'supabase/generated');

const [scrape, users, backup] = await Promise.all([
  readJson(scrapePath),
  readJson(usersPath),
  readJson(backupPath).catch(() => ({ events: [] })),
]);

const occurrences = scrape.occurrences ?? [];
const rows = buildGrasonImportRows(occurrences, {
  sourceMonth: SOURCE_MONTH,
  users,
});
const report = buildGrasonImportReport({
  rows,
  occurrences,
  existingEvents: backup.events ?? [],
});

await mkdir(outputDir, { recursive: true });

const importSqlPath = resolve(outputDir, 'grason-may-events-import.sql');
const safetySqlPath = resolve(outputDir, 'grason-may-events-safety-check.sql');
const reportPath = resolve(outputDir, 'grason-may-events-import-report.json');

await Promise.all([
  writeFile(importSqlPath, buildGrasonEventsImportSql(rows), 'utf8'),
  writeFile(safetySqlPath, buildGrasonSafetyCheckSql(SOURCE_MONTH), 'utf8'),
  writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'),
]);

console.log(JSON.stringify({
  sourceMonth: SOURCE_MONTH,
  grasonExportDir: grasonDir,
  grasonConfirmationOccurrences: report.grasonConfirmationOccurrences,
  grasonEventRows: report.grasonEventRows,
  existingMayEventRows: report.existingMayEventRows,
  existingThroughMay14Rows: report.existingThroughMay14Rows,
  matchedByJobOrJobAndName: report.matchedByJobOrJobAndName,
  fuzzyNameOnlyMatches: report.fuzzyNameOnlyMatches,
  unmatchedRows: report.unmatchedRows,
  files: {
    importSqlPath,
    safetySqlPath,
    reportPath,
  },
}, null, 2));
