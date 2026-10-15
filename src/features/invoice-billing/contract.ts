import { z } from 'zod';
import type { Role } from '../../types';

export interface BillingScope { source: 'local' | 'supabase'; userId: string | null; profileId: string | null; role: Role }
export const billingUuid = z.string().uuid();
// Versions are opaque: converting them through Date would discard microseconds.
export const billingVersion = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/);
export const billingDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
const amount = z.number().finite().nonnegative();
const optionalAmount = amount.nullable();
const money = amount.refine((value) => value === Number(value.toFixed(2)));
const optionalMoney = money.nullable();
const nullableId = billingUuid.nullable();
const supplier = z.object({ profileId: billingUuid, name: z.string(), ico: z.string(), dic: z.string().nullable(),
  bankAccount: z.string(), iban: z.string().nullable(), billingStreet: z.string(), billingZip: z.string(),
  billingCity: z.string(), billingCountry: z.string(), vatPayer: z.literal(false) }).strict();
const customer = z.object({ clientId: nullableId, name: z.string(), ico: z.string(), dic: z.string().nullable(),
  street: z.string(), zip: z.string(), city: z.string(), country: z.string() }).strict();
const day = z.object({ id: billingUuid, date: billingDate, time_from: z.string().nullable(), time_to: z.string().nullable(),
  day_type: z.enum(['pripravy', 'instal', 'provoz', 'deinstal']), note: z.string().nullable(),
  meals: z.array(z.enum(['obed', 'vecere'])).max(2), hours: optionalAmount, amount_meals: optionalMoney }).strict();
const report = z.object({ timelog_id: billingUuid, report_updated_at: billingVersion,
  quoted_report_updated_at: billingVersion.optional(), status: z.enum(['pending_coo', 'approved', 'invoiced', 'paid']),
  contractor_id: billingUuid, contractor_user_id: nullableId, event_id: billingUuid, event_name: z.string(),
  event_updated_at: billingVersion, job_number: z.string().nullable(), project_id: nullableId,
  date_from: billingDate.nullable(), date_to: billingDate.nullable(), meal_allowance_enabled: z.boolean(),
  hourly_rate: optionalAmount, km_rate: optionalAmount, meal_rate: optionalAmount, km: optionalAmount, hours: optionalAmount,
  amount_hours: optionalMoney, amount_km: optionalMoney, amount_meals: optionalMoney, amount_receipts: optionalMoney,
  total_amount: optionalMoney, days: z.array(day), supplier_snapshot: supplier, customer_snapshot: customer }).strict();
const financial = z.object({ currency: z.literal('CZK'), reports: z.array(report).min(1), total_amount: optionalMoney }).strict();
const source = z.object({ statement_id: billingUuid, timelog_id: billingUuid, event_id: billingUuid, report_updated_at: billingVersion,
  round_id: nullableId, reserved: z.boolean(), source_snapshot: report.extend({ approved_at: billingVersion.nullable().optional(),
    approved_by: nullableId.optional(), billing_prepared_by: nullableId.optional(), approval: z.record(z.unknown()).nullable().optional(),
    workflow_round_id: nullableId.optional(), workflow_round_updated_at: billingVersion.nullable().optional() }) }).strict();
const statement = z.object({ id: billingUuid, contractor_id: billingUuid, contractor_user_id: nullableId, round_id: nullableId,
  status: z.enum(['ready', 'blocked', 'document_pending', 'document_returned', 'issued']), blocked_reason: z.string().nullable(),
  capture_kind: z.enum(['approval', 'selection']), financial_verified: z.boolean(), financial_version: z.number().int().positive(),
  identity_version: z.number().int().positive(), financial_snapshot: financial, supplier_snapshot: supplier, customer_snapshot: customer,
  preview_issue_date: billingDate, preview_due_date: billingDate, preview_taxable_supply_date: billingDate.nullable(), preview_valid_until: billingVersion,
  total_amount: money, currency: z.literal('CZK'), approved_by: nullableId, approved_at: billingVersion, consent_grant_id: nullableId,
  superseded_by_statement_id: nullableId, active_document_id: nullableId, invoice_id: nullableId,
  created_at: billingVersion, updated_at: billingVersion, sources: z.array(source).min(1) }).strict();
