# Stable Draft Identities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Supabase event and receipt creates idempotent across reindexing, lost responses, retries, and auth resets by assigning the database UUID to the draft before its first request.

**Architecture:** New Supabase drafts carry their database UUID in `supabaseId`; services use only stable UUID plus `updatedAt` and never choose a write target from a numeric local ID. Event and receipt loaders remain pure, while guarded callers compare both lifecycle generation and a service reset epoch immediately before state/query-cache commit.

**Tech Stack:** React 18, TypeScript 5.8, Supabase JS/PostgREST, TanStack Query, Vitest 4, Testing Library.

---

## File Map

- Create `src/features/stable-draft-identity.ts`: one browser-safe UUID allocator shared by event and receipt draft factories.
- Create `src/features/stable-draft-identity.test.ts`: allocator success/failure contract.
- Modify `src/features/events/services/events.service.ts`: UUID-bearing factories, UUID-only write identity, CAS, pure/epoch-guarded hydration and reset cleanup.
- Modify `src/features/events/services/events.service.test.ts`: event factory, double-save, reindex, ambiguous retry, reset-race and no-positional-write regressions.
- Modify `src/features/receipts/services/receipts.service.ts`: UUID-bearing factory, UUID-only receipt/event identity, pure/epoch-guarded hydration and reset cleanup.
- Modify `src/features/receipts/services/receipts.service.test.ts`: receipt factory, double-save, reindex, ambiguous retry and reset-race regressions.
- Modify `src/components/modals/EventEditModal.tsx`: same-render save lock while retaining the UUID-bearing draft on failure.
- Modify `src/components/modals/EventEditModal.test.tsx`: native double-click and failed-save identity assertions.
- Modify `src/components/modals/ReceiptEditModal.tsx`: stable event UUID selection and same-render save lock.
- Modify `src/components/modals/uuid-contractor-modal-identity.test.tsx`: receipt event UUID and failed-save/double-click assertions.
- Modify `src/features/uuid-write-flows.integration.test.ts`: end-to-end event/receipt UUID persistence, reset and invoice selection regression.
- Modify `docs/superpowers/specs/2026-08-18-stable-draft-identities-design.md`: mark implementation complete only after all gates pass.

### Task 1: Assign Stable UUIDs When Drafts Are Created

**Files:**
- Create: `src/features/stable-draft-identity.ts`
- Create: `src/features/stable-draft-identity.test.ts`
- Modify: `src/features/events/services/events.service.ts`
- Modify: `src/features/events/services/events.service.test.ts`
- Modify: `src/features/receipts/services/receipts.service.ts`
- Modify: `src/features/receipts/services/receipts.service.test.ts`

- [ ] **Step 1: Write failing allocator and factory tests**

Add tests with these assertions:

```ts
it('allocates one stable UUID or fails closed when crypto is unavailable', () => {
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'client-uuid-1') });
  expect(createStableDraftUuid()).toBe('client-uuid-1');
  vi.stubGlobal('crypto', undefined);
  expect(() => createStableDraftUuid()).toThrow('Stable draft UUID is unavailable');
});

it('creates Supabase event drafts and copies with different stable UUIDs', () => {
  vi.stubGlobal('crypto', {
    randomUUID: vi.fn()
      .mockReturnValueOnce('client-uuid-1')
      .mockReturnValueOnce('client-uuid-2'),
  });
  const draft = createEmptyEvent();
  const source = { ...newEventDraft(), supabaseId: 'server-event', updatedAt: 'v1' };
  const copy = createEventCopy(source);
  expect(draft.supabaseId).toBe('client-uuid-1');
  expect(copy.supabaseId).toBe('client-uuid-2');
  expect(copy.updatedAt).toBeUndefined();
});

it('creates a Supabase receipt draft with a stable UUID', () => {
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'client-uuid-1') });
  expect(createEmptyReceipt('profile-1').supabaseId).toBe('client-uuid-1');
});
```

