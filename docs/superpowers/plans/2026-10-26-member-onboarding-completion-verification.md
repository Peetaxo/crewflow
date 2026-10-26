# Member completion pilot — verification

Date: 2026-10-26. Application commit: `114934c`. Test phase only; no Tally connection, real-recipient delivery or linked backend deployment.

## Verified source

- Activation and recovery share minimum8 Unicode codepoints and maximum72 UTF-8 bytes. Local GoTrue minimum8 is active; no forced character classes.
- Recovery uses official Supabase SDK2.103.0 with an isolated, nonpersistent Auth client. It verifies only on explicit valid form submission, keeps its own verified session for retry, and signs out the current normal local session only after the success CTA. Existing/unknown request responses are generic.
- Recovery links are strict bounded token-hash URLs; native activation/recovery use `nodu-test` only in the separate pilot. Both native listeners mount before route readiness gating; regression tests cover newer warm links against older cold launches in both directions.
- Crew introduction is optional, skips/reopens from Settings, and stores only per-UUID/version local preference. Auth refresh/loading no longer remounts the operational subtree or discards drafts. Stale guide controls are invalidated.
- Independent spec and quality reviews completed; same-password retry, subtree stability and native initialization findings fixed and re-reviewed with no remaining source findings.

## Checks

- Full Vitest: **210 files, 2733 tests passed**.
- Clean synchronized merged-main Vitest: **20 files, 383 tests passed**; ordinary Vite build passed.
- Pilot build passed. Scoped ESLint and diff checks passed. TypeScript has exactly the existing **109 diagnostics**, no new lines.
- Mail/template Node tests: **13 passed**.
- Actual local API/Auth/Mailpit trial after approved policy application: **12/12 groups passed**. Covered48-hour activation,7-character rejection/exact8 acceptance, correct crew/profile/rate250, generic known/unknown recovery, isolated verification/update, old/new login, invalid/used/expired hashes and protected human/operator snapshots. Real RLS checks prove anonymous, crew, no-role and linked-identity INSERT denial; genuine COO and CrewHead can insert an unlinked profile. Temporary fixture roles are restored exactly.

## Local runtime and devices

Restored the existing pilot volumes with124 profiles and31 Auth users before new fixtures. Original human profile identity/e-mail/rate fields remained equal after restart. Only pilot restarted for minimum8 and recovery template; old invoice demo configuration/data unchanged. All running container log configurations retained10MB ×3.

Normal simulator development app and separate `nodu test` simulator app built, installed and launched. A damaged temporary SwiftPM cache required a fresh DerivedData directory; build then succeeded. Clean-main refresh reported simulator updated at114934c. Physical iPhone Peetax disappeared from Xcode destinations during its build; subsequent CoreDevice inspection confirmed tunnel unavailable. **Phone not updated**, waiting for connection. Only the two known generated Capacitor package paths were restored afterward; clean main checkout preserved.

## Approved local policy and UI verification

The genuine administrator UI initially could not save a fresh profile because the existing profiles RLS had no management INSERT policy. The user explicitly approved the13-line change on2026-10-26: “Ano, povolit pouze v testovacím prostředí.” Applied only to `crewflow-onboarding-pilot-20261020`, API55431, in one transaction. The new authenticated-management INSERT policy requires `user_id IS NULL` and the existing database CrewHead/COO role lookup. Exact snapshot comparison confirms all pre-existing profile policies unchanged; immediate existing profile/Auth row counts unchanged. Local migration history marks20261026134216 applied. No production/linked backend or Tally change.

The expanded12-group runner passed after the change. Read-only local security advisors completed:9 warnings in pre-existing function search paths/other always-true policies; no issue references the new profile INSERT policy. Those unrelated policies were not changed.

Actual UI proof after approval: **Crew → Nový člen → Ulozit clena** successfully created fresh synthetic **Nový Člen**, separate first/last names, Praha, rate250. Opened that exact profile and created one invitation through **Pozvat do aplikace → Vytvořit testovací pozvánku**. API confirmation found one unlinked profile and exactly one48-hour captured native-test activation email. Private fixture is `approved-ui-member-20261026.private.json`; capabilities/mail remain outside Git. This resolves the earlier blocked fresh-profile/create/invite step.

## Remaining human/device steps

Human native new-password entry, first-use/relogin/recovery UI confirmation remain pending. No original human password was changed and no new password was entered through UI automation.

Peetax later reconnected (iOS27.0.1, CoreDevice connected). Resumed only the prior phone build/install/launch plan using clean synchronized main preflight and preserved development team. Build is currently waiting at codesign: securityd explicitly logged two keychain access prompts for signing Capacitor/Cordova. An asynchronous user handoff asks the user to enter the login-keychain password directly in macOS and allow access. Do not enter it through automation or change keychain ACLs. Phone update remains incomplete until build, installation and launch succeed; resume the exact waiting operation after the user responds.

Self-service steps: [trial guide](2026-10-26-member-onboarding-trial-guide.md). Credentials, tokens, captured messages and private fixtures remain outside Git.
