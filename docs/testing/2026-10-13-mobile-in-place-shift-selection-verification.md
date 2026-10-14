# Mobile in place shift selection verification 14 October 2026

## Scope and current status

Implements the user-approved `2026-10-13-mobile-in-place-shift-selection-design.md`: mobile linking selects the current cards in the existing overview, uses the same date picker, adds only compact inline search and a floating footer, and removes the mobile list/calendar switch for every role. Desktop and the existing editor retain their previous behavior.

The latest development installation uses synchronized main `0a0dcae13c80f48557dd03b8d9197d8944e06d0b`, installed and launched successfully in both the simulator and physical iPhone at 13:41 Europe/Prague. Its application source is byte-identical to fully verified combined source `76b94bc030cbe1b3164377d9acd9c8a943e4d380`; subsequent commits were documentation only. It preserves the compact Projects list and reviewed mobile selection source from `fc3047a847d939e21249e129723d9775f66d26df`. Detailed keyboard, scrolling, cancellation and role QA ran on `fc3047a`; the same mobile-selection files were checked again for May 12 entry on `76b94bc`.

Physical-phone installation and launch are now verified; direct physical-phone visual QA is not claimed. Native summary/back with a new eligible selection remains a separate acceptance check: sampled Staff history is already locked by approval, and no test business records were created or changed. Summary/back and save protections pass automated tests with isolated fixtures.

The mobile-selection task performs no migrations, Staff workflow/event/hours/approval/invoice test writes, authentication/permission implementation changes, invoice edits, dependency updates or tracked tooling workarounds. The integrated source also preserves the separately reviewed Projects work. Native role checks use the existing user-authorized test-role control; its implementation is unchanged.

## Reviewed implementation

- Deferred immutable draft and non-null compatibility wrapper: `5ca65c3dc952e5cfeae0afa1320880a5f04beec7`, independently approved by spec and quality reviewers after correcting stale callbacks, reset/publication boundaries and persistent capture errors.
- Stable mobile overview and owner: `de11b561ccb6b8369c1c20910ed918cf935a035d`, independently approved by spec and quality reviewers. A separately reproduced search-scroll snapback was corrected and its independent reproducer passed for both searched and unsearched views.
- Whole initial app delta `4eff3dd..de11b56` received a separate final read-only review, approved for integration and native verification, not as native visual proof.
- Initial synchronized clean main: `ef21148838ddd63d62d2a41058ab328d054b9f24`. Its extra change after `de11b56` is plan progress only.
- Native entry correction: `1e6750c3d7106b7ea78f08ea7e6c9db7d2b649c9` measures the actual expanded toolbar boundary and keeps the same occurrence below it. Cancellation retains the separate original snapshot. Realistic tests include scroll clamping and inherited-query restoration.
- Scroll-bookkeeping correction: `3745f22cfc514ac2672b4d2ded29eb90a0b15123` synchronizes the restored scroll position before a delayed browser scroll event. Fresh independent spec and quality reviews approved this source. The independent probe confirms entry positions 0 and 137 restore to 37 without expanding history, then a genuine upward movement expands once. Final focused evidence is 281 tests across 12 files; the final branch passed 160 files and 2,007 tests.
- Integration main `fc3047a` preserves the newer Projects work from `fa069bf935202d93079e19d2c8870d1a5d1e14d9`. The four-file correction delta received a separate bounded final review, approved without actionable findings. The Projects files, Events navigation defaults and invoice workflow locks remain preserved.

## Final merged verification on 14 October

All checks below ran freshly on clean main `fc3047a`, before pushing and refreshing devices. No application source changed during this resumed run.