Run the service factory assertions after mocking `appDataSource` to `supabase`
and dynamically importing the service, following the existing test isolation
pattern. Add one local-mode assertion per factory that `supabaseId` remains
undefined and no UUID is requested.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

```bash
npm test -- src/features/stable-draft-identity.test.ts src/features/events/services/events.service.test.ts src/features/receipts/services/receipts.service.test.ts
```

Expected: failures show the allocator is missing and Supabase draft factories return no UUID or reuse the copied UUID.

- [ ] **Step 3: Implement the UUID allocator and use it in Supabase factories**

Create:

```ts
export const createStableDraftUuid = (): string => {
  const uuid = globalThis.crypto?.randomUUID();
  if (!uuid) throw new Error('Stable draft UUID is unavailable');
  return uuid;
};
```

In both draft factories, set `supabaseId` only when `appDataSource === 'supabase'`. In `createEventCopy`, always clear `updatedAt` and allocate a fresh UUID in Supabase mode. Keep `supabaseId` undefined in local-only mode.

- [ ] **Step 4: Run focused GREEN tests**

Run the Step 2 command.

Expected: allocator/factory assertions pass and all pre-existing event/receipt service assertions remain green.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/features/stable-draft-identity.ts src/features/stable-draft-identity.test.ts src/features/events/services/events.service.ts src/features/events/services/events.service.test.ts src/features/receipts/services/receipts.service.ts src/features/receipts/services/receipts.service.test.ts
git commit -m "fix: assign stable UUIDs to new drafts"
```

### Task 2: Make Event Writes UUID-Only and Event Hydration Reset-Safe

**Files:**
- Modify: `src/features/events/services/events.service.ts`
- Modify: `src/features/events/services/events.service.test.ts`
- Modify: `src/components/modals/EventEditModal.tsx`
- Modify: `src/components/modals/EventEditModal.test.tsx`

- [ ] **Step 1: Write failing identity, reset-race and modal-lock tests**

Extend `setupEventCreateIntentHarness` with a `setSnapshot` callback and make
its insert mock model the primary-key idempotency boundary: the first call
stores `authoritativeEventRow`; a later call with the same `payload.id` returns
`{ code: '23505', message: 'duplicate key value violates unique constraint' }`
without replacing the row. Keep exposing that authoritative row through the
existing `eventsSelect` recovery path. Then add focused tests using only this
harness API:

```ts
it('reuses the draft UUID after a committed insert, failed recovery, and local-id reuse', async () => {
  const harness = await setupEventCreateIntentHarness({
    loseFirstInsertResponse: true,
    failFirstRecovery: true,
  });
  const draft = { ...newEventDraft(), supabaseId: 'event-client-uuid-1' };
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  await expect(harness.service.saveEvent(draft))
    .rejects.toThrow('Akci se nepodařilo uložit.');
  harness.setSnapshot((snapshot) => ({
    ...snapshot,
    events: [{ ...newEventDraft(), id: draft.id, supabaseId: 'event-row-other', updatedAt: 'v-other' }],
  }));

  const recovered = await harness.service.saveEvent(draft);

  expect(harness.insert).toHaveBeenCalledTimes(2);
  expect(harness.insert.mock.calls.map(([payload]) => payload.id))
    .toEqual([draft.supabaseId, draft.supabaseId]);
  expect(harness.update).not.toHaveBeenCalled();
  expect(recovered.supabaseId).toBe(draft.supabaseId);
  consoleError.mockRestore();
});

it('drops an event hydration that finishes after auth reset', async () => {
  const oldUserEvent = { ...lifecycleEvent, name: 'Old user event' };
  const harness = await setupLifecycleService({
    initialSnapshot: createSnapshot({ events: [] }),
    deferredPublicEvents: [oldUserEvent],
  });
  const oldLoad = harness.service.fetchEventsSnapshot();
  await vi.waitFor(() => expect(harness.eventsSelect).toHaveBeenCalledOnce());

  harness.service.resetSupabaseEventsHydration();
  harness.setSnapshot((snapshot) => ({ ...snapshot, events: [] }));
  harness.resolveDeferredPublicEvents();
  await expect(oldLoad).resolves.toEqual([]);

  expect(harness.getSnapshot().events).toEqual([]);
  expect(harness.setQueryData).not.toHaveBeenCalledWith(['events'], expect.anything());
  expect(harness.cancelQueries).toHaveBeenCalledWith({ queryKey: ['events'] });
});

