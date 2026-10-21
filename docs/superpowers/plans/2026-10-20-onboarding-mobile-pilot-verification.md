# Onboarding mobile pilot verification

This is a disposable local test of one invited crew member. No linked Supabase migration/function deployment or real email delivery is authorized by this pilot.

## Isolated target

- Directory: `/Users/peetax/Projekty/.crewflow-onboarding-pilot-20261020`.
- API: `http://127.0.0.1:55431`; database port `55432`.
- Captured mailbox: `http://127.0.0.1:55434`; web activation: `http://127.0.0.1:8096/activate`.
- Synthetic recipients only: `@crewflow-onboarding.test`.
- Local credentials, raw invitation tokens, password fixtures and native overrides stay in the disposable directory with private file permissions. Do not commit them or paste their values into reports.

The initial schema was copied without application data from the existing local schema. Public account signup is disabled. The activation worker and frontend require explicit local opt-in. The existing invoice demo and linked backend are separate targets.

## Repeatable checks

From the repository worktree:

```sh
npm test -- src/features/onboarding/services/activation-handler.test.ts --maxWorkers=2
node --test scripts/onboarding-pilot-invite.test.mjs
node supabase/tests/crew-onboarding.integration.mjs /Users/peetax/Projekty/.crewflow-onboarding-pilot-20261020 --expect-disabled
node supabase/tests/crew-onboarding.integration.mjs /Users/peetax/Projekty/.crewflow-onboarding-pilot-20261020
node scripts/onboarding-pilot-invite.mjs /Users/peetax/Projekty/.crewflow-onboarding-pilot-20261020
```

Run the disabled check before enabling the worker. Before enabled integration, apply the reviewed migration only to the disposable database and serve `crew-onboarding` there with `CREW_ONBOARDING_ENABLED=true`. Allowed origins are the pilot web origins and Capacitor origins. No service key belongs in the frontend.

The invitation script rejects remote services, the old invoice demo, real recipient domains and header injection before it creates a profile. It calls the service-only invitation RPC, captures HTML/text mail through Mailpit, and writes the token-bearing `mobile-invitation.private.json` fixture privately. Its console summary contains only recipient, profile identifier, expiry, mailbox origin and fixture path.

Use separate recipients for automated activation and native review. A consumed link must show the existing-account state and must never be reused as a fresh invitation.

## Evidence recorded so far

- Handler TDD: expected failing assertions observed before implementation; 18/18 passed after implementation.
- Invitation guard/rendering TDD: missing implementation failed first; 11/11 passed after implementation.
- Before mobile UI implementation: full Vitest 187 files / 2,319 tests passed; lint passed; production build passed with existing bundle-size and dynamic-import warnings.
- SQL access test initially failed as expected before the invitation table existed. Initial migration was applied to the disposable database. Full SQL/Auth/Edge proof remains pending.
- Independent backend source review identified a nullable-phone contract mismatch and requested explicit ambiguous-network recovery documentation. Corrections are being verified.

## Native and runtime acceptance still to establish

- A captured email has both correct activation URLs and 48-hour wording.
- No Auth account/session exists before password completion; after completion there is one intended profile, one Auth user, only crew role and rate 250.
- Existing custom rate/history survive activation and explicit reissue; replay cannot reset the password.
- Expired, revoked, concurrently completed and untrusted metadata cases fail safely; anon/authenticated callers cannot invoke privileged RPCs or read private intent records.
- iOS warm/cold custom links reach activation before the login gate; imported identity, own password and ordinary login work against the real disposable backend.
- Logout/login and session restoration work in the native app; reused/invalid links have usable states.
- Final review, merged-main checks and the required development-device refresh are recorded separately for simulator and physical iPhone.

The custom scheme proves the installed-app pilot only. Public verified HTTPS Universal/App Links, installation handoff, Tally ingestion, production email delivery and public rollout remain later work.

## Interrupted activation recovery

An ambiguous Auth creation response is reconciled against its reserved user UUID. If the account cannot be confirmed, the claim stays locked because the earlier request could still commit. A service-authorized reissue revokes the old reservation and creates a new invitation for the same profile. This deliberately avoids retrying uncertain creation with a different password. No client can reset an existing user's password through activation.

## Paused at the user’s request — 2026-10-20

The user asked to stop for today and continue tomorrow. Do not continue implementation or arrange a scheduled wakeup without a new request.