| Check | Actual result |
| --- | --- |
| Complete serial test suite | Exit 0; 163 files and 2,076 tests; start 12:26:54 Europe/Prague; duration 103.23s |
| Lint | Exit 0; all 37 changed TypeScript source/test files in the combined `4eff3dd..fc3047a` delta |
| Web build | Exit 0; existing bundle, dynamic-import and Browserslist warnings only |
| Diff check | Exit 0 |
| Actual global TypeScript check | Exit 2; 111 existing diagnostics |
| Complete TypeScript output comparison | Exit 0; exactly matches the updated-origin `fa069bf` baseline after normalizing only line/column coordinates |
| Git synchronization | Push succeeded; local main and origin/main both `fc3047a847d939e21249e129723d9775f66d26df` before refresh |

The TypeScript comparison neither sorts nor filters diagnostics. The repository's global type check remains failing; this correction adds no diagnostics against the preserved Projects baseline.

Fresh logs are `/private/tmp/crewflow-mobile-in-place-20261014-final-main-tests.log`, `-lint.log`, `-build.log`, `-types.txt` and `-type-compare.log`. The comparison baseline is `/private/tmp/crewflow-mobile-in-place-20261013-updated-origin-baseline-types.txt`.

## Preservation of the later Projects update

During documentation synchronization, origin/main advanced to `21c03d9baa450955dd0830f677319cd0f5c6a7b6`, adding only the compact mobile Projects list, its regression and its two documents. A non-forced push rejection was resolved by fetching, inspecting and merging that source rather than overwriting it. Combined main became `76b94bc030cbe1b3164377d9acd9c8a943e4d380` and was pushed successfully.

Fresh combined verification passed: 163 files / **2,077 tests**, exit 0, start 12:48:03 Europe/Prague, duration 92.71s; lint of all 37 changed TypeScript files, build and diff check exit 0. Actual TypeScript still exits 2 with the same 111 complete coordinate-normalized baseline diagnostics. Logs use `/private/tmp/crewflow-mobile-in-place-20261014-current-main-{tests,lint,build,type-compare}.log` and `current-main-types.txt`.

The combined app source exactly matches that updated origin outside documentation. A separate diff confirms all shift-workflow, EventsView and mobile-events files remain unchanged from the detailed native QA source `fc3047a`. These later changes introduce no mobile-selection edits.

## Initial automated verification

Both the task branch and integrated clean main passed the complete suite: **160 files / 2,001 tests**, exit 0. Branch duration 93.67s; main duration 93.44s. Focused corrected Task 2 evidence was 12 files / 275 tests. Changed-source lint, web build and diff checks exited 0.

Actual TypeScript checking exited **2**, not 0. Its complete 111-diagnostic output exactly matched the pre-change baseline after normalizing only line/column coordinates, without sorting, filtering or dropping diagnostics. This change introduces no additional diagnostics; the repository does not have a passing global type check.

The existing Vite configuration runner issue was handled only by the previously established temporary runner/preload. No tracked configuration or dependencies changed. Existing bundle-size, ineffective dynamic-import and Browserslist-age warnings remain.

Evidence logs under `/private/tmp/`:

- `crewflow-mobile-in-place-20261013-full-branch-tests.log`
- `crewflow-mobile-in-place-20261013-full-main-tests.log`
- `crewflow-mobile-in-place-20261013-branch-{lint,build}.log`
- `crewflow-mobile-in-place-20261013-main-{lint,build,type-compare}.log`
- `crewflow-mobile-in-place-20261013-{baseline,branch,main}-types.txt`
- `crewflow-mobile-in-place-20261013-task2-search-fix-*`

## First development installation and actual native findings

The required `npm run ios:refresh:devices` ran from clean synchronized main `ef21148`, with its original preflight checks, ignored configuration and existing Apple development team intact. Log: `/private/tmp/crewflow-mobile-in-place-20261013-ios-refresh.log`.

Simulator: iPhone 17 Pro, iOS 26.5, `B337323A-264B-4AAC-9236-BEAAB3701659`, bundle `cz.nodu.app`. Build, installation and launch succeeded.

Physical phone: iPhone 13 mini, `00008110-000C284E2299801E`. Build and installation succeeded; launch failed with CoreDevice `Locked`. The refresh exited 1. The user subsequently confirmed unlocking, and retrying the same launch command succeeded with exit 0 at 15:08 on installed source `ef21148`. That recovery does not prove installation of the later entry correction. No direct visual QA on the physical phone was performed.