it('rejects native double click in the same render and keeps draft UUID after failure', async () => {
  const pending = createDeferred<Event>();
  const saveEvent = vi.fn(() => pending.promise);
  const onClose = vi.fn();
  vi.doMock('../../features/events/services/events.service', () => ({
    applyEventDraft: (nextEvent: Event) => nextEvent,
    createDefaultPhaseTimes: (from: string, to: string) => ({
      instal: { from, to }, provoz: { from, to }, deinstal: { from, to },
    }),
    getEventFormOptions: () => ({ projects: [], clients: [] }),
    normalizeEventSchedules: () => ({}),
    saveEvent,
  }));
  const { default: EventEditModal } = await import('./EventEditModal');
  render(<EventEditModal
    editingEvent={{ ...event, supabaseId: 'event-client-uuid' }}
    onClose={onClose}
    onChange={vi.fn()}
  />);

  const saveButton = screen.getByRole('button', { name: 'Ulozit akci' });
  saveButton.click();
  saveButton.click();
  expect(saveEvent).toHaveBeenCalledOnce();
  expect(saveEvent).toHaveBeenCalledWith(expect.objectContaining({ supabaseId: 'event-client-uuid' }));
  await act(async () => pending.reject(new Error('Akci se nepodařilo uložit.')));
  expect(onClose).not.toHaveBeenCalled();
});
```

Add `act` to the Testing Library imports and add the same concrete
`createDeferred<T>()` helper already used by the service tests at the top of
`EventEditModal.test.tsx`.

Add `cancelQueries` to `setupLifecycleService`'s query-client mock and returned
harness. Add static source assertions that `saveEvent` does not consult
`eventRowIdByLocalId` or an `EventCreateIntent` to select the row being written.
Use the existing `readFileSync` pattern and isolate the exported function:

```ts
const serviceSource = readFileSync(resolve(
  process.cwd(),
  'src/features/events/services/events.service.ts',
), 'utf8');
const saveSource = serviceSource.slice(
  serviceSource.indexOf('export const saveEvent'),
  serviceSource.indexOf('export const deleteEvent'),
);
expect(serviceSource).not.toContain('type EventCreateIntent');
expect(serviceSource).not.toContain('eventCreateIntentByLocalId');
expect(saveSource).not.toContain('eventRowIdByLocalId');
```

Also cover missing `supabaseId`, missing `updatedAt` on an existing row, raw RLS
text mapping, and a same-session generation discard followed by one successful
fresh hydration; all pre-request failures must assert zero Supabase writes and
zero recovery reads. Rewrite the existing immediate-double-save regression so
the draft already contains `supabaseId: 'event-client-uuid-1'`; it must assert
one insert followed by one CAS update of that same UUID. Add a `23505` assertion
showing that duplicate-key recovery reads only the original UUID and never
surfaces the raw database message.

- [ ] **Step 2: Run event tests and confirm RED**

```bash
npm test -- src/features/events/services/events.service.test.ts src/components/modals/EventEditModal.test.tsx
```

Expected: local-ID reindex targets the wrong row, reset-era hydration commits old data, or double click calls save twice.

- [ ] **Step 3: Remove numeric create-intent identity and require UUID/CAS**

Delete `EventCreateIntent`, `eventCreateIntentByLocalId`, reservation cleanup and any use of `eventRowIdByLocalId` for choosing a write target. Use this decision inside the lifecycle queue:

```ts
const current = getLocalAppState().events.filter((row) => row.supabaseId === event.supabaseId);
if (!event.supabaseId || current.length > 1) throw new Error(EVENT_SAVE_CONFLICT_MESSAGE);
const existing = current[0];
const payload = await toSupabaseEventPayload(normalized);
if (existing) {
  if (!existing.updatedAt) throw new Error(EVENT_SAVE_CONFLICT_MESSAGE);
  result = await supabase
    .from('events')
    .update(payload)
    .eq('id', event.supabaseId)
    .eq('updated_at', existing.updatedAt)
    .select('id,updated_at,crew_filled')
    .single();
} else {
  if (event.updatedAt) throw new Error(EVENT_SAVE_CONFLICT_MESSAGE);
  result = await supabase
    .from('events')
    .insert({ id: event.supabaseId, ...payload })
    .select('id,updated_at,crew_filled')
    .single();
}
```

Keep `crew_filled` out of the save payload. Recovery loads by the exact UUID and uses canonical JSON equality; it never consults a numeric local ID to select a database row.
Change `eventSaveErrorCouldHaveCommitted` (or replace it with an operation-aware
predicate) so `23505` is recoverable only for an INSERT using the draft's
client UUID. Other integrity errors remain non-recoverable. A duplicate-key
recovery succeeds only when exactly one row with that UUID semantically matches
the requested create payload.

- [ ] **Step 4: Guard event hydration with generation and reset epoch before commit**

Add `eventsHydrationEpoch`. Keep `loadEventsLifecycleSnapshot()` pure. Capture both guards before awaiting and commit only when both still match:

```ts
const generation = getLifecycleSnapshotGeneration();
const epoch = eventsHydrationEpoch;
const snapshot = await loadEventsLifecycleSnapshot();
if (generation !== getLifecycleSnapshotGeneration() || epoch !== eventsHydrationEpoch) {
  return { committed: false, events: getLocalAppState().events ?? [] };
}
commitEventLifecycleSnapshot(snapshot);
return { committed: true, events: snapshot.events };
```

On generation discard, schedule one current-generation retry. On reset, increment the epoch, clear `eventsLoaded`, clear the tracked promise and row map, and cancel the event query. An old epoch must neither commit nor retry.

- [ ] **Step 5: Add a synchronous modal save lock**

Use a ref set before awaiting:

```ts
const saveInFlightRef = useRef(false);
const [isSaving, setIsSaving] = useState(false);
if (saveInFlightRef.current) return;
saveInFlightRef.current = true;
setIsSaving(true);
try { await saveEvent(draft); onClose(); }
finally { saveInFlightRef.current = false; setIsSaving(false); }
```

Disable save/close controls while saving without clearing the draft after failure.

- [ ] **Step 6: Run event GREEN and broader lifecycle tests**

```bash
npm test -- src/features/events/services/events.service.test.ts src/components/modals/EventEditModal.test.tsx src/views/EventDetailView.lifecycle.test.tsx src/features/uuid-write-flows.integration.test.ts
```

Expected: all tests pass, one UUID is used across retries, and old-session hydration never commits.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/features/events/services/events.service.ts src/features/events/services/events.service.test.ts src/components/modals/EventEditModal.tsx src/components/modals/EventEditModal.test.tsx
git commit -m "fix: persist event drafts by client UUID"
```

