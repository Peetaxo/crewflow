import { useDeferredShiftWorkflowDraft, type ShiftWorkflowDraftInput } from './useDeferredShiftWorkflowDraft';

export type { ShiftWorkflowCrewDisplay, ShiftWorkflowDraftInput } from './useDeferredShiftWorkflowDraft';

/** Compatibility contract for owners with complete evidence on the first render. */
export function useShiftWorkflowDraft(props: ShiftWorkflowDraftInput) {
  const { reset: _reset, ready: _ready, ...draft } = useDeferredShiftWorkflowDraft(props);
  return { ...draft, data: draft.data!, impact: draft.impact! };
}

export type ShiftWorkflowDraft = ReturnType<typeof useShiftWorkflowDraft>;
