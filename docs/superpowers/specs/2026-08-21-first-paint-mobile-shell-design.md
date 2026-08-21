# First-paint mobile shell design

Date: 2026-08-21
Status: approved for planning

## Goal

After sign-in, render the correct styled mobile overview on the first application paint. Do not briefly render the desktop dashboard or a role-incompatible default tab.

## Root cause

Two initial states are currently corrected only after React effects run:

1. `useIsMobile()` starts as unknown but exposes that state as `false`, so the first paint uses the desktop shell and desktop dashboard branch.
2. `AppProvider` defaults `currentTab` to `dashboard` even when the resolved role is Crew. Crew does not have access to that tab, so a later effect replaces it with `my-shifts` after the incorrect dashboard has already rendered once.

The stylesheet is bundled and linked in the initial Capacitor document, so this is a render-state flash rather than a missing iOS CSS asset.

## Design

### Mobile detection

Initialize the mobile breakpoint synchronously from the current browser viewport. Keep the existing media-query subscription so rotation and later viewport changes still update the value.

The hook must be safe if rendered outside a browser environment by using a desktop fallback when `window` is unavailable.

### Role-aware initial tab

When no valid persisted UI session is restored, initialize `currentTab` from the first allowed navigation item for the already resolved role. This means:

- Crew starts on `my-shifts`.
- CrewHead and COO start on `dashboard`.

The existing post-render role guard remains as defense for later role changes and stale persisted sessions.

### Loading behavior

Do not add an arbitrary timeout, splash screen, or artificial loading delay. The authenticated app should render as soon as authentication is resolved, but its first rendered shell and tab must already be correct.

## Testing

Add focused regression coverage that proves:

- a narrow viewport reports mobile on the first render, before an effect-driven update;
- a wide viewport reports desktop on the first render;
- a Crew session without persisted UI state starts directly on `my-shifts`;
- management roles still start on `dashboard`;
- existing viewport change and role normalization behavior remains intact.

Then run the affected tests, TypeScript check, focused lint, production build, and iOS simulator build.

## Out of scope

- Supabase authentication or database changes;
- query/data-loading architecture;
- visual redesign of the overview;
- production deployment.
