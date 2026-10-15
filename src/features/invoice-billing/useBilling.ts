import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BillingError } from './contract';
import { billingService, freezeBillingCommand, toBillingError, type BillingCommand } from './service';
import { billingInactive, usePrivateInvoiceQuery, useBillingScope } from './useBillingScope';
export function useBilling(enabled = true) {
  const identity = useBillingScope(enabled); const client = useQueryClient();
  const read = useCallback(() => billingService.read(identity.scope), [identity.scope]);
  const resource = usePrivateInvoiceQuery('invoice-billing', read, enabled && identity.scope.source === 'supabase');
  const [saving, setSaving] = useState(false); const [error, setError] = useState<BillingError | null>(null);
  const pending = useRef<BillingCommand | null>(null); const inFlight = useRef(false);
  useLayoutEffect(() => { pending.current = null; inFlight.current = false; setSaving(false); setError(null); }, [resource.scopeKey]);
  const { capture, reload, scope } = resource;
  const execute = useCallback(async (command: BillingCommand) => {
    const isCurrent = capture(); if (!isCurrent()) throw billingInactive();
    if (inFlight.current || (pending.current && pending.current !== command)) throw new BillingError('invalid', 'Nejdříve zopakujte původní požadavek.');
    const captured = pending.current ?? freezeBillingCommand(command);
    pending.current = captured; inFlight.current = true; setSaving(true); setError(null);
    let failure: BillingError | null = null;
    try { await billingService.execute(scope, captured, isCurrent); }
    catch (cause) { failure = toBillingError(cause); }
    if (!isCurrent()) throw billingInactive();
    if (!failure || failure.kind !== 'ambiguous') pending.current = null;
    try {
      await Promise.all([reload(), client.invalidateQueries({ queryKey: ['invoices'] }), client.invalidateQueries({ queryKey: ['invoice-approvals'] })]);
    } catch { if (!failure) failure = new BillingError('conflict', 'Operace je uložená, přehled se nepodařilo obnovit. Obnovte data.'); }
    if (!isCurrent()) throw billingInactive();
    inFlight.current = false; setSaving(false); setError(failure);
    if (failure) throw failure;
  }, [client, capture, reload, scope]);
  const retry = useCallback(() => pending.current ? execute(pending.current) : Promise.reject(new BillingError('invalid', 'Není co opakovat.')), [execute]);
  return { ...resource, saving, error, execute, retry, canRetry: Boolean(error?.kind === 'ambiguous') };
}
export type BillingController = ReturnType<typeof useBilling>;
