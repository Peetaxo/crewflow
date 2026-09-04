# Mobile event form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved fullscreen mobile create/edit form with visible required contact, event boundaries, day-first optional phases and working approver configuration.

**Architecture:** Pure form-state helpers own calendar-date phase planning and serialization; a focused day planner component renders that state. The existing modal retains its stable draft identity, project/map integration and asynchronous save protections, while its presentation becomes a fullscreen accessible dialog on mobile. Only explicitly saved forms activate schedule v2; existing actual hours remain untouched.

**Tech Stack:** React 18 / TypeScript, existing Radix Dialog, date-fns, CSS theme tokens, Vitest / Testing Library / Playwright.

---

## Prerequisites

Both schedule-persistence and targeted-event-approval tasks are implemented, tested and independently reviewed. Do not deploy a form producing empty daily shifts against old database RPCs. Do not modify the standalone approved HTML mockup or replace actual app data with mock fixtures.

## Task 1: Draft-state and validation helpers

**Files:**
- Create `src/features/events/services/event-form-state.ts` and `.test.ts`.
- Modify `src/features/events/services/events.service.ts` and tests for v2 new/copy/validation behavior.

- [ ] RED tests: boundary ordering, date-key preservation across shortened/restored ranges, disabled/re-enabled planner, free-day roundtrip, multiple and repeated phases, untimed/partial/overnight/equal phase intervals, preparation preservation, saved slots outside range, legacy initialization, DST across Europe/Prague spring/fall dates.

```ts
export interface EventFormPhase {
  id: string;
  type: TimelogType;
  from: string;
  to: string;
  showTimes: boolean;
}
export interface EventFormDay {
  free: boolean;
  phases: EventFormPhase[];
}
export type EventFormPlan = Record<string, EventFormDay>;
// A missing key or empty phases means “Zatím neurčeno”, never a free day.
```

- [ ] Implement exported `getEventFormDates(startDate, endDate): string[]`, `createEventFormPlan(event): EventFormPlan`, `serializeEventFormPlan(event, plan): Pick<Event,'phaseSchedules'|'dayTypes'|'freeDays'>`, and `validateEventForm(event, plan): void`. Use parseISO/addDays/format on local calendar dates, not the legacy DST-sensitive `getDatesBetween`. Reject invalid/reversed boundaries. Enumeration returns an empty array for incomplete input, never loops on invalid dates.

Initialization clones explicit slots by actual date and preserves IDs, times and all four phase types. The modal may pass an event with `normalizeEventSchedules` applied once for legacy initialization to materialize existing daily defaults; new v2 unknown days remain empty. Keep form-state helpers independent of events.service to avoid a circular import when event saving calls validation. Multi-date saved slots can split into date-specific draft rows with stable derived IDs. Serialization emits only dates within the active term; free days suppress stored active shifts but their draft phases remain cached. If the phase toggle is off, preserve its cached values in the draft, but `showDayTypes:false` makes all of them inactive. Hidden partial fields are validated only when active.

- [ ] Validation uses `parseTimeToMinutes`. Required fields: Job Number, event name, client, valid start/end dates/times, trimmed contact identity (linked profile preferred; legacy free-text snapshot allowed). Validate needed crew as nonnegative integer. Same-day boundary requires end > start; different days allow any valid clock values so long as complete datetime end is later. Phase clocks are optional as a pair, complete unequal clocks support overnight; errors identify date and phase. Contact selection never changes roles. A selected profile without a COO account is a saved intended contact, not an authenticated approver; handoff remains guarded by the approval RPC.

```ts
const from = parseTimeToMinutes(phase.from);
const to = parseTimeToMinutes(phase.to);
const hasAnyTime = Boolean(phase.from || phase.to);
if (hasAnyTime && (from === null || to === null || from === to)) {
  throw new Error(`Doplňte platné časy fáze pro ${date}.`);
}
```

- [ ] New events set scheduleVersion2, freeDays[], contactApprovesHours true and no invented phases. Copies shift freeDays by the same calendar offset as phase schedules/dayTypes; never retain the source's unshifted free dates. Event save enforces v2 boundary/contact/phase validation as well as UI validation, without applying the new requirement to untouched legacy records or changing historical dresscode. `applyEventDraft` must not synthesize global phase times for v2. Verify saved event changes leave all existing actual timelog rows untouched (including drafts and dates now outside the event term).

- [ ] Run focused helpers/service tests then full tests/build. Commit task files; independent spec review then code quality review.

## Task 2: Day planner and accessible fullscreen form

**Files:**
- Create `src/features/events/components/EventDayPlanner.tsx` and tests.
- Create `src/features/events/components/event-edit-form.css`.
- Refactor `src/components/modals/EventEditModal.tsx` and tests.
- Modify `src/features/events/components/EventAddressField.tsx` and `EventLocationPickerModal.tsx` only for scoped accessibility/stacking if required.
- Modify parent create/edit mode props in `src/views/EventsView.tsx` / `EventDetailView.tsx` if needed.

- [ ] RED component tests for one day vs multiple days, required visible contact, toggle label, visible optional description/meeting place, absent dresscode, empty map not rendered, and correct new/edit labels. Preserve existing project-fill and async draft-switch/unmount/save-race regression tests. Update assertions only where the approved design intentionally changes labels/layout/validation.

- [ ] Build EventDayPlanner as controlled `dates`, `plan`, `onChange` component. Render chronological date + Czech weekday and a native accessible phase select for each day. Options: Zatím neurčeno, Instalace, Provoz, Deinstalace, Volný den. Include Přípravy when existing data uses it; never silently drop it. Active phases offer “Doplnit časy”; revealing inputs does not set a time. Each phase uses labelled Od/Do, optional next-day hint if end < start, and remove control. “Přidat další fázi” adds one blank-time phase row without duplicating all phases. Free day hides time/add controls while retaining the prior draft row in memory.