const consent = z.object({ contractor_id: billingUuid, enabled: z.boolean(), active_grant_id: nullableId, updated_at: billingVersion.nullable() }).strict();
const consentHistory = z.object({ id: billingUuid, contractor_id: billingUuid, actor_id: billingUuid, enabled: z.boolean(),
  non_vat_confirmed: z.boolean(), wording_version: z.literal(1), wording: z.string(), created_at: billingVersion }).strict();
const decision = z.object({ id: billingUuid, document_id: billingUuid, statement_id: billingUuid, actor_id: billingUuid,
  decision: z.enum(['accept', 'return']), note: z.string(), created_at: billingVersion }).strict();
const document = z.object({ id: billingUuid, statement_id: billingUuid, request_id: billingUuid, uploader_user_id: billingUuid,
  statement_updated_at: billingVersion, financial_version: z.number().int().positive(), identity_version: z.number().int().positive(),
  storage_bucket: z.literal('invoice-pdfs'), storage_path: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byte_size: z.number().int().positive().max(5242880), content_type: z.literal('application/pdf'), external_invoice_number: z.string().min(1),
  issue_date: billingDate, due_date: billingDate, total_amount: money, created_at: billingVersion, decision: decision.nullable() }).strict();
const job = z.object({ id: billingUuid, kind: z.enum(['issue', 'pdf']), statement_id: billingUuid, invoice_id: nullableId,
  status: z.enum(['queued', 'running', 'completed', 'cancelled', 'failed']), attempts: z.number().int().min(0).max(8), max_attempts: z.literal(8),
  retry_generation: z.number().int().nonnegative(), available_at: billingVersion, updated_at: billingVersion, failed_at: billingVersion.nullable(),
  failure_code: z.enum(['transient_failure', 'retry_budget_exhausted', 'lease_expired_budget']).nullable(), can_retry: z.boolean() }).strict();
const snapshot = z.object({ version: z.literal(1), consent, consent_history: z.array(consentHistory), statements: z.array(statement),
  superseded_statements: z.array(statement), documents: z.array(document), jobs: z.array(job) }).strict();
const quote = z.object({ id: billingUuid, fingerprint: z.string().min(1), timelog_ids: z.array(billingUuid).min(1),
  preview: financial, created_at: billingVersion }).strict();

type Camel<S extends string> = S extends `${infer A}_${infer B}` ? `${A}${Capitalize<Camel<B>>}` : S;
type Mapped<T> = T extends readonly (infer V)[] ? Mapped<V>[] : T extends object ? { [K in keyof T as K extends string ? Camel<K> : K]: Mapped<T[K]> } : T;
function camel<T>(value: T): Mapped<T> {
  if (Array.isArray(value)) return value.map(camel) as Mapped<T>;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) =>
    [key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), camel(item)])) as Mapped<T>;
  return value as Mapped<T>;
}
export type BillingSnapshot = Omit<Mapped<z.infer<typeof snapshot>>, 'statements' | 'supersededStatements'> & { statements: BillingStatement[]; supersededStatements: BillingStatement[] };
export type BillingStatement = Mapped<z.infer<typeof statement>> & { needsSourceVerification: boolean };
export type BillingDocument = Mapped<z.infer<typeof document>>;
export type BillingJob = Mapped<z.infer<typeof job>>;
export type BillingQuote = Mapped<z.infer<typeof quote>>;
export type BillingFinance = BillingStatement['financialSnapshot'];
export type BillingConsent = BillingSnapshot['consent'];
export const standingConsentWording = 'Prohlasuji, že nejsem plátcem DPH. Souhlasím, aby CrewFlow vystavoval faktury mým jménem za nově schválené výkazy.';
export class BillingError extends Error {
  constructor(public kind: 'invalid' | 'denied' | 'conflict' | 'ambiguous', message: string) { super(message); this.name = 'BillingError'; }
}
const invalid = (): never => { throw new BillingError('invalid', 'Fakturační podklady se nepodařilo ověřit. Obnovte data.'); };
const unique = (values: string[]) => new Set(values).size === values.length;
const stableJson = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const same = (left: unknown, right: unknown) => stableJson(left) === stableJson(right);
// Check stored decimal amounts without recomputing prices from current rates.
const cents = (value: number) => Math.round(value * 100);
const totalsMatch = (total: number | null, parts: (number | null)[]) => total === null || parts.some((part) => part === null)
  || cents(total) === parts.reduce<number>((sum, part) => sum + cents(part!), 0);
