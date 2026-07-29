# CrewHead Timelog Correction Approval

## Goal

When a CrewHead changes a crew member's submitted work report, the correction must not be approved onward immediately. The crew member must first see the corrected report, understand what changed, and confirm it before the report returns to CrewHead approval.

This keeps the workflow fair: CrewHead can correct or reconcile hours, but Crew remains accountable for the final submitted work report. COO continues to see only clean reports after CrewHead approval, without internal correction history.

## Current Workflow

Current statuses are:

- `draft`
- `pending_ch`
- `pending_coo`
- `approved`
- `invoiced`
- `paid`
- `rejected`

The current mobile and desktop approval flow lets CrewHead edit `draft` and `pending_ch` reports. After saving a changed report, the same report can still be approved onward to COO. That creates a risk that CrewHead can change hours and immediately send them forward without explicit crew confirmation.

## New Status

Add a new timelog status:

- `pending_crew_confirmation`

Label in the UI:

- `Čeká na souhlas Crew`

Meaning:

- The report was submitted by Crew, then changed by CrewHead.
- Crew must confirm the changed report before CrewHead can approve it onward.
- COO must not see this report yet.

## Role Rules

Crew:

- Can edit `draft`, `rejected`, and `pending_crew_confirmation`.
- Can submit `draft` or `rejected` to `pending_ch`.
- Can confirm a CrewHead correction by sending `pending_crew_confirmation` back to `pending_ch`.
- Can reject the correction by editing the report and sending it back to `pending_ch`, or by leaving a note and resubmitting.

CrewHead:

- Can edit `draft` and `pending_ch`.
- If CrewHead edits data on a `pending_ch` report, the saved status becomes `pending_crew_confirmation`.
- CrewHead cannot approve `pending_crew_confirmation` to COO.
- CrewHead can approve only `pending_ch` to `pending_coo`.
- CrewHead can still return a `pending_ch` report to `rejected`.

COO:

- Can view and decide only `pending_coo` reports.
- Cannot edit report data.
- Cannot see `pending_crew_confirmation` reports in the COO approval queue.

## Data Change Detection

Saving by CrewHead should move `pending_ch` to `pending_crew_confirmation` only when report data changes.

Data changes include:

- Any day added, removed, or changed.
- Start or end time changed.
- Phase changed.
- Travel kilometers changed.
- Crew-visible note changed.

Status-only actions must remain separate:

- Approve: `pending_ch` -> `pending_coo`
- Return: `pending_ch` -> `rejected`

## UI Flow

CrewHead approval modal:

- For `pending_ch`, show `Schválit`, `Vrátit`, and `Upravit`.
- After CrewHead saves changes from `Upravit`, close the edit modal and show the report as `Čeká na souhlas Crew`.
- Hide `Schválit` for `pending_crew_confirmation`.
- Show helper text: `Čeká na potvrzení upraveného výkazu členem Crew.`

Crew report detail:

- For `pending_crew_confirmation`, show the report prominently as waiting for crew confirmation.
- Primary action: `Potvrdit úpravy a odeslat CH`.
- Secondary action: `Upravit výkaz`.
- The crew-visible CrewHead note should remain visible so the crew member understands why the change happened.

Timelog list filters:

- Add the new status to filter counts.
- For Crew, include it in the actionable reports.
- For CrewHead, show it as waiting, but not as approvable.
- For COO, exclude it from active approval work.

## Database And RLS

The Supabase enum `public.timelog_status` must include `pending_crew_confirmation`.

RLS and trigger rules should allow:

- Crew editing own `pending_crew_confirmation`.
- Crew moving own `pending_crew_confirmation` to `pending_ch`.
- CrewHead moving changed `pending_ch` data to `pending_crew_confirmation`.
- CrewHead viewing `pending_crew_confirmation`.

RLS and trigger rules should deny:

- CrewHead moving `pending_crew_confirmation` to `pending_coo`.
- COO editing data in any status.
- COO seeing `pending_crew_confirmation` as an approval item.

## Audit And Notes

This feature does not need a full public edit history for COO.

For this iteration, the important user-facing record is:

- Crew can see the corrected values.
- Crew can see the relevant CrewHead note.
- COO sees only the final values after Crew confirms and CrewHead approves.

A fuller internal audit log can be added later if legal or operational needs require it.

## Testing

Unit and component coverage should verify:

- CrewHead saving changed `pending_ch` data results in `pending_crew_confirmation`.
- CrewHead cannot approve `pending_crew_confirmation`.
- Crew can submit `pending_crew_confirmation` back to `pending_ch`.
- COO approval queues exclude `pending_crew_confirmation`.
- Supabase policy SQL includes the new status transitions.
- Existing draft, rejected, pending CH, pending COO, approved, invoiced, and paid transitions still work.

## Out Of Scope

- Showing COO a correction history.
- Building a full immutable audit timeline.
- Push notifications for the new status.
- Invoice/self-billing changes.