- [ ] The modal keeps a per-draft plan cache keyed by stable UUID/local ID; changing dates does not recreate the cache from only currently visible dates. Keep previous multi-day end date across off/on; cache clears only when the draft identity changes or the form closes. Parent controlled draft edits must not overwrite internal cached slots because global times changed. Opening another draft during an async request must retain all existing stale-response protection.

- [ ] Fullscreen shell on widths below768; desktop remains a centered responsive dialog. Use existing Radix primitives directly where needed for focus trapping, title, Escape and body scroll lock without altering every shared dialog. Dialog portal must be above the role-switcher (z90); use form overlay/content z100/101 and nested confirmation/map overlay above it. Do not remove or change the development switch.

```css
.nodu-event-edit {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--nodu-text);
  background: rgb(var(--nodu-surface-rgb));
}
.nodu-event-edit__body { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.nodu-event-edit input, .nodu-event-edit select, .nodu-event-edit textarea {
  min-width: 0;
  max-width: 100%;
  font-size: 16px;
}
@media (max-width: 767px) {
  .nodu-event-edit {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100dvh;
    max-width: none;
    max-height: none;
    border-radius: 0;
    transform: none;
  }
  .nodu-event-edit__header { padding-top: max(16px, env(safe-area-inset-top)); }
  .nodu-event-edit__footer { padding-bottom: max(16px, env(safe-area-inset-bottom)); }
}
```

Use theme variables for all surfaces, minimum44px controls, modest section spacing and human-readable Czech labels rather than dense tracked uppercase labels. Account for visualViewport resizing only if real keyboard testing shows dvh alone is insufficient; cleanup any listener and scope it to the dialog. The header/footer must remain reachable with the keyboard open. Avoid auto-focusing a mobile text field that opens the keyboard on mount.

- [ ] Main field order: event name/project/client, date section, place, contact + phone and approver toggle, needed crew, optional description and meeting place, advanced settings. Compact related date/time controls may share a row but must fit320px. “Více dní” groups first-date/start-time under “Začátek akce”, last-date/end-time under “Konec akce”; one-day mode shows one date and start/end clocks. Phase planner remains under advanced settings with exact toggle “Rozdělit akci na fáze”. Existing crew time proposal toggle remains, no phase self-application.

- [ ] Load contact options via the reviewed approval service with pending/error/retry states; no silent empty options on load error. Required contact is always visible. Selecting an option fills profile ID/name/phone snapshot without granting roles. Preserve a historical unlinked name as a readable/editable contact option; allow explicit manual contact name/phone for a person not onboarded, but do not pretend that text is an approval identity. “Schvaluje také hodiny” is visible and defaults true on new drafts. Off reveals the separate intended approver; cache that selection when turning on again. Mark a selected person without approval access with concise “Schvalování bude dostupné po připojení účtu COO.” No CH workflow paragraphs or additional-approver instructions in the form.

- [ ] Save validates before any remote write. If saved phase dates would be discarded because the range shrank, show a confirmation listing those dates; cancel preserves draft and writes nothing. Removing/canceling the form with changed values asks to discard, unless currently saving. Preserve existing request token/mounted/draft identity checks, fieldset disabled, duplicate-save guard and address-resolution wait. On failure keep form/draft and show the error. Successful same-draft save closes; stale earlier-draft completion cannot close the new one.

- [ ] Show map preview only when both valid coordinates exist, but keep address entry and “Vybrat na mapě” reachable. Verify map picker stays above the form and its buttons can receive focus; no modal focus trap blocks map controls. Footer primary labels “Vytvořit akci” / “Uložit akci”, header “Nová akce” / “Upravit akci”. Determine create/edit from canonical persisted identity, not UUID existence alone (new drafts already have UUIDs).

- [ ] Component tests for toggle/range/free-day caching, day/date phase preservation, overnight hint and validation, required contact, unavailable approver warning, manual historical contact, visible optional fields, no historical dresscode deletion, save failure/duplicate/stale-draft guards, discard confirmations, semantic labels/dialog and map layering. Run full tests/build and scoped lint, independent spec then quality review, commit.

## Task 3: Integration and development installations

**Files:** verification notes in `docs/superpowers/plans/2026-09-04-mobile-event-form-preflight.md`; no live fixture data.

- [ ] Run the actual app from this worktree in local/demo mode with isolated browser storage; inspect320/360/414 widths, light/dark, long names, planner scroll, keyboard/focus, header/footer and no horizontal overflow. Use synthetic local data only. Capture before/after screenshots of the real form, not the standalone prototype. Preserve any user's active browser form by testing in a fresh tab/session.
- [ ] Repeat all SQL migration tests against fresh schema-only baseline plus migrations, inspect new RLS/function ACLs and run advisors. Apply only the reviewed additive migrations to the linked development project once. No synthetic live users/reports. Recheck schema metadata and advisor deltas read-only after application.
- [ ] Run full tests and build, obtain final independent feature review. Integrate to main preserving pre-existing edits in TimelogsView and its test; verify merged main, synchronize origin/main as required by AGENTS.md. If the main checkout is dirty, use a separate clean checkout for device refresh and preserve ignored .env.local without exposing its contents.
- [ ] Load iOS skill and run `npm run ios:refresh:devices` after synchronization. Report simulator and paired iPhone separately; unavailable paired phone is waiting, available-device build/sign/install/launch failure is blocking. Final response describes only verified deployed results and any remaining account-onboarding limitation.