### Task 3: Make Receipt Writes UUID-Only and Receipt Hydration Reset-Safe

**Files:**
- Modify: `src/features/receipts/services/receipts.service.ts`
- Modify: `src/features/receipts/services/receipts.service.test.ts`
- Modify: `src/components/modals/ReceiptEditModal.tsx`
- Modify: `src/components/modals/uuid-contractor-modal-identity.test.tsx`
- Modify: `src/features/uuid-write-flows.integration.test.ts`

- [ ] **Step 1: Write failing receipt identity, event-link and reset tests**

Extend `setupReceiptCreateIntentHarness` with the same concrete `setSnapshot`
callback used by the event harness. Make the insert mock return a `23505`
duplicate-key error without replacing `authoritativeReceiptRow` when the same
UUID is inserted again. Keep its existing `update`, `receiptsOrder`, and
authoritative-row mocks, then add:

```ts
it('never redirects a receipt retry after local ids are reindexed', async () => {
  const harness = await setupReceiptCreateIntentHarness({
    loseFirstInsertResponse: true,
    failFirstRecovery: true,
  });
  const draft = {
    ...newReceiptDraft(),
    supabaseId: 'receipt-client-uuid-1',
    eventSupabaseId: 'event-row-1',
  };
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  await expect(harness.service.saveReceipt(draft))
    .rejects.toThrow('Účtenku se nepodařilo uložit.');
  harness.setSnapshot((snapshot) => ({
    ...snapshot,
    receipts: [{
      ...newReceiptDraft(), id: draft.id, supabaseId: 'receipt-row-other', updatedAt: 'v-other',
    }],
  }));

  const recovered = await harness.service.saveReceipt(draft);

  expect(harness.insert).toHaveBeenCalledTimes(2);
  expect(harness.insert.mock.calls.map(([payload]) => ({
    id: payload.id,
    eventId: payload.event_id,
  }))).toEqual([
    { id: draft.supabaseId, eventId: draft.eventSupabaseId },
    { id: draft.supabaseId, eventId: draft.eventSupabaseId },
  ]);
  expect(harness.update).not.toHaveBeenCalled();
  expect(recovered.supabaseId).toBe(draft.supabaseId);
  consoleError.mockRestore();
});

it('does not commit receipt rows from a hydration started before reset', async () => {
  // Reuse the existing firstReceipts deferred-query setup from the
  // generation-discard test, but reset the service before resolving it.
  expect(getReceipts()).toEqual([]);
  await vi.waitFor(() => expect(receiptsOrder).toHaveBeenCalledOnce());
  resetSupabaseReceiptsHydration();
  snapshot = createSnapshot({ receipts: [] });
  firstReceipts.resolve({ data: [canonicalRow], error: null });
  await firstReceipts.promise;
  await Promise.resolve();

  expect(snapshot.receipts).toEqual([]);
  expect(setQueryData).not.toHaveBeenCalled();
  expect(cancelQueries).toHaveBeenCalledWith({ queryKey: ['receipts'] });
  expect(receiptsOrder).toHaveBeenCalledOnce();
});

it('stores the selected stable event UUID before saving', () => {
  mockAppContext.editingReceipt = {
    id: 1,
    supabaseId: 'receipt-client-uuid',
    contractorProfileId: 'profile-uuid-1',
    eid: 1,
    eventSupabaseId: 'event-a',
    job: 'A',
    title: 'Taxi',
    vendor: 'Bolt',
    amount: 300,
    paidAt: '2026-04-21',
    note: '',
    status: 'draft',
  };
  mockReceiptDependencies.events = [
    { id: 1, supabaseId: 'event-a', job: 'A', name: 'Event A', startDate: '2026-04-20', endDate: '2026-04-20' },
    { id: 2, supabaseId: 'event-b', job: 'B', name: 'Event B', startDate: '2026-04-21', endDate: '2026-04-21' },
  ];
  render(<ReceiptEditModal />);
  fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: '2' } });
  expect(setEditingReceipt).toHaveBeenCalledWith(expect.objectContaining({
    eid: 2,
    eventSupabaseId: 'event-b',
    job: 'B',
  }));
});
```

