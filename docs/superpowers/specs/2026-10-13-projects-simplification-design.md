# Simplified Projects

Approved in conversation on 2026-10-13, including the user's final agreement. The implementation follows that agreement without requesting another approval of the same scope.

## List

Keep the table and Job Number as the leading identifier. Columns: Job Number, name, period, client, event count, crew cost, row actions. Remove the creation date beneath Job Number. Derive the period from the earliest linked event start and latest end; show one date for a one-day project and an em dash without events. The same derived period appears in the detail and updates with event changes.

Replace all/upcoming/past segmented buttons with an accessible filter button in the upper right opening client and date-range controls plus reset. Date filters use inclusive overlap with the project period. No period matches no selected date range. Search continues to work. Replace the text create button with an accessible plus icon; on mobile use the same floating placement as Events, on desktop a small plus in the toolbar.

## Detail

One page containing only four areas:

1. Header: Job Number, name, client, derived period, edit action.
2. Events: chronological list showing term, location, staffing and the event's existing responsible contact, linking to the existing Event detail. A plus action creates an event prefilled with this project and client. Keep a single-event project compact.
3. Costs: work, travel, meals and receipts, with total and four non-overlapping monetary stages (in progress, approved, invoiced, paid). This is a cost summary, not an approval queue. Remove charts, standalone crew totals, hours/km KPI cards and detailed timelog cards.
4. Documents: receipt and invoice lists showing statuses and amounts, invoice due date and actions to open read-only receipt records/invoice PDFs. Show the project's share of a multi-project invoice and optionally the full document total as secondary context.

Do not introduce budgets, revenue, a project manager field, project notes in the header/form, tasks, archive behavior, document upload, or an approval workflow. Retain stored notes for compatibility when an existing project is saved. Existing record actions and roles stay in place.

## Financial correctness

Use persisted invoice item amounts to allocate multi-project invoices and freeze billed historical costs. Add optional typed item amounts to Invoice and retain them in its existing read/local-create paths; no schema migration or new writes are needed. Work, travel, meals and receipts are separate amounts. Single-project legacy invoices can use their header amounts. Never divide a combined invoice equally or charge its full amount to every project; if the exact share is unavailable, disclose that fact and exclude its unknown amount from the known subtotal.

Count every source expense once: an invoice supersedes its linked timelogs/receipts (prefer UUID links over local IDs); remaining non-rejected timelogs/receipts contribute their current derived cost. Rejects do not contribute. Draft invoice expenses belong to approved costs, sent invoices to invoiced, paid invoices to paid. Remaining expense stages follow their explicit lifecycle status. Current work uses the crew rate, travel KM_RATE, meals the existing event meal-allowance rule. Missing source rates must not silently appear as a complete zero-cost total.

Loading/error states must distinguish incomplete data from zero costs; scope changes must not show another project's data or open another document after an asynchronous PDF request. Reuse existing loaders and session permissions. No currency or tax behavior changes.

## Verification and integration

Focused regression tests cover empty/single/multiple-event periods, inclusive filters, status buckets, persisted shared-invoice allocation, no double counting and document/event navigation. Verify desktop and 390px mobile with seeded local preview data, including filter, edit, new event and PDF/read-only receipt actions. Run type check, build, relevant tests and full suite. Independently review spec compliance then code quality. Integrate into main without touching unrelated main working changes, synchronize origin/main and run the repository's iOS refresh, reporting simulator and iPhone results separately.
