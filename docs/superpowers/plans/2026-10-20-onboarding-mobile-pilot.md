# Onboarding Mobile Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete one real local test profile → captured activation email → password setup → normal authenticated login in the iOS app, with a 48-hour invitation and a 250 CZK/h new-profile default.

**Architecture:** A source-independent invitation record is held server-side; there is no Auth account or session for this invitation before password completion. A privileged activation endpoint validates a strong invitation token and creates an Auth user with the chosen password. A trusted database intent binds this exact Auth UUID to the existing intended profile in the Auth insert transaction, consumes the invitation, and grants only crew. The client then performs ordinary password sign-in. Tally ingestion, public release, bulk invitations and production backend changes are outside this first pilot.

**Tech Stack:** React/TypeScript, Supabase Auth/Postgres/Edge Functions, Capacitor App plugin, Vitest, local Supabase and Mailpit, Xcode iOS simulator.

---

## Environment and scope

- Worktree: `/Users/peetax/Projekty/crewflow/.worktrees/tally-onboarding-design`.
- Branch: `codex/tally-onboarding-design`; preserve the two reviewed design commits.
- Isolated backend directory: `/Users/peetax/Projekty/.crewflow-onboarding-pilot-20261020`.
- Local ports: API 55431, Postgres 55432, Mailpit 55434, web app 8096. Do not mutate the other invoice demo or linked databases.
- Test recipients use only `@crewflow-onboarding.test`. Local email is captured, never externally delivered.
- Frontend activation is opt-in via `VITE_ONBOARDING_ENABLED=true`; normal installations retain the existing login path.
- The activation function is opt-in via `CREW_ONBOARDING_ENABLED=true`. No linked deployment is performed by this plan.
- Custom scheme `nodu://activate` provides local mobile proof. Verified HTTPS Universal/App Links remain an explicit public-deployment requirement because a public host/domain association is not configured in this pilot.

## Shared HTTP contract

One public Edge Function, `crew-onboarding`, accepts POST JSON. It must validate origin, body size, structure and token before any Auth mutation. SQL helpers are executable only by service_role, not anon/authenticated.

```ts
type PreviewRequest = { action: 'preview'; token: string };
type CompleteRequest = { action: 'complete'; token: string; password: string };
type InvitationPreview = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  expiresAt: string;
};
type ActivationComplete = { status: 'active'; email: string; profileId: string };
type ActivationError = {
  error: 'disabled' | 'invalid_invitation' | 'expired_invitation' |
    'already_active' | 'activation_in_progress' | 'invalid_password' |
    'activation_unavailable';
};
```

The HTTP envelope is `{ data: InvitationPreview | ActivationComplete }` on success and `ActivationError` on failure. No service key, raw invitation record or password is returned or logged. Passwords require at least 12 characters and a finite upper size bound; their storage remains solely with Auth.

## Task 1: Backend activation transaction and genuine local integration

**Files:**
- Create migration through `supabase migration new crew_onboarding_pilot`.
- Create `supabase/functions/crew-onboarding/index.ts` and a small dependency-injected handler module.
- Create unit tests under `src/features/onboarding/services/activation-handler.test.ts`.
- Create `supabase/tests/crew-onboarding.integration.mjs` and a SQL access/transaction test.
- Modify `supabase/config.toml` to declare this function's public invocation; authorization is the invitation capability, not an Auth session.

- [ ] Write the failing tests before implementation. Cover valid preview, disabled configuration, malformed/expired/used token, weak password, no mutation on preview, no log/response secrets and dependency failures. Run focused Vitest and record expected failures.
- [ ] Use a private, non-exposed invitation table with a hash of a 256-bit token, profile ID, immutable invited email, reserved Auth UUID, 48-hour expiry, state and timestamps. Public service-only RPC wrappers use exact grants, fully qualified objects and an empty search path. Enforce one current invitation per profile and revoke previous records on explicit reissue.
- [ ] Implement service-only creation of an invitation for a new or unbound existing profile. New profiles get 250; existing profiles retain their rate, UUID and history. Existing bound/ambiguous profiles are rejected without changing identity. Preserve the neutral meaning of experience; no skill/rating inference is introduced.
- [ ] Implement service-only preview and claim. Claim serializes concurrent completion, reserves the exact Auth UUID, checks immutable email/profile binding and expiry again, and exposes no password to SQL. Repeated completions cannot reset an already active user's password. Failure recovery first reconciles the reserved user. An ambiguous result with no confirmed user remains locked because an earlier Auth request might still commit; explicit service reissue revokes that reservation and creates a new one for the same profile. Never retry uncertain creation with another password.
- [ ] Update `handle_new_user` to consume only a private trusted intent matching the reserved Auth UUID and exact email. In that Auth insert transaction, bind the existing unbound profile, grant crew, consume the invitation and preserve rate/history. An untrusted `user_metadata` target cannot bind a profile. Preserve the existing legacy path for unrelated account creation; this pilot does not enable general public registration.
- [ ] In the Edge Function validate preview/claim, call `auth.admin.createUser({ id: reservedUserId, email, password, email_confirm: true })` only after a valid claim, and reconcile any ambiguous transport error. Never update the password of an existing user. Before returning success check the consumed invitation and final profile/user binding. Expiry/revocation must also be checked inside the insert transaction.
- [ ] Run the unit tests to green, then the real local integration tests. Prove ordinary password sign-in, one profile and Auth user, crew role, rate 250, preserved custom existing rate, invalid/expired/reissued token rejection, concurrent activation and denial of anon/authenticated access to all private/privileged operations.
- [ ] Commit only this task's tested files.

