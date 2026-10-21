# Manual crew invitations — verification

## Authorized scope and baseline

The user requested an invitation action in the member profile and a 250 CZK/h new-member default. The user explicitly selected test-only invitations after the real-delivery alternative was explained. Tally stays disconnected. No real mail delivery or linked backend deployment is authorized by this change.

Branch `codex/manual-crew-invitations` reuses the clean worktree `/Users/peetax/Projekty/crewflow/.worktrees/tally-onboarding-design`, based on main `cac82bd`. Root main has three unrelated working files (Info.plist and TimelogsView source/test); preserve them. Focused baseline: 45/45 tests passed across CrewView, CrewDetailView and activation handler.

The disposable backend remains `/Users/peetax/Projekty/.crewflow-onboarding-pilot-20261020`, API 55431, DB 55432, Mailpit 55434. Keys, operator passwords, JWTs, activation capabilities and captured mail remain in private files only. A host-side UI preview runs at `http://127.0.0.1:8096` using only the pilot anonymous client key, real Supabase login and explicit local activation/invitation flags.

## Backend task

Implementation commit: `3246b794782f407f10f158322588605257b2e1a1`.

- Separate authenticated `crew-invitations` endpoint; allowlisted actual Auth UUID plus database COO role. Explicitly rejects anonymous Auth and nonallowlisted callers, including a self-promoted COO using the existing mutable developer-role RPC.
- Only the fixed local Supabase/Mailpit targets and synthetic recipient domain are supported. No real mail provider or relay is configured. Safe management responses contain only state, selected profile/email, invitation ID and expiry.
- Service-only status/preparation/capture/exact-cancellation RPCs preserve existing activation semantics. Manual request UUIDs and optimistic invitation versions prevent duplicate sends and stale replacement. Ambiguous capture failure revokes only its exact pending preparation. Preparing status never claims successful delivery.
- Database rate default is 250 for future omitted values. Existing custom rates, explicit zero and history remain unchanged. No Auth account is created by invitation preparation.
- TDD evidence: handler initially 41 failing / 1 passing, then 42/42 passing. SQL helper absence and actual disabled HTTP were observed before local enabling.
- Verification: focused onboarding Vitest 107/107; existing email script 11/11; real manual integration 12 groups; unchanged real activation integration 12 groups; scoped ESLint clean. Parent independently reran new handler 42/42 and old scripts 11/11 and inspected all 12 manual runtime PASS groups.
- TypeScript remains at the accepted 110 existing diagnostics, with none referencing new backend files/tests. Local security advisors returned nine existing warnings, none naming the new manual helpers; this is not a claim that existing public authorization is ready for release.
- Private evidence: `manual-integration-enabled.private.log`, `manual-activation-regression.private.log`, `manual-backend-vitest.private.log`, `manual-handler-red.private.log`, `manual-sql-red.private.log`, `manual-http-disabled.private.log`, `manual-advisors.private.json`.
- Pilot worker restarted alone, with copied committed sources verified equal; serve session 27935. The restored old invoice demo and log configuration were untouched. Existing activation remains enabled only in the disposable pilot.
- Independent spec review passed. Quality review found one status defect after a saved recipient change: captured mail to A was attributed to current email B. Correction `e9095281` reports `not_invited`, retains the old optimistic invitation version and returns no expiry, without revoking on read. Actual HTTP RED was reproduced, then 14/14 manual integration groups passed including stale email, explicit replacement, competing requests and claiming protection. Private evidence: `manual-stale-email-{red,green,apply}.private.log`. Targeted independent spec and quality re-reviews both passed; no remaining findings.

## Frontend implementation and checks

Implementation `ab6e804` adds the COO-only profile panel, explicit local/test configuration and genuine-session guards, safe API adapter, 48-hour confirmation, version-checked replacement and async identity isolation. The real new-member form starts at 250 and preserves custom/zero saved rates. Independent spec review passed; quality found no critical/important issue and identified keyboard focus restoration improvements.

The first full parent run exposed one existing COO workflow test fixture without an Auth provider (2526 passed/one failed), rather than an application provider failure. Correction `72de4d3` retains its workflow assertions and supplies a safe provider; it also registers the dialog trigger for cancel/Escape focus restoration. Parent rerun passed 2529/2529 tests in 196 files. Final narrow correction `5a5b077` returns focus to the recovery button on a failed submit, with observed RED then 46 affected tests passing. Targeted independent spec and quality re-reviews both passed, including an independent 2/2 focus probe. A final merged-code full run remains pending.

