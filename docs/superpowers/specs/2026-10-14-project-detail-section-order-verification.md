# Project detail section order

The user requested moving project costs above project events. Source `2a1f15c` moves the unchanged costs section in `ProjectStatsView.tsx`. Final order: base information, costs, events, documents. Conditions, financial values, event actions and data loading are unchanged.

- Existing detail and summary tests: 58 passed across two files, including in the clean main checkout. Production build, changed-file lint and whitespace checks passed. No new tests were added for this reversible layout-only change.
- Independent read-only review approved the exact block move with no findings.
- Mobile browser preview confirmed heading order and captured fictional data at `/Users/peetax/.codex/visualizations/2026/10/13/01a134ed-10ed-7b72-9e8e-e85580d127d4/project-detail-costs-first-2026-10-14.jpg`. Preview stopped, tab closed, viewport reset.
- Main/origin/main are synchronized at the verified application source. Unrelated Info.plist and TimelogsView source/tests WIP hashes remain unchanged.

Device refresh completed: simulator **updated**, physical iPhone **updated**. The clean synchronized main refresh built/signed and installed both apps from source `2a1f15c`. Its final phone launch was initially blocked because the device was locked; the user then confirmed unlocking it. Retrying only the unchanged final launch command succeeded with exit 0. No app code or signing configuration changed during this retry.

Refresh log: `/private/tmp/crewflow-project-detail-order-ios-refresh.log`; successful phone launch retry: `/private/tmp/crewflow-project-detail-order-phone-launch-retry.log`. Command: `xcrun devicectl device process launch --device 75DA6037-2430-56C9-A791-4DD552D102BA --terminate-existing --timeout 15 --quiet cz.nodu.app`. Implementation and completion documentation are integrated into main; the temporary worktree and browser resources have been removed.
