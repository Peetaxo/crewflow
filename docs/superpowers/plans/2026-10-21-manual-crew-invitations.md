# Manual Crew Invitations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Let an authorized test operator prepare a 48-hour activation invitation directly from a saved member profile, and make new-member defaults consistently 250 CZK/h, with real delivery and Tally disabled.

**Architecture:** A dedicated authenticated Edge Function authorizes a server-allowlisted COO and calls service-only SQL preparation/status/acknowledgement helpers around the existing activation transaction. Capture email only in the dedicated pilot Mailpit. A small profile panel and API adapter consume safe metadata, without exposing activation capabilities.

**Tech Stack:** React/TypeScript, existing UI/dialog components, Supabase Postgres/Auth/Edge Functions, Vitest, Mailpit, Capacitor/iOS.

---

Approved contract and exact edge cases: `docs/superpowers/specs/2026-10-21-manual-crew-invitations-design.md`. Worktree: `/Users/peetax/Projekty/crewflow/.worktrees/tally-onboarding-design`; branch `codex/manual-crew-invitations`; baseline main `cac82bd`. Preserve root working files. Local target only: `.crewflow-onboarding-pilot-20261020`, API 55431, DB 55432, Mailpit 55434. Never print its keys/tokens/passwords.

## Task 1 — Privileged test invitation API and SQL

**Create:** migration via `supabase migration new manual_crew_invitations`; `supabase/functions/crew-invitations/{index,handler}.ts`; focused handler tests under `src/features/onboarding/services/`; real runner `supabase/tests/crew-invitations.integration.mjs` and SQL access checks. **Modify:** `supabase/config.toml`; email renderer/shared module as required. Own the database default here.

- [x] Write handler tests using the exact request/status/error unions in the spec. Minimum cases: disabled before dependencies, no/invalid bearer, nonallowlisted caller even with COO role, wrong origin/JSON/UUID/oversized body, missing profile/email, normal domain, safe successful capture/status and capture failure. Assert no raw token or backend error in any response. Run and record the expected red.
- [x] Create the migration with CLI discovery (`supabase migration --help`, then `new`). Add `manual_request_id uuid unique` and `mail_captured_at timestamptz` to the private invitation record, plus service-only `crew_onboarding_manual_status`, `crew_onboarding_manual_prepare` and `crew_onboarding_manual_capture` helpers. A concrete prepare call is:
  ```ts
  service.rpc('crew_onboarding_manual_prepare', {
    p_profile_id: body.profileId, p_expected_email: body.expectedEmail,
    p_request_id: body.requestId, p_expected_invitation_id: body.expectedInvitationId,
    p_replace_existing: body.replaceExisting,
  });
  ```
  Status takes `p_profile_id`; capture and separate `crew_onboarding_manual_cancel` take exact `p_profile_id`, `p_request_id`, `p_token_hash`. The old core cancellation helper accepts only a profile; retain its signature and wrap it under an exact-request check/email lock. See the spec for optimistic version, replay and current-invitation checks. Preserve all core activation functions and existing profile values. Include `alter table public.profiles alter column hourly_rate set default 250;` without any row update.
- [x] Implement a dependency-injected handler. Validate configuration/local targets, bearer/Auth user + server UUID allowlist + database COO role, origin/body, then dispatch status or prepare. Prepare reads trusted profile email, creates no Auth account, sends captured HTML/text mail, acknowledges that exact invitation and returns only safe status. Failure cancels only its token hash. No raw diagnostics/logs. The index supplies pinned Supabase 2.103.0 and the fixed allowed local Mailpit transport.
- [x] Move/reuse the existing small escaped renderer if needed, retaining the existing 11 script tests. Use `verify_jwt=false` with explicit bearer validation for compatibility with local keys, as existing functions do; never accept the anon key as user authorization.
- [x] Observe SQL/API red against the disposable target, apply only these reviewed new objects locally, then verify green. Test ordinary authenticated operator requests against real GoTrue/Edge/Mailpit, role/allowlist denials, service-only grants, mail failure/replay/replacement races, stale email/version and custom/zero/history preservation. Guard every runner against a remote API and nonsynthetic recipient. Save private proof logs. Commit only tested task files.
- [x] Independent spec review, followed by quality/security review; repair and re-review all important findings before Task 2.

## Task 2 — Profile invitation controls and form default

**Create:** `src/features/onboarding/services/invitations.service.ts` and its tests; `src/features/onboarding/CrewInvitationPanel.tsx` and its tests. **Modify:** `src/views/CrewDetailView.tsx`, existing detail tests, `src/views/CrewView.tsx`, existing crew/new-member tests, `src/vite-env.d.ts`. Use the settled backend contract from Task 1.

- [x] Write failing tests for a profile panel showing the exact “Pozvat do aplikace” action, dialog recipient/48-hour/test wording, cancellation with zero writes and one-request duplicate suppression. Cover no saved UUID, missing/normal email, loading/errors, active/claiming, pending/expired/preparing and explicit version-checked replacement. Add stale profile/email/session response cases.
- [x] Implement the thin Supabase Functions adapter with validated safe response parsing and `FunctionsHttpError` translation. Operational UI requires `VITE_CREW_INVITATIONS_ENABLED=true`, activation enabled, data source Supabase, dedicated local API port 55431, real non-dev session and server authorization. In ordinary configured installations show the disabled explanation without network calls.
- [x] Mount the panel directly below the profile header for COO management only; use a keyed boundary for profile/email/current Auth identity so older async state cannot bleed across profiles or users. Use existing Dialog/Button patterns, 44px targets, readable mobile layout, accessible alerts and labels. Success wording says captured test invitation, never real email delivery. Do not expose raw capability URLs or add new recruitment UI.
- [x] Change `createEmptyContractor`’s rate to 250. Extend the existing form interaction test to assert the new default and preservation when editing an existing custom rate; no bulk data/fixture rewriting.
- [x] Run new tests, existing CrewView/CrewDetailView/auth/routing regressions, lint and build. Commit tested files. Independent spec review then quality review; repair/re-review before final acceptance.

## Task 3 — Runtime/UI proof, integration and development installations

- [ ] Prepare a separate synthetic allowlisted operator and target in the same disposable pilot; keep their credentials only in a private fixture. Enable only the local worker/frontend test flags. Do not modify the existing Mobilní Test account. Validate the genuine invite button → confirmation → captured message → 48-hour pending status, plus replacement and active-account state. Use ordinary sign-in, with no injected session or client service key.
- [ ] Independently inspect all new code and the real runtime proof. Run full Vitest, full ESLint, existing script tests and production build. Compare type diagnostics with baseline. Save a concise verification document and private screenshot paths, without secrets.
- [ ] Integrate the verified branch into main and push/synchronize. Preserve root unrelated changes and ignored local configuration. Reuse the clean main checkout at `/Users/peetax/Projekty/.crewflow-onboarding-main-20261021` for `npm run ios:refresh:devices`. If an available phone needs unlock/trust, request only that missing device action and resume the failed step after it changes. Report actual simulator/phone outcomes separately.
- [ ] Finish the checklist/documentation and keep normal public onboarding/real delivery/Tally disabled. The existing local log limits must remain effective; no log-runtime reconfiguration is required for this feature.
