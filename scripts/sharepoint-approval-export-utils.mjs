const DEFAULT_SOURCE = 'powerapps_document_approval';

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function cleanOptionalText(value) {
  const text = normalizeText(value);
  if (!text || text === '0') return '';
  return text;
}

function sqlText(value) {
  if (value == null || value === '') return 'null';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlRequiredText(value) {
  return `'${String(value ?? '').replaceAll("'", "''")}'`;
}

function sqlJsonb(value) {
  return `${sqlRequiredText(JSON.stringify(value))}::jsonb`;
}

function sqlTextArray(values) {
  if (!values || values.length === 0) return "'{}'::text[]";
  return `array[${values.map(sqlRequiredText).join(', ')}]::text[]`;
}

function parseApprovers(value) {
  return normalizeText(value)
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseInvoiceNumberFromFileName(fileName) {
  const baseName = String(fileName ?? '').replace(/\.[^.]+$/, '');
  const matches = [...baseName.matchAll(/(?:^|[\s_-])(\d{4}[-/]?\d{2,}|\d{6,})(?=$|[\s_-])/g)];
  return matches.at(-1)?.[1] ?? '';
}

function normalizeApprovalStatus(statusLabel) {
  const normalized = normalizeText(statusLabel)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (normalized.includes('ve schvalovani')) return 'pending';
  if (normalized.includes('schvaleno')) return 'approved';
  if (normalized.includes('zamitnuto')) return 'rejected';
  return 'unknown';
}

function getFieldText(item, key) {
  return item?.FieldValuesAsText?.[key] ?? item?.[key] ?? '';
}

function getExternalId(item) {
  return cleanOptionalText(getFieldText(item, 'UniqueId'))
    || cleanOptionalText(item?.GUID)
    || cleanOptionalText(item?.UniqueId)
    || cleanOptionalText(item?.Id);
}

export function mapSharePointApprovalItem(item, sourceInfo = {}, exportedAt = new Date().toISOString()) {
  const fieldValues = item?.FieldValuesAsText ?? {};
  const documentName = cleanOptionalText(getFieldText(item, 'FileLeafRef')) || `SharePoint item ${item?.Id ?? ''}`.trim();
  const invoiceNumber = cleanOptionalText(getFieldText(item, 'lggInvoiceNumber'))
    || parseInvoiceNumberFromFileName(documentName);
  const supplierName = cleanOptionalText(getFieldText(item, 'lggVendorText'))
    || cleanOptionalText(getFieldText(item, 'lggVendor'));
  const statusLabel = cleanOptionalText(getFieldText(item, 'lggApprovalState'));

  return {
    source: DEFAULT_SOURCE,
    externalId: getExternalId(item),
    documentName,
    company: cleanOptionalText(getFieldText(item, 'lggCompany')),
    jobNumber: cleanOptionalText(getFieldText(item, 'lggContractNumber')).toUpperCase(),
    invoiceNumber,
    supplierName,
    approvalStatus: normalizeApprovalStatus(statusLabel),
    approvalStatusLabel: statusLabel,
    comment: cleanOptionalText(getFieldText(item, 'lggComment')),
    approvers: parseApprovers(getFieldText(item, 'lggApprovers')),
    requester: cleanOptionalText(getFieldText(item, 'lggRequestor'))
      || cleanOptionalText(getFieldText(item, 'Author')),
    rawPayload: {
      sourceInfo,
      fieldValuesAsText: fieldValues,
      item,
    },
    lastSyncedAt: item?.Modified ?? exportedAt,
  };
}

export function mapSharePointApprovalExport(exportPayload) {
  const sourceInfo = exportPayload.source ?? {};
  const exportedAt = exportPayload.exportedAt ?? new Date().toISOString();
  return (exportPayload.items ?? [])
    .map((item) => mapSharePointApprovalItem(item, sourceInfo, exportedAt))
    .filter((document) => document.externalId && document.documentName);
}

export function buildSharePointApprovalImportSql(documents) {
  if (documents.length === 0) {
    return '-- No SharePoint approval documents to import.\n';
  }

  const values = documents.map((document) => `  (${[
    sqlRequiredText(document.source),
    sqlText(document.externalId),
    sqlRequiredText(document.documentName),
    sqlText(document.company),
    sqlText(document.jobNumber),
    sqlText(document.invoiceNumber),
    sqlText(document.supplierName),
    sqlRequiredText(document.approvalStatus),
    sqlText(document.approvalStatusLabel),
    sqlText(document.comment),
    sqlTextArray(document.approvers),
    sqlText(document.requester),
    sqlJsonb(document.rawPayload),
    sqlRequiredText(document.lastSyncedAt),
  ].join(', ')})`).join(',\n');

  return `-- Generated SharePoint approval document import.
-- Mirrors metadata from /sites/DocumentApproval/ApprovalDocuments.
-- Does not mark invoices as paid and does not create timelogs.

begin;

insert into public.invoice_approval_documents (
  source,
  external_id,
  document_name,
  company,
  job_number,
  invoice_number,
  supplier_name,
  approval_status,
  approval_status_label,
  comment,
  approvers,
  requester,
  raw_payload,
  last_synced_at
)
values
${values}
on conflict (source, external_id) where external_id is not null do update set
  document_name = excluded.document_name,
  company = excluded.company,
  job_number = excluded.job_number,
  invoice_number = excluded.invoice_number,
  supplier_name = excluded.supplier_name,
  approval_status = excluded.approval_status,
  approval_status_label = excluded.approval_status_label,
  comment = excluded.comment,
  approvers = excluded.approvers,
  requester = excluded.requester,
  raw_payload = excluded.raw_payload,
  last_synced_at = excluded.last_synced_at,
  updated_at = now();

commit;
`;
}
