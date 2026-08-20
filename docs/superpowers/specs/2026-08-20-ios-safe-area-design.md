# iOS Safe Area Design

Date: 2026-08-20
Status: Approved

## Problem

The Capacitor build renders the mobile application beneath the iOS status bar on an iPhone 13 mini. The mobile shell already uses `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`, but the viewport metadata does not enable `viewport-fit=cover`, so WebKit does not provide the expected safe-area inset values.

## Design

Add `viewport-fit=cover` to the existing viewport meta tag in `index.html`. Keep the current responsive CSS unchanged: the page frame, role switcher, bottom navigation, event detail, and timelog modal will continue to consume the existing safe-area environment variables.

This avoids a fixed top padding, which would be incorrect across iPhone models, orientations, and browser contexts. It also avoids adding a native Status Bar plugin for a problem already covered by the existing CSS contract.

## Verification

- Add a static regression test that requires the viewport meta tag to contain `viewport-fit=cover`.
- Run the focused CSS/viewport tests, TypeScript, ESLint, and the production build.
- Rebuild and synchronize the Capacitor iOS bundle with the local Supabase configuration.
- Install and launch the development build on the connected iPhone 13 mini and visually confirm that the page header and role switcher stay below the status bar.

## Out of Scope

- Visual redesign of the dashboard.
- Fixed device-specific padding.
- App Store, TestFlight, or production deployment.
