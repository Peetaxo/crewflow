# Projects search and filters

The user asked for a search field immediately above the Projects list and for the existing upper-right filter to be useful and actually filter results. This extends the already approved simple project list; mobile rows keep only Job Number, name and client.

- Add one accessible search input above the list, bound to the existing shared search query. Match Job Number, project name or client immediately, ignoring case and Czech diacritics. Provide a clear-search button when text exists.
- Keep the filter in the upper-right corner. Client options come from existing projects so the menu does not offer unrelated clients without projects.
- Label dates as the realization period and explain inclusive overlap with the period derived from the project's actions. Projects without actions remain visible without a date filter and are excluded when a date is selected. One-sided date ranges work.
- Search, client and dates combine with AND. Show the result count when ready and the active client/date values above the list, each removable. Reset filters preserves the search text; clearing search preserves filters.
- If From is later than To, show a clear Czech validation message rather than a misleading empty list. The message remains visible with the popup closed; correcting or removing a date restores results.
- Preserve the existing loading/error states, authorization, detail navigation, desktop table, and compact mobile rows. No old status tabs, new financial sections, persistence overhaul or database changes.

Verify selector results with real fixture data and component interactions that render those results, then inspect narrow mobile and desktop layouts. Follow AGENTS.md: integrate verified code into main, refresh local iOS installations, and report simulator and phone separately.
