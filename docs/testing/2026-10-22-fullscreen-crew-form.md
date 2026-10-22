# Fullscreen member form — 2026-10-22

User request: show the current new/edit member form across the entire screen. Source: `b8732f7` (`aa942a0` layout plus theme-preserving portal correction).

The fixed form is portaled into `.nodu-app-shell`, outside animated page transforms and within the existing theme scope. It covers the viewport above preview navigation, with dynamic viewport height and safe-area padding. Header/44px close and footer/44px actions do not shrink or scroll; the body scrolls independently. Desktop content remains centered with a 768px maximum column. Existing controlled fields, saving, validation and rates are unchanged.

Verification:

- Existing CrewView form/list/detail tests: 24/24 passed, repeated from clean synchronized main at the final source. Scoped ESLint and diff checks passed. No new tests mirroring CSS classes were added for this presentation-only change.
- Actual mobile browser: viewport and overlay both 403×827 at x0/y0. All19 existing input values survived the portal update. Close/save targets are44px high; save bottom811 remains inside the827px viewport.
- Actual body scroll reached760px with zero remaining scroll; the final notes field was reachable and save stayed at bottom811. Returned to the top without submitting or clearing the form.
- Actual desktop browser: viewport and overlay both1280×800 at x0/y0, content column768px, given/family fields share a row. Temporary viewport override was reset.
- Final quality review identified a body-portal theme regression. Corrected it to the existing shell-level portal pattern and independently re-reviewed the final diff: PASS, no remaining actionable findings. Actual DOM confirms the overlay is a direct child of the theme shell.
- Guarded local pilot web build passed. Updated the separate `nodu test` simulator bundle; native build/install/launch succeeded in14.6s and the existing operator session survived.

Screenshots: `/Users/peetax/Projekty/.crewflow-onboarding-pilot-20261020/evidence/fullscreen-crew-mobile-20261022.png` and `fullscreen-crew-desktop-20261022.png`. Mobile image was inspected and embedded in progress.

Parent logs: `/private/tmp/fullscreen-crew-form-final-tests.log`, `/private/tmp/fullscreen-crew-merged-main-tests.log`, `/private/tmp/fullscreen-crew-pilot-build.log`, `/private/tmp/fullscreen-crew-main-device-refresh.log`.

## Development installation acceptance

Source `b8732f7` was fast-forwarded into main and pushed. Root unrelated working files retained their exact pre-merge contents. Clean main matched origin/main and passed the same24 focused tests plus scoped lint before the required `npm run ios:refresh:devices` command. Normal web build, Capacitor sync and both native builds succeeded using the existing development team and complete DerivedData cache.

- Simulator iPhone17Pro: normal app build/install/launch succeeded. The separate updated `nodu test` installation also shows the actual full-screen member form, with readable fields below the notch and footer above the home area; screenshot `fullscreen-crew-native-20261022.jpg` in the same private evidence directory. No member was submitted.
- Physical iPhone Peetax: signed build and installation succeeded; initial launch was blocked solely by the device lock. The user confirmed unlocking it. Repeated only the exact final devicectl launch step, which exited0. Final status: updated and launch verified. Evidence: `/private/tmp/fullscreen-crew-phone-final-launch.log`.

Preserved ignored local configuration and restored only verified Capacitor-generated dependency-path rewrites afterward. Final follow-up commit changes this acceptance document only; installed application source remains `b8732f7`. Public onboarding/Tally/real email configuration was untouched.
