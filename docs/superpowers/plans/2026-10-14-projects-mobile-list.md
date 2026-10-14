# Mobile Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Show only Job Number, project name and client on phones, without horizontal scrolling.

**Architecture:** ProjectList uses the existing useIsMobile hook to select compact button rows or the existing desktop table. Both consume the same filtered projectRows and existing query states. No new data layer or detail behavior.

**Tech Stack:** React, TypeScript, Tailwind, Vitest/Testing Library, Vite and the existing Capacitor iOS refresh.

## Task 1: Mobile rows

Files: `src/views/ProjectsView.tsx`, `src/views/ProjectsView.test.tsx`.

- [x] Add a meaningful failing mobile test using a controlled useIsMobile boundary. Scope assertions to the project ledger: native button contains id/name/client, there is no table/period/cost/edit/delete, and clicking it calls setSelectedProjectIdForStats('JTI001'). Existing desktop column/filter/creation tests remain.

```tsx
const ledger = screen.getByRole('region', { name: 'Seznam projektů' });
expect(within(ledger).queryByRole('table')).not.toBeInTheDocument();
const row = within(ledger).getByRole('button', { name: /JTI001.*JTI.*NextLevel/ });
fireEvent.click(row);
expect(mocks.context.setSelectedProjectIdForStats).toHaveBeenCalledWith('JTI001');
```

- [x] Run `npm test -- src/views/ProjectsView.test.tsx` and confirm the new test fails because the current mobile view is still the wide table.
- [x] Add `useIsMobile` to ProjectList. Render a semantic list with native button rows on mobile. Use a two-column grid with `grid-cols-[minmax(0,5rem)_minmax(0,1fr)]`, `min-w-0`, and `[overflow-wrap:anywhere]`; show only id, name and client fallback `—`. Keep the existing table in the desktop branch. The outer mobile panel has no horizontal-scroll requirement. Existing loading/error/empty/filter/plus code remains shared.
- [x] Run focused tests and changed-file lint; self-review scope, accessibility and long text; commit only the UI/test files.
- [x] Obtain independent spec review followed by quality review and address any confirmed important issue.

## Task 2: Verify and install

- [x] Inspect isolated browser fixtures at 320px and 390px: long values wrap, ledger and page widths fit, all row text is visible, filters/+ still work and row opens detail. Resize to desktop and verify the complete table.
- [x] Run full tests, production build, changed-file ESLint and diff checks. Compare changed-file type diagnostics with the known baseline rather than fixing unrelated existing errors.
- [x] Save a mobile screenshot outside the repository and record verification here.
- [x] Fetch current main, integrate the reviewed change, verify clean synchronized main and run `npm run ios:refresh:devices`. Report simulator and physical iPhone separately, preserving unrelated files.
- [x] Record outcomes, synchronize and clean up the temporary worktree.

## Verification record

- At `2cd4a33`, the new mobile regression was verified RED before implementation, then all seven ProjectsView tests passed. Full suite passed: 163 files / 2,071 tests. Production build, changed-file ESLint and diff checks passed.
- TypeScript retains 111 pre-existing diagnostics before and after the change; zero new normalized diagnostics.
- Browser fixtures included long unbroken project/client names. At 390px, page width was 390px and ledger/row widths and scroll widths were all 356px. At 320px they were 320px and 286px respectively. All text wrapped; no sideways scrolling. Client filtering and clicking the client text to open project detail passed. Desktop resize restored all seven table headers. Screenshot saved outside the repository.
- Independent spec and quality reviews passed with no confirmed Critical/Important findings. Reviewer independently passed ESLint; its optional focused test startup stalled and was cancelled before assertions. Root full-suite verification provides the completed test evidence.
- Merged newer main `fc3047a` into reviewed work as `21c03d9`, without conflicts. Reviewed ProjectsView files remained identical. Full suite passed again: 163 files / 2,077 tests; build passed; type diagnostics remained 111 with no new diagnostics. Clean installation checkout was on synchronized main and matched this commit exactly.
- Required iOS refresh initially failed because the shared build cache lacked Capacitor/Cordova framework files. Retried unchanged code with the supported `IOS_REFRESH_DERIVED_DATA_ROOT=/private/tmp/crewflow-projects-mobile-device-refresh-20261014` override. Simulator build/install/launch succeeded and screenshot confirmed the running app.
- Physical iPhone: waiting for connection, not updated. Its cached paired-device lookup succeeded, but Xcode found no device destination. Follow-up device inspection confirmed the configured UDID still matched, Developer Mode was enabled, and `tunnelState` was `unavailable`. Treat this as the AGENTS.md non-blocking unavailable-device case, not a successful phone refresh.
- Original Info.plist and TimelogsView working changes remained byte-for-byte intact. Browser override reset, preview stopped and temporary worktree/branch removed. This follow-up changes the verification record only.
