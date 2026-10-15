# Projects search only

The user explicitly requested removing the project filter entirely. Remove its button, popup, client/date state, active chips, reset and date validation. Retain search, search clearing, ready result count, project-store subscription, desktop/mobile layouts, permissions and detail navigation. Empty results should refer to search instead of removed filters. Leave shared service filtering APIs and other sections unchanged.

- [x] Remove obsolete filter interaction tests and retain real-service search, query sharing, clear, loading/error, empty result and mobile detail tests. Update existing empty-copy and unfiltered row-selector expectations; run the focused suite.
- [x] Remove only the filter UI/local state/imports from ProjectsView. Use `getProjectRows(searchQuery)` so persisted legacy filters cannot hide projects. Retain `useProjectDependencies()` as the store-change subscription. Update the empty message to `Žádné projekty neodpovídají hledání.` for a query, or `Zatím tu nejsou žádné projekty.` without one.
- [x] Run retained tests, build and lint; independent review and narrow/desktop browser inspection; ensure no horizontal mobile overflow. Capture updated screenshot.
- [x] Integrate verified code into current main, preserve unrelated WIP, synchronize origin/main and run the required device refresh with existing signing configuration. Report simulator and physical iPhone separately.
- [x] Record verification and clean up only this task's worktree and preview.

Verified source: `5cfcec0`. Simulator and physical iPhone updated successfully after the user confirmed macOS Keychain signing access. See the verification record.
