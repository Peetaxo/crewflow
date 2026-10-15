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

- [ ] Verify passing project baseline and record TypeScript baseline.
- [ ] Add failing behavior tests for default collapse, keyboard/ARIA controls, expanded filtering/clearing/count/empty state, accent-insensitive matching, hidden-query isolation and plus independence.
- [ ] Implement section using existing Radix Collapsible and Input; update only tests whose event controls now require expansion. Preserve query retry and navigation coverage.
- [ ] Run project tests, changed-file ESLint and production build; self-review and commit.
- [ ] Independent spec review followed by quality review; fix any issues and recheck.

### Task 2: Verification and local delivery

- [ ] Verify actual app with fictional local data: initial collapsed state, search and clear, plus prefill, navigation, 320/390/desktop and palette consistency.
- [ ] Merge into clean main, run full tests/build and compare normalized TypeScript diagnostics. Synchronize origin/main without force; preserve unrelated primary-checkout changes.
- [ ] Run required `npm run ios:refresh:devices`; report simulator and physical iPhone separately. Request manual keychain/unlock action only if actually blocked.
- [ ] Record results and remove owned preview/worktree resources.