Parent full ESLint passed, normal production web build passed with existing chunk/import warnings, and TypeScript produced exactly the accepted 110 existing diagnostics with none in changed files. Existing email scripts passed 11/11. Private frontend evidence index: `/private/tmp/crew-invitation-frontend-proof.md`; full parent logs: `/private/tmp/manual-invitations-full-vitest-final.log`, `/private/tmp/manual-invitations-eslint-final.log`, `/private/tmp/manual-invitations-full-build.log`, `/private/tmp/manual-invitations-full-types.log`.

## Runtime fixture and preparation

A dedicated synthetic operator and uninvited target were created without modifying the earlier “Mobilní Test” account. Credentials are only in `manual-invitation-operator.private.json` (mode 0600). Operator Auth UUID: `bda0ee6e-db97-4afe-9002-2d4316935913`; target profile UUID: `0c69d4ac-8134-459a-a6f5-14759f4481b6`.

Parent used ordinary email/password login in the real browser preview, observed the COO role and selected the target “Manual Invitation”. No session injection, client service key or developer-login shortcut was used. Dialog cancellation left zero messages and unchanged status/profile. Actual UI submission captured one message with a 48-hour expiry; explicit UI replacement captured a second and made the first link invalid. Anonymous activation preview accepts exactly one current link. Profile/rate/note remain unchanged and no Auth user was created. Selecting the operator's existing profile showed “Účet je aktivní.” with invitation disabled. The target is now pending activation.

The UI baseline snapshot records `not_invited`, zero captured messages, rate 250 and no Auth binding. A separate private simulator preview project uses bundle `cz.nodu.app.manualinvitations` and display name `nodu test`, preserving the earlier pilot installation and its human-tested session. Build/run succeeded; parent signed in normally as the separate operator, selected the target and observed its actual pending status/expiry through native-origin authenticated requests. Replacement confirmation and cancellation work without an extra message. A small mobile header/close-button overlap is being corrected before final visual acceptance. The normal clean-main checkout has neither activation nor invitation frontend opt-in flag set.

Private runtime proof: `manual-ui-runtime-proof.private.log` reports two captured messages, one valid link, unchanged profile and zero created Auth users. Actual browser screenshot: `manual-invitation-web-proof.png` (embedded in progress). The normal-main device refresh remains pending.

The old local baseline schema does not contain every recent shared-workflow/activity helper used elsewhere in main. A pre-existing empty-dashboard/activity widget can therefore show unavailable data in this disposable pilot. This feature does not modify those unrelated workflows; invitation/profile verification is recorded separately.

## User-requested stopping point — 2026-10-21

The user explicitly stopped work to continue next time. Do not treat this checkpoint as completed integration. Source is committed through `d592776` on `codex/manual-crew-invitations`; root main/origin remain unchanged at the previous baseline. No final main merge, push or normal-device refresh has happened for this feature.

The mobile overlap correction reserves a 48px header gutter while preserving the 44px close target. Its spec and quality reviews passed, 36 panel tests/scoped lint passed, and the final pilot web bundle build completed successfully. The installed separate simulator app still contains the earlier bundle: copying the corrected bundle, rebuilding/relaunching and visually confirming the dialog remain the next step. It is already genuinely logged in as the separate test operator and showing the pending target profile; no user password was changed.

Private staging project: `manual-mobile-preview/` under the pilot directory; bundle `cz.nodu.app.manualinvitations`, display `nodu test`. XcodeBuildMCP profile `crewflow-manual-invitations`, DerivedData `/private/tmp/crewflow-manual-invitations-ios`, simulator `B337323A-264B-4AAC-9236-BEAAB3701659`. Rebuild the pilot assets with `build-native-pilot.mjs`, copy to staging `dist/`, run Capacitor copy there, then build/run the existing profile. Original pilot app/session remains intact.

Runtime target has two captured messages and one valid current link, no Auth account, rate250 and preserved note/history. `manual-ui-runtime-proof.private.log` confirms the result. Existing operator credentials remain only in mode0600 `manual-invitation-operator.private.json`; never display them. Browser preview tab2 is retained for later continuation. The temporary UI preview is stopped for this pause. No pilot CLI serve process remains; existing Docker services/databases and the older invoice demo are retained. Restart only the pilot worker from its `.env.functions` and UI with `manual-invitation-ui-server.mjs` when resuming. Do not re-run fixture setup or reset the original “Mobilní Test” account.

Root's three unrelated working files remain preserved; their pre-integration diff backup is `/private/tmp/manual-invitations-unrelated-before.patch`. Use the existing clean main checkout for final verification/device refresh and preserve its ignored `.env.local`.

## Remaining acceptance

- Final mobile dialog layout verification after the close-button gutter correction.
- Full test/lint/build/type comparison and final review.
- Verified integration, main synchronization and required simulator/physical-phone development refresh with preserved local configuration. No linked deployment, real recipient or Tally automation.
