# Nodu stage 3 — multi-account refresh implementation plan

> **For agentic workers:** Use executing-plans for the coupled runtime sequence and subagent-driven-development for bounded implementation tasks. Follow test-driven-development and independent spec/quality review before integration. The user explicitly authorized roadmap stage 3.

**Goal:** Crew, CrewHead and COO see their own writes immediately, refresh on opening/resuming a surface, and see another account's changes within 30 seconds without losing drafts or crossing identities.

**Architecture:** Preserve the existing React Query and service snapshot/generation guards. Add refresh options only to operational queries, a foreground/navigation bridge and a visible stale/retry state. Keep frozen editor versions and server approval quotes; never refresh by resetting bootstrap. No global QueryClient change, Realtime migration, dependency upgrade or live synthetic data.

**Tech Stack:** React, TanStack Query v5, Capacitor App, Supabase local Auth/Postgres, Vitest, real browser/iOS simulator.

## 1. Reproduce and prepare the isolated matrix

- [x] Read current main `ffeae85`, AGENTS, query hooks, snapshot writers, native lifecycle and independent refresh/draft audits. Reuse the clean implementation worktree; preserve the original checkout's three unrelated files.
- [ ] In the exact local onboarding pilot (`127.0.0.1:55431`), create separately named synthetic crew, CH, COO and second crew identities. Keep generated credentials outside Git and never change the human onboarding password.
- [ ] Create synthetic project/event/report/invoice fixtures owned by these accounts. Use actual authenticated REST/RPC operations for transitions; privileged setup may only create named fixture prerequisites.
- [ ] Open independent browser origins for CH/COO and a separate iOS test bundle for crew. Keep normal nodu and human nodu test installations/data intact. Record the installed source commit and actual backend.
- [ ] Reproduce a write from another account on an already open screen and record write acknowledgement / first visible time. Initial source has no polling or native resume listener; record failures as failures.

## 2. Keep draft evidence and identity boundaries safe

**Files:** `src/features/timelogs/services/timelogs.service.ts` and its focused concurrency tests; `src/app/providers/reset-supabase-data-scope.ts` and tests; `src/lib/ui-session-storage.ts`, `src/context/AppContext.tsx`, affected hydration services and regression tests as confirmed by the audit.

- [ ] Add a RED regression: editor opens UUID/version v1, a remote read publishes v2, saving v1 must conflict without writing v1 content under v2 evidence. Cover an empty-days deletion too. Send the reviewed editor version/status, never silently rebind to the latest global cache. Preserve typed values on conflict and offer explicit reload.
- [ ] Add a RED identity regression with old receipts/query/snapshot/editor values and a delayed old read. Retire generations, cancel old reads, remove account queries and clear private in-memory/UI data before mounting the next account. Keep local demo behavior intact and guard any missing late-response epochs in touched hydration loaders.
- [ ] Verify existing shared draft freeze, save revision merge and final COO quote/conflict controls still pass. Do not rewrite the approval protocol.

## 3. Scoped refresh and stale state

**Files:** new `src/lib/operational-query-options.ts` and tests; events/timelogs/receipts query hooks; `useShiftWorkflows.ts`; `useBillingScope.ts`; new `src/components/layout/AppDataFreshness.tsx` and tests; mount inside `AppLayout.tsx`.

- [ ] Add RED tests using real QueryClient observers/fake timers: a fresh-cache remount reads again, two consumers share reads, changed server data reaches a mounted surface within the interval, local/hidden/offline/disabled cases do not poll.
- [ ] Operational Supabase queries use a 20-second interval, remount/focus/reconnect always. Interval below 30 seconds reserves time for the response. Unrelated global query defaults stay unchanged.

```ts
export const operationalQueryOptions = (remote: boolean) => remote ? {
  refetchInterval: 20_000,
  refetchOnMount: 'always' as const,
  refetchOnWindowFocus: 'always' as const,
  refetchOnReconnect: 'always' as const,
} : {};
```

- [ ] One guarded shell bridge observes browser visibility/focus/online, Capacitor `appStateChange` and tab navigation. Refresh only active operational keys; deduplicate concurrent reads, remove listeners on unmount, and never revive the previous identity. Navigation needs an explicit refresh because badge consumers keep queries mounted.
- [ ] Cached rows remain visible on offline/read failure. A small Czech stale banner explains that data may be old and offers a retry. Clear the warning only after successful reads/reconnect, not merely after clicking. Use real query state in tests and verify no bootstrap restart or editor remount.
- [ ] Spec review followed by quality review; fix material findings and rerun exact affected checks.

## 4. Real multi-account and iOS verification

- [ ] Time assignment, crew submission, CH return, crew correction/resubmission, CH/COO approval and invoice state change across separate Auth sessions. Distinguish writer's own immediate state from another account's refresh. Use actual server responses and visible UI, not only mocked tests or SDK readbacks.
- [ ] Test browser re-open/focus, native background/foreground, offline/stale/retry, dirty draft through refresh, conflict after another writer, logout and login as another actor. Record actual latency and device/account combinations in `docs/testing/2026-10-27-multi-account-refresh.md`.
- [ ] Run focused regression suites, lint/build and compare type diagnostics against the known 108. Broaden tests where concurrency/identity changes warrant it. Review the complete patch.
- [ ] Integrate reviewed source into origin/main, verify clean synchronized main, preserve `.env.local`, run `npm run ios:refresh:devices`. Report simulator and phone separately according to AGENTS. Update evidence/roadmap only for completed criteria; stage 4/public onboarding is not enabled by this work.