function validFinance(value: z.infer<typeof financial>) {
  return totalsMatch(value.total_amount, value.reports.map((r) => r.total_amount))
    && value.reports.every((r) => totalsMatch(r.total_amount, [r.amount_hours, r.amount_km, r.amount_meals, r.amount_receipts])
      && totalsMatch(r.amount_meals, r.days.map((d) => d.amount_meals)));
}
// Nulls remain readable in unverified blocked data and quote previews. A
// verified financial capture must instead contain every stored operand and day.
function completeFinance(value: z.infer<typeof financial>) {
  const time = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return value.total_amount != null && value.reports.every((r) => r.contractor_user_id != null
    && r.hourly_rate != null && r.hourly_rate > 0
    && [r.km_rate, r.meal_rate, r.km, r.hours, r.amount_hours, r.amount_km, r.amount_meals, r.amount_receipts, r.total_amount].every((v) => v != null)
    && r.days.length > 0 && r.days.every((d) => d.hours != null && d.amount_meals != null
      && d.time_from != null && time.test(d.time_from) && d.time_to != null && time.test(d.time_to)));
}
const validDocumentPath = (d: Pick<z.infer<typeof document>, 'statement_id' | 'request_id' | 'storage_path'>) =>
  d.storage_path === `billing-statements/${d.statement_id}/documents/${d.request_id}.pdf`;
