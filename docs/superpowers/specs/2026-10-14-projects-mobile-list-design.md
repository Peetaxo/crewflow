# Mobile project list

Approved in chat: the user requested only Job Number, project name and client on mobile, without sideways scrolling. The compact-row proposal was accepted by “pokračuj” on 2026-10-14.

- Below the existing 768px mobile breakpoint, replace the wide projects table with compact full-width rows in the same ledger panel.
- Each row displays Job Number on the left and project name with client underneath on the right. Use wrapping, including unbroken strings, so all three values remain visible at 320px and 390px without horizontal scrolling.
- The entire row is a native button opening the existing project detail. Keyboard activation remains available.
- Period, counts, costs and row edit/delete controls are absent from the mobile list. Project information and editing remain accessible through the existing detail.
- Reuse the existing project rows, search, client/date filters, loading/errors, empty state and plus creation control. No new data requests, storage changes, financial calculations or detail changes.
- At 768px and above, retain the existing desktop table and its actions.

Verification: a failing mobile interaction test before implementation, desktop regressions, browser inspection at 320px/390px with long text and desktop resize, production build/lint, independent reviews, integration into main and the AGENTS.md-required iOS development refresh.
