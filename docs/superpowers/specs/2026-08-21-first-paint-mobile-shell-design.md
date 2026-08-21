# First-paint mobile shell design

Date: 2026-08-21
Status: approved for implementation planning

## Goal

After sign-in, show an intentional branded loading state until the user's profile and roles are known, then render the correct styled mobile overview on its first application paint. Do not briefly render the desktop dashboard or a role-incompatible default tab.

## Root cause

Three initial states currently combine into the visible flash:

1. `useIsMobile()` starts as unknown but exposes that state as `false`, so the first paint uses the desktop shell and desktop dashboard branch.
2. `AppProvider` defaults `currentTab` to `dashboard` even when the resolved role is Crew. Crew does not have access to that tab, so a later effect replaces it with `my-shifts` after the incorrect dashboard has already rendered once.
3. After Supabase establishes a session, `hasKnownSession` becomes true before the asynchronous profile and role requests finish. `Index` therefore stops showing its loading state while authentication is still loading. During those requests `AppProvider` temporarily falls back to CrewHead and `dashboard`, which can remain visible for several seconds on a real phone.

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

Do not render the authenticated application layout while profile and role metadata are still loading, even when a Supabase session is already known. During that interval show a dedicated loading view instead.

The loading view contains only the Nodu mark, without visible text, centered within the usable viewport. It keeps an accessible status label for screen readers.

The approved animation uses the orange dot as its fixed visual center. The six black rays grow outward one after another, remain briefly visible, and then shrink smoothly back into the dot. Each complete ray is scaled from the dot rather than shortened with a dashed stroke. This preserves the original rounded shape while ensuring the rays, their thickness, and their endpoints reach zero together without leaving black dots in Safari.

The cycle lasts approximately 3.7 seconds and repeats only while real authentication metadata is loading. There is no arbitrary timeout or minimum splash duration; the correct application shell renders immediately when authentication finishes. When the operating system requests reduced motion, the mark is shown statically.

## Testing

Add focused regression coverage that proves:

- an authenticated session with profile/role metadata still loading renders the branded loading mark and not the application layout;
- the loading mark contains no visible copy but exposes an accessible loading status;
- the animated rays use the approved scale-from-dot behavior and reduced-motion fallback;
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
- an artificial splash-screen delay;
- production deployment.
