# Projects search and filters implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan. Steps use checkbox syntax for tracking.

**Goal:** Make project search available directly above the list and make filtering understandable and verifiable.

**Architecture:** Reuse AppContext search state and the existing ProjectListFilters selector. Derive active filters, counts and validation directly during render. Test real selectors separately and in rendered interactions; keep loading and auth boundaries intact.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, existing Input/Popover components.

### Task 1: Project search and filtering

**Files:** `src/views/ProjectsView.tsx`, `src/views/ProjectsView.test.tsx`, `src/features/projects/services/projects.service.ts`, `src/features/projects/services/projects.service.test.ts`, with a separate ProjectsView integration test only if needed to avoid existing mocks.

- [ ] Add failing selector cases for mixed case/diacritics in number, name and client, combined search/client/date matching, inclusive boundary and one-sided dates, and projects without actions. Preserve overall period-overlap semantics for projects with multiple actions.
- [ ] Run `npx vitest run src/features/projects/services/projects.service.test.ts` and confirm the new diacritic test fails for the expected reason.
- [ ] Add a local normalization helper and apply it to the query and the three searchable fields:
  ```ts
  const normalizeProjectSearch = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const query = normalizeProjectSearch(search.trim());
  ```
- [ ] Add failing rendered interaction tests for the labelled search field, clearing search, actual matching rows with combined filters, only project-backed client options, removable active filters, reset preserving query, and invalid ranges recovering after correction. Reuse real service logic rather than simulating its filtering in a mock.
- [ ] Run `npx vitest run src/views/ProjectsView.test.tsx` plus any new integration test and confirm expected failures.
- [ ] Bind `Input type="search" aria-label="Vyhledat projekty"` to `searchQuery/setSearchQuery`, with placeholder `Job Number, název nebo klient` and an accessible clear button. Keep layout `min-w-0` and flexible at 320px.
- [ ] Derive validation from `Boolean(filters.startDate && filters.endDate && filters.startDate > filters.endDate)`. Label date group `Období realizace`; describe project-period overlap. Derive clients from `dependencies.projects.map(project => project.client)`, exclude empty values, deduplicate and locale-sort.
- [ ] Render active client/From/To values as accessible removal buttons. Show `Zobrazeno: ${projectRows.length}` when data is ready and the range is valid. Reset `{}` leaves search unchanged. Show `Datum Od nesmí být pozdější než datum Do.` instead of results for an invalid range, outside the popup so it remains visible.
- [ ] Run focused selector and component tests, then self-review scope and commit the feature.

### Task 2: Review, verify and integrate

- [ ] Independent spec review followed by code quality review; resolve actionable findings and repeat review.
- [ ] Inspect real preview with fixture projects at 320px, 390px and desktop; test query, client, one-sided/two-sided date ranges, combined filters, clear/reset, validation, empty results and detail opening.
- [ ] Run `npm test`, `npm run build`, `npm run lint` and compare `npx tsc --noEmit -p tsconfig.app.json` to the exact base diagnostic baseline.
- [ ] Integrate into current main without overwriting unrelated changes; verify any incoming source changes before push.
- [ ] Use the clean synchronized main checkout to run `IOS_REFRESH_DERIVED_DATA_ROOT=/private/tmp/crewflow-project-search-ios-20261014 npm run ios:refresh:devices`. Preserve `.env.local` and all preflight checks. Inspect device availability if the phone cannot be targeted.
- [ ] Record outcomes and remove only this task's worktree and preview resources. Report simulator and physical phone separately.
