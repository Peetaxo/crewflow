# Projects search and filters verification

Application source verified at `613c3197d1d4f8f9d94bfaaa7fa0cb437151a8d6`, integrated into synchronized `main`/`origin/main` on 2026-10-14. Incoming main changes since the feature base affected documentation only.

- Baseline: 163 files / 2,077 tests passed. Feature suite: 164 files / 2,094 tests passed. After the accessible date-label correction, all 32 focused tests passed again in both the feature worktree and the clean main checkout.
- Production build passed, including after the accessibility correction. Whole-repository lint passed on final main. TypeScript retains the same 111 pre-existing diagnostics; the normalized diagnostic multiset matches the exact base, with no added diagnostics.
- Selector and rendered interaction tests use actual filtering logic. Red phases reproduced accentless-search failures, the absent search/filter UI, and inaccessible selected dates before their corresponding fixes.
- Independent spec and final quality reviews approved the implementation. The date-chip accessibility finding was corrected and independently rechecked.
- Browser preview with fictional data verified 320px, 390px and desktop layouts; Job Number/name/client search and Czech accent folding; shared sidebar search; client/date/search combinations; inclusive full-project periods including gaps between actions; one-sided ranges; exclusion of undated projects only when dated; clear/reset/removal; invalid-range recovery; empty results; and opening/back from project detail.
- Long unbroken project and client names, including the active client chip, fit at 320px. Document and main scroll widths equal the viewport width. Mobile rows remain limited to Job Number, name and client.
- Screenshot: `/Users/peetax/.codex/visualizations/2026/10/13/01a134ed-10ed-7b72-9e8e-e85580d127d4/projects-search-mobile-2026-10-14.jpg`. Browser preview stopped, temporary tab closed and viewport override reset.
- Original checkout WIP in Info.plist and TimelogsView source/tests was preserved and checked against its pre-task SHA-256 snapshot.

Local iOS refresh completed successfully from clean synchronized main `613c319` with preserved `.env.local`, intact preflight and a fresh task-specific DerivedData directory. `npm run ios:refresh:devices` exited 0: simulator **updated**, physical iPhone **updated**. Both builds succeeded and the refresh installed/launched both apps. A simulator screenshot independently confirmed the app running; project search/filter interaction was verified in the browser preview.

Logs are under `/private/tmp/crewflow-project-search-*`. Native refresh used `/private/tmp/crewflow-project-search-ios-20261014`. The application source remains exactly the reviewed commit; the completion record changes documentation only.