- Current committed branch head: `6faf4dd` on `codex/tally-onboarding-design`. Backend source spec and quality reviews pass after phone normalization, 72-byte password validation and safe profile-deletion tombstones. Latest focused backend suite: 29/29 passed. Real SQL/Auth/Edge integration is still pending.
- Mobile implementation was interrupted. Preserve uncommitted package changes plus activation-link and activation-service source/tests. ActivationView, router/native handoff and actual iOS proof are unfinished. Do not mistake this working tree for a finished build.
- Full old invoice-demo database log was archived to the private `environment-repair` directory in the disposable pilot. The 90,557,601,199 source bytes were fully decompressed and SHA256-verified against the 2,444,090,628-byte gzip archive. Private manifest: `environment-repair/verified-log-backup.private.json`.
- The user approved archival, freeing the old log, and configuring standard log limits/restarting both local stacks. The stop request takes precedence: both local stacks were stopped cleanly, all four database/storage data volumes were verified present, and docker ps returned no running containers. VM disk is now 10% used (85G free). No further restart or configuration change should begin today.
- The proposed Colima configuration (json-file, max-size 10m, max-file 3, compress true) is saved privately as `environment-repair/colima.proposed.yaml`; original configuration and container settings were also saved. The global limit has NOT been applied.
- For tomorrow, first inspect saved stop/volume status and free VM space. Apply the already-approved limit safely, restore both local stacks and the old invoice worker secret from the private recovery env; prove effective log limits and preserved data. Then finish the independent backend runtime checks, native UI implementation/reviews and first mobile login. No linked backend deployment or real invitation is authorized.
- The temporary caffeinate process was stopped. No cloud handoff or automation was created.

## Resumed — 2026-10-21

The user explicitly resumed, requesting log limits first and then completion of the mobile onboarding pilot.

- Applied the prepared Colima configuration after verifying it differed only in Docker logging defaults, then restarted the empty local runtime.
- A disposable stress container generated 45,000,000 input bytes (base64 logging produces more output). Actual rotation retained exactly three files using `json-file`, `max-size=10m`, `max-file=3`, `compress=true`; retained disk size was 6,516,332 bytes at inspection. The disposable container was removed afterwards.
- Restored both Supabase stacks from their existing database/storage volumes. Verified the same volume names and the original invoice worker secret. All 15 running services have the exact logging limits above, including both databases and the restored invoice worker.
- Read-only old-demo presence check: 30 profiles, 30 Auth users, 63 invoices. No old-demo application data was modified.
- Private evidence: `environment-repair/log-rotation-proof.json` and updated `verified-log-backup.private.json`. Global log limits are now applied and verified.
- Mobile implementation and real disposable backend verification resumed. The earlier pause is superseded by the new user request.

### Backend and captured-email proof

- Applied the final reviewed onboarding objects only to the previously empty disposable target. Before replacement, old-schema preview returned null phone (observed runtime red); final SQL normalizes it to an empty string.
- Actual backend verification passed: 29 handler tests; disabled Edge check (1 group); enabled real GoTrue/Edge integration (12 groups); complete SQL access/binding/deletion suite with rollback; four direct anon/authenticated SQL probes returned exact SQLSTATE `42501`.
- The real integration proves reserved Auth UUID, exactly one intended profile and crew role, new rate 250, preserved custom rate/history, concurrent different-password first-wins behavior, Unicode password boundaries, deleted-profile tombstones, metadata refusal, cancel/reissue/expiry checks and transport-loss recovery. Ordinary password login succeeds and anonymous public signup is denied.
- Corrected pilot-only configuration: keep `auth.enable_signup=false` while enabling `auth.email.enable_signup=true` (the latter controls the email provider as well). Runtime flags were checked: signup disabled, email login enabled.
- Local image `17.6.1.106` has the upstream reserved-role permission-error crash tracked at <https://github.com/supabase/postgres/issues/2112>. Pilot-only `supautils.hint_roles=''` disables explanatory hints and lets the actual denial checks run. ACLs, owners, RLS and policies were captured before/after and remained byte-for-byte unchanged. No source or linked-backend workaround was deployed.
- Private runtime evidence lives in the pilot directory: `runtime-integration-enabled.log`, `runtime-sql-access.log`, `runtime-hint-workaround.json`. The enabled worker is serving the reviewed source.
- A genuine Mailpit message was captured for a separate mobile fixture. Recipient, subject, both correct web/native links and 48-hour wording passed API assertions. Before native completion, the fixture has zero Auth users, one unbound profile and rate 250. Tokens remain in private fixtures only.
- TypeScript comparison against a fresh `origin/main` snapshot: 110 existing diagnostics in both baseline and current code, with zero new diagnostics. A newly introduced backend mock literal-type error was corrected in `bd5b875`; focused handler tests still pass 29/29. Full project type checking remains blocked by the existing diagnostics.