## Task 2: Mobile activation screen and link handling

**Files:**
- Create `src/features/onboarding/services/activation.service.ts` and tests.
- Create `src/features/onboarding/activation-link.ts` and tests.
- Create `src/features/onboarding/ActivationView.tsx` and tests.
- Create `src/features/onboarding/NativeActivationLinks.tsx` and tests.
- Modify `src/App.tsx` to register `/activate` and mount the link listener inside the router.
- Modify `ios/App/App/Info.plist`, Android manifest and Capacitor package files for the verified plugin/custom scheme.

- [ ] Write failing tests for the API contract, invalid/external link rejection, native cold/warm start, and routing to activation before AppShell's login/data-bootstrap checks. A hash token is held only for the activation operation and removed from visible history; it is not put in localStorage.
- [ ] Implement a small API adapter using the existing Supabase client and the shared HTTP contract. Handle Supabase function non-2xx responses without replacing actionable error codes with raw transport errors.
- [ ] Write screen tests for loading, preview, expiration, password confirmation mismatch, duplicate submission, backend failure and ordinary password sign-in after completion. Do not fake backend success or make a dev-login shortcut.
- [ ] Implement a mobile-sized Czech form matching LoginView's nodu appearance: imported identity, password and confirmation, 48-hour information, one activation button, accessible errors and a return-to-login action. Do not collect billing details here. After activation use existing `signIn(email, password)`, clear password/token state and replace navigation with `/app`.
- [ ] Install a pinned compatible official `@capacitor/app` plugin. Use `getLaunchUrl` plus `appUrlOpen`, clean up listeners, validate exact scheme/host/path and reject arbitrary redirects. Support configured trusted HTTPS activation URLs as well as the pilot custom scheme.
- [ ] Register `nodu://activate` in native targets, sync Capacitor, and prove both a running app and a closed app route to activation. Do not add an unconfigured public-domain association or claim public Universal Links have been validated.
- [ ] Run focused new tests plus existing auth/routing regressions, then commit tested files.

## Task 3: Captured email and repeatable disposable profile

**Files:**
- Create `scripts/onboarding-pilot-invite.mjs` and a focused Node test for validation/rendering.
- Create `docs/superpowers/plans/2026-10-20-onboarding-mobile-pilot-verification.md`.
- Keep credentials, tokens, generated test password, Mailpit contents and native build overrides only in the ignored disposable backend directory.

- [ ] Write failing tests proving the local-only/backend-directory and synthetic-recipient guards reject a linked/remote URL, real recipient, missing configuration and header injection.
- [ ] Implement the local script: read local CLI status without printing keys, generate/hash the token, call the service-only invitation RPC and send a real message to local Mailpit. Render one web activation URL plus an explicit open-in-app option. Save private fixture material with mode 0600, print only a safe summary and the mailbox origin.
- [ ] Fetch the captured message through Mailpit's local API and assert recipient, subject, 48-hour wording and correct web/native activation paths. Never forward tokens to an installation/analytics URL.
- [ ] Run this script only against the disposable target. Create separate synthetic profiles for automated activation tests and for the native review so an already-consumed link is not mistaken for a valid invitation.
- [ ] Commit the guarded script/tests and verification instructions, not local fixtures.

## Task 4: End-to-end proof, review and integration

- [ ] Independently review backend spec compliance, then security/code quality, before proceeding to UI implementation. Repeat that review sequence for UI/integration. Fix important findings with regression tests.
- [ ] Run the real backend suite and all changed frontend tests. Verify no Auth account can sign in before activation, expiry remains 48 hours, active-user password cannot be changed by replay, and reserved profile/history/rate are preserved.
- [ ] Run full Vitest, lint and production build. Compare type diagnostics to the existing baseline; do not claim unrelated pre-existing type failures were repaired.
- [ ] Build and launch the iPhone simulator app against the isolated local backend. Capture activation and the correct logged-in crew identity. Check the cold/warm link path, ordinary logout/login, session restoration, and invalid/reused link handling. Report any unverified UI step precisely.
- [ ] Commit verification evidence paths and results without secrets. Review the complete diff, integrate the verified work into main while preserving unrelated changes, synchronize with origin/main, and run the required `npm run ios:refresh:devices` from a clean checkout. Preserve ignored `.env.local`; report simulator and phone outcomes separately.
- [ ] Do not deploy the migration/function to a linked backend or send real invitations as part of this pilot. Report the first test slice separately from later Tally automation, account suspension, public Universal Links and production email delivery.

## Self-review

- This plan implements the user's first test slice and the approved source-independent/mobile-first/48-hour/250 requirements.
- Tally parsing, wider recruitment administration and a production rollout are deliberately separate work.
- Credential creation is postponed until the valid invitation is completed. This refines the earlier short-lived-preactivation-session design and avoids introducing an active session requiring broad authorization changes before the test slice can function.
- The public registration restrictions and developer-role-switch hardening remain prerequisites before allowing additional real users into a public deployment, not claims of this local test.
