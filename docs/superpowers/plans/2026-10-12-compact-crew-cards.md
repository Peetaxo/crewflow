# Compact Crew Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement the UI task, then review spec compliance and code quality.

**Goal:** Reduce mobile Crew card height while preserving identity, rating, activity and direct contact actions.

**Architecture:** Keep the existing CrewView data flow and one responsive DOM per member. Change only the card layout and labels; the mobile footer groups activity and actions, and lg:contents returns its children to existing desktop columns.

**Tech Stack:** React, TypeScript, Tailwind, existing lucide icons, Vitest, browser preview and iOS development refresh.

## Task 1: Compact layout and accessible contact actions

**Files:** Modify `src/views/CrewView.tsx` and `src/views/CrewView.test.tsx`.

- [x] Add tests for named contact actions, correct destinations, missing contacts, contact search and unknown rating/activity semantics. Observe a failure for missing action labels before implementation.

```tsx
expect(screen.getByRole('link', { name: 'Zavolat: Petr Heitzer, +420777123456' })).toHaveAttribute('href', 'tel:+420777123456');
expect(screen.getByRole('link', { name: 'Napsat e-mail: Petr Heitzer, petr@example.cz' })).toHaveAttribute('href', 'mailto:petr@example.cz');
```

- [x] Run `NODE_OPTIONS='--import=/private/tmp/crew-ux-runner-preload.mjs' npm test -- src/views/CrewView.test.tsx --configLoader=runner --maxWorkers=1`; new action expectations must fail against current markup.
- [x] Use a mobile three-column header (identity, rating, 44 px menu); smaller avatar, no redundant navigation chevron. Preserve the lg five-column row. Long identity text wraps naturally.
- [x] Use this footer structure, retaining the existing phone and email fields and desktop columns:

```tsx
<div className="col-span-3 row-start-2 flex flex-wrap items-center justify-between gap-2 lg:contents">
  <div className="flex min-w-0 items-center gap-1 text-xs text-[var(--nodu-text-soft)] lg:col-start-4 lg:row-start-1" title="Poslední zaznamenané používání aplikace">
    <Clock size={12} aria-hidden="true" className="shrink-0 lg:hidden" />
    <span className="sr-only">Poslední aktivita: </span><span>{activityLabel}</span>
  </div>
  <div className="flex min-w-0 flex-wrap gap-2 lg:col-start-3 lg:row-start-1 lg:flex-col lg:gap-0.5">
    {person.phone ? <a aria-label={`Zavolat: ${person.name}`} title={person.phone} href={`tel:${person.phone.replace(/[^+\d]/g, '')}`} className="flex min-h-11 items-center gap-1.5 rounded-lg border border-[var(--nodu-border)] px-2.5 text-xs text-[var(--nodu-text)] hover:text-[var(--nodu-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nodu-accent)] lg:min-h-8 lg:border-0 lg:px-0 lg:text-sm"><Phone size={14} aria-hidden="true" className="shrink-0" /><span className="lg:hidden">Zavolat</span><span className="hidden break-words lg:inline">{person.phone}</span></a> : null}
    {person.email ? <a aria-label={`Napsat e-mail: ${person.name}`} title={person.email} href={`mailto:${person.email}`} className="flex min-h-11 min-w-0 items-center gap-1.5 rounded-lg border border-[var(--nodu-border)] px-2.5 text-xs text-[var(--nodu-text-soft)] hover:text-[var(--nodu-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nodu-accent)] lg:min-h-8 lg:border-0 lg:px-0"><Mail size={14} aria-hidden="true" className="shrink-0" /><span className="lg:hidden">E-mail</span><span className="hidden min-w-0 break-all lg:inline">{person.email}</span></a> : null}
    {!person.phone && !person.email ? <p className="text-xs text-[var(--nodu-text-soft)]">Kontakt neuveden</p> : null}
  </div>
</div>
```

- [x] Keep the rating value `/ 10`. For unknown values show an aria-hidden dash on mobile and `Bez hodnocení` with `sr-only lg:not-sr-only`; Crew users receive no rating badge.
- [x] Run focused tests, ESLint for the two TSX files and `git diff --check`; commit only those files after self-review.
- [x] Independent spec review, then quality review; fix any findings and re-review before merge.

## Task 2: Visual verification and development installation

**Files:** Create `docs/testing/2026-10-12-compact-crew-cards.md`; update this plan.

- [x] Run synthetic preview with long names, contacts and populated/unknown metadata at 375, 390, 412, 768 and 1280 px; inspect light/dark, missing contacts and larger font. Measure old/new card height. Check mobile action sizes, desktop contact text and no overflow. Do not dial, send email or save test people.
- [ ] Verify focused tests and web build, inspect final diff. Preserve unrelated local work and ignored `.env.local`; integrate into clean current main and verify synchronized origin/main.
- [ ] Push, then run `IOS_REFRESH_DERIVED_DATA_ROOT=/private/tmp/crewflow-compact-cards-device-refresh-20261012 NODE_OPTIONS='--import=/private/tmp/crewflow-card-selection-vite-runner-preload-20261012.mjs' npm run ios:refresh:devices` with intact preflight. Record simulator and physical phone results separately; inspect compact cards in running simulator and preserve input-focus fix.
- [ ] Commit/push only the final verification documentation and retain the user-facing preview and screenshot.

Quality follow-up: include the actual contact value in each accessible name and use 14 px mobile action labels; verified in final source.
