# Event Shift Workflow Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create shared-shift links from Akce, edit existing links from an event detail, and make crew-detail summaries read-only and assignment-specific.

**Architecture:** Retain the existing membership RPC, gateway, selection-impact checks and shared evidence/approval mechanism. Separate global management loading and candidate selection from the personal assignment reader. Own dialogs in keyed, abortable management sessions so navigation or identity changes retire all callbacks.

**Tech Stack:** React, TypeScript, existing shadcn Dialog/Button, TanStack Query snapshot hook, Supabase/local gateways, Vitest and React Testing Library, Capacitor iOS.

---

## Approved scope and baseline

The Czech spec is `docs/superpowers/specs/2026-10-09-event-shift-workflow-management-design.md`. The user approved the final list-first placement and event-detail edit shortcut. No schema migration, invoice selection, authorization expansion or business-data conversion is permitted. Use existing branch/worktree `codex/shared-crew-workflow-plan` at `/Users/peetax/Projekty/crewflow/.worktrees/shared-crew-workflow`; do not touch the three unrelated dirty files in the original checkout. Main application baseline is `cc4f36f`; design-only commit is `eee53dd`. Existing focused management tests pass 44 tests in four files. The actual app typecheck has 112 baseline diagnostics; compare normalized diagnostics, not only counts.

## Task 1 Global management and read-only personal overview

This is one integrated task: the editor, owners and routes share one changed contract and must ship together. Keep components focused; do not refactor unrelated event layouts.

**Files:**
- Modify: `src/features/shift-workflows/shift-workflows.management.ts` and its `.test.ts`.
- Modify: `src/features/shift-workflows/shift-workflows.management-loader.ts` and its `.test.ts`.
- Modify: `src/features/shift-workflows/ShiftWorkflowEditor.tsx` and its `.test.tsx`.
- Create: `src/features/shift-workflows/EventShiftWorkflowManagement.tsx` and `.test.tsx` for global create and event-detail edit owners.
- Refactor/retire: `src/features/shift-workflows/CrewShiftWorkflowManagement.tsx`, `ShiftWorkflowManagementContext.ts`, and `ShiftWorkflowSummary.tsx`. Keep the existing file/module if it can become a clearly documented read-only personal provider; do not retain a working management action under another label.
- Modify: `src/views/EventsView.tsx`, `EventDetailView.tsx`, `CrewDetailView.tsx`.
- Modify: `src/views/CrewDetailView.shift-workflows.test.tsx`.
- Create: `src/views/EventsView.shift-workflows.test.tsx` and `EventDetailView.shift-workflows.test.tsx` using the actual feature components; mock only unavoidable application/query boundaries.

- [x] **Step 1 Write failing behavior tests before implementation.** Extend existing fixtures with unassigned events and two different people, then assert global candidate selection and personal intersection separately. Desired global helper takes no person ID:

```ts
it('offers identified events without a common crew member', () => {
  const input = data();
  input.eventCrewAssignments = [];
  expect(getEventWorkflowCandidates(input, scope).map(({ id }) => id))
    .toEqual([id(21), id(22), id(23), id(24), id(25)]);
});
```

Add behavioral tests for CH/COO list create button, empty initial selection and disabled save below two members; existing event-detail edit preselects the entire group; name/job search does not change selected IDs; full membership submit uses the actual selection builder. Assert crew-detail summary is not a button and never includes an unassigned third event, even if a historical report exists. Test role/account/event changes during loading, save and refresh; retired callbacks must not close a new dialog or publish old content. Preserve conflict refresh/review, exact ambiguous retry, source-remnant and invoice/history tests.

- [x] **Step 2 Observe RED using the supported runner loader.**

```sh
node --input-type=module -e 'globalThis.__dirname=process.cwd();process.argv=["node","vitest","run","src/features/shift-workflows","src/views/CrewDetailView.shift-workflows.test.tsx","src/views/EventsView.shift-workflows.test.tsx","src/views/EventDetailView.shift-workflows.test.tsx","--maxWorkers=1","--configLoader=runner"];await import("./node_modules/vitest/vitest.mjs");'
```

Confirm new assertions fail because the list entry/global candidates/read-only overview are absent, not because of malformed fixtures. Add and test new symbols incrementally if an initially missing import prevents a behavioral assertion. Record the observed RED output.

- [x] **Step 3 Implement global data and personal member selection.** Add `getEventWorkflowCandidates(data, scope)` which returns every identified visible event sorted by date/name/ID, independent of assignments. Keep the underlying identified-event source and existing impact/version checks. Add a personal member helper, `getCrewWorkflowMembers(data, scope, profileId, eventId)`, which resolves the event's workflow, intersects its IDs with current authoritative assignments for that profile, resolves visible event records, and never infers assignment from timelogs. The remote branch requires canonical event UUIDs; local numeric IDs are translated with the existing local identity helper. Return no personal group when the anchor event is not currently assigned.

Add `loadEventShiftWorkflowManagementData(scope, readSnapshot, signal)` without a profile argument or assignment-table read:

```ts
export async function loadEventShiftWorkflowManagementData(
  scope: ShiftWorkflowScope, readSnapshot: () => Promise<ShiftWorkflowSnapshot>, signal: AbortSignal,
): Promise<ShiftWorkflowManagementData> {
  const assertAccess = () => {
    if (signal.aborted || !canManageShiftWorkflows(scope.role)) {
      throw new ShiftWorkflowError('denied', 'Přístup k propojeným směnám se změnil.');
    }
  };
  assertAccess();
  const [snapshot, events, timelogs, invoices] = await Promise.all([
    readSnapshot(), fetchEventsSnapshot(), fetchTimelogsSnapshot(), fetchInvoicesSnapshot(),
  ]);
  assertAccess();
  return { snapshot, events, timelogs, invoices, eventCrewAssignments: [] };
}
```

