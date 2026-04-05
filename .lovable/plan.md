

# StaffFlow Refactoring Plan

## Summary
Split the 3,749-line monolithic `App.tsx` into ~25 modular files while preserving all visual appearance and functionality. Adapt from Tailwind v4 / React 19 / `motion/react` to the project's Tailwind v3 / React 18 / `framer-motion` stack.

## Compatibility Adaptations
- `motion/react` → `framer-motion` (same API, different package)
- `@import "tailwindcss"` + `@theme` → `@tailwind base/components/utilities` + `tailwind.config.ts` extend
- `recharts` v3 → v2 (already in project, minor API differences)
- Install `framer-motion` as new dependency

## File Structure

```text
src/
├── types.ts                      # Existing types (unchanged)
├── data.ts                       # Initial mock data (unchanged)
├── utils.ts                      # Renamed utility functions + aliases
├── constants.ts                  # KM_RATE, phase definitions
├── context/
│   └── AppContext.tsx             # All useState + handlers via React Context
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx            # Nav sidebar + role switcher + search
│   │   └── AppLayout.tsx          # Sidebar + main content wrapper
│   ├── shared/
│   │   ├── StatusBadge.tsx        # Badge component
│   │   ├── StatCard.tsx           # Stat card
│   │   ├── ShiftCard.tsx          # Reusable shift card (MyShifts + CrewDetail)
│   │   └── EmptyState.tsx         # Empty state placeholder
│   └── modals/
│       ├── TimelogEditModal.tsx
│       ├── EventEditModal.tsx
│       ├── ProjectEditModal.tsx
│       ├── ClientEditModal.tsx
│       ├── AssignCrewModal.tsx
│       └── DeleteConfirmModal.tsx
├── views/
│   ├── DashboardView.tsx
│   ├── EventsView.tsx
│   ├── EventDetailView.tsx
│   ├── ProjectsView.tsx
│   ├── ProjectStatsView.tsx
│   ├── ClientsView.tsx
│   ├── ClientStatsView.tsx
│   ├── CrewView.tsx
│   ├── CrewDetailView.tsx
│   ├── MyShiftsView.tsx
│   ├── TimelogsView.tsx
│   ├── ApprovalsView.tsx
│   ├── InvoicesView.tsx
│   ├── RecruitmentView.tsx
│   └── SettingsView.tsx
├── pages/
│   └── Index.tsx                  # <AppProvider><AppLayout /></AppProvider>
└── App.tsx                        # Router only (minimal)
```

## Steps

### 1. Install `framer-motion`, copy source files
- Add `framer-motion` to dependencies
- Copy `types.ts` and `data.ts` as-is to `src/`

### 2. Update `utils.ts` with readable names
- `fd` → `formatShortDate` (keep `fd` as alias)
- `fdr` → `formatDateRange`
- `fc` → `formatCurrency`
- `calcH` → `calculateTotalHours`
- `calcDayH` → `calculateDayHours`
- `countdown` → `getCountdown`
- `getDays` → `getDatesBetween`
- Add JSDoc comments to each function

### 3. Create `constants.ts`
- Export `KM_RATE`, phase config array (instal/provoz/deinstal with colors), nav items config

### 4. Create `AppContext.tsx`
- Move all `useState` from App into a single context provider
- Rename handlers: `handleTlAct` → `handleTimelogAction`, `approveAll` → `approveAllTimelogs`, `advCand` → `advanceCandidate`, `genInvs` → `generateInvoices`, `approveInv` → `approveInvoice`
- `gc` → `findContractor` (returns `Contractor | null`, no `!` assertion)
- `ge` → `findEvent` (returns `Event | null`, no `!` assertion)
- All filtered data computed via `useMemo` inside the provider
- Reset `searchQuery` when `curTab` changes
- Fix `approveInvoice` to match timelogs by ID (not eid+cid pair)
- Fix invoice ID generation with timestamp-based unique IDs
- Replace `alert()` calls with `toast()` from sonner

### 5. Extract shared components
- `StatusBadge` — the status-to-style mapping badge
- `StatCard` — stat display card
- `ShiftCard` — used in MyShiftsView and CrewDetailView (deduplicated)
- `EmptyState` — icon + message placeholder

### 6. Extract all modals (6 files)
- Each modal receives state + callbacks from context
- `EventEditModal`: replace `document.getElementById` with controlled state (`useState`) for date range inputs

### 7. Extract all views (15 files)
- Each view is a top-level component (fixes re-mount issue)
- Views consume `useAppContext()` hook
- Sub-views (EventDetail, CrewDetail, ProjectStats, ClientStats) are separate files, navigated via context state

### 8. Create layout components
- `Sidebar.tsx` — navigation, search input, role switcher, user info
- `AppLayout.tsx` — sidebar + main area with `AnimatePresence` tab switching

### 9. Adapt CSS for Tailwind v3
- Replace `@import "tailwindcss"` with `@tailwind base/components/utilities`
- Move `@theme` custom properties into existing `tailwind.config.ts` extend section
- Keep all `.dark` overrides, `.jn`, `.av`, `.secdiv`, table styles
- Tailwind v3 uses `!important` via `!` prefix in classes (same syntax works)

### 10. Wire everything together
- `Index.tsx` → `<AppProvider><AppLayout /></AppProvider>`
- `App.tsx` stays as router wrapper
- All `motion/react` imports → `framer-motion`

## Bug Fixes Included
1. `findContractor` / `findEvent` return `null` instead of crashing with `!`
2. `alert()` → toast notifications
3. Invoice ID uses `Date.now()` for uniqueness
4. `approveInvoice` updates timelogs by matching timelog IDs from invoice data
5. Search query resets on tab change
6. `document.getElementById` replaced with React controlled state
7. All views moved outside App function (prevents unmount/remount)

## What Stays the Same
- Every className, color, spacing, layout — pixel-identical
- All user-facing functionality and workflows
- Dark mode behavior
- Data model and types

