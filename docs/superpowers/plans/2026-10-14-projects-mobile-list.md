# Mobile Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Show only Job Number, project name and client on phones, without horizontal scrolling.

**Architecture:** ProjectList uses the existing useIsMobile hook to select compact button rows or the existing desktop table. Both consume the same filtered projectRows and existing query states. No new data layer or detail behavior.

**Tech Stack:** React, TypeScript, Tailwind, Vitest/Testing Library, Vite and the existing Capacitor iOS refresh.

## Task 1: Mobile rows

Files: `src/views/ProjectsView.tsx`, `src/views/ProjectsView.test.tsx`.

- [ ] Add a meaningful failing mobile test using a controlled useIsMobile boundary. Scope assertions to the project ledger: native button contains id/name/client, there is no table/period/cost/edit/delete, and clicking it calls setSelectedProjectIdForStats('JTI001'). Existing desktop column/filter/creation tests remain.

```tsx
const ledger = screen.getByRole('region', { name: 'Seznam projektů' });
expect(within(ledger).queryByRole('table')).not.toBeInTheDocument();
const row = within(ledger).getByRole('button', { name: /JTI001.*JTI.*NextLevel/ });
fireEvent.click(row);
expect(mocks.context.setSelectedProjectIdForStats).toHaveBeenCalledWith('JTI001');
```

- [ ] Run `npm test -- src/views/ProjectsView.test.tsx` and confirm the new test fails because the current mobile view is still the wide table.
- [ ] Add `useIsMobile` to ProjectList. Render a semantic list with native button rows on mobile. Use a two-column grid with `grid-cols-[minmax(0,5rem)_minmax(0,1fr)]`, `min-w-0`, and `[overflow-wrap:anywhere]`; show only id, name and client fallback `—`. Keep the existing table in the desktop branch. The outer mobile panel has no horizontal-scroll requirement. Existing loading/error/empty/filter/plus code remains shared.
- [ ] Run focused tests and changed-file lint; self-review scope, accessibility and long text; commit only the UI/test files.
- [ ] Obtain independent spec review followed by quality review and address any confirmed important issue.

## Task 2: Verify and install

- [ ] Inspect isolated browser fixtures at 320px and 390px: long values wrap, ledger and page widths fit, all row text is visible, filters/+ still work and row opens detail. Resize to desktop and verify the complete table.
- [ ] Run full tests, production build, changed-file ESLint and diff checks. Compare changed-file type diagnostics with the known baseline rather than fixing unrelated existing errors.
- [ ] Save a mobile screenshot outside the repository and record verification here.
- [ ] Fetch current main, integrate the reviewed change, verify clean synchronized main and run `npm run ios:refresh:devices`. Report simulator and physical iPhone separately, preserving unrelated files.
- [ ] Record outcomes, synchronize and clean up the temporary worktree.
