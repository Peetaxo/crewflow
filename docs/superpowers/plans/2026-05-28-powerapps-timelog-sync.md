# PowerApps Timelog Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a preview-first sync from PowerApps approval comments to NODU timelogs.

**Architecture:** Keep invoice approval document loading as-is. Add a focused parser/matcher service that produces preview rows and an apply service action that updates or creates timelogs only for safe matches. Add the preview UI to the existing `Schvalovani` page.

**Tech Stack:** React, TypeScript, Supabase client, TanStack Query, Vitest.

---

### Task 1: Parser And Matching Service

**Files:**
- Create: `src/features/invoices/services/approval-timelog-sync.service.ts`
- Test: `src/features/invoices/services/approval-timelog-sync.service.test.ts`

- [ ] Write tests for comment person priority, multi-day parsing, pausal five-hour range, job-number normalization, ambiguous shared job numbers, and non-approved status handling.
- [ ] Implement parser helpers for Czech dates, time ranges, `celkem`, and `pausal/paušál`.
- [ ] Implement matching against events, contractors, event crew assignments, Grason confirmations, and existing timelogs.
- [ ] Return preview rows with `ready`, `needs_review`, or `blocked` status and precise reasons.

### Task 2: Apply Safe Preview Rows

**Files:**
- Modify: `src/features/invoices/services/approval-timelog-sync.service.ts`
- Modify: `src/features/timelogs/services/timelogs.service.ts`
- Test: `src/features/invoices/services/approval-timelog-sync.service.test.ts`
- Test: `src/features/timelogs/services/timelogs.service.test.ts`

- [ ] Write tests that applying a row updates an existing timelog to proposed days and `approved`.
- [ ] Write tests that applying a row creates a timelog only when the person is assigned to the matched event.
- [ ] Implement a small exported timelog upsert helper that persists Supabase rows by event UUID and contractor profile UUID.
- [ ] Keep `pending` and `unknown` PowerApps rows out of automatic approval.

### Task 3: Preview UI

**Files:**
- Modify: `src/views/ApprovalsView.tsx`
- Test: `src/views/ApprovalsView.test.tsx`

- [ ] Add `PowerApps timelogy` preview section for COO users.
- [ ] Show document, comment person, matched action, proposed days, approval status, and reason.
- [ ] Add per-row `Aplikovat` and hromadne `Aplikovat jasne shody` buttons for ready rows.
- [ ] Refresh timelog queries after successful apply.

### Task 4: Verification

**Files:**
- All touched files.

- [ ] Run targeted Vitest files.
- [ ] Run lint.
- [ ] Run production build.
- [ ] Open local preview and verify the `Schvalovani` page renders the new preview without overlapping UI.
