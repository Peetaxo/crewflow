# Project Budgets Design

## Context

Crewflow currently treats a project as the job-number container. A project aggregates events, timelogs, receipts, and invoices by job number. The user needs budgeting to live primarily inside the project detail, because a single job number can contain many operational events.

The provided budget workbook uses a sectioned cost structure:

- budget sheet or event name
- cost section, for example transportation, location, technique, catering, agency
- line item name
- units
- amount/count
- quantity
- price per unit
- total
- notes

The first release should support the same data shape manually in the app. Excel import should be enabled by this model, but implemented later as its own workflow with preview and validation.

## Decision

Add project-level budget packages. A project remains the top-level job-number container. Inside a project, users can create budget packages such as `Majales` or `Bitva o Prahu`. A budget package can group multiple existing events and hold its own budget line items.

This avoids turning all events into a parent-child hierarchy while still supporting the real operational shape:

- project `JTI001`
- budget package `Majales`
- linked events: `Majales priprava`, `Majales rozvozy`, `Majales realizace`
- budget items attached either to the package as a whole or to one linked event

## Data Model

### Budget Package

Represents one budget grouping inside a project.

- `id`: local numeric ID or Supabase UUID
- `projectId`: project job number in local state, Supabase project UUID in database
- `name`: visible package name
- `note`: optional internal note
- `eventIds`: linked local event IDs in local state, backed by a join table in Supabase
- `createdAt`: creation timestamp

### Budget Item

Represents one planned cost line.

- `id`: local numeric ID or Supabase UUID
- `projectId`: required project reference
- `budgetPackageId`: optional package reference
- `eventId`: optional event reference
- `section`: budget section/category from the workbook
- `name`: line item name
- `units`: unit descriptor such as `pcs/action/czk`
- `amount`: first multiplier from the workbook
- `quantity`: second multiplier from the workbook
- `unitPrice`: price per unit
- `total`: derived as `amount * quantity * unitPrice`
- `note`: optional note
- `createdAt`: creation timestamp

For local state, `total` can be derived in selectors and UI. For Supabase, it can either be a generated column or derived in the client for v1.

## UI Design

Project detail gets a new budget area above or near the existing operational breakdown. The page should show the current project summary and add budget-specific KPIs:

- planned budget total
- actual costs total from invoices and receipts
- variance between planned and actual
- number of budget packages
- number of linked events

The budget area has two levels:

1. Package list
   Shows each budget package, linked events, planned total, actual cost estimate from linked events, variance, and actions.

2. Package detail
   Shows linked events and budget line items grouped by section. Users can add, edit, and delete line items. A line item can be linked to one event in the package or left at package level.

If a project has no package yet, the page should show an empty state with a primary action to create the first budget package.

## Actual Cost Rollup

Actual costs should reuse existing app data:

- invoices connected by project job number and, where available, event IDs
- receipts connected by project job number and event ID
- timelog-derived crew cost can remain as the existing invoice-based cost in v1

Package actuals are calculated from linked events. Project actuals are calculated from all existing project invoices and receipts, plus any package rollup.

## Excel Import Path

Excel import is not part of the first implementation. The v1 model intentionally mirrors the workbook so import can be added later:

- each workbook sheet can become a budget package or import target
- section header rows become `section`
- item rows become `BudgetItem`
- `Units`, `Amount`, `Amount/Quantity`, `Price per unit`, `Total`, and `Notes` map directly to item fields

Future import should include a preview step before saving, because workbook structures vary and some totals may be formulas or manual overrides.

## Supabase Direction

When persisted to Supabase, use dedicated tables:

- `budget_packages`
- `budget_package_events`
- `budget_items`

`budget_package_events` keeps event grouping flexible without changing the existing `events` hierarchy. Existing event, timelog, receipt, and invoice flows do not need to change for the first version.

## Tests

Add focused tests for:

- budget total calculations
- package rollups by linked event
- project-level planned vs actual variance
- creating and editing budget packages/items in local state
- project detail rendering empty and populated budget states

## Out Of Scope

- Excel import and parsing
- approvals for budget changes
- client-facing budget exports
- turning events into parent-child records
- replacing existing invoice/receipt cost logic
