# Project detail section order

The user requested moving project costs above project events. Source `2a1f15c` moves the unchanged costs section in `ProjectStatsView.tsx`. Final order: base information, costs, events, documents. Conditions, financial values, event actions and data loading are unchanged.

- Existing detail and summary tests: 58 passed across two files, including in the clean main checkout. Production build, changed-file lint and whitespace checks passed. No new tests were added for this reversible layout-only change.
- Independent read-only review approved the exact block move with no findings.
- Mobile browser preview confirmed heading order and captured fictional data at `/Users/peetax/.codex/visualizations/2026/10/13/01a134ed-10ed-7b72-9e8e-e85580d127d4/project-detail-costs-first-2026-10-14.jpg`. Preview stopped, tab closed, viewport reset.
- Main/origin/main are synchronized at the verified application source. Unrelated Info.plist and TimelogsView source/tests WIP hashes remain unchanged.

Device refresh: simulator updated; phone installed, awaiting final launch verification while disconnected. Simulator built, installed and launched successfully. Phone build/signing and installation succeeded after the user confirmed the new macOS Keychain request. The required refresh command reached its final launch step, which failed specifically because the phone was locked (CoreDevice error 10002 / FBSOpenApplicationErrorDomain Locked). The user was asked to unlock the phone. A subsequent device-info check confirmed the paired phone is now unavailable (`connectionProperties.tunnelState = unavailable`), so waiting for its reconnection is non-blocking under AGENTS.md. Do not claim the phone updated until launch is verified.

Refresh log: `/private/tmp/crewflow-project-detail-order-ios-refresh.log`. Retry only the unchanged final launch step after the phone is unlocked: `xcrun devicectl device process launch --device 75DA6037-2430-56C9-A791-4DD552D102BA --terminate-existing --timeout 15 --quiet cz.nodu.app`. The main refresh checkout remains clean and synchronized at `2a1f15c`. After reconnection/unlock and successful launch, update this record with the phone result. The implementation and completion documentation are integrated into main; the task worktree can be removed without losing the pending device step.