Actual simulator observations on this first installed version:

- CH and COO have the date-picker icon on the left and linking icon on the right, without a mobile view-mode switch.
- Choosing 12 May displays the correct cards; linking keeps the same visible cards/date, adds search and selection controls, and does not autofocus or show a loading paragraph. Exact DOM identity is separately covered by integration tests, not inferred from native screenshots.
- **Defect:** the expanded sticky toolbar covers the previously visible first card's title/job/date because entry restores the old raw offset. This is not accepted native behavior. The same card must clear the actual new control boundary.
- Searching `instal` gives four matching cards. The header/search remains accessible under the notch while typing and during a real finger drag; the footer clears both the keyboard and its accessory bar.
- Closing the keyboard lets the last matching card display completely above the footer. Cancelling returns to the original 12 May cards and position.
- Screenshot dimensions remain 368 × 800 throughout; no stretched phone frame is used as proof.
- The temporary role-test switch remains unchanged. It is not new production UI.

Initial native evidence remains in the task record. It records the rejected entry defect, not the final native result below.

## Corrected simulator installation and visual checks

The unchanged required refresh ran again on 14 October from synchronized clean main `fc3047a`, with the existing ignored configuration, Apple development team, temporary Vite preload and derived-data root preserved. Log: `/private/tmp/crewflow-mobile-in-place-20261014-final-ios-refresh.log`.

Simulator build, installation and launch succeeded on iPhone 17 Pro, iOS 26.5, `B337323A-264B-4AAC-9236-BEAAB3701659`, bundle `cz.nodu.app`. The native QA used this corrected installed source, not the initial `ef21148` build or the stretching HTML demonstration.

- CH and COO show the shared date picker on the left and linking icon on the right. Neither mobile role has the list/calendar switch. Crew retains the existing filter, has no linking action and no mobile calendar-view switch.
- Choosing May 12 and opening selection retains the same Miss Agro/JTI001 cards, their May 12 dates and the 150-action view. Their headings and dates now clear the expanded controls. Opening shows search, circles and the floating bar, without a loading paragraph or automatic keyboard focus.
- Searching `instal` returns four actions across the captured available history. The search/header remains accessible below the notch with the full software keyboard and its accessory bar visible. The selection footer clears both.
- A real finger drag on the enlarged native simulator window visibly moved from the May 14 installation toward the May 24 deinstallation. The fixed header and footer remained accessible. Enlarging the host window did not change the simulated app's display size.
- After closing the keyboard with Done, the last matching Deinstal Pivní slavnosti Třebíč card fits completely above the footer and bottom navigation.
- Cancel restores the original May 12 normal view, empty normal search, 150 actions and first-card position. A later role change retires the selection without saving. The test role was returned to CH.
- Every native capture remains 368 × 800. Neither the footer nor keyboard stretches the app frame.

The mandatory refresh was repeated from clean synchronized `76b94bc` after preserving the compact Projects update. The simulator again built, installed and launched successfully; the phone destination was still unavailable at that point. Log: `/private/tmp/crewflow-mobile-in-place-20261014-current-ios-refresh.log`. A fresh May 12 entry check on this installed source again keeps the same cards with visible title/job/date, no loading paragraph or autofocus, and the floating footer above navigation. A later successful refresh at 13:41 installs `0a0dcae` on both devices, as recorded below.

Local screenshots are retained under `/Users/peetax/.codex/visualizations/2026/09/03/01a0664d-de93-7d91-b974-aa5eddd4eb23/crewflow-mobile-in-place-20261014/`: `before.jpg`, `entry-ch.jpg`, `entry-coo.jpg`, `keyboard.jpg`, `keyboard-drag.jpg`, `last-card.jpg`, `cancel.jpg` and `crew.jpg` show detailed `fc3047a` QA; `current-entry.jpg` shows the repeated entry check on `76b94bc`. They are local native evidence, not uploaded Staff screenshots.

