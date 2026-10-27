# Stage 2 — access hardening, then dashboard

> Use executing-plans task by task. The user explicitly authorized stage 2 and specified server authorization first, dashboard second. No exception for the preview role switcher.

**Goal:** Ordinary authenticated users cannot change their real role; the dashboard shows current-calendar-month hours without hiding outstanding work.

**Design:** Keep the obsolete role RPC signature as a nonprivileged, always-denied compatibility endpoint and revoke client execution. This protects old installations as well as new clients. Disable real-session switching in AuthProvider and remove the preview buttons. Existing synthetic/local development sessions never write backend roles. Retain the existing management role-administration policy. Verify management profile creation separately using the already reviewed unlinked-only policy; do not change legitimate identities or existing role assignments.

Revocation alone could be undone by a later grant; dropping the RPC would unnecessarily invalidate older generated client contracts. An always-denied invoker function plus revoked grants is the selected bounded change. `supabase/user-role-switching.sql` must contain the same safe definition so manual application cannot restore the vulnerability.

The dashboard derives a month label and date-only bounds from the current local calendar date. Filter individual timelog days, sum with existing hours arithmetic and approved statuses. Approval queues retain their full time range. No new period selector or global query changes.

## 1. Server permission regression and fix

- [ ] Add `supabase/tests/self-role-escalation.sql`: verify no PUBLIC/anon/authenticated/service-role execution, invoker semantics and direct denied calls in a transaction; verify current role rows remain identical. Run against the named isolated pilot before changing SQL and observe RED.
- [ ] Create a migration through `supabase migration new disable_self_role_switching`. Implement `security invoker`, empty `search_path`, unconditional SQLSTATE `42501`, and `revoke all ... from public, anon, authenticated, service_role`. Mirror the definition in `supabase/user-role-switching.sql`.
- [ ] Apply only this reviewed SQL to the local pilot and rerun the regression GREEN. Run actual REST/Auth role attacks with synthetic accounts, restore/delete only owned fixtures, and verify existing user-role snapshots.
- [ ] Verify owner/management API access for profiles, timelogs, assignments, invoices/documents and invitation helpers. Reuse existing local tests where appropriate and record exact coverage, including unavailable runtime objects.
- [ ] Review the complete restrictive migration, apply to the linked backend requested by the user, and repeat permission checks. Keep a private before-snapshot and rollback procedure. No role assignments are rewritten. Verify management INSERT with unlinked-only checks before considering its existing migration for the linked backend.

## 2. Client guard and obsolete controls

- [ ] In `AuthProvider.test.tsx`, replace authenticated-switch expectations with tests that a real crew/CH/COO session keeps its role and data scope and never calls the role RPC. Observe RED, then replace the real-session branch with a clear permission error.
- [ ] Remove mobile and sidebar role switch buttons and their handlers; update existing layout/sidebar tests to assert absence. Keep ordinary navigation, current-role labels and account sign-out working. Verify the focused auth/layout suites.

## 3. Dashboard (only after authorization fix verified)

- [ ] Add regression cases in `DashboardView.test.tsx` for current month/year label, per-day allocation across December/January, empty month, approved statuses and historical pending work on mobile/desktop across crew/CH/COO. Observe the intended failures first.
- [ ] Use `format(date, 'LLLL yyyy', { locale: cs })`, `startOfMonth`/`endOfMonth` date-only bounds and `calculateTotalHours(timelog.days.filter(...))`. Replace the fixed April label and all-time approved-hours sum only.
- [ ] Focused tests, lint, build, typecheck comparison against the recorded 109 diagnostics. Run full Vitest with at most two workers at integration.

## 4. Integration and development installations

- [ ] Independent code review per requesting-code-review; resolve material findings.
- [ ] Commit exact owned files, integrate into current remote main, preserve unrelated root changes and verify synchronized clean main.
- [ ] Preserve ignored `.env.local`, run `npm run ios:refresh:devices` with preflight intact. Report simulator and phone outcomes separately; only unavailable phone can remain waiting.
- [ ] Update stage-2 evidence and roadmap with actual API, UI, test and device results. Keep public onboarding/delivery disabled.
