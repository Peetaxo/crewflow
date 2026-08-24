# Native startup routing design

Date: 2026-08-24
Status: approved for implementation planning

## Goal

Opening the installed iOS or Android application must never show the public Nodu marketing page. A returning authenticated user should see the existing loading animation followed by the application, while a user without a valid session should see the login form.

The browser version keeps the public marketing page at `/`.

## Current behavior

Capacitor loads the bundled application at its root URL. `AppShell` currently treats every `/` pathname as the public web entry and renders `WelcomeView` before checking authentication. The installed application therefore opens the marketing page with a `Prihlasit` button in the header even though native startup should enter the authenticated application flow.

## Approved behavior

### Native application

On a native Capacitor platform, treat an initial `/` pathname as the application entry and replace it with `/app` without ever rendering `WelcomeView`.

The first visible application state follows the existing authentication flow:

- while the stored session is being checked, render `AppLoadingMark`;
- when a valid session exists, keep the continuous authenticated loader mounted through initial data bootstrap and then render `AppLayout`;
- when no valid session exists, render `LoginView`;
- after sign-out, remain in the application route and render `LoginView` rather than the public marketing page.

The native root redirect must run without changing Capacitor `server.url`, using live reload, or creating a separate HTML bundle. It must not introduce a frame in which `WelcomeView` appears.

### Browser

On a normal browser platform:

- `/` continues to render `WelcomeView`;
- the public header login action continues to navigate to `/login`;
- `/login` and `/app` keep their current authentication behavior.

The existing development-only `previewLogin=1` behavior remains available.

## Architecture

Use `Capacitor.isNativePlatform()` from `@capacitor/core` inside `AppShell` to determine native runtime synchronously.

When the runtime is native and the current pathname is `/`:

1. suppress the `WelcomeView` branch immediately;
2. render the same authentication/loading decision that `/app` uses on that first React paint;
3. schedule a replace navigation to `/app` so browser history and later navigation use the canonical application route.

Keep this routing decision in `AppShell`, where public, login, and authenticated states are already selected. Do not duplicate authentication logic in Capacitor configuration or native Swift/Android code.

## Testing

Add focused routing tests proving that:

- native `/` with an unknown unauthenticated session shows the loading mark and never renders `WelcomeView`;
- native `/` without a session shows `LoginView` and replaces the route with `/app`;
- native `/` with a valid session enters `AppDataBootstrap` and never renders `WelcomeView`;
- browser `/` still renders `WelcomeView`;
- browser `/login` and `/app` retain their current behavior.

Then run the focused routing tests, all loading/bootstrap tests, TypeScript, lint, the full test suite, a production build with the local Supabase configuration, Capacitor iOS sync, and an iOS simulator launch.

## Out of scope

- changing the public web page;
- changing authentication persistence or Supabase configuration;
- adding automatic credentials or biometric login;
- changing the approved loading animation or its 1.8-second minimum intro;
- setting a remote Capacitor `server.url`;
- production deployment.
