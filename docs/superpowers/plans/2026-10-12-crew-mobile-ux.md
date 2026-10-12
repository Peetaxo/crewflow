# Crew mobile UX implementation plan

**Goal:** Make Crew list and personal detail usable on phones, with operational information first and accurate summaries.

**Architecture:** Keep the existing Crew service, role checks, shared workflow provider and global navigation. Pure presentation helpers own search/status summaries; the list uses one responsive DOM, the detail owns navigation and delegates history/invoice/profile rendering to focused components.

**Tech Stack:** React, TypeScript, Tailwind, existing Radix controls, Vitest and browser preview.

- [ ] Add regression tests for accent-insensitive contact search, reliable/driver filters, accurate pending hours, safe missing profiles, past draft visibility and role-safe editor access. Run focused tests and confirm the new expectations fail.
- [ ] Add `src/features/crew/services/crew-presentation.ts`: `filterCrewMembers`, `getCrewOverviewStats`, `isCrewTimelogInFilter`, `calculateCrewTimelogEstimate`; cover real status distinctions and meal allowance.
- [ ] Rewrite `src/views/CrewView.tsx` with local search and three filters, responsive list items, contact links and per-person menu. Preserve calendar, create/edit modal, stable profile IDs and delete confirmation.
- [ ] Split the detail into `CrewDetailRecords.tsx` (responsive reports/invoices), `CrewProfilePanel.tsx` (collapsible data and editable meta) and `CrewBillingChart.tsx` (existing optional chart). Rewrite `CrewDetailView.tsx` around identity/contact, compact summaries and Směny/Výkazy/Faktury tabs. Preserve shared approval grouping and workflow summary; resolve event UUID aliases.
- [ ] Run focused tests and lint, full test suite and web build. Visually inspect real components in local preview at mobile and desktop widths, including long names/contacts, invoice identifiers, empty search and dark mode. Fix any overflow/interaction defect and rerun affected checks.
- [ ] Review actual diff, commit only task files, integrate into a clean synchronized main while preserving unrelated changes. Recheck integrated main, push, run `npm run ios:refresh:devices` with intact preflight and record simulator/phone results separately.
