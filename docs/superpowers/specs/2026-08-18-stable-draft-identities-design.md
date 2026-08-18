# Stable Draft Identities and Reset-Safe Hydration — Design

**Date:** 2026-08-18
**Status:** Approved design option; awaiting written-spec review
**Scope:** Supabase event and receipt draft identity, optimistic writes, ambiguous-response recovery, hydration generation/session guards, modal save state, and focused regressions. No database schema change and no production deployment.

## Problem

Event and receipt services currently use a temporary create-intent registry keyed by a local numeric ID. Those IDs are presentation indexes rebuilt after hydration. If a newly inserted row sorts before an existing row, the same numeric ID can later identify a different database row. An ambiguous insert followed by hydration or an auth reset can therefore redirect a retry to the wrong row.

A second issue exists at the read boundary. A request started for an older lifecycle generation or authenticated session can finish later. Checking the generation only after a helper has already committed its result is too late: stale or cross-session data may already have replaced the current state and query cache.

## Decision

Use the existing database UUID primary key as the client idempotency key. A new event or receipt receives its `supabaseId` when the draft is created, before the first asynchronous operation. Supabase writes never infer row identity from local numeric IDs or row order.

The alternatives were rejected:

- A registry keyed by local numeric IDs cannot survive reindexing safely.
- A new database idempotency column and RPC contract would duplicate the guarantees already available from the UUID primary key and unnecessarily widen the migration.

## Draft Identity Contract

In Supabase mode:

- `createEmptyEvent()` and `createEmptyReceipt()` assign `crypto.randomUUID()` to `supabaseId` synchronously.
- Copying an event creates a fresh UUID and clears `updatedAt`; it never reuses the source event UUID.
- Selecting an event for a receipt stores both the local `eid` used for display and the selected event's stable `eventSupabaseId`.
- The modal keeps the same draft object identity fields after a failed save. Closing and deliberately creating a new draft produces a new UUID.
- Existing hydrated rows must carry both `supabaseId` and `updatedAt` before they can be updated or deleted.
- A new row is identified by `supabaseId` with no `updatedAt`. An existing row is identified by the exact `supabaseId` plus expected `updatedAt`.
- Missing stable identity fails closed with a Czech domain error. The service does not fall back to a local numeric ID, row position, or field matching.

Local-only mode keeps its current numeric-ID behavior. The stable UUID field remains optional in shared TypeScript types so local fixtures and offline data remain compatible.

## Write Flow

Every Supabase event or receipt mutation reserves the shared lifecycle queue synchronously before its first `await` and holds it through the canonical local/query-cache commit.

For create:

1. Validate the draft UUID and all stable foreign UUIDs before issuing a request.
2. Insert using the client UUID as the table primary key.
3. Require the returned UUID to equal the draft UUID and retain the returned `updated_at`.
4. Commit the canonical row by UUID, then release the queue.

Two immediate saves of the same draft therefore use the same UUID. After the first insert commits, the second queued call re-resolves the current row by UUID and performs a versioned update rather than another insert.

For update:

1. Re-resolve the current row by UUID inside the queue.
2. Require the current canonical `updatedAt` and target the database row by exact `id + updated_at`.
3. Do not persist derived event fields such as `crew_filled`.
4. Require a single canonical response and commit its new version by UUID.

No write path may consult the positional event/receipt maps to choose its database target.

## Ambiguous Response Recovery

Once a request has started, an error may mean either rollback or a committed write whose response was lost. While still holding the lifecycle queue, the service loads an authoritative snapshot and searches only for the original client UUID.

- If the row exists and its normalized persisted fields match the requested payload, the operation returns that canonical row as success.
- JSONB event fields are compared semantically by recursively sorting object keys; array order remains significant.
- If the row is absent or differs, the original stable domain error is rethrown.
- If recovery itself fails, it is logged diagnostically and the original stable error is rethrown. The modal still retains the same draft UUID, so a user retry cannot create a second row; a duplicate-key response is recovered against that same UUID.
- Validation failures before a request do not trigger recovery reads.

## Hydration and Auth-Reset Contract

Event and receipt database loaders are pure: they return mapped rows and never mutate application state or query cache.

The caller captures both:

- the shared lifecycle generation; and
- a service-specific session/reset epoch.

Immediately before committing loaded rows, the caller checks both values. A mismatch discards the result without touching state, row maps, loaded flags, or query cache.

- A generation mismatch within the same session schedules one fresh hydration for the current generation.
- `resetSupabaseEventsHydration()` and `resetSupabaseReceiptsHydration()` synchronously increment their epoch, clear loaded/promise state and identity maps for the old session, and clear or cancel the corresponding query-cache work.
- A promise from an older epoch cannot commit and cannot schedule a retry into the new session.
- `loaded=true` is set only after a guarded commit actually succeeds.

This prevents stale lifecycle reads and cross-session data from reappearing after logout/login.

## UI Behavior

The event and receipt modals keep an in-flight save guard to prevent accidental double clicks. The guard is defense in depth; the service and database UUID/version contract remains authoritative.

On save failure, the modal stays open with the same UUID-bearing draft. On confirmed success, it closes as today. Creating a new draft after closing or deleting the previous row always allocates a new UUID.

## Error Handling

Expected identity, version, duplicate-key, RLS, and recovery conflicts map to stable Czech domain messages. Raw Supabase/Postgres text is logged only diagnostically and is never passed to a toast.

## Tests

RED tests precede production changes and cover:

- draft factories and copied events assign the correct stable UUIDs;
- two immediate saves of the same new event or receipt issue one insert and then target the same UUID;
- committed insert plus failed recovery plus user retry reuses the same UUID;
- event/receipt reindexing cannot redirect a write to another row;
- deleting a row and deliberately creating a new draft produces a new UUID;
- semantically identical reordered JSONB is accepted during recovery;
- a generation-discarded hydration retries and eventually commits current data;
- an auth reset during hydration prevents the old session's rows from reaching state or query cache;
- missing stable row/event UUIDs fail before any request;
- UI save guards reject same-render double clicks and preserve the UUID-bearing draft on failure.

Focused event, receipt, modal, UUID integration, lifecycle, invoice, TypeScript, lint, build, and diff checks remain release gates. Production migration and frontend deployment stay blocked until an independent spec review and code-quality review approve the implementation.