### Source review and native handoff

- Mobile implementation: `8986d58`; native bridge logging protection: `fc68cbe`; transient preview retry: `471d74e`. Independent spec and quality reviews passed, including re-review of retry recovery and the combined native-provider/view regression.
- Full final Vitest run at the reviewed code: **192 files / 2,402 tests passed**, duration 67.03 seconds. Full ESLint passed. Production/pilot web builds passed with existing chunk/Browserslist/dynamic-import warnings. Final TypeScript comparison remains 110 baseline / 110 current / zero new diagnostics.
- The first full run exposed an inherited flaky StrictMode test. It reproduced on untouched `origin/main` (`535fa0a`) with identical source files. `fafa851` wraps initial async rendering in awaited React `act`, retaining the original disposed-session assertion. Twenty consecutive isolated runs and 27 focused regressions passed before the successful full suite. No application behavior changed.
- Built and launched a separate simulator-only installation with build override `PRODUCT_BUNDLE_IDENTIFIER=cz.nodu.app.onboardingpilot`; the shared app ID remains unchanged. iPhone 17 Pro simulator UDID: `B337323A-264B-4AAC-9236-BEAAB3701659`, iOS 26.5. DerivedData: `/private/tmp/crewflow-onboarding-ios-pilot`. The normal app/session was preserved.
- Private pilot build uses API 55431, anonymous client key, Supabase data source and `VITE_ONBOARDING_ENABLED=true`. Both synced native configs have `loggingBehavior=none` so SDK debug replies do not print invitation URLs.
- Actual captured-email custom link opened the correct activation form with imported identity in a running app and after the pilot app was stopped. No ATS weakening was required. Screenshot: `evidence/mobile-activation-before-password.jpg` in the private pilot directory.
- Mailpit messages were ephemeral across the Auth-provider fix/restart. Reissued the invitation explicitly to the same existing unbound mobile profile, preserving identity/rate and revoking its prior token; captured and verified the new message before the native handoff. No duplicate profile was created.
- Xcode UI snapshots omit WKWebView fields on this local runtime. The native frontend is **Device Hub**, bundle `com.apple.dt.Devices`; CUA can control its wrapper and observe the phone. The real form is visible in the selected iPhone 17 Pro window. CUA binding name: `onboardingDeviceHub`.
- **Waiting for human password entry.** Computer Use Confirmation Policy requires the user to enter, confirm and submit any new authentication credential themselves. The user was shown the real form and asked to activate it. They asked which account; clarified that it is only the separate local nodu profile “Mobilní Test” at the synthetic email saved in the private fixture. Never request or record that password in chat.
- After the user finishes: verify exact profile/Auth/crew/rate binding and visible authenticated identity; test native session restoration and used/invalid links without changing the password. Then complete integration into main, synchronize origin/main and run the required development-device refresh from a clean checkout with the original ignored `.env.local`. Physical iPhone was visible in Device Hub during this session; refresh must probe current availability and report its actual result separately.
- No main merge, remote backend deployment, real email delivery or development-device refresh has occurred yet. Root main retains its three unrelated modified files; preserve them. The separate pilot and restored local invoice services remain running with verified log rotation.

### Human activation and native session proof — 2026-10-21

- The user entered and submitted their own password in the simulator and confirmed activation. No password was requested, read or recorded.
- The native app opened the crew dashboard greeting “Mobilní Test”. A fresh read-only database assertion confirms exactly one matching profile (`933f4420-c17c-432b-8ced-9ccaf646de59`), bound to exactly one reserved Auth identity, only the `crew` role, rate 250 and a consumed invitation. Auth records an ordinary successful password sign-in immediately after activation.
- Stopped only `cz.nodu.app.onboardingpilot` and launched it normally without an activation link. The same authenticated dashboard returned, proving native session restoration.
- Reopened the actual captured invitation: the app displayed “Účet je již aktivní” and a working return-to-login link. With the existing session, that link returned to the correct dashboard. A malformed token was ignored; a correctly formatted nonexistent token displayed the invalid-invitation message and the same working return path.
- Private proof: `mobile-after-activation.json`, `evidence/mobile-after-activation.jpg`, `evidence/mobile-session-restored.jpg`, `evidence/mobile-used-invitation.jpg`, `evidence/mobile-invalid-invitation.jpg`.
- Used the native Settings → “Odhlásit se” control and observed the normal login screen. The user has been asked to sign in there with the same email/password for the final manual logout/login check. That repeat-login step remains pending; initial ordinary password sign-in and session restoration are already proven.
