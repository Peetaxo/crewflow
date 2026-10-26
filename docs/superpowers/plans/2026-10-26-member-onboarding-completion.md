# Member Onboarding Completion Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development with explicit file ownership and independent spec/quality review. Recovery and welcome have separate files; the parent exclusively owns Git staging/commits and local runtime configuration.

**Goal:** Prepare the complete pilot trial, password recovery and skippable first-use guide with the user-selected8-character password minimum.

**Architecture:** Official Supabase recovery in an isolated in-memory Auth client; separate recovery-link context/router. Local-only gates and Mailpit template. Client-local per-Auth-UUID welcome preference and shared guide, mounted at the authenticated shell and reopened in Settings.

**Tech Stack:** Existing React/Router/Capacitor/Supabase2.103.0, Vitest, Mailpit and local GoTrue.

---

Spec: docs/superpowers/specs/2026-10-26-member-onboarding-completion-design.md. Branch codex/member-onboarding-completion, base ebe6718, reuse tally-onboarding-design worktree. Do not modify dirty root checkout or deploy to a linked backend. No key/password/token/HTML output.

## Task 1 — Recovery and shared password policy

Owned files: new password-recovery service/link/context/views/tests under src/features/onboarding; App.tsx; LoginView.tsx/tests; existing activation policy/view/handler/tests and their integration boundary cases; activation-link/NativeActivationLinks and tests; local activation-email renderer/manual handler and tests for the unique test scheme; supabase/templates/recovery-pilot.html; source Supabase Auth minimum8 configuration. Do not touch AppLayout, SettingsView or welcome files.

- [ ] Write failing tests for gating, generic requests, exact recovery-type verification, isolated sessions,8-character/72-byte bounds, cleanup/stale operation and native/web cold/warm links. Update existing activation boundary expectations from11/12 to7/8 and observe intended RED.
- [ ] Implement request service and per-token completion operation with explicit disposal and retries. Verified recovery-session identity authorizes updateUser; opening a link does not sign in the normal client. Catch safe error codes only.
- [ ] Implement request/reset views with accessible Czech labels, duplicate-submit suppression, validation, safe retry/new-request and success-to-local-signout/login. Add pilot login link and gated routes/context provider. No normal-build network calls when disabled.
- [ ] Support nodu-test links only in the local pilot, while preserving existing activation URLs and public scheme behavior. Update only local capture renderer/fixtures to generate unique test-native activation links. Add a named local recovery email template; no production localhost template activation.
- [ ] Run focused tests/lint and compare type diagnostics. Report tested diff/files/logs to parent; no Git commits while the independent task writes. Parent stages exact owned files and obtains spec then quality review.

## Task 2 — First-use guide

Owned files: new CrewGettingStarted component/gate/local preference service and tests; components/layout/AppLayout.tsx/tests; views/SettingsView.tsx/tests. Do not touch App.tsx, LoginView, activation/recovery files or AuthProvider.

- [ ] Write failing tests for genuine crew eligibility, disabled/managers/dev/loading boundaries, first display, skip/continue, per-account persistence, storage failure, identity change and reopening from Settings.
- [ ] Implement the3-point guide from the spec using existing tokens/controls,44px actions and safe mobile layout. Keep it separate from public WelcomeView.
- [ ] Mount a keyed gate inside existing authenticated AppProvider context. Both skip/continue allow entry, primary opens my-shifts. Store only UUID/version preference. Reopen the same guide from a crew Settings control without changing the settings-section union or other settings behavior.
- [ ] Run focused tests/lint, self-review and report exact owned files/logs. No Git staging/commits; parent handles those and independent reviews.

## Task 3 — Runtime, integration and installations (parent)

- [ ] Restore existing local Docker/pilot services with data/log limits preserved. Keep old invoice demo unchanged. Configure only pilot GoTrue minimum8, recovery redirect/template and unique simulator scheme; copy reviewed Edge source. Preserve the original human test account.
- [ ] Create a fresh synthetic user trial through admin form/invitation UI, capture mail and prepare native activation for human password handoff. Independently run guarded API integration for activation/recovery/identity/rate/password bounds and one-use semantics; no real emails or account changes outside the test fixtures.
- [ ] Complete spec then quality reviews for both tasks and combined changes. Run full tests/lint/build, compare existing type diagnostics and inspect actual mobile/web recovery/welcome screens. Record any human-only pending step honestly.
- [ ] Integrate/synchronize main without overwriting root unrelated work. Verify clean merged main, run required ios:refresh:devices preserving .env.local. Refresh separate pilot too. Report simulator/phone separately and resume only the failed launch after any actual unlock request.
- [ ] Save verification and a concise self-service trial guide; Tally and real delivery remain disabled. Finish all code/configuration work independently of a pending human password entry.

Official references checked: Supabase resetPasswordForEmail, verifyOtp and email template docs; current changelog fetched2026-10-26. Existing pinned SDK supports recovery verification and scope-local signout; no dependency upgrade.
