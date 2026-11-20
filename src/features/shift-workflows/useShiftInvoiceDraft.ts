import { useLayoutEffect, useRef, useState } from 'react';
import { createStableDraftUuid } from '../stable-draft-identity';
import { downloadShiftInvoiceAttachment, readShiftInvoiceAttachment, validateShiftInvoiceReplacement,
  type ShiftInvoiceAvailability, type ShiftInvoiceChange, type ShiftInvoiceFields } from './shift-invoice-attachment';
import { ShiftWorkflowError } from './shift-workflows.contract';

type Draft = { kind: 'remove' } | (ShiftInvoiceFields & { kind: 'replace'; file: File | null; requestId: string });
type ReadState = { key: string; result: ShiftInvoiceAvailability | null };

export function useShiftInvoiceDraft(scopeKey: string | null, timelogKey: string, roundKey: string) {
  const [read, setRead] = useState<ReadState | null>(null);
  const [draftState, setDraftState] = useState<{ key: string; value: Draft } | null>(null);
  const [downloadState, setDownloadState] = useState<{ key: string; status: 'busy' | 'error' } | null>(null);
  const [version, setVersion] = useState(0);
  const activation = useRef<symbol | null>(null);
  const key = JSON.stringify([scopeKey, timelogKey, roundKey]);
  const lookupKey = JSON.stringify([key, version]);

  useLayoutEffect(() => {
    if (!scopeKey || !timelogKey) return;
    const owner = Symbol();
    activation.current = owner;
    const assertCurrent = () => {
      if (activation.current !== owner) throw new ShiftWorkflowError('denied', 'Přístup k evidenci se změnil.');
    };
    // Let StrictMode retire its probe before dispatching the authenticated read.
    void Promise.resolve().then(() => {
      assertCurrent();
      return readShiftInvoiceAttachment(timelogKey.split(','), assertCurrent);
    }).then((result) => {
      if (activation.current === owner) setRead({ key: lookupKey, result });
    }, () => {
      if (activation.current === owner) setRead({ key: lookupKey, result: null });
    });
    return () => { activation.current = null; };
  }, [scopeKey, timelogKey, lookupKey]);

  const lookup = read?.key === lookupKey ? read : null;
  const result = lookup?.result;
  const draft = draftState?.key === key ? draftState.value : null;
  const downloadStatus = downloadState?.key === lookupKey ? downloadState.status : null;
  const attachment = result?.attachment ?? null;
  const canChoose = Boolean(result?.eligible && result.customer_id && result.customer_name);
  const setDraft = (value: Draft | null) => setDraftState(value ? { key, value } : null);
  const startReplacement = () => {
    if (!canChoose) return;
    setDraft({ kind: 'replace', requestId: createStableDraftUuid(), file: null, invoiceNumber: attachment?.invoice_number ?? '',
      issueDate: attachment?.issue_date ?? '', dueDate: attachment?.due_date ?? '', totalAmount: attachment?.total_amount.toFixed(2) ?? '' });
  };

  return {
    attachment, result, draft, canChoose, downloadStatus,
    loading: !lookup, loadError: Boolean(lookup && !result),
    startReplacement,
    editReplacement: (patch: Partial<ShiftInvoiceFields & { file: File | null }>) => {
      if (draft?.kind === 'replace') setDraft({ ...draft, ...patch, requestId: createStableDraftUuid() });
    },
    remove: () => { if (attachment) setDraft({ kind: 'remove' }); },
    reset: () => setDraft(null),
    reload: () => setVersion((current) => current + 1),
    prepare: (): ShiftInvoiceChange | undefined => {
      if (!draft) return undefined;
      if (draft.kind === 'remove') return draft;
      if (!canChoose) throw new ShiftWorkflowError('invalid', 'Přílohu teď nelze přidat. Zrušte výběr souboru nebo obnovte evidenci.');
      return validateShiftInvoiceReplacement({ ...draft, customerId: result.customer_id });
    },
    download: async () => {
      const owner = activation.current;
      const isCurrent = () => owner !== null && activation.current === owner;
      if (!attachment || downloadStatus === 'busy' || !isCurrent()) return;
      setDownloadState({ key: lookupKey, status: 'busy' });
      try {
        await downloadShiftInvoiceAttachment(attachment.storage_path, isCurrent);
        if (isCurrent()) setDownloadState(null);
      } catch {
        if (isCurrent()) setDownloadState({ key: lookupKey, status: 'error' });
      }
    },
  };
}
