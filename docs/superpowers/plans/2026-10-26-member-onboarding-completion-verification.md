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

Normal simulator development app and separate `nodu test` simulator app built, installed and launched. A damaged temporary SwiftPM cache required a fresh DerivedData directory; build then succeeded. Clean-main refresh reported simulator updated at114934c. Physical iPhone Peetax disappeared from Xcode destinations during its build; subsequent CoreDevice inspection confirmed tunnel unavailable. That first phone attempt remained incomplete until connection returned; the successful continuation is recorded below. Only the two known generated Capacitor package paths were restored afterward; clean main checkout preserved.

## Approved local policy and UI verification

The genuine administrator UI initially could not save a fresh profile because the existing profiles RLS had no management INSERT policy. The user explicitly approved the13-line change on2026-10-26: “Ano, povolit pouze v testovacím prostředí.” Applied only to `crewflow-onboarding-pilot-20261020`, API55431, in one transaction. The new authenticated-management INSERT policy requires `user_id IS NULL` and the existing database CrewHead/COO role lookup. Exact snapshot comparison confirms all pre-existing profile policies unchanged; immediate existing profile/Auth row counts unchanged. Local migration history marks20261026134216 applied. No production/linked backend or Tally change.

The expanded12-group runner passed after the change. Read-only local security advisors completed:9 warnings in pre-existing function search paths/other always-true policies; no issue references the new profile INSERT policy. Those unrelated policies were not changed.

Actual UI proof after approval: **Crew → Nový člen → Ulozit clena** successfully created fresh synthetic **Nový Člen**, separate first/last names, Praha, rate250. Opened that exact profile and created one invitation through **Pozvat do aplikace → Vytvořit testovací pozvánku**. API confirmation found one unlinked profile and exactly one48-hour captured native-test activation email. Private fixture is `approved-ui-member-20261026.private.json`; capabilities/mail remain outside Git. This resolves the earlier blocked fresh-profile/create/invite step.

## Remaining human/device steps — status on 2026-10-26

Human native new-password entry, first-use/relogin/recovery UI confirmation remain pending. No original human password was changed and no new password was entered through UI automation.

Peetax later reconnected (iOS27.0.1, CoreDevice connected). Resumed only the prior phone build/install/launch plan using clean synchronized main preflight and preserved development team. Codesign paused on two macOS keychain prompts; the user confirmed access directly in macOS. **Phone build and installation succeeded.** First launch was refused because the device was locked. Repeated only the exact `devicectl device process launch` command, which completed with **exit0** and no error output. **Normal development nodu is updated and launched on Peetax.** Simulator was already updated; the separate local activation pilot remains nodu test in the simulator. No keychain password was entered by automation and no keychain ACLs were changed.

Self-service steps: [trial guide](2026-10-26-member-onboarding-trial-guide.md). Credentials, tokens, captured messages and private fixtures remain outside Git.

## Resumed native trial — 2026-10-27

The completion roadmap now uses a separate clean source checkout based on verified `main` **`ddc3101`**; see [fresh baseline](../../testing/2026-10-27-completion-baseline.md). Application code did not change in this continuation.

The existing local pilot containers were healthy. The stopped web preview was restored on `127.0.0.1:8096` using the preserved guarded private launcher and configuration. The invoice demo containers were left running unchanged. The installed **nodu test** bundle is `cz.nodu.app.manualinvitations`, with `nodu-test` scheme; its JS artifact `index-Wq-86IsW.js` matches the preserved pilot build and includes recovery support. The iPhone 17 Pro simulator runs iOS 26.5. No new phone or simulator installation was made.

Read-only database and captured-mail checks confirmed exactly one unlinked **Nový Člen** profile, rate **250 Kč/h**, no Auth account for its synthetic email and one matching pending invitation valid until **28 October 2026, 15:10 Europe/Prague**. The preserved native URL and captured email match the stored invitation hash. Activation preview returned HTTP 200. No replacement invite or duplicate profile was created.

Opening the link while the previously signed-in operator app was warm initially left the operator overview visible after the OS handoff dialog. A cold handoff after stopping only nodu test displayed the correct activation form. The Xcode UI tap did not dismiss this Device Hub OS dialog; its native CUA button did. Later warm activation/recovery handoffs worked in the same trial, as recorded below; the initial observation was not reproduced in those checks.

