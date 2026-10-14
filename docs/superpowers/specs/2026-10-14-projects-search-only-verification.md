# Projects search-only verification

Reviewed application source `5cfcec01c8da35be003144228184e5d2ca4f96c9` is integrated into synchronized main/origin/main. Filter UI and local state are removed; shared search and the store subscription remain. Shared service APIs, other views and native configuration are unchanged.

- Retained focused suite: 27 tests passed across three files, including again in the clean main checkout. Full suite: 164 files / 2,089 tests passed; five obsolete filter UI tests were removed. Final main production build and lint passed. TypeScript retains exactly the same 111 pre-existing diagnostics, with no new diagnostics.
- Independent spec and quality review approved the removal, including retained store reactivity, unfiltered default rows, search, permissions and navigation.
- Browser preview confirmed no filter control on mobile or desktop; search, clear and empty-result message still work. At 320px and 390px, page/main widths equal viewport width. Desktop search synchronizes with the sidebar. Screenshot with fictional data: `/Users/peetax/.codex/visualizations/2026/10/13/01a134ed-10ed-7b72-9e8e-e85580d127d4/projects-search-only-mobile-2026-10-14.jpg`. Preview stopped, tab closed, viewport reset.
- Original checkout Info.plist and TimelogsView source/tests WIP hashes remain unchanged.

Device refresh completed from clean synchronized main `5cfcec0`, preserving `.env.local` signing configuration and all preflight checks. Simulator **updated**; physical iPhone **updated**. The retry refresh exited 0 and both builds, installations and launches succeeded. A simulator screenshot independently confirmed the app running; project-list interaction was verified in the browser preview.

The initial phone signing step waited for macOS Keychain access. The user confirmed the codesign request directly on the Mac; the retry then completed successfully. No signing configuration or security permissions were changed by the agent. Retry used fresh DerivedData at `/private/tmp/crewflow-project-search-only-ios-20261014`; log: `/private/tmp/crewflow-project-search-only-ios-refresh-retry.log`. Completion documentation changes no application code.
