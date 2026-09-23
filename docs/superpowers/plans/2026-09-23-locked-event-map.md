# Locked Event Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Protect the event location from accidental changes by opening the existing picker from a read-only preview.

**Architecture:** Keep MapLibre's existing read-only mode, add an accessible edit trigger inside the preview, and route both form triggers to the same picker. The picker retains its own draft and commits coordinates only on confirmation. Capture the actual opener for focus restoration; leave event detail and data services unchanged.

**Tech Stack:** React 18, TypeScript, Radix Dialog, MapLibre, Vitest/Testing Library, Capacitor.

## Task 1: Locked preview and picker integration

**Files:**
- Modify `src/components/modals/EventEditModal.tsx` — preview props and picker opener ref.
- Modify `src/features/events/components/EventMapPreview.tsx` — optional accessible edit trigger, no change to unrelated consumers.
- Modify `src/features/events/components/event-edit-form.css` — edit trigger placement and focus; keep attribution operable.
- Create `src/components/modals/EventEditModal.map.test.tsx` — real modal/preview/picker integration with MapLibre boundary mock.
- Modify `src/features/events/components/EventMapPreview.test.tsx` if component-level checks are needed.

- [x] Add failing integration tests. Render an Event with coordinates `{ locationLat: 50.0929, locationLng: 14.4502 }`; assert preview Map constructor receives `interactive: false` and no `moveend` location handler. The new trigger must be a button named `Upravit polohu`, type `button`, with `aria-haspopup="dialog"`. Click it, assert picker constructor center `[14.4502, 50.0929]` and `interactive: true`; simulate picker `moveend` to `{ lat: 49.1951, lng: 16.6068 }`. Confirm and assert draft receives only the new coordinates; cancellation by Zrušit/X/Escape must preserve the old pair. Assert focus returns to preview trigger or original map button depending on opener. Test saved-address and map-confirmed preview paths and disabled saving state. Do not mock EventMapPreview or EventLocationPickerModal in these integration tests.

```tsx
const opener = screen.getByRole('button', { name: 'Upravit polohu' });
expect(opener).toHaveAttribute('type', 'button');
expect(opener).toHaveAttribute('aria-haspopup', 'dialog');
fireEvent.click(opener);
expect(screen.getByRole('dialog', { name: 'Vybrat polohu' })).toBeInTheDocument();
```

- [x] Run `npm test -- src/components/modals/EventEditModal.map.test.tsx --reporter=dot`; confirm failure is the missing locked/edit-trigger behavior, not a broken mock.
- [x] Implement optional preview prop `onEdit?: (opener: HTMLButtonElement) => void`. Render an overlay native button inside `.nodu-event-map-preview` when supplied, with text `Upravit polohu`; keep map attribution above the trigger and keyboard accessible. Reuse that trigger for unavailable-map fallback too. Keep editable support unchanged for consumers that request it. The form must stop passing `editable` and `onLocationChange` and pass `onEdit` instead.

```tsx
const mapPickerOpenerRef = useRef<HTMLButtonElement | null>(null);
const openLocationPicker = (opener: HTMLButtonElement | null) => {
  mapPickerOpenerRef.current = opener;
  setIsLocationPickerOpen(true);
};
// Address button:
onPickMap={() => openLocationPicker(mapButtonRef.current)}
// Read-only preview:
onEdit={openLocationPicker}
// Picker close:
onCloseAutoFocus={() => restoreFocus(mapPickerOpenerRef.current, mapButtonRef.current ?? titleRef.current)}
// Native preview action (inside the preview, not wrapping interactive attribution):
<button type="button" aria-haspopup="dialog" onClick={(event) => onEdit(event.currentTarget)}
  className="event-form-map-preview-edit"><span>Upravit polohu</span></button>
```

- [x] Run integration, existing form, preview, picker and address tests, and scoped lint. Run full `npm test -- --reporter=dot` and `npm run build`. Review exact diff and commit only scoped files.
- [x] Independent spec review followed by quality review. Address findings before integration.

## Task 2: Main-agent verification and delivery

- [x] Use a local-only preview; check 390px and desktop, scroll without changing pin, click and Enter/Space open picker, cancel and confirm, focus and attribution. Do not modify live data or roles.
- [x] Integrate into main without disturbing user changes in TimelogsView/test and Info.plist; verify synchronized main in clean device checkout.
- [x] Run `npm run ios:refresh:devices` with preserved `.env.local`, report simulator/phone separately, and record evidence. Do not delete worktrees or user backups.

## Final verification — 2026-09-23

- Implementation `26bbbf2`, test-only type fix `24abdb7`; independent spec and final quality reviews approved without open findings.
- Main-agent full suite on approved source and again on clean merged main: 117 files / 1314 tests passed; web build passed. Logs: `/private/tmp/crewflow-locked-map-main-tests-20260923.log`, `/private/tmp/crewflow-locked-map-main-build-20260923.log`.
- Actual `tsc -p tsconfig.app.json --noEmit` retains 116 pre-existing diagnostics, no diagnostics in changed files. Root `tsc --noEmit` does not check app files and is not evidence of a green app typecheck.
- Browser QA at desktop and 390px: click, Enter and Space open the existing picker; canceled drag preserves 49.817500 / 15.473000; confirmation and reopening retain 49.815814 / 15.475613. X/Escape return to the form and actual preview opener.
- Scrolling over preview changes form scrollTop from 506.5 to 717.5 without opening picker. Native button has type=button, aria-haspopup=dialog and touch-action:auto. Attribution expands with OpenFreeMap/OpenMapTiles/OpenStreetMap links independently of picker.
- Address lookup tested with public query Praha: selected result produces locked preview; edit action initializes picker at 50.087465 / 14.421254. No live records saved or user roles changed. Temporary draft/tab/server at 8087 closed; original local-only 8086 preview updated and preserved.
- Main fast-forward integrated and pushed; unrelated Info.plist and TimelogsView/test changes preserved byte-for-byte (diff SHA256 before/after: 8cebee2a264a5753186cbdd58c404fa4d3727db1a9504d9f4987bc73db56d5ac).
- Clean synchronized main `24abdb7` ran required `npm run ios:refresh:devices`: exit 0, simulator updated, phone updated. Simulator screenshot confirmed rendering; phone build/install/launch completed. Log: `/private/tmp/crewflow-locked-map-ios-refresh-20260923.log`. Slow phone signing completed without changing security settings.
- This documentation checkpoint changes no installed application source. Worktrees and user backups retained.
