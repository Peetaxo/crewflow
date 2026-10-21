# Notification delivery rollout

The notification migration and this worker are not activated by a frontend build.
Apply the migration only after explicit approval for the Staff database rollout.
The migration starts with both `history_enabled=false` and `push_enabled=false`.

1. Apply `20261020131551_app_notifications.sql` to the approved database and run
   `supabase/tests/app-notifications.sql`. Its disposable fixtures run in a rolled-back
   subtransaction; it must report its assertion count with no residual test users.
2. Deploy `send-notifications` with `verify_jwt=false`. Its only accepted request is
   a POST carrying the database-owned `x-notification-secret`; the function validates
   it through a service-role-only RPC before making claims. Browser roles cannot read
   the secret, access device tokens, claim work, or emit messages.
3. Enable history deliberately:
   ```sql
   update private.notification_control
   set history_enabled=true, activated_at=clock_timestamp()
   where singleton;
   ```
   Existing events are not replayed. Cron runs once per minute, creates due reminders,
   and calls the worker only when push is enabled and work is due. The project URL is
   derived from the already configured `invoice_pdf_worker_url` in Vault; the invoice
   worker credential is never reused.
4. Configure native providers through Supabase server secrets, never `VITE_*`:
   - `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY` (Apple .p8 PEM),
     `APNS_BUNDLE_ID=cz.nodu.app`.
   - `FCM_SERVICE_ACCOUNT` (Firebase service-account JSON for the matching project).
   - Android also needs its Firebase `google-services.json`, a push icon and channel.
   - Enable Push Notifications capability for the Apple app identifier and provisioning
     profiles, then include the appropriate `aps-environment` entitlement. This needs
     an Apple developer team that supports push. A Debug simulator compile does not
     prove that signing or remote delivery works on a physical iPhone.
   - Set `VITE_APNS_ENVIRONMENT=development` for development-signed iOS builds and
     `production` for TestFlight/store builds. Test both provider environments.
5. Test a dedicated consenting test account and real device. Do not notify all crew
   for a provider smoke test. After verification, activate push:
   ```sql
   update private.notification_control set push_enabled=true where singleton;
   ```
   Activation records a fresh push timestamp; older queued notifications are skipped.
   The UI shows history immediately and indicates that mobile delivery is not active
   until this separate server switch is enabled.

Category preferences and quiet hours affect push only; history remains available.
Urgency bypasses app quiet hours only for assigned shift changes/cancellations within
24 hours. OS permissions and Focus settings can still suppress presentation.

Claims use leases and a bounded delivery budget. Up to four provider requests run
concurrently; already delivered device IDs survive retries. Invalid tokens are disabled.
Temporary failures retry with backoff up to eight attempts. Seven-day-old messages and
resolved reminders are not delivered. Push remains at least once: a provider may accept
an alert immediately before a transport timeout. Stable collapse keys reduce repeats.
A user's five most recently registered installations remain active.

To pause delivery without losing history:
```sql
update private.notification_control set push_enabled=false where singleton;
```
To pause all new notification generation as well:
```sql
update private.notification_control set history_enabled=false where singleton;
```
No phone registration or provider credential has been configured as part of the
current implementation checkpoint. Do not claim end-to-end delivery before step 5.
