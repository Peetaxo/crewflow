# Manual crew invitations — test phase

## Approved scope

The user requested “Pozvat do aplikace” in the member profile and a new-member default of 250 CZK/h, with Tally disconnected. After the delivery alternatives were explained, the user explicitly selected the test variant. This extends the accepted 48-hour activation design; it does not enable real email delivery or deploy a linked backend.

The member record remains independent from login access. Saving a profile does not invite or activate the person. Existing rates, identities, work history and previously activated accounts remain intact.

## Profile interaction

- Add a small “Přístup do aplikace” panel directly below the member header, using the existing UI components and responsive spacing. Show invitation controls only in the COO management view. The UI role is presentation only; server authorization is mandatory.
- Normal installations expose the panel in a disabled test-only state: “Pozvánky jsou zatím dostupné pouze v testovacím prostředí.” They must make no invitation API calls. A separate explicit frontend flag and the dedicated loopback pilot API are required for operational controls.
- In the configured pilot, read the current server status. States are not invited, preparing, pending activation, expired, already active and activation in progress. Missing email, non-test recipient, unavailable profile, unavailable backend and missing real authenticated session have clear explanations. Do not claim email delivery before capture acknowledgement.
- “Pozvat do aplikace” opens a confirmation dialog with the selected member’s name/email, 48-hour validity and test mailbox wording. Its submit button creates one test invitation; cancel does nothing. Disable duplicate submission immediately.
- A pending invitation displays its expiry. Explicit replacement uses “Vytvořit novou pozvánku” and explains that the old link becomes invalid. Expired or interrupted preparation can be recovered the same way. No replacement is offered for an active account or activation in progress.
- An optimistic version check prevents a stale tab or second concurrent request from silently replacing a newer invitation. Responses from a previous profile, email or signed-in identity must never update the currently displayed member.
- No password, raw invitation token, activation URL, service key or message HTML is returned to or retained by this management UI.

## Shared HTTP contract

One separate Edge Function `crew-invitations` handles authenticated management requests, leaving anonymous token-based activation separate.

```ts
type InvitationState = 'not_invited' | 'preparing' | 'pending' | 'expired' | 'active' | 'activation_in_progress';
type CrewInvitationStatus = {
  profileId: string;
  email: string;
  state: InvitationState;
  invitationId: string | null;
  expiresAt: string | null;
};
type StatusRequest = { action: 'status'; profileId: string };
type InviteRequest = {
  action: 'invite';
  profileId: string;
  expectedEmail: string;
  requestId: string;
  expectedInvitationId: string | null;
  replaceExisting: boolean;
};
type InvitationError = 'disabled' | 'unauthorized' | 'forbidden' | 'invalid_request'
  | 'profile_unavailable' | 'missing_email' | 'test_only' | 'already_active'
  | 'activation_in_progress' | 'invitation_changed' | 'invitation_in_progress'
  | 'delivery_unavailable' | 'invitation_unavailable';
```

Success is `{ data: CrewInvitationStatus }`; failure is `{ error: InvitationError }`. Validate UUIDs, exact request shape, normalized expected email, bounded JSON and configured origins. Error responses contain no raw server diagnostics.

## Authorization and test-only delivery

- Disabled by default. Require `CREW_INVITATIONS_ENABLED=true`, a nonempty server-side inviter Auth UUID allowlist and the dedicated local pilot configuration. Reject linked/cloud Supabase URLs. The server may use the local Docker `kong:8000` API or loopback API port 55431 only; email capture is restricted to the pilot Mailpit container at port 8025 (or loopback 55434 for host-side tests).
- Validate the bearer token through Auth `getUser`, require the UUID in the server allowlist and current database `coo` role. A mutable UI/dev role or user-editable metadata is insufficient. No privileged credential enters a frontend build.
- Only saved profiles with exactly matching current email and synthetic `@crewflow-onboarding.test` recipient are eligible. The server reads identity from the database; request email is an optimistic assertion, never the delivery source.
- Deliver only to Mailpit’s capture API with fixed local transport, no external provider or relay flag. Reuse the existing escaped activation-email renderer and 48-hour text, with the known local web and `nodu://activate` links. Extracting the renderer into a small shared module is in scope.
- SQL helper RPCs are service-only and use exact grants, qualified names and empty search paths. Existing activation RPCs remain service-only. Privileged status reads occur only after endpoint authorization.

## Atomic preparation and recovery

- Reuse `crew_onboarding_create` for its reviewed profile binding, token generation, one-current-invitation invariant and reissue revocation. Do not create an Auth user while inviting.
- Add private invitation metadata for a unique manual request UUID and mail capture acknowledgement timestamp. Store no raw token. Atomic preparation takes the same email advisory lock as activation, locks/refetches the profile, checks the expected email/version and eligibility, and then calls the existing creation routine. A concurrent initial request must not revoke the first invitation.
- The same request UUID must not create/send a second message, target a different profile or resurrect a revoked request. If already captured, a replay can return its safe status; if still preparing, return `invitation_in_progress`.
- Acknowledgement targets the exact request/profile/token hash and only marks a still-current valid invitation after successful capture. A replacement cannot be acknowledged accidentally by an earlier request.
- On failed or uncertain capture, revoke only that exact prepared invitation using the existing cancellation helper. This ensures an ambiguously captured old message cannot grant access after retry. Never cancel a newer invitation. A hard process interruption can leave “preparing”; explicit version-checked replacement is the recovery path. Do not claim delivery for that state.
- Existing active/claiming profiles cannot be reinvited by this management action. No invitation operation changes password, role, rate or history.

## Default rate

Change the new-member form default from 200 to 250. Set the database `profiles.hourly_rate` default to 250 for new rows that omit a rate. The activation flow already uses 250 for new profiles. Do not update existing rows, imported fixtures, saved custom rates or explicit zero rates.

## Verification and completion

Observe meaningful failing tests before implementing the new security and behavior. Cover disabled/anonymous/nonallowlisted/self-promoted caller denial, real-recipient and remote-target rejection, missing/stale identity, no Auth creation, preserved custom/zero rates/history, capture success/failure, same-request replay, competing requests/reissues, exact cancellation, safe status and secret-free responses. Verify actual SQL grants and actual authenticated HTTP plus Mailpit in the existing disposable pilot.

Cover profile dialog/cancel, missing email, disabled normal build with zero requests, active and expired states, retry/reissue, duplicate clicks, identity/profile changes during asynchronous requests, API error translation, and the new form default. Use existing tests rather than creating tests that merely mirror a constant.

Run focused checks, full Vitest, lint and build. Compare TypeScript diagnostics to the accepted existing baseline (110 diagnostics); do not add new ones. Verify the management panel in the actual app against the isolated backend, using a separate synthetic operator/target fixture and ordinary login. Do not reset the user's already tested “Mobilní Test” password or elevate that account for this feature.

Integrate into main, preserve the original three unrelated working files and ignored `.env.local`, synchronize local/origin main, and execute the required `npm run ios:refresh:devices` from the clean main checkout. Report simulator and physical phone separately. Keep the pilot worker/fixtures available. Tally, real delivery, linked backend deployment and public rollout remain outside this change.