Do not modify `readShiftWorkflowManagerAssignments`: it is also used by shared evidence and remains authoritative for the personal overview. Existing personal loading may be retained with its profile/role/abort checks.

- [x] **Step 4 Update the shared editor contract and search.** Remove the crew-person requirement from editor management props and candidate selection. New creation initializes `eventIds=[]`; existing editing initializes every stored member. Key editor lifetime by captured auth/data scope, workflow ID and owner context (list versus event ID). Preserve its in-flight/activation guards, stable request UUID, exact retry command, full affected versions and explicit refresh review.

Add one labelled input **Hledat směnu nebo jobnumber**. Derive the displayed candidates from the full identified set and the query, while always retaining selected/missing IDs for review. Selection state is independent of search, list calendar/filter and fetched snapshot refresh. Preserve the original impact warnings, different-job/project and move confirmations, unlink/dissolve explanation and blocked reasons. Replace the empty-person message with **Nejsou dostupné směny k propojení.** No automatic grouping or save on close.

- [x] **Step 5 Implement management owners and route placement.** `EventShiftWorkflowManagement.tsx` exports `EventShiftWorkflowCreateAction` for the main list and `EventShiftWorkflowDetails` accepting an `Event` for existing-group overview/edit. Use the existing `useShiftWorkflows` scope and readiness boundary. Management is CH/COO-only; do not rely on broad `role !== 'crew'`. Initial/load errors must not make unrelated view content unusable; provide read retry and fail closed for edit/save. Each open loads authoritative management data, and the keyed session owns one abort controller plus request version and the selected editor snapshot.

Route integration is intentionally small:

```tsx
// EventsView management toolbar; visible on mobile as well as desktop.
<EventShiftWorkflowCreateAction />

// EventDetailView mobile and desktop layouts; existing linkage overview only.
<EventShiftWorkflowDetails event={event} />
```

The list action is labelled **Propojit směny**, beside management actions, without reusing the floating new-event button. Hide/retire list dialogs when an event detail opens. Event detail shows the linked names/jobnumbers/dates and **Upravit propojení**, reusing the same editor. It does not expose a new create action for an unlinked event. On event-detail navigation the old owner unmounts/rekeys, including mobile event-to-event navigation.

- [x] **Step 6 Make crew detail read-only.** Remove `CrewShiftWorkflowActions` from imports and rendering, and remove every save/edit dialog route from its provider/summary. The personal provider captures profile plus auth/data scope and reloads current assignments, never display-derived historical assignments. Render each card's own assigned intersection as noninteractive **Společná evidence: [assigned names]**. If only the anchor is assigned, show only that member, not the unassigned group size. Do not add invoice-selection controls in this change.

- [x] **Step 7 Verify GREEN and self-review, then commit the integrated change.** Run the focused command above plus all existing event view/lifecycle and shared editor/approval tests. Check no new schema, dependencies, storage writes, role mutations or invoice APIs were added. Run `git diff --check`. Commit only task files with `feat: manage shared shifts from events and show personal summaries`.

- [x] **Step 8 Two-stage independent review.** First a fresh spec reviewer checks all acceptance cases against actual code and tests. Resolve and re-review all gaps before a fresh quality reviewer checks architecture, ownership/abort boundaries, reliable fixtures, complete sets and regressions. Do not trust the implementer report as proof. A final full-change review is required before main integration.

## Task 2 Acceptance documentation and rollout verification

**Files:** update `docs/testing/shared-shifts-acceptance-cs.md` and add `docs/testing/2026-10-09-event-shift-workflow-verification.md` after real results.

- [x] Update the manual entry path to **Akce → Propojit směny**, with no requirement for a person assigned to all selected events. Add existing-event edit and personal read-only checks; retain progressive drafts, shared approval, correction/confirmation, invoice non-creation and role retirement cases.
- [x] Run the full suite with one worker and runner loader. Expected: all previous tests and new tests pass; baseline was 143 files / 1,703 tests before this task.
- [x] Run web build with runner loader and focused ESLint. Run actual `tsc -p tsconfig.app.json --noEmit`; compare normalized file/message diagnostics with `/private/tmp/crewflow-event-workflows-20261009-types-before.txt`. Existing diagnostics are not a green global typecheck.
- [x] Visually inspect real mobile/desktop feature UI with synthetic local-only fixtures if needed; do not save test memberships or approvals into real Staff business data. Verify actual list create, search, existing edit and personal summary controls.
- [ ] Integrate the reviewed branch into the existing clean rollout checkout `/Users/peetax/Projekty/crewflow-shared-rollout-20261008`, reverify merged code, push/synchronize `main`, and preserve original dirty files and ignored `.env.local`.
- [ ] Run `npm run ios:refresh:devices` with needed system access and intact preflight. If default Vite config bundling reproduces its known stall, terminate only the validated task-owned process and use the previously verified process-scoped runner loader. Verify real simulator UI after launch. Report physical iPhone separately; missing device is waiting, available-device failure is blocking.
- [ ] Record final results, limits and commits; commit documentation and report actual installed behavior. No Staff migration or business-data mutation is part of this rollout.
