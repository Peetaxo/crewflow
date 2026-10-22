# Billing and Timelog Presentation Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development. Root owns shared evidence cards and filter order; a separate worker owns invoice presentation. Review each completed change before integration.

**Goal:** Improve hierarchy and responsive layouts of both requested screens, placing timelog controls before every report.

**Architecture:** Retain current data controllers, identity guards, frozen financial snapshots and mutation handlers. Change presentation/disclosure only, using existing nodu tokens and native accessible details/buttons.

**Tech Stack:** React, TypeScript, Tailwind, Lucide, Vitest/Testing Library, existing Capacitor iOS.

## Task 1: Timelog navigation and shared report cards

- [ ] In `src/views/TimelogsView.test.tsx`, add desktop/mobile ordering checks against a rendered shared-card fixture, and exercise previous month on desktop Crew. Run the suite and confirm failure for current below-card placement and missing desktop month control.
- [ ] In `src/views/TimelogsView.tsx`, move `sharedApprovals.cards(visibleTimelogs)` below controls. Render existing month navigation for Crew mine scope at both breakpoints and filter the same `baseTimelogs` by the selected month. Preserve manager scope and existing editor actions.
- [ ] Restyle `src/features/shift-workflows/SharedApprovalCard.tsx` with identity/status header, labelled hour/amount metrics, individual event rows and a clear action. Preserve UUID lookup, completeness guard, mileage/meal values and review action callbacks. Collapse previous return reason with history once no longer rejected.
- [ ] Add meaningful disclosure coverage in `SharedApprovalCard.test.tsx`, preserving multi-part totals, missing-member disabled state and correct event identity. Run both suites.

## Task 2: Invoice and pending-statement cards

- [ ] Update `BillingInvoiceCard`, `BillingStatementCard`, `BillingFinancePreview` and `InvoiceBillingView` in `src/features/invoice-billing/` to the approved visual hierarchy. A compact statement overview must retain full exact finance in expandable detail.
- [ ] Add a regression proving exact preview opens when selecting self-billing/upload and explicit consent still gates the command. Keep original download, CH-only accept/return, unavailable amount, immutable attribution and payment tests passing.
- [ ] Verify all invoice-billing tests plus the invoice PDF download regression; report changes for root review. Do not change controllers, services or contracts.

## Task 3: Verification and rollout

- [ ] Visually inspect both screens via CUA in local demo at desktop, 390px, 320px and dark theme. Check actual control placement, text wrapping, disclosure and action availability; save screenshots. Do not issue or pay new invoices for styling proof.
- [ ] Run full Vitest suite, production build, ESLint changed files and diff check. Review code and spec conformance.
- [ ] Merge verified changes into main, verify merged source, sync origin/main and run `npm run ios:refresh:devices` with existing signing team and preserved `.env.local`. Perform a short simulator visual check; record simulator and phone separately.