The sampled May 12, installation and TEST cards are already locked by approval; the UI explains the reason and keeps Continue disabled. Native summary/back was therefore not exercised with two eligible cards in this run. Automated real-component tests cover that behavior with isolated fixtures. No workflow save, hours submission, approval, invoice mutation or test-record creation was performed in Staff.

## Physical iPhone status

The two earlier 14 October refreshes exited 1 after successful simulator stages: the phone build could not resolve destination `00008110-000C284E2299801E`. The command's availability probe returned cached paired-device information rather than a usable Xcode destination. Two separate reads confirmed `Device State: unavailable` and last connection on 13 October at 15:12; Xcode listed no available physical iPhone.

After the user confirmed reconnecting and unlocking the phone, a fresh read reported `Device State: connected` with last connection on 14 October at 13:41. The unchanged mandatory refresh then ran from clean synchronized main **`0a0dcae13c80f48557dd03b8d9197d8944e06d0b`**, preserving the ignored configuration and existing signing team. It exited **0** with `simulator: updated` and `phone: updated`.

Simulator build, installation and launch succeeded again; a fresh 368 × 800 capture confirms the running CH overview. On iPhone 13 mini, build, signing, installation and launch all succeeded. Current physical-phone status is **updated**, not waiting. This is a local development installation, not an App Store or production release. It does not imply direct visual testing on the phone.

Successful-refresh log: `/private/tmp/crewflow-mobile-in-place-20261014-phone-connected-ios-refresh.log`. Availability evidence: `/private/tmp/crewflow-mobile-in-place-20261014-phone-connected-availability.txt`. No application files changed in this phone-only continuation; a fresh complete non-documentation diff against verified `76b94bc` exited 0.

## Remaining acceptance checks

- With two eligible shifts, check native summary/back without saving; use isolated writable fixtures for save scenarios, not production Staff test writes.
- Both devices contain installed source `0a0dcae`; later documentation-only commits do not imply another rebuilt native binary.

## User testing

In CH or COO, open Akce, select a date such as May 12 with the left calendar icon, then press the right linking icon. The same cards should remain visible with search and selection circles. Try searching, scrolling and cancelling; cancellation should restore the original view. To reach the summary, choose at least two different unlocked shifts. Historical shifts where approval has already started intentionally cannot be newly linked.

## Preservation baseline

Original checkout files are intentionally untouched:

- `ios/App/App/Info.plist`: `f846dcf613937ef8afdbd70dedfec98c2f92ed6ae36b9e637931f7ccc8806457`
- `src/views/TimelogsView.tsx`: `3f5e938b9ca657d7164f3c8f93e8720187e03741f1ded6f1712f365fcb2da55d`
- `src/views/TimelogsView.test.tsx`: `a7727a103cac66461972d603dcace554033ca62a1c144071d4df47ad7a6b1f63`

All three original-file hashes were freshly rechecked on 14 October and match these baselines. The four historical dirty 12 October documents also match their preserved hashes:

- `docs/superpowers/plans/2026-10-12-event-card-shift-selection.md`: `61945e4bbe4265fa3fc3c603bc2fc7cc8d195303477f152d918cb4111595083c`
- `docs/testing/2026-10-12-event-card-shift-selection-verification.md`: `21de2e4beb2f1907ca302c1bb6bbd6013927b49ce035313bf564196e670ec530`
- `docs/testing/shared-shifts-acceptance-cs.md`: `68264daab98bd6e6b6fb8f3c9c3107e61c62b8d5f378bba59e487ecf0addfba9`
- `docs/testing/2026-10-12-event-card-shift-selection-resume.md`: `15828d5a85e683f20e0318cd8a3497221e11b60155302919210f5e835e095eec`

The shared worktree is preserved, without staging historic dirty documents or resetting/stashing the original checkout. The dedicated clean rollout's ignored `.env.local` still hashes to `a2c442980690baf181462c32a4dea881cc29107b8bd86dd7675250ae871c22f5`.