Add `cancelQueries` to the receipt query-client mock. Add the receipt modal's
native same-render double-click test. Hoist a `saveReceiptMock`, return it from
the existing receipt service mock, and use this exact assertion shape:

```ts
const pending = createDeferred<ReceiptItem>();
saveReceiptMock.mockReturnValue(pending.promise);
render(<ReceiptEditModal />);
const saveButton = screen.getByRole('button', { name: 'Uložit účtenku' });
saveButton.click();
saveButton.click();
expect(saveReceiptMock).toHaveBeenCalledOnce();
expect(saveReceiptMock).toHaveBeenCalledWith(expect.objectContaining({
  supabaseId: 'receipt-client-uuid',
  eventSupabaseId: 'event-a',
}));
await act(async () => pending.reject(new Error('Účtenku se nepodařilo uložit.')));
expect(setEditingReceipt).not.toHaveBeenCalledWith(null);
```

Add the concrete `createDeferred<T>()` helper at the top of the modal test and
reset `saveReceiptMock` in `beforeEach`. Add fail-closed tests for missing
receipt UUID, event UUID or canonical version; each must assert that `insert`,
`update`, the transition RPC, delete, and recovery select remain untouched. Add
raw RLS message mapping assertions alongside the existing stable Czech error
tests.

Add a static contract next to the current no-positional-helper test:

