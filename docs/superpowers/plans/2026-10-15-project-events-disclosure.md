# Collapsible project events implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Track steps below.

**Goal:** Reduce initial project detail height with collapsed events, and make large projects easy to search.

**Architecture:** A focused ProjectEventsSection owns disclosure and local search; ProjectStatsView retains its query, permissions, project prefill and navigation responsibilities. Reuse the existing Radix Collapsible, Input and card presentation. No database or financial changes.

**Tech stack:** React/TypeScript, Radix, Tailwind, Lucide, Vitest, Capacitor.

## Design based on the user's requested refinement

- “Akce projektu” defaults collapsed on entering a project. The heading is a keyboard-operable toggle with a chevron, expanded state and a count of all ready events. Keep its accessible section name “Akce projektu”. Do not show stale counts while loading/failed.
- Keep the management plus button outside the toggle, always available, retaining existing project/client prefill. Crew permissions unchanged.
- Expanded content contains a labelled search field “Vyhledat akce projektu” with placeholder “Název, místo nebo kontakt”, a clear control, and result count when ready.
- Search matches event name, city, address or contact person, ignoring case, Czech accents and surrounding whitespace. Local state does not change project-list search or financial/document values. Keep chronological order.
- Collapsing/reopening preserves the typed query during the same project session; project/auth remount clears it. No persistence across projects. Existing event detail navigation/back remains.
- Distinguish a project without events from no matching results. Keep independent query loading/error/retry messages visible even when collapsed.
- Reuse existing `--nodu-*` palette, icons, mobile input size and responsive cards. No new horizontal scrolling at 320/390 px; preserve card accessible descriptions.

### Task 1: Component and regression coverage

**Files:** Create `src/features/projects/components/ProjectEventsSection.tsx`; modify `src/views/ProjectStatsView.tsx`, its tests and narrowly scoped project detail CSS if needed. Add focused section tests if clearer than expanding the integration suite. Do not edit financial services/models or ProjectDocuments.

- [x] Verify passing project baseline and record TypeScript baseline.
- [x] Add failing behavior tests for default collapse, keyboard/ARIA controls, expanded filtering/clearing/count/empty state, accent-insensitive matching, hidden-query isolation and plus independence.
- [x] Implement section using existing Radix Collapsible and Input; update only tests whose event controls now require expansion. Preserve query retry and navigation coverage.
- [x] Run project tests, changed-file ESLint and production build; self-review and commit.
- [x] Independent spec review followed by quality review; fix any issues and recheck.

### Task 2: Verification and local delivery

- [x] Verify actual app with fictional local data: initial collapsed state, search and clear, plus prefill, navigation, 320/390/desktop and palette consistency.
- [x] Merge into clean main, run full tests/build and compare normalized TypeScript diagnostics. Synchronize origin/main without force; preserve unrelated primary-checkout changes.
- [x] Run required `npm run ios:refresh:devices`; report simulator and physical iPhone separately. Request manual keychain/unlock action only if actually blocked.
- [x] Record results and remove owned preview/worktree resources.


## Verified delivery — 2026-10-15

- Source: `eebf340`; merged and synchronized main: `be62c70`. Independent specification and code quality reviews passed with no unresolved findings.
- Baseline 90 project tests; final 106 scoped tests. Merged main passed all 165 files / 2,124 tests. Changed-file ESLint, whitespace checks and production build passed.
- TypeScript: the same 111 pre-existing diagnostics; normalized file/code/message comparison has zero added or removed diagnostics.
- Browser verified with fictional local data: initially collapsed events and ready total count; independent plus with project/client prefill; actual Enter and Space toggle activation; uppercase unaccented search matching Czech names; no-match state; clear restoring input focus; query retained through collapse/reopen; existing event detail/back.
- Responsive verification: 320/390 px and desktop, light/dark palette. No horizontal overflow in project components. Desktop collapsed events section measured 86 px high. Financial values and documents remained unchanged during event searches.
- Native refresh completed successfully from clean synchronized main `be62c70`, with preserved local signing configuration and healthy existing DerivedData. Simulator: updated and launched. Physical paired iPhone: updated and launched. No additional keychain/unlock action was needed for this refresh.
- Evidence: `/private/tmp/crewflow-events-disclosure-main-tests.log`, `-main-build.log`, `-main-types.log`, and `-ios-refresh.log` (same prefix).
- Actual app screenshots: chat visualization files `project-events-search-mobile-2026-10-15.jpg` and `project-events-collapsed-desktop-2026-10-15.jpg`.
- Preview server/tab closed; temporary viewport reset; merged feature worktree/branch removed. Primary checkout's three unrelated modified files verified unchanged by SHA-256.
