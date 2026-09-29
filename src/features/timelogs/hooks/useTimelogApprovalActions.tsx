import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import type { Timelog } from '../../../types';
import {
  updateTimelogStatuses,
  type TimelogAction,
} from '../services/timelogs.service';

interface UseTimelogApprovalActionsOptions {
  currentProfileId: string | null | undefined;
  timelogs: Timelog[];
  onSuccess?: () => void;
  /** Opens the complete shared round and consumes the action before any write. */
  reviewSelection?: (ids: number[]) => boolean;
  identityKey?: string;
}

interface PendingReturnRequest {
  ids: number[];
}

interface TimelogApprovalActions {
  execute: (ids: number[], action: TimelogAction) => void;
  dialog: React.ReactNode;
  isPending: boolean;
}

const getMutationErrorMessage = (error: unknown) => (
  error instanceof Error ? error.message : 'Nepodařilo se aktualizovat výkaz.'
);

export const useTimelogApprovalActions = ({
  currentProfileId,
  timelogs,
  onSuccess,
  reviewSelection,
  identityKey,
}: UseTimelogApprovalActionsOptions): TimelogApprovalActions => {
  const [returnRequest, setReturnRequest] = useState<PendingReturnRequest | null>(null);
  const [returnNote, setReturnNote] = useState('');
  const [dialogError, setDialogError] = useState('');
  const [isPending, setIsPending] = useState(false);
  const mountedRef = useRef(true);
  const pendingRef = useRef(false);
  const timelogsById = useMemo(() => new Map(timelogs.map((timelog) => [timelog.id, timelog])), [timelogs]);
  const activation = useMemo(() => ({ active: false, profileId: currentProfileId, identityKey }), [currentProfileId, identityKey]);
  useLayoutEffect(() => {
    activation.active = true;
    setReturnRequest(null);
    setReturnNote('');
    setDialogError('');
    return () => { activation.active = false; };
  }, [activation]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const finishSuccessfully = useCallback(() => {
    if (!mountedRef.current) return;
    onSuccess?.();
  }, [onSuccess]);

  const runMutation = useCallback(async (
    ids: number[],
    action: TimelogAction,
    note?: string,
    keepDialogOpenOnError = false,
  ) => {
    if (!activation.active || !mountedRef.current || pendingRef.current || ids.length === 0) return;

    pendingRef.current = true;
    if (mountedRef.current) {
      setIsPending(true);
      setDialogError('');
    }

    try {
      await updateTimelogStatuses(ids, action, {
        assertCurrent: () => {
          if (!activation.active) throw new Error('Přístup k výkazu se změnil. Otevřete jej znovu.');
        },
        ...(currentProfileId ? { currentProfileId } : {}),
        ...(note ? { note } : {}),
      });

      if (!mountedRef.current || !activation.active) return;
      if (keepDialogOpenOnError) {
        setReturnRequest(null);
        setReturnNote('');
      }
      finishSuccessfully();
    } catch (error) {
      if (!mountedRef.current || !activation.active) return;
      const message = getMutationErrorMessage(error);
      if (keepDialogOpenOnError) {
        setDialogError(message);
      } else {
        toast.error(message);
      }
    } finally {
      pendingRef.current = false;
      if (mountedRef.current) setIsPending(false);
    }
  }, [activation, currentProfileId, finishSuccessfully]);

  const execute = useCallback((ids: number[], action: TimelogAction) => {
    if (!activation.active || !mountedRef.current || pendingRef.current || ids.length === 0) return;
    try {
      if (reviewSelection?.(ids)) return;
    } catch (error) {
      toast.error(getMutationErrorMessage(error));
      return;
    }

    const requiresReturnNote = action === 'rej' && ids.some((id) => (
      timelogsById.get(id)?.status === 'pending_coo'
    ));

    if (requiresReturnNote) {
      setReturnRequest({ ids: [...ids] });
      setReturnNote('');
      setDialogError('');
      return;
    }

    void runMutation(ids, action);
  }, [activation, reviewSelection, runMutation, timelogsById]);

  const closeDialog = useCallback(() => {
    if (!activation.active || !mountedRef.current || pendingRef.current) return;
    setReturnRequest(null);
    setReturnNote('');
    setDialogError('');
  }, [activation]);

  const submitReturn = useCallback(() => {
    if (!activation.active || !mountedRef.current || !returnRequest || pendingRef.current) return;

    const note = returnNote.trim();
    if (!note) {
      setDialogError('Napiš prosím důvod vrácení.');
      return;
    }

    void runMutation(returnRequest.ids, 'rej', note, true);
  }, [activation, returnNote, returnRequest, runMutation]);

  const isBulkReturn = (returnRequest?.ids.length ?? 0) > 1;
  const dialogTitle = isBulkReturn ? 'Vrátit výkazy k opravě' : 'Vrátit výkaz k opravě';
  const confirmLabel = isBulkReturn ? 'Vrátit výkazy' : 'Vrátit výkaz';

  const dialog = (
    <Dialog
      open={Boolean(returnRequest)}
      onOpenChange={(open) => {
        if (!open) closeDialog();
      }}
    >
      <DialogContent
        overlayClassName="z-[100]"
        className="z-[101] max-w-md"
        aria-busy={isPending || undefined}
      >
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>
            Doplň, co je potřeba opravit v evidenci hodin. Tento krok se netýká fakturace.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label htmlFor="timelog-return-note" className="text-sm font-semibold text-[color:var(--nodu-text)]">
            Důvod vrácení
          </label>
          <textarea
            id="timelog-return-note"
            autoFocus
            rows={4}
            value={returnNote}
            disabled={isPending}
            onChange={(event) => {
              setReturnNote(event.target.value);
              if (dialogError) setDialogError('');
            }}
            className="w-full resize-y rounded-[16px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.94)] px-3 py-2 text-sm text-[color:var(--nodu-text)] outline-none transition focus:border-[color:var(--nodu-accent)] focus:ring-2 focus:ring-[color:var(--nodu-accent-soft)] disabled:cursor-wait disabled:opacity-70"
          />
          {dialogError && (
            <p role="alert" className="text-sm font-medium text-[color:var(--nodu-error-text)]">
              {dialogError}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={closeDialog} disabled={isPending}>
            Zrušit
          </Button>
          <Button type="button" onClick={submitReturn} disabled={isPending}>
            {isPending ? 'Vracím…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { execute, dialog, isPending };
};