The user entered and submitted the password directly in the simulator and confirmed **“Aktivace hotová”**. Subsequent read-only verification confirmed one profile, one Auth user, the exact reserved identity link, role **crew** only, rate **250**, consumed invitation and a real sign-in. No password was read, copied or entered by automation.

Actual native UI checks then passed:

- First-use guide displayed after activation; **Přeskočit** opened the crew overview showing **Nový Člen**.
- **Nastavení → Jak používat nodu** reopened the guide. **Zobrazit směny** opened the existing crew overview route; **Procházet akce** reached the events offer with an appropriate empty state for this new user.
- Stopping only nodu test and launching it normally restored the same signed-in **Nový Člen** overview without showing the first-use guide again.

The user then logged out and signed in with the newly chosen password, confirming **“Znovu přihlášený”**. The login form was observed after logout and the same **Nový Člen** overview was observed after sign-in. Logout/password sign-in and native session restoration are verified.

The following recovery trial also passed through actual native screens: logout → **Zapomenuté heslo** → synthetic email entry → **Poslat odkaz** → one newly captured recovery email → its native link → **Nastavení nového hesla**. The user personally entered/submitted a different password and confirmed **“Nové heslo uložené”**. The success screen was observed, **Přihlásit se novým heslem** opened the ordinary login form, and the user verified **“Staré odmítnuto, nové funguje”**. The restored **Nový Člen** crew overview was observed afterward. No password value was provided in chat or handled by automation.

The previously used recovery capability was then rejected by the actual local Auth API: HTTP **403**, `otp_expired`, with no access token. This is API evidence for one-use recovery; a second password submission through the UI was not performed. The complete successful recovery flow itself was verified in native UI with human password entry.

Actual native error screens passed for **used**, **invalid** and **expired** activation links. The used original invite showed **Účet je již aktivní**; an all-zero synthetic token showed the invalid-link guidance; a separate synthetic unlinked fixture with expired timestamp showed **Platnost pozvánky vypršela** and guidance to request another invite. Its preview also returned HTTP **410** `expired_invitation`; invalid preview returned HTTP **400** `invalid_invitation`. No Auth user or email delivery was created for the separate expired fixture. Each newer link reached its proper screen while nodu test was already running, including transitions between activation links. Returning through **Přejít na přihlášení** restored the existing signed-in trial account.

Final read-only checks confirmed the same single profile and Auth identity, role **crew**, rate **250**, consumed original invitation, cleared recovery token and a normal sign-in later than the captured recovery email. GoTrue clears `recovery_sent_at` after success, so the comparison correctly uses the preserved message timestamp. The original protected human profile's identity, email, Auth link and hourly rate exactly match the pre-trial private snapshot.

**Completion roadmap stage 1: verified on 2026-10-27.** No human activation, first-use, sign-in or recovery confirmation remains pending for this local simulator trial. This supersedes the 2026-10-26 pending status above. Real-recipient invitation delivery, public app links, multi-account operational acceptance and physical-device onboarding remain separate roadmap stages.

Other observed pilot limitations: the isolated backend lacks `get_my_notifications(p_before_id)` and the operator overview reported unavailable shared approvals before activation. These are environment/version prerequisites to resolve before using this pilot for multi-account operations; notification history was not verified here. The guide says “Moje směny” while current mobile navigation labels are “Přehled” and “Akce”; track this copy mismatch for final polish. Source inspection also found a stale 12-character message in the server-error branch of activation; the actual form, successful activation and backend minimum remain 8. Neither copy issue prevented this completed trial.

Private evidence files in the preserved pilot directory: `completion-resume-status-20261027.private.json`, `completion-resume-activation-20261027.private.json`, `completion-resume-native-open-20261027.private.log`, `completion-resume-cold-open-20261027.private.log`, `completion-ui-20261027.private.log`. They contain no new password; capabilities and personal fixture data remain outside Git.

Additional final evidence: `completion-recovery-20261027.private.json`, `completion-recovery-api-proof-20261027.private.json`, `completion-expired-invitation-20261027.private.json`, the used/invalid/expired invitation opening logs and `completion-final-identity-20261027.private.json`. The running local preview is retained for continuation; the separate development installations were not rebuilt because application source did not change.