export function parseBillingStatement(value: unknown): BillingStatement {
  const parsed = statement.safeParse(value); if (!parsed.success) return invalid();
  const s = parsed.data;
  let needsSourceVerification = false;
  if ((!s.financial_verified && s.status !== 'blocked') || (s.financial_verified && !completeFinance(s.financial_snapshot))
    || !validFinance(s.financial_snapshot) || (s.financial_snapshot.total_amount !== null && cents(s.total_amount) !== cents(s.financial_snapshot.total_amount))
    || !same(s.customer_snapshot, s.financial_snapshot.reports[0].customer_snapshot)
    // A blocked statement may have several buyers even when an earlier
    // financial-data check supplied its reason; issuance still requires one.
    || s.financial_snapshot.reports.some((r) => !same(s.supplier_snapshot, r.supplier_snapshot)
      || (s.status !== 'blocked' && !same(s.customer_snapshot, r.customer_snapshot)))
    || s.supplier_snapshot.profileId !== s.contractor_id || (s.status === 'issued') !== Boolean(s.invoice_id)
    || (s.status === 'blocked') !== Boolean(s.blocked_reason) || s.preview_due_date < s.preview_issue_date
    || !unique(s.sources.map((x) => x.timelog_id)) || !unique(s.financial_snapshot.reports.map((r) => r.timelog_id))
    || s.sources.length !== s.financial_snapshot.reports.length || s.sources.some((x) => {
      const r = s.financial_snapshot.reports.find((r) => r.timelog_id === x.timelog_id);
      if (r && !Object.keys(report.shape).every((key) => same(r[key as keyof typeof r], x.source_snapshot[key as keyof typeof x.source_snapshot]))) {
        // Early pre-provenance records contain the exact quoted payload under
        // its preapproval version. Keep history readable, never actionable.
        const legacy = s.capture_kind === 'approval' && s.financial_verified && r.status === 'pending_coo'
          && r.quoted_report_updated_at === undefined && x.source_snapshot.status === 'approved'
          && x.source_snapshot.report_updated_at === x.report_updated_at
          && Date.parse(r.report_updated_at) < Date.parse(x.report_updated_at)
          && Object.keys(report.shape).every((key) => ['status', 'report_updated_at'].includes(key)
            || same(r[key as keyof typeof r], x.source_snapshot[key as keyof typeof x.source_snapshot]));
        if (!legacy) return true;
        needsSourceVerification = true;
      }
      return !r || x.statement_id !== s.id || r.contractor_id !== s.contractor_id || r.contractor_user_id !== s.contractor_user_id
        || r.supplier_snapshot.profileId !== s.contractor_id || r.event_id !== x.event_id
        || x.source_snapshot.report_updated_at !== x.report_updated_at || x.source_snapshot.timelog_id !== x.timelog_id || x.source_snapshot.event_id !== x.event_id
        || x.source_snapshot.contractor_id !== s.contractor_id || x.source_snapshot.contractor_user_id !== s.contractor_user_id;
    })) return invalid();
  return { ...camel(s), needsSourceVerification };
}
export function parseBillingSnapshot(value: unknown, scope: BillingScope): BillingSnapshot {
  const parsed = snapshot.safeParse(value); if (!parsed.success) return invalid();
  const raw = parsed.data; const result = camel(raw) as BillingSnapshot;
  const all = [...raw.statements, ...raw.superseded_statements];
  if (raw.consent.contractor_id !== scope.profileId || raw.consent.enabled !== Boolean(raw.consent.active_grant_id)
    || raw.consent_history.some((h) => h.contractor_id !== scope.profileId || (h.enabled && !h.non_vat_confirmed))
    || !unique(all.map((s) => s.id)) || !unique(raw.documents.map((d) => d.id)) || !unique(raw.jobs.map((j) => j.id))
    || raw.statements.some((s) => s.superseded_by_statement_id !== null || s.sources.some((x) => !x.reserved))
    || raw.superseded_statements.some((s) => !s.superseded_by_statement_id || s.sources.some((x) => x.reserved))
    || all.some((s) => (scope.role === 'crew' && (s.contractor_id !== scope.profileId || s.contractor_user_id !== scope.userId)))
    || raw.documents.some((d) => !validDocumentPath(d) || !all.some((s) => s.id === d.statement_id) || d.due_date < d.issue_date
      || (d.decision && (d.decision.document_id !== d.id || d.decision.statement_id !== d.statement_id)))
    || all.some((s) => s.active_document_id && !raw.documents.some((d) => d.id === s.active_document_id && d.statement_id === s.id))
    || raw.jobs.some((j) => !all.some((s) => s.id === j.statement_id) || (scope.role === 'crewhead' && j.can_retry))) return invalid();
  result.statements = raw.statements.map(parseBillingStatement);
  result.supersededStatements = raw.superseded_statements.map(parseBillingStatement);
  return result;
}
export function parseBillingQuote(value: unknown): BillingQuote {
  const parsed = quote.safeParse(value); if (!parsed.success) return invalid();
  const q = parsed.data;
  if (!validFinance(q.preview) || !unique(q.timelog_ids) || !unique(q.preview.reports.map((r) => r.timelog_id))
    || q.timelog_ids.length !== q.preview.reports.length || q.preview.reports.some((r) => !q.timelog_ids.includes(r.timelog_id)
      || r.contractor_id !== r.supplier_snapshot.profileId)) return invalid();
  return camel(q);
}
export function parseBillingConsent(value: unknown): BillingConsent { return camel(consent.parse(value)); }
export function parseBillingDocument(value: unknown): BillingDocument {
  const d = document.extend({ decision: decision.nullable().default(null) }).parse(value);
  if (!validDocumentPath(d) || d.due_date < d.issue_date) return invalid();
  return camel(d);
}
export function formatBillingMoney(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? 'Neznámá částka' : new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 2 }).format(value);
}
export function formatBillingHours(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'Neznámý čas';
  const minutes = Math.round(value * 60); return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
