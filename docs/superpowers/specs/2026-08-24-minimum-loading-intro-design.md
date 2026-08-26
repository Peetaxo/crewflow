# Minimum loading intro design

Date: 2026-08-24
Status: approved for implementation planning

## Goal

After a Supabase session is accepted, keep the existing Nodu loading animation visible long enough for every black ray to extend fully once, even when authentication metadata and initial application data load faster. The application should then open without waiting for the rays to retract.

## Current behavior

The existing CSS animation is a 3.7-second repeating cycle. The last ray starts 0.4 seconds after the first and reaches its fully extended state at 37% of the cycle, approximately 1.77 seconds after the animation begins.

The authenticated loading flow currently renders `AppLoadingMark` in two separate places:

1. `AppShell` renders it while the session profile and roles load.
2. `AppDataBootstrap` renders a new instance while initial events, timelogs, Crew, and projects load.

This can restart the CSS animation between the two phases. Once bootstrap finishes, the second instance is removed immediately, so a fast response can also cut the outward motion short. Together these transitions make the animation appear faster in the simulator even though its CSS duration is unchanged.

## Approved behavior

### Minimum intro

Keep the current SVG, ray paths, easing, delays, colors, sizing, and 3.7-second repeating CSS animation unchanged.

For the initial authenticated startup only, the loading view must remain visible until both conditions are true:

- the authenticated application data is ready;
- 1.8 seconds have elapsed since the authenticated loading view started.

The 1.8-second minimum covers the complete staggered outward phase through the moment the last ray is fully extended. Retraction is not part of the minimum.

If data is ready before 1.8 seconds, wait only for the remaining intro time. If data takes longer, keep the existing animation running and show the application immediately when data becomes ready; do not wait for another animation boundary.

The minimum delay applies once per mounted authenticated session. A later role switch may show the loader while the new role scope loads, but it must not add another artificial 1.8-second wait. Signing out unmounts the authenticated gate, so a later sign-in receives a new intro.

When the operating system requests reduced motion, retain the existing static mark and skip the artificial animation minimum.

### Continuous loading view

Once an authenticated session exists, use one persistent `AppDataBootstrap` gate for both remaining authentication metadata and initial application data:

1. while profile and roles are loading, the gate renders `AppLoadingMark` but does not start role-scoped bootstrap queries;
2. once authentication metadata is ready, the same mounted gate starts the initial data bootstrap;
3. while bootstrap and any remaining intro time run, the same `AppLoadingMark` instance stays mounted;
4. when data and the approved minimum are both ready, the gate mounts `AppProvider` and `AppLayout`.

Place `AppDataBootstrap` outside `AppProvider` so the provider and application layout remain unmounted until the complete gate is ready. The unauthenticated session check and login view keep their current behavior and do not receive the 1.8-second delay.

### Timing and cleanup

Track the authenticated intro start with a monotonic timestamp and schedule only the remaining portion of the 1.8-second minimum after bootstrap succeeds.

The existing generation protection remains authoritative. Scope changes, sign-out, retry, and unmount must cancel any pending readiness timer so an obsolete attempt cannot reveal stale content.

Bootstrap errors continue to show the existing generic retry state immediately. They are not hidden behind an artificial delay.

## Testing

Add focused regression coverage proving that:

- an authenticated session whose profile and roles are still loading renders the bootstrap loading mark without starting role-scoped data loading;
- the same loading mark DOM instance remains mounted when authentication metadata completes and bootstrap begins;
- a bootstrap that finishes immediately keeps children hidden until 1.8 seconds have elapsed;
- children appear immediately when bootstrap finishes after the 1.8-second intro;
- completing a later role-scope bootstrap does not impose a second artificial minimum;
- a stale or unmounted attempt cannot reveal children through a delayed timer;
- reduced-motion mode skips the artificial minimum;
- unauthenticated and local-data flows preserve their current behavior.

Then run the focused component tests, TypeScript check, lint, full test suite, production build, Capacitor sync, and iOS simulator verification.

## Out of scope

- changing the approved SVG or CSS keyframes;
- waiting for the rays to retract;
- aligning application reveal to complete repeating-cycle boundaries;
- changing Supabase queries, policies, or schema;
- production deployment.