```ts
expect(serviceSource).not.toContain('type ReceiptCreateIntent');
expect(serviceSource).not.toContain('receiptCreateIntentByLocalId');
const saveSource = serviceSource.slice(
  serviceSource.indexOf('export const saveReceipt'),
  serviceSource.indexOf('export const deleteReceipt'),
);
expect(saveSource).not.toContain('.find((receipt) => receipt.id === updated.id)');
```

Rewrite the existing immediate-double-save receipt regression with an explicit
`supabaseId`. It must assert one insert, then one versioned update of that UUID;
the UUID allocator is exercised by `createEmptyReceipt`, not inside
`saveReceipt`. Keep the deliberate-delete/new-draft regression and assert that
the new factory call receives a different UUID.

- [ ] **Step 2: Run receipt tests and confirm RED**

```bash
npm test -- src/features/receipts/services/receipts.service.test.ts src/components/modals/uuid-contractor-modal-identity.test.tsx src/features/uuid-write-flows.integration.test.ts
```

Expected: a numeric-ID fallback redirects the retry, receipt selection omits `eventSupabaseId`, or an old epoch commits stale rows.

- [ ] **Step 3: Remove receipt numeric intent/fallbacks and require stable foreign identity**

Delete `ReceiptCreateIntent`, `receiptCreateIntentByLocalId`, inactive-intent cleanup and any local-ID fallback used to choose a database receipt. Resolve only by UUID inside the queue:

```ts
if (!updated.supabaseId || !updated.eventSupabaseId) throw new Error(RECEIPT_INVALID_ERROR);
const matches = snapshot.receipts.filter((row) => row.supabaseId === updated.supabaseId);
if (matches.length > 1) throw new Error(RECEIPT_WRITE_CONFLICT_ERROR);
const existing = matches[0];
if (existing && !existing.updatedAt) throw new Error(RECEIPT_WRITE_CONFLICT_ERROR);
if (!existing && updated.updatedAt) throw new Error(RECEIPT_WRITE_CONFLICT_ERROR);
const payload = {
  contractor_id: updated.contractorProfileId,
  event_id: updated.eventSupabaseId,
  job_number: updated.job,
  name: updated.title,
  supplier: updated.vendor,
  amount: updated.amount,
  paid_at: updated.paidAt,
  note: updated.note,
};
const result = existing
  ? await supabase.from('receipts').update(payload)
      .eq('id', updated.supabaseId)
      .eq('updated_at', existing.updatedAt!)
      .eq('status', existing.status)
      .select('id,updated_at,event_id,status').single()
  : await supabase.from('receipts').insert({ id: updated.supabaseId, ...payload, status: 'draft' })
      .select('id,updated_at,event_id,status').single();
```

For update/delete/status require the canonical `updatedAt`. For create insert the draft UUID. On ambiguous error, load and compare only that UUID. Never derive `event_id` from current event ordering; use the draft's `eventSupabaseId` and require exactly one current matching event.

- [ ] **Step 4: Move receipt epoch/generation checks before commit**

Make the loader pure and return rows only. Capture generation and `receiptsHydrationEpoch` before awaiting. Check both immediately before `commitReceiptsSnapshot`. A same-session generation discard retries; an epoch discard does not. Reset increments the epoch, clears loaded/promise state and cancels the receipt query before old data can commit.

- [ ] **Step 5: Persist event UUID and add modal in-flight protection**

When the selection changes, store:

```ts
setEditingReceipt({
  ...editingReceipt,
  eid: event.id,
  eventSupabaseId: event.supabaseId,
  job: event.job,
});
```

