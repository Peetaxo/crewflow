# Crew mobile UX implementation plan

**Goal:** Make Crew list and personal detail usable on phones, with operational information first and accurate summaries.

**Architecture:** Keep the existing Crew service, role checks, shared workflow provider and global navigation. Pure presentation helpers own search/status summaries; the list uses one responsive DOM, the detail owns navigation and delegates history/invoice/profile rendering to focused components.

**Tech Stack:** React, TypeScript, Tailwind, existing Radix controls, Vitest and browser preview.

- [x] Add regression tests for accent-insensitive contact search, accurate pending hours, safe missing profiles, past draft visibility and role-safe editor access. Run focused tests and confirm the new expectations fail.
- [x] Add `src/features/crew/services/crew-presentation.ts`: `filterCrewMembers`, `getCrewOverviewStats`, `isCrewTimelogInFilter`, `calculateCrewTimelogEstimate`; cover real status distinctions and meal allowance.
- [x] Add `profile_activity` migration with own-profile server-time RPC, manager/self RLS and no client write grants. Add foreground/interactions tracker and activity read hook; test throttling, hidden/anonymous/dev sessions, cleanup and timestamp labels. Verify database privileges and role behavior in a rollback transaction before integrating.
- [x] Rewrite `src/views/CrewView.tsx` with local search, simple responsive list items (identity, rating, contact, activity) and per-person menu. Preserve calendar, create/edit modal, stable profile IDs and delete confirmation.
- [x] Split the detail into `CrewDetailRecords.tsx` (responsive reports/invoices), `CrewProfilePanel.tsx` (collapsible data and editable meta) and `CrewBillingChart.tsx` (existing optional chart). Rewrite `CrewDetailView.tsx` around identity/contact, compact summaries and Směny/Výkazy/Faktury tabs. Preserve shared approval grouping and workflow summary; resolve event UUID aliases.
- [x] Run focused tests and lint, full test suite and web build. Visually inspect real components in local preview at mobile and desktop widths, including long names/contacts, invoice identifiers, empty search and dark mode. Fix any overflow/interaction defect and rerun affected checks.
- [ ] Review actual diff, commit only task files, integrate into a clean synchronized main while preserving unrelated changes. Recheck integrated main, push, run `npm run ios:refresh:devices` with intact preflight and record simulator/phone results separately.
