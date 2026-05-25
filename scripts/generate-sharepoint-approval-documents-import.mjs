import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  buildSharePointApprovalImportSql,
  mapSharePointApprovalExport,
} from './sharepoint-approval-export-utils.mjs';

const defaultExportPath = '/Users/peetax/Downloads/sharepoint-approval-documents-export.json';
const exportPath = process.argv[2] ? resolve(process.argv[2]) : defaultExportPath;
const outputDir = resolve('supabase/generated');
const importSqlPath = resolve(outputDir, 'sharepoint-approval-documents-import.sql');
const reportPath = resolve(outputDir, 'sharepoint-approval-documents-import-report.json');

const exportPayload = JSON.parse(await readFile(exportPath, 'utf8'));
const documents = mapSharePointApprovalExport(exportPayload);
const statusCounts = documents.reduce((acc, document) => {
  acc[document.approvalStatus] = (acc[document.approvalStatus] ?? 0) + 1;
  return acc;
}, {});
const report = {
  exportPath,
  source: exportPayload.source ?? null,
  exportedAt: exportPayload.exportedAt ?? null,
  documents: documents.length,
  statusCounts,
  withComment: documents.filter((document) => document.comment).length,
  withJobNumber: documents.filter((document) => document.jobNumber).length,
  withInvoiceNumber: documents.filter((document) => document.invoiceNumber).length,
};

await mkdir(dirname(importSqlPath), { recursive: true });
await writeFile(importSqlPath, buildSharePointApprovalImportSql(documents));
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  ...report,
  files: {
    importSqlPath,
    reportPath,
  },
}, null, 2));
