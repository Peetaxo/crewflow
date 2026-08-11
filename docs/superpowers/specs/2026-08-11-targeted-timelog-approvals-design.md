# Targeted Timelog Approvals

## Goal

Replace the role-based final timelog approval step with approval by specific people assigned to the event workflow.

The event contact person selected on the event should become the default final approver for timelogs from that event. CrewHead or COO can add more approvers from existing Nodu profiles when sending a checked timelog onward.

Only people in Nodu can be selected as approvers. External e-mail based approvals are out of scope.

## Product Reason

The current flow assumes that all timelogs move from Crew to CH and then to COO. In practice, the person who needs to approve a timelog depends on the event. The event already has a contact person, and that person should be the natural default approver.

This keeps approval responsibility close to the actual event while preserving CH as the first control point.

## Status Labels

User-facing labels should be:

- `Koncept`
- `Ceka na kontrolu`
- `Ceka na potvrzeni Crew`
- `Vraceno k oprave`
- `Ceka na schvaleni`
- `Schvaleno`
- `Vyuctovano`
- `Zaplaceno`

The database can keep the existing technical `pending_coo` status for the first implementation, but the UI must treat it as `Ceka na schvaleni`, not as a COO-only queue.

## Workflow

1. Crew creates or edits a timelog.
2. Crew sends the timelog to `Ceka na kontrolu`.
3. CH reviews the timelog.
4. CH can return it to Crew, edit it, or send it to selected approvers.
5. Sending to approvers opens an approver selection modal.
6. The event contact person is preselected by default.
7. CH can add additional approvers from existing Nodu profiles.
8. The timelog enters `Ceka na schvaleni`.
9. Each selected approver can approve or return the timelog.
10. When all selected approvers approve, the timelog becomes `Schvaleno`.
11. If any selected approver returns it, the timelog becomes `Vraceno k oprave` for Crew.
12. Crew fixes it and sends it back to `Ceka na kontrolu`, so CH sees it again before it can go to final approval.

If the event contact person is the same person as the CH sending the timelog onward, that contact should not block approval by requiring the same person to approve twice. CH can add another approver, or if no additional approver is needed, the timelog can become `Schvaleno`.

If an event has no contact person, the approver selection modal starts empty and CH must choose approvers or explicitly finish without an additional approver.

## CH And COO Actions

For a timelog in `Ceka na kontrolu`, CH/COO can:

- `Vratit k oprave`
- `Upravit`
- `Odeslat ke schvaleni`

`Vratit k oprave` must never happen immediately. It always opens a confirmation modal with an optional note field. The note is not required because some corrections are handled by phone, but Crew must see the note when it is provided.

`Upravit` opens the timelog editor. If CH/COO changes timelog data, the timelog moves to `Ceka na potvrzeni Crew`. Crew must confirm the change before the timelog returns to `Ceka na kontrolu`.

`Odeslat ke schvaleni` opens a modal with:

- preselected event contact person when available,
- search/select for additional Nodu profiles,
- optional note for approvers,
- primary action `Odeslat ke schvaleni`.

## Approver Actions

Selected approvers see only timelogs where they are explicitly listed as an approver.

An approver can:

- `Schvalit`
- `Vratit k oprave`

`Vratit k oprave` opens a confirmation modal with an optional note. The timelog goes directly to Crew as `Vraceno k oprave`. CH still sees the issue in management views, but Crew is the next actor because Crew must fix or resubmit the report.

After Crew resubmits, the timelog returns to `Ceka na kontrolu`, so CH reviews it again before any final approval.

## Crew Experience

Crew must clearly see actionable problems.

The Crew overview shows `Vykazy k doreseni` when the user has timelogs in:

- `Vraceno k oprave`
- `Ceka na potvrzeni Crew`

The timelog detail shows:

- return reason note when provided,
- CH change summary when CH edited the timelog,
- Crew's own timelog note,
- CH or approver note separately from Crew's note.

