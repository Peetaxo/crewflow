# Member onboarding completion — test phase

The user authorized the first three remaining steps: a complete new-member trial, forgotten-password recovery, and a short first-use introduction. The user then chose a minimum password length of **8 characters**, including activation. Keep the existing maximum of72 UTF-8 bytes. Tally, real recipients, shared/linked deployment and production enrollment stay disabled.

## Recovery

Add “Zapomenuté heslo” to the pilot login, a /forgot-password request form and /reset-password completion form. Enable only with the existing onboarding opt-in, Supabase data source and exact loopback API55431. Allow only the existing synthetic recipient domain. Ordinary builds stay unchanged/disabled. All email is captured by the dedicated local Mailpit.

Use official Supabase Auth resetPasswordForEmail and recovery-type verifyOtp/updateUser. Use a separate client with in-memory/nonpersistent session, no automatic URL detection or refresh, and a distinct storage key. An existing app session must not be replaced by opening or submitting a recovery link. Request confirmation must be identical for existing and unknown accounts; no account enumeration or raw provider diagnostics. Safe retry/expired/used-link states lead to another request.

The local recovery email template contains a web /reset-password#token_hash=... link and a native nodu-test://reset-password#token_hash=... link. Accept bounded opaque URL-safe hashes; do not assume the activation token's64-hex format. Capture/scrub fragments before painting the form; keep capabilities only in memory, with strict paths/no query credentials or arbitrary redirects. Native links work for cold/warm launches. Retain the existing activation path; its local test native scheme becomes nodu-test as well to avoid collisions with ordinary nodu installations. Accept that extra activation scheme only under explicit local-pilot gating; ordinary nodu and trusted-HTTPS behavior stays intact.

Verify a recovery capability only when the user explicitly submits a valid new password, not on mere page opening. The operation keeps any verified recovery session in memory to support retry after a password-update failure; clear/dispose secrets on completion/unmount and suppress stale results. A changed route/token must not reuse a previous operation. A password change is authorized solely by the verified recovery session, never by the currently logged-in app user. After success, show a user-controlled “Přihlásit se novým heslem” action that signs out only the current local app session through the existing AuthProvider and opens normal login. If a session exists, explain that continuation signs it out. Do not change profile/roles/rate or create accounts during recovery.

Use the same8-character/72-byte bounds in activation client, server handler, new recovery forms and local GoTrue minimum. The recovery OTP keeps its own existing1-hour expiry; do not extend it to the activation invitation's48 hours. Commit a clearly named pilot email template; configure it only in the private pilot runtime, not as a production template pointing to localhost.

## First-use introduction

Create a short accessible Czech guide for genuine signed-in crew, only in the enabled local pilot. Explain choosing a shift, waiting for coordinator confirmation (an application is not a confirmed shift), and submitting worked hours/receipts. Primary action opens My Shifts; “Přeskočit” also allows entry without blocking access. Explain profile/billing data can be completed later.

Show automatically once per genuine Auth UUID/version/device. Store only that non-security preference locally; no personal information, authorization decisions, role/rate changes or database migration. An account/role/loading change must not retain another user's guide state. Missing/unavailable browser storage must never block application access. Reopen the same guide through “Jak používat nodu” in crew Settings, without adding a new global settings-section type. Existing managers/dev sessions and disabled environments are unaffected.

## Complete trial

The actual administrator form exposed a pre-existing missing INSERT policy on profiles. Add only the missing authenticated-management permission for a new unlinked profile (`user_id is null`), using the existing genuine CrewHead/COO role lookup. Ordinary crew, anonymous callers and attempts to attach an Auth identity remain denied. No other profile policies or identity triggers change; apply the new migration only to the private pilot during this trial.

Use a fresh synthetic profile and real admin UI invitation; preserve the original Mobilní Test account and all prior human passwords. Verify captured48-hour mail, exact profile/Auth/crew identity, rate250, activation, login, welcome skip/reopen, logout/relogin/session restoration and recovery with old/new password behavior. Invalid/used/expired links, unknown recipients, stale operations and disabled gates receive tests. Keep private credentials/tokens/mail bodies outside Git and outputs. Any human entry of a new password in browser/simulator is handed off to the user; API-only automated fixtures may use privately generated disposable credentials.

The unique nodu-test URL scheme is registered only by the separate simulator pilot installation. Ordinary app identity/signing and nodu URL registration remain unchanged. Refresh the normal development simulator/phone installations from clean synchronized main per AGENTS.md; report actual outcomes separately.
