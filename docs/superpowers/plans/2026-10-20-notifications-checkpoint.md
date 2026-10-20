# Notifications — paused at the user's request, 2026-10-20

The user approved the notification scope, then explicitly requested stopping and
continuing tomorrow. Do not resume until asked. This is a WORK IN PROGRESS checkpoint,
not a completed implementation or a production deployment.

## Workspace and integration

- Isolated checkout: `/Users/peetax/Projekty/crewflow-notifications-20261020`.
- Branch: `codex/notifications-20261020`, based on verified GitHub main
  `535fa0a3db7114936439aaae4941597d800aa246`.
- Primary checkout `/Users/peetax/Projekty/crewflow` has unrelated local changes and
  is behind origin/main. Preserve those changes. A separate clean main checkout is
  available at `/Users/peetax/Projekty/crewflow-device-refresh-4S3gC4`.
- No migration or Edge Function has been deployed. All Supabase calls so far were
  read-only against Staff (`gkxbluqkugprwcpdephk`). Nothing has been sent to users.
- No merge/push/main update or development-device installation has occurred.
- `AGENTS.md` requires integration into verified synchronized main followed by
  `npm run ios:refresh:devices`, reporting simulator and iPhone results separately.

## Approved behavior

- New published shifts notify all active crew (default enabled); not drafts.
- Applications notify the event coordinator and contact, deduplicating recipients.
- Confirmation/rejection, assignment/removal, important shift changes/cancellation.
- Reminder roughly 24 h before assigned shift; missing report next day.
- Returned/changed hours requiring crew confirmation; approval requests and outcomes.
- Invoice available/recorded paid; withdrawal request and its outcome.
- Returned receipts, understaffing around 48 h before start, invoice worker failure.
- Shared persistent bell/history on web and mobile, unread status, direct targets.
- Native mobile push with category settings, quiet hours, urgent nearby changes,
  and grouped new shifts/applications/reports. Browser push deferred.

## Written but unfinished

- CLI-generated migration `20261020131551_app_notifications.sql`: notification
  tables, RLS/identity snapshots, event/application/assignment/report/finance triggers,
  reminder generator, push queue/leases, preferences/device APIs and Cron.
- Coordinator field added to event schema/type/mapping/form; defaults to event author
  for new events and COO fallback on old events without a coordinator.
- `src/features/notifications/`: contract/service/provider, bell/history panel,
  settings UI, native registration and sign-out disconnection.
- Context navigation with existing unsaved-change guard; invoice focus anchor.
- `supabase/functions/send-notifications/`: APNs/FCM sender and grouping worker;
  custom server-secret authentication (verify_jwt=false, no public unauthenticated
  send path intended).
- Official Capacitor Push Notifications 8.1.3 source vendored from upstream commit
  `87c0bb8045db2b4560d3db4b7d8e565c23ec1736`, retaining MIT license. npm registry
  unavailable in sandbox; this file dependency installs offline. See UPSTREAM.md.
- Capacitor sync completed in this isolated checkout only.

## Verification and blockers

- Web development build passed; existing bundle-size/dynamic-import warnings remain.
- Focused existing tests: 175 passed, 13 failed (2 files failed, 4 passed).
  Log: `/tmp/nodu-notifications-tests.log`. Event form failures include duplicate
  option names introduced by coordinator select; service expectation needs new
  coordinator field. Investigate all failures; do not assume this is the entire list.
- Typecheck has many pre-existing errors. `/tmp/nodu-notification-types.log` includes
  one new plugin type-export error. Package types was subsequently changed to
  `lib/index.d.ts` and declaration files generated; not rechecked yet.
- Tests for notifications/worker/security/reminders are NOT WRITTEN yet.
- SQL is NOT EXECUTED, parsed, or verified yet. Review in detail before deploying.
  Docker socket access is denied here; normal git fetch cannot resolve github.com.
  GitHub connector can read/write remotely. Local git worktrees/commits work.
- No Firebase google-services.json or Apple push credentials were found/configured.
  APNs entitlement/capability is not yet added. Real delivery cannot be claimed.
- `private.notification_control.push_enabled` defaults false; no historical replay
  intended. Activation timestamp should prevent queued backlog on future enablement.

## Next work (after user resumes)

1. Review/reduce incomplete code and resolve known UI/test failures. Verify package
   exports/types. Check identity transitions, sign-out, pagination/poll interactions,
   direct-target navigation after cold start and unsaved changes.
2. Audit SQL carefully: correct exact-day reminder selection/expiry/rescheduling,
   duplicate withdrawal/assignment outcomes, current recipient access, no historical
   spam, valid schedules/times and RLS/ACL. Test real behavior with rollback fixtures.
3. Worker still needs concurrency bounds (currently sequential groups can exceed
   lease/runtime), category-specific collapse keys, and delivery retry tests.
   Review behavior when only one platform is configured: do not permanently discard
   another platform's jobs or omit its device when marking the job sent.
4. Ensure server project URL configuration exists. Current dispatcher looks for
   Vault `project_url`; existing invoice worker uses different URL/secret names.
   Configure without exposing secrets, and verify auth before queue claims.
5. Add meaningful notification recipient/deduplication/privacy/quiet-hour/stale-job
   and worker tests, UI identity tests and visual QA.
6. Configure/verify Apple/Firebase credentials and signing capabilities if available;
   report actual missing setup honestly. Do not enable live push or backfill messages
   merely to test. Recheck advisors against captured pre-change baseline.
7. Integrate only after checks pass; keep unrelated changes intact, synchronize clean
   main and refresh devices per AGENTS.md. Do not report WIP as finished.

No further work was authorized after the user's stop request beyond saving this
checkpoint. Resume only on a new instruction.