Crew actions:

- `Ulozit vykaz`
- `Odeslat ke kontrole`
- `Potvrdit a odeslat` when confirming CH edits.

## Notes

Crew note and review notes must be separated.

Crew note:

- written by Crew as part of the timelog,
- remains Crew-owned content,
- should not be overwritten by CH review comments.

Review note:

- written by CH/COO or approvers when returning or editing a timelog,
- explains why a report was returned or adjusted,
- visible to the affected Crew member.

Implementation can keep existing note columns where safe, but the UI must make the ownership clear and migrations must preserve existing note content.

## Database Design

Add a table named `timelog_approvals`.

Required fields:

- `id`
- `approval_round_id`
- `timelog_id`
- `approver_profile_id`
- `status`: `pending`, `approved`, `returned`
- `requested_by_profile_id`
- `requested_at`
- `resolved_at`
- `superseded_at`
- `note`

The table represents selected approvers for timelog approval rounds. All rows with the same `approval_round_id` belong to one approval round. Active approval rows have `superseded_at` set to `null`.

When CH sends a timelog to approval:

- previous active approval rows for the timelog are marked with `superseded_at = now()`,
- a new `approval_round_id` is created,
- one new row is created for each selected approver,
- the timelog moves to `pending_coo` technically, displayed as `Ceka na schvaleni`.

When an approver approves:

- only that approver row changes to `approved`,
- the timelog becomes `approved` only after every non-superseded approver row for the active round is approved.

When an approver returns:

- that approver row changes to `returned`,
- the timelog moves to `rejected`, displayed as `Vraceno k oprave`,
- the return note is visible to Crew.

## Permissions And RLS

RLS must ensure:

- Crew can read and edit only their own timelogs where the status allows it.
- CH/COO can review timelogs that need internal control.
- CH/COO can create approval rows when sending timelogs onward.
- Selected approvers can read timelogs where they have an active `timelog_approvals` row.
- Selected approvers can update only their own approval row.
- Non-selected users cannot see approval details for unrelated timelogs.

Existing RLS transition rules for `pending_crew_confirmation` remain valid:

- CH/COO edits require Crew confirmation.
- CH/COO cannot bypass Crew confirmation after changing report data.

## UI Surfaces

Mobile Crew:

- overview actionable card for returned or confirmation-needed timelogs,
- timelog detail with separated notes and change summary,
- clear status label `Ceka na tvoje potvrzeni` for CH edits.

Mobile CH/COO:

- `Schvalovani` section shows timelogs needing CH/COO control,
- timelog action modal includes `Vratit k oprave`, `Upravit`, `Odeslat ke schvaleni`,
- `Odeslat ke schvaleni` modal selects event contact and additional approvers.

Mobile Approver:

- approval list shows only assigned approval requests,
- each request displays event, crew member, hours, amount, days, notes,
- actions are `Schvalit` and `Vratit k oprave`.

Desktop:

- keep equivalent actions available where the desktop approval flow exists,
- do not make the mobile workflow diverge from desktop business rules.

## Testing

Coverage should verify:

- event contact person is preselected when sending a timelog to approval,
- extra approvers can be selected from existing Nodu profiles,
- selected approvers can see only their own approval requests,
- approving one approver row does not approve the timelog until all approvers approve,
- returning from any approver moves the timelog to `Vraceno k oprave`,
- `Vratit k oprave` always opens a note modal before changing status,
- CH edits still move the timelog to `Ceka na potvrzeni Crew`,
- Crew confirmation sends CH edits back to `Ceka na kontrolu`,
- UI labels no longer present `pending_coo` as COO-specific,
- Supabase RLS tests cover approver read and update boundaries.

## Out Of Scope

- External e-mail approvers.
- Public approval links.
- Push notifications.
- Full immutable audit timeline beyond selected approver rows and notes.
- Removing the technical `pending_coo` database enum value in the first implementation.
- Invoice and payment state changes.
