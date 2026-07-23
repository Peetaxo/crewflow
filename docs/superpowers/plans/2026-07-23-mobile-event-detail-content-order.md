# Mobile Event Detail Content Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the mobile Crew event detail so the floating action panel, meeting point, assigned crew order, and crew hours match the approved UX.

**Architecture:** Keep the change local to the mobile branch inside `EventDetailView`. Adjust tests first, then update JSX ordering and small CSS rules only if the markup needs them.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, existing CSS classes in `src/index.css`.

---

### Task 1: Lock Mobile Detail Content Behavior

**Files:**
- Modify: `src/views/EventDetailView.test.tsx`
- Modify: `src/views/EventDetailView.tsx`
- Modify if needed: `src/index.css`

- [x] **Step 1: Write failing tests**

Add assertions that the mobile Crew detail:
- does not show `v evidenci` in the floating action panel;
- shows meeting location in the info card as `Sraz`;
- does not render the separate `Kde se potkáme` section;
- places `Přiřazená crew` after `Popis akce`;
- shows crew hours without phase text;
- shows `0h` when an assigned crew member has no timelog.

- [x] **Step 2: Run tests and confirm RED**

Run:

```bash
npm test -- src/views/EventDetailView.test.tsx --reporter verbose
```

Expected: failing tests caused by current mobile layout.

- [x] **Step 3: Implement minimal JSX changes**

Update the mobile branch in `EventDetailView.tsx`:
- remove `.nodu-mobile-event-floating-summary` for assigned Crew;
- add compact-style panel behavior for the assigned state if no summary row remains;
- move meeting location into the info card as a `Sraz` row;
- render description before assigned crew;
- remove phase label from mobile crew row meta;
- render `${hours.toFixed(1)}h` or `0h`.

- [x] **Step 4: Run tests and confirm GREEN**

Run:

```bash
npm test -- src/views/EventDetailView.test.tsx --reporter verbose
```

Expected: all EventDetailView tests pass.

### Task 2: Verify And Commit

**Files:**
- Verify changed files only

- [x] **Step 1: Run targeted tests**

Run:

```bash
npm test -- src/components/layout/AppLayout.test.tsx src/views/EventDetailView.test.tsx src/index.css.test.ts --reporter verbose
```

- [x] **Step 2: Run build**

Run:

```bash
npm run build
```

- [x] **Step 3: Run lint**

Run:

```bash
npm run lint
```

- [x] **Step 4: Commit and push**

Stage only the mobile detail files and this plan, then commit:

```bash
git add docs/superpowers/plans/2026-07-23-mobile-event-detail-content-order.md src/views/EventDetailView.tsx src/views/EventDetailView.test.tsx src/index.css
git commit -m "fix: simplify mobile event detail content"
git push
```
