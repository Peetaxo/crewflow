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
- Actual local API/Auth/Mailpit trial: **9 groups passed** before the new RLS checks were added. Covered48-hour activation,7-character rejection/exact8 acceptance, correct crew/profile/rate250, generic known/unknown recovery, isolated verification/update, old/new login, invalid/used/expired hashes and protected human/operator snapshots.

## Local runtime and devices

Restored the existing pilot volumes with124 profiles and31 Auth users before new fixtures. Original human profile identity/e-mail/rate fields remained equal after restart. Only pilot restarted for minimum8 and recovery template; old invoice demo configuration/data unchanged. All running container log configurations retained10MB ×3.

Normal simulator development app and separate `nodu test` simulator app built, installed and launched. A damaged temporary SwiftPM cache required a fresh DerivedData directory; build then succeeded. Clean-main refresh reported simulator updated at114934c. Physical iPhone Peetax disappeared from Xcode destinations during its build; subsequent CoreDevice inspection confirmed tunnel unavailable. **Phone not updated**, waiting for connection. Only the two known generated Capacitor package paths were restored afterward; clean main checkout preserved.

## Explicit pending work

The genuine administrator UI could not save a fresh profile: existing profiles RLS had SELECT/UPDATE management policies but no INSERT policy. The prepared13-line migration allows only authenticated CrewHead/COO to INSERT `user_id IS NULL`; anonymous, crew, no-role and linked-identity cases are denied. Scoped real-API RED reproduced management42501. The expanded integration runner has12 groups, with final GREEN waiting for policy application.

Automatic approval **rejected runtime CREATE POLICY**, asking for explicit user authorization of this role-access expansion. A user question is pending; the policy has **not been applied**. Do not bypass or retry without authorization.

An invitation from the existing dedicated Manual Invitation test profile was successfully created through the actual profile UI and captured for48 hours. This does not complete the fresh-profile test. Human entry of the new password, native first-use/relogin/recovery UI confirmation and the complete fresh-profile UI trial remain pending. No original human password was changed and no new password was entered through UI automation.

Self-service steps: [trial guide](2026-10-26-member-onboarding-trial-guide.md). Credentials, tokens, captured messages and private fixtures remain outside Git.