Use the same ref-based lock as the event modal. Preserve the UUID-bearing draft after failure.

- [ ] **Step 6: Run receipt GREEN and cross-feature tests**

Run the Step 2 command, then:

```bash
npm test -- src/features/invoices/services/invoices.service.test.ts src/features/timelogs/services/timelogs.service.test.ts src/views/ReceiptsView.test.tsx
```

Expected: all tests pass and invoice/timelog consumers retain exact receipt UUID/version behavior.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/features/receipts/services/receipts.service.ts src/features/receipts/services/receipts.service.test.ts src/components/modals/ReceiptEditModal.tsx src/components/modals/uuid-contractor-modal-identity.test.tsx src/features/uuid-write-flows.integration.test.ts
git commit -m "fix: persist receipt drafts by client UUID"
```

### Task 4: Review, Documentation and Release Gates

**Files:**
- Modify: `docs/superpowers/specs/2026-08-18-stable-draft-identities-design.md`
- Modify: `docs/superpowers/specs/2026-08-17-atomic-timelog-mutations-design.md`
- Modify: `docs/superpowers/plans/2026-08-17-atomic-timelog-mutations.md`
- Modify: `docs/superpowers/plans/2026-08-17-timelog-assignment-lifecycle.md`

- [ ] **Step 1: Run the complete focused release matrix**

```bash
npm test -- \
  src/features/stable-draft-identity.test.ts \
  src/features/events/services/events.service.test.ts \
  src/features/receipts/services/receipts.service.test.ts \
  src/features/uuid-write-flows.integration.test.ts \
  src/components/modals/EventEditModal.test.tsx \
  src/components/modals/uuid-contractor-modal-identity.test.tsx \
  src/features/invoices/services/invoices.service.test.ts \
  src/features/timelogs/services/timelogs.service.test.ts \
  src/views/EventDetailView.lifecycle.test.tsx \
  src/views/ReceiptsView.test.tsx
```

Expected: zero failures.

- [ ] **Step 2: Run independent spec and code-quality reviews**

The spec reviewer must verify every requirement in `2026-08-18-stable-draft-identities-design.md`, including reset races and the absence of numeric write identity. Only after `SPEC APPROVED` may the code-quality reviewer inspect concurrency, error mapping, test realism and unnecessary complexity. Every Critical/Important finding returns to the implementer with a new RED test and another review cycle.

- [ ] **Step 3: Update release documentation to the actual contract**

Mark the stable-identity design implemented. Replace the obsolete seven-RPC text with the exact current contract: 13 endpoints, 9 `SECURITY DEFINER`, 4 `SECURITY INVOKER`, and 5 catalog-verified helpers. Document event/receipt client UUIDs, reset epochs, exact CAS and the schema-first deployment gate. Remove Markdown trailing whitespace.

- [ ] **Step 4: Run global local gates**

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
git diff --check 1962eab..HEAD
git status --short
```

Expected: feature tests are green; only the already isolated Fleet/Warehouse baseline failures may remain in the full suite, lint has zero errors, TypeScript/build/diff-check pass, and the worktree is clean.

- [ ] **Step 5: Commit documentation**

```bash
git add docs/superpowers/specs/2026-08-18-stable-draft-identities-design.md docs/superpowers/specs/2026-08-17-atomic-timelog-mutations-design.md docs/superpowers/plans/2026-08-17-atomic-timelog-mutations.md docs/superpowers/plans/2026-08-17-timelog-assignment-lifecycle.md
git commit -m "docs: finalize stable lifecycle rollout"
```

- [ ] **Step 6: Keep deployment blocked until schema-first verification**

After local review gates, use the Supabase CLI help-discovered commands to reconcile remote migration history in the isolated preflight directory, run `db push --dry-run`, inspect the exact migration set, and only then request/perform the production schema push. Run the rollback verifier under real `authenticated` role, advisors, duplicate/constraint/policy/ACL invariants and the Red Bull canonical-row smoke check before any frontend deployment.
