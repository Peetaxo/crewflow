import { z } from 'zod';
import type { Database } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';
import {
  BillingError,
  type BillingMutationResult,
  type BillingScope,
  type BillingSnapshot,
  type SaveBillingGroup,
} from './billing-groups.model';
import { readLocalBillingGroups, saveLocalBillingGroup } from './billing-groups.local';

export { readLocalBillingGroups, saveLocalBillingGroup } from './billing-groups.local';
export { BillingError } from './billing-groups.model';

type RpcError = { code?: unknown; message?: unknown } | null;
type RpcResponse = { data: unknown; error: RpcError };
type SaveArguments = Database['public']['Functions']['save_billing_group_atomic']['Args'];
type BillingRpcClient = {
  rpc(functionName: 'read_billing_groups'): { abortSignal(signal: AbortSignal): Promise<RpcResponse> };
  rpc(functionName: 'save_billing_group_atomic', args: SaveArguments): Promise<RpcResponse>;
};

const AMBIGUOUS_MESSAGE = 'Výsledek uložení není potvrzen. Opakujte stejný požadavek.';
const LOGIN_MESSAGE = 'Pro práci se skupinami se přihlaste.';
const CONFLICT_MESSAGE = 'Data se mezitím změnila. Obnovte výběr a znovu jej potvrďte.';

const snapshotSchema = z.object({
  revision: z.number().int().nonnegative().nullable(),
  groups: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    event_ids: z.array(z.string().uuid()),
  }).strict()),
}).strict();

const mutationSchema = z.object({
  request_id: z.string().uuid(),
  group_id: z.string().uuid(),
  revision: z.number().int().nonnegative(),
}).strict();

const tokenMessages = new Map<string, string>([
  ['billing_group_cross_project_confirmation', 'Potvrďte společnou fakturaci přes více projektů.'],
  ['billing_group_move_confirmation', 'Potvrďte přesun z jiné fakturační skupiny.'],
  ['billing_group_not_empty', 'Smazat lze pouze prázdnou skupinu.'],
  ['billing_group_request_mismatch', 'Požadavek má jiné údaje. Obnovte výběr.'],
  ['billing_group_missing', 'Skupina už neexistuje. Obnovte data.'],
  ['billing_group_invalid_input', 'Údaje skupiny nejsou platné.'],
]);

function ambiguous(): BillingError {
  return new BillingError('ambiguous', AMBIGUOUS_MESSAGE);
}

function billingClient(scope: BillingScope): BillingRpcClient {
  if (!supabase || !scope.userId) {
    throw new BillingError('denied', LOGIN_MESSAGE);
  }
  return supabase as unknown as BillingRpcClient;
}

function domainError(error: RpcError): BillingError {
  if (!error) return ambiguous();
  if (error.code === '40001') return new BillingError('conflict', CONFLICT_MESSAGE);
  if (error.code === '42501') {
    return new BillingError('denied', 'Ke změně skupiny nebo některé akce nemáte oprávnění.');
  }
  const message = typeof error.message === 'string' ? tokenMessages.get(error.message) : undefined;
  return message ? new BillingError('invalid', message) : ambiguous();
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new BillingError('ambiguous', 'Čtení bylo přerušeno. Obnovte data.');
  }
}

export async function readBillingGroups(
  scope: BillingScope,
  signal: AbortSignal,
): Promise<BillingSnapshot> {
  assertNotAborted(signal);
  if (scope.source === 'local') return readLocalBillingGroups(scope);
  const client = billingClient(scope);

  let response: RpcResponse;
  try {
    response = await client.rpc('read_billing_groups').abortSignal(signal);
  } catch {
    throw ambiguous();
  }
  assertNotAborted(signal);
  if (response.error) throw domainError(response.error);
  const parsed = snapshotSchema.safeParse(response.data);
  if (!parsed.success) throw ambiguous();
  return {
    revision: parsed.data.revision,
    groups: parsed.data.groups.map((group) => ({
      id: group.id,
      name: group.name,
      eventIds: [...group.event_ids],
    })),
  };
}

export async function saveBillingGroup(
  scope: BillingScope,
  command: SaveBillingGroup,
): Promise<BillingMutationResult> {
  if (scope.source === 'local') return saveLocalBillingGroup(scope, command);
  const client = billingClient(scope);

  let response: RpcResponse;
  try {
    response = await client.rpc('save_billing_group_atomic', {
      p_request_id: command.requestId,
      p_group_id: command.groupId,
      p_name: command.name,
      p_event_ids: command.eventIds,
      p_expected_revision: command.expectedRevision,
      p_event_versions: command.eventVersions,
      p_confirm_cross_project: command.confirmCrossProject,
      p_confirm_moves: command.confirmMoves,
      p_delete: command.deleteGroup,
    });
  } catch {
    throw ambiguous();
  }
  if (response.error) throw domainError(response.error);
  const parsed = mutationSchema.safeParse(response.data);
  if (!parsed.success || parsed.data.request_id !== command.requestId || parsed.data.group_id !== command.groupId) {
    throw ambiguous();
  }
  return {
    requestId: parsed.data.request_id,
    groupId: parsed.data.group_id,
    revision: parsed.data.revision,
  };
}
