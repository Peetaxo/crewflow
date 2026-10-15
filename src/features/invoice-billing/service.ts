import { z } from 'zod';
import { supabase } from '../../lib/supabase';
import { billingDate, billingUuid, billingVersion, BillingError, parseBillingSnapshot, parseBillingQuote,
  parseBillingConsent, parseBillingStatement, parseBillingDocument, type BillingScope } from './contract';
const base = { requestId: billingUuid };
const exact = { statementId: billingUuid, expectedUpdatedAt: billingVersion };
const commandSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('consent'), enabled: z.boolean(), expectedUpdatedAt: billingVersion.nullable(), nonVatConfirmed: z.boolean() }).strict(),
  z.object({ ...base, ...exact, kind: z.literal('confirm'), nonVatConfirmed: z.boolean() }).strict(),
  z.object({ ...base, ...exact, kind: z.literal('refresh') }).strict(),
  z.object({ ...base, ...exact, kind: z.literal('review'), documentId: billingUuid, decision: z.enum(['accept', 'return']), note: z.string() }).strict(),
  z.object({ ...base, kind: z.literal('prepare'), timelogIds: z.array(billingUuid).min(1) }).strict(),
  z.object({ ...base, ...exact, kind: z.literal('repair'), contractorId: billingUuid,
    sources: z.array(z.object({ timelogId: billingUuid, expectedUpdatedAt: billingVersion, km: z.number().finite().min(0).max(99999999.99).refine((v) => Number(v.toFixed(2)) === v) }).strict()).min(1) }).strict(),
  z.object({ ...base, ...exact, kind: z.literal('retry'), jobId: billingUuid, expectedJobUpdatedAt: billingVersion }).strict(),
  z.object({ ...base, ...exact, kind: z.literal('upload'), invoiceNumber: z.string().trim().min(1), issueDate: billingDate, dueDate: billingDate,
    file: z.custom<File>((v) => typeof File !== 'undefined' && v instanceof File) }).strict(),
]);
export type BillingCommand = z.infer<typeof commandSchema>;
export type NewBillingCommand = BillingCommand extends infer T ? T extends BillingCommand ? Omit<T, 'requestId'> : never : never;
function freeze<T>(v: T): T {
  if (v && typeof v === 'object' && !(v instanceof Blob)) { Object.values(v).forEach(freeze); Object.freeze(v); }
  return v;
}
export function freezeBillingCommand(input: BillingCommand): BillingCommand { return freeze(commandSchema.parse(input)); }
export function makeBillingCommand(input: NewBillingCommand): BillingCommand {
  return freeze(commandSchema.parse({ ...input, requestId: crypto.randomUUID() }));
}
export function toBillingError(error: unknown): BillingError {
  if (error instanceof BillingError) return error;
  const value = error as { code?: string; status?: number; message?: string } | null;
  if (['PT409', '40001', '409', '23505'].includes(value?.code ?? '') || value?.status === 409)
    return new BillingError('conflict', 'Podklad, údaje nebo schválení se změnily. Obnovte náhled a potvrďte nový požadavek.');
  if (['42501', '401', '403'].includes(value?.code ?? '') || [401, 403].includes(value?.status ?? 0))
    return new BillingError('denied', 'K tomuto kroku fakturace nemáte oprávnění.');
  if (['22023', '400', '413'].includes(value?.code ?? '') || [400, 413].includes(value?.status ?? 0))
    return new BillingError('invalid', 'Požadavek není platný. Zkontrolujte potvrzení, PDF a aktuální podklad.');
  return new BillingError('ambiguous', 'Výsledek není potvrzen. Obnovujeme data; případné opakování použije stejný požadavek.');
}
type Result = { data?: unknown; error?: unknown };
export interface BillingClient {
  rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<Result>;
  functions?: { invoke: (name: string, options: { body: FormData }) => PromiseLike<Result> };
}
function assertScope(scope: BillingScope) {
  if (scope.source !== 'supabase' || !billingUuid.safeParse(scope.userId).success || !billingUuid.safeParse(scope.profileId).success)
    throw new BillingError('denied', 'Pro fakturaci se přihlaste.');
}
export function createBillingService(client: BillingClient | null) {
  const call = async (name: string, args?: Record<string, unknown>) => {
    if (!client) throw new BillingError('denied', 'Pro fakturaci se přihlaste.');
    try { const result = await client.rpc(name, args); if (result.error) throw toBillingError(result.error); return result.data; }
    catch (error) { throw toBillingError(error); }
  };
  return {
    read: async (scope: BillingScope) => { assertScope(scope); return parseBillingSnapshot(await call('get_invoice_billing_snapshot'), scope); },
    quote: async (timelogIds: string[]) => {
      if (!timelogIds.length || new Set(timelogIds).size !== timelogIds.length || timelogIds.some((id) => !billingUuid.safeParse(id).success))
        throw new BillingError('invalid', 'Vyberte úplné výkazy ke schválení.');
      const quote = parseBillingQuote(await call('get_invoice_billing_quote', { p_timelog_ids: [...timelogIds].sort() }));
      if (quote.timelogIds.length !== timelogIds.length || quote.timelogIds.some((id) => !timelogIds.includes(id))) throw new BillingError('invalid', 'Náhled patří jinému výběru.');
      return quote;
    },
    execute: async (scope: BillingScope, input: BillingCommand) => {
      assertScope(scope);
      const result = commandSchema.safeParse(input);
      if (!result.success) throw new BillingError('invalid', 'Neplatný požadavek fakturace.');
      const c = result.data;
      const requiredRole = c.kind === 'review' ? 'crewhead' : ['prepare', 'repair'].includes(c.kind) ? 'coo' : c.kind === 'retry' ? null : 'crew';
      if ((requiredRole && scope.role !== requiredRole) || (c.kind === 'retry' && !['crew', 'coo'].includes(scope.role)))
        throw new BillingError('denied', 'K tomuto kroku fakturace nemáte oprávnění.');
      if ((c.kind === 'confirm' && !c.nonVatConfirmed) || (c.kind === 'consent' && c.enabled && !c.nonVatConfirmed)
        || (c.kind === 'review' && c.decision === 'return' && !c.note.trim())) throw new BillingError('invalid', 'Doplňte výslovné potvrzení nebo důvod vrácení.');
      const args: Record<string, unknown> = { p_request_id: c.requestId };
      if ('statementId' in c) { args.p_statement_id = c.statementId; args.p_expected_updated_at = c.expectedUpdatedAt; }
      let data: unknown;
      switch (c.kind) {
        case 'consent': return parseBillingConsent(await call('set_self_billing_consent', { ...args, p_enabled: c.enabled, p_expected_updated_at: c.expectedUpdatedAt, p_non_vat_confirmed: c.nonVatConfirmed }));
        case 'confirm': data = await call('confirm_invoice_billing', { ...args, p_non_vat_confirmed: c.nonVatConfirmed }); break;
        case 'refresh': data = await call('refresh_invoice_billing_preview', args); break;
        case 'prepare': data = await call('prepare_invoice_billing_selection', { ...args, p_timelog_ids: c.timelogIds }); break;
        case 'review': data = await call('review_invoice_billing_document', { ...args, p_document_id: c.documentId, p_decision: c.decision, p_note: c.note }); break;
        case 'repair': data = await call('repair_invoice_billing_distance', { ...args, p_contractor_id: c.contractorId,
          p_sources: c.sources.map((s) => ({ timelog_id: s.timelogId, expected_updated_at: s.expectedUpdatedAt, km: s.km })) }); break;
        case 'retry': data = await call('retry_invoice_billing_job', { ...args, p_job_id: c.jobId, p_expected_job_updated_at: c.expectedJobUpdatedAt }); break;
        case 'upload': {
          if (!client?.functions || c.dueDate < c.issueDate || c.file.type !== 'application/pdf' || c.file.size < 1 || c.file.size > 5242880)
            throw new BillingError('invalid', 'Vyberte PDF do 5 MiB a platná data faktury.');
          const header = new TextDecoder().decode(await c.file.slice(0, 5).arrayBuffer());
          if (header !== '%PDF-') throw new BillingError('invalid', 'Soubor nemá platnou hlavičku PDF.');
          const body = new FormData();
          for (const field of ['requestId', 'statementId', 'expectedUpdatedAt', 'invoiceNumber', 'issueDate', 'dueDate'] as const) body.append(field, c[field]);
          body.append('file', c.file);
          try {
            const response = await client.functions.invoke('upload-invoice-document', { body });
            if (response.error) {
              const context = (response.error as { context?: Response }).context;
              throw toBillingError(context ? { status: context.status } : response.error);
            }
            data = response.data;
          } catch (error) { throw toBillingError(error); }
          break;
        }
      }
      const receipt = data as { statement?: unknown; document?: unknown };
      const statement = parseBillingStatement(receipt?.statement);
      if ('statementId' in c && statement.id !== c.statementId) throw new BillingError('invalid', 'Odpověď patří jinému podkladu.');
      if (scope.role === 'crew' && (statement.contractorId !== scope.profileId || statement.contractorUserId !== scope.userId))
        throw new BillingError('denied', 'Podklad patří jinému účtu.');
      if (c.kind === 'upload') parseBillingDocument(receipt.document);
      // Receipt is intentionally not published: replay may describe a superseded version.
      return statement;
    },
  };
}
export const billingService = createBillingService(supabase as unknown as BillingClient | null);
