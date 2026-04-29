# Nodu Dashboard Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved `nodu.` visual pilot for the existing sidebar and dashboard without changing business logic or layout structure.

**Architecture:** Keep the current React component structure intact and layer the redesign through scoped visual tokens, app-shell background helpers, and targeted class updates in `AppLayout`, `Sidebar`, `DashboardView`, and `StatCard`. Use tests to lock the intended pilot behaviors: `nodu.` branding hooks, paper-like app background, orange active navigation, monochrome stat cards, and orange-accented job badges in timelog rows.

**Tech Stack:** React 18, Vite, Tailwind CSS, framer-motion, Vitest, Testing Library

---

## File Structure

### Existing files to modify

- `src/index.css`
  - Extend the global visual tokens with warm `nodu.` surfaces, paper texture helpers, subtle warm borders, and reusable pilot utility classes.
- `src/components/layout/AppLayout.tsx`
  - Apply the `nodu.` app-shell background and keep the pilot scoped to the current shell.
- `src/components/layout/Sidebar.tsx`
  - Restyle the existing blocks to match the approved sidebar mock while preserving logic and role-driven behavior.
- `src/components/shared/StatCard.tsx`
  - Move stat cards from badge-heavy accent chips to restrained monochrome cards with only a tiny optional accent detail.
- `src/views/DashboardView.tsx`
  - Keep the existing data flow and sections, but apply the `nodu.` visual hierarchy to the header, cards, timelog list, and upcoming events.
- `src/views/uuid-mine-scope-identity.test.tsx`
  - Extend the existing sidebar test coverage for the pilot-specific presentation hooks.

### New files to create

- `src/components/shared/StatCard.test.tsx`
  - Verify the new stat-card rendering contract and prevent orange-dot regressions.
- `src/views/DashboardView.test.tsx`
  - Verify the pilot dashboard presentation contract around monochrome stat cards and orange job badges.

## Task 1: Add `nodu.` app-shell tokens and background helpers

**Files:**
- Modify: `src/index.css`
- Modify: `src/components/layout/AppLayout.tsx`
- Test: `src/components/layout/AppLayout.tsx` covered indirectly by `src/views/DashboardView.test.tsx`

- [ ] **Step 1: Write the failing dashboard shell test**

Create `src/views/DashboardView.test.tsx` with a shell assertion that will fail until `AppLayout` and the dashboard root expose the new pilot classes:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AppLayout from '../components/layout/AppLayout';

vi.mock('../context/AppContext', () => ({
  useAppContext: () => ({
    darkMode: false,
    currentTab: 'dashboard',
  }),
}));

vi.mock('../components/layout/Sidebar', () => ({
  default: () => <aside data-testid="sidebar-stub">Sidebar</aside>,
}));

vi.mock('../views/DashboardView', () => ({
  default: () => <section data-testid="dashboard-view">Dashboard content</section>,
}));

vi.mock('../views/MyShiftsView', () => ({ default: () => <div /> }));
vi.mock('../views/ClientsView', () => ({ default: () => <div /> }));
vi.mock('../views/ProjectsView', () => ({ default: () => <div /> }));
vi.mock('../views/EventsView', () => ({ default: () => <div /> }));
vi.mock('../views/CrewView', () => ({ default: () => <div /> }));
vi.mock('../views/TimelogsView', () => ({ default: () => <div /> }));
vi.mock('../views/InvoicesView', () => ({ default: () => <div /> }));
vi.mock('../views/ReceiptsView', () => ({ default: () => <div /> }));
vi.mock('../views/RecruitmentView', () => ({ default: () => <div /> }));
vi.mock('../views/SettingsView', () => ({ default: () => <div /> }));
vi.mock('../components/modals/TimelogEditModal', () => ({ default: () => null }));
vi.mock('../components/modals/ProjectEditModal', () => ({ default: () => null }));
vi.mock('../components/modals/ReceiptEditModal', () => ({ default: () => null }));
vi.mock('../components/modals/ClientEditModal', () => ({ default: () => null }));
vi.mock('../components/modals/DeleteConfirmModal', () => ({ default: () => null }));

describe('AppLayout nodu shell', () => {
  it('applies the nodu shell background helpers around the dashboard pilot', () => {
    const { container } = render(<AppLayout />);

    expect(container.firstChild).toHaveClass('nodu-app-shell');
    expect(screen.getByRole('main')).toHaveClass('nodu-page-frame');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd /Users/peetax/Projekty/crewflow && npm test -- src/views/DashboardView.test.tsx
```

Expected:

```text
FAIL  src/views/DashboardView.test.tsx
+ Expected the element to have class:
+   nodu-app-shell
```

- [ ] **Step 3: Add the global `nodu.` background tokens and shell classes**

Update `src/index.css` with warm background tokens and scoped utility helpers:

```css
:root {
  --nodu-paper: 42 29% 96%;
  --nodu-paper-strong: 40 24% 93%;
  --nodu-surface: 0 0% 100%;
  --nodu-surface-muted: 40 25% 98%;
  --nodu-text: 24 10% 8%;
  --nodu-text-soft: 28 8% 38%;
  --nodu-border: 32 19% 86%;
  --nodu-accent: 29 94% 52%;
  --nodu-accent-soft: 31 100% 95%;
  --nodu-shadow: 24 38% 24%;
}

.nodu-app-shell {
  min-height: 100vh;
  background-color: hsl(var(--nodu-paper));
  background-image:
    radial-gradient(circle at top left, rgba(255, 255, 255, 0.88), transparent 34%),
    radial-gradient(circle at bottom right, rgba(255, 248, 240, 0.72), transparent 28%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.62), rgba(255, 255, 255, 0.62)),
    repeating-linear-gradient(
      115deg,
      rgba(122, 94, 56, 0.018) 0,
      rgba(122, 94, 56, 0.018) 2px,
      transparent 2px,
      transparent 18px
    );
}

.nodu-page-frame {
  position: relative;
}

.nodu-surface {
  @apply rounded-2xl border;
  background: hsl(var(--nodu-surface) / 0.92);
  border-color: hsl(var(--nodu-border));
  box-shadow:
    0 1px 2px rgba(24, 19, 14, 0.04),
    0 20px 45px -28px rgba(24, 19, 14, 0.16);
}

.nodu-panel {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(252, 248, 243, 0.96));
  border: 1px solid hsl(var(--nodu-border));
  box-shadow:
    0 1px 2px rgba(24, 19, 14, 0.05),
    0 24px 60px -34px rgba(24, 19, 14, 0.22);
}
```

- [ ] **Step 4: Apply the shell helpers in `AppLayout.tsx`**

Update the layout root and main wrapper:

```tsx
return (
  <div className={`nodu-app-shell flex h-screen overflow-hidden font-sans ${darkMode ? 'dark' : ''}`}>
    <Sidebar />

    <main className="nodu-page-frame flex-1 overflow-y-auto p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <AnimatePresence mode="wait">{renderCurrentView()}</AnimatePresence>
      </div>
    </main>

    <TimelogEditModal />
    <ProjectEditModal />
    <ReceiptEditModal />
    <ClientEditModal />
    <DeleteConfirmModal />
  </div>
);
```

- [ ] **Step 5: Run the shell test to verify it passes**

Run:

```bash
cd /Users/peetax/Projekty/crewflow && npm test -- src/views/DashboardView.test.tsx
```

Expected:

```text
PASS  src/views/DashboardView.test.tsx
  AppLayout nodu shell
    ✓ applies the nodu shell background helpers around the dashboard pilot
```

- [ ] **Step 6: Commit the shell changes**

```bash
cd /Users/peetax/Projekty/crewflow
git add src/index.css src/components/layout/AppLayout.tsx src/views/DashboardView.test.tsx
git commit -m "feat: add nodu app shell styling"
```

## Task 2: Convert stat cards to the restrained `nodu.` card pattern

**Files:**
- Modify: `src/components/shared/StatCard.tsx`
- Test: `src/components/shared/StatCard.test.tsx`

- [ ] **Step 1: Write the failing stat-card test**

Create `src/components/shared/StatCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import StatCard from './StatCard';

describe('StatCard', () => {
  it('renders a restrained nodu card without decorative orange dots', () => {
    const { container } = render(
      <StatCard label="Faktury v procesu" value={3} sub="Self-billing" cls="bg-amber-50 text-amber-700" />
    );

    expect(screen.getByText('Faktury v procesu')).toHaveClass('text-[11px]');
    expect(screen.getByText('3')).toHaveClass('text-[28px]');
    expect(screen.getByText('Self-billing')).toHaveClass('nodu-stat-chip');
    expect(container.querySelector('[data-testid="stat-accent-dot"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the stat-card test to verify it fails**

Run:

```bash
cd /Users/peetax/Projekty/crewflow && npm test -- src/components/shared/StatCard.test.tsx
```

Expected:

```text
FAIL  src/components/shared/StatCard.test.tsx
+ Expected the element to have class:
+   nodu-stat-chip
```

- [ ] **Step 3: Implement the `nodu.` stat-card surface**

Update `src/components/shared/StatCard.tsx`:

```tsx
import React from 'react';

const StatCard = ({
  label,
  value,
  sub,
  cls,
}: {
  label: string;
  value: string | number;
  sub: string;
  cls: string;
}) => (
  <div className="nodu-surface rounded-[22px] p-4">
    <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-[hsl(var(--nodu-text-soft))]">
      {label}
    </div>
    <div className="text-[28px] font-semibold leading-none text-[hsl(var(--nodu-text))]">
      {value}
    </div>
    <div className="mt-3">
      <span
        className={`nodu-stat-chip inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium ${cls}`}
      >
        {sub}
      </span>
    </div>
  </div>
);

export default StatCard;
```

Add the chip helper in `src/index.css`:

```css
.nodu-stat-chip {
  border-color: hsl(var(--nodu-border));
  background: hsl(var(--nodu-surface-muted));
  color: hsl(var(--nodu-text-soft));
}
```

- [ ] **Step 4: Run the stat-card test to verify it passes**

Run:

```bash
cd /Users/peetax/Projekty/crewflow && npm test -- src/components/shared/StatCard.test.tsx
```

Expected:

```text
PASS  src/components/shared/StatCard.test.tsx
  StatCard
    ✓ renders a restrained nodu card without decorative orange dots
```

- [ ] **Step 5: Commit the stat-card changes**

```bash
cd /Users/peetax/Projekty/crewflow
git add src/components/shared/StatCard.tsx src/components/shared/StatCard.test.tsx src/index.css
git commit -m "feat: restyle dashboard stat cards for nodu"
```

## Task 3: Restyle the existing sidebar to the approved `nodu.` panel

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/views/uuid-mine-scope-identity.test.tsx`

- [ ] **Step 1: Write the failing sidebar assertions**

Extend the existing sidebar test in `src/views/uuid-mine-scope-identity.test.tsx`:

```tsx
it('renders the nodu sidebar pilot styles for authenticated mine scope', () => {
  render(<Sidebar />);

  expect(screen.getByAltText('Nodu')).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/Hledat akci, job nebo jmeno/i)).toHaveClass('nodu-sidebar-search');
  expect(screen.getByRole('button', { name: /Dashboard/i })).toHaveClass('nodu-nav-active');
});
```

- [ ] **Step 2: Run the sidebar test to verify it fails**

Run:

```bash
cd /Users/peetax/Projekty/crewflow && npm test -- src/views/uuid-mine-scope-identity.test.tsx
```

Expected:

```text
FAIL  src/views/uuid-mine-scope-identity.test.tsx
+ Unable to find an element with the alt text: Nodu
```

- [ ] **Step 3: Apply the `nodu.` sidebar classes without changing behavior**

Update `src/components/layout/Sidebar.tsx` around the existing structure:

```tsx
<aside
  className={`nodu-panel flex shrink-0 flex-col border-r transition-all duration-300 ${
    sidebarCollapsed ? 'm-3 w-20 rounded-[28px]' : 'm-3 w-64 rounded-[32px]'
  }`}
>
```

```tsx
<img
  src="/nody-mark.svg"
  alt="Nodu"
  className="h-10 w-10 rounded-2xl object-contain"
/>
```

```tsx
<input
  type="text"
  placeholder="Hledat akci, job nebo jmeno..."
  className="nodu-sidebar-search w-full rounded-2xl border px-3 py-2.5 pl-9 text-[12px] text-[hsl(var(--nodu-text))] outline-none transition-all"
  value={searchQuery}
  onChange={(event) => setSearchQuery(event.target.value)}
/>
```

```tsx
className={`relative flex w-full items-center rounded-2xl px-3 py-2.5 text-[13px] transition-all ${
  sidebarCollapsed ? 'justify-center' : 'gap-2.5'
} ${
  currentTab === item.id
    ? 'nodu-nav-active font-medium text-[hsl(var(--nodu-text))]'
    : 'text-[hsl(var(--nodu-text-soft))] hover:bg-white/80 hover:text-[hsl(var(--nodu-text))]'
}`}
```

Add the helper classes in `src/index.css`:

```css
.nodu-sidebar-search {
  background: rgba(255, 255, 255, 0.7);
  border-color: hsl(var(--nodu-border));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.nodu-sidebar-search:focus {
  border-color: hsl(var(--nodu-accent));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.7),
    0 0 0 4px hsl(var(--nodu-accent) / 0.14);
}

.nodu-nav-active {
  background: hsl(var(--nodu-accent-soft));
  border: 1px solid hsl(var(--nodu-accent) / 0.24);
  box-shadow: 0 12px 24px -18px hsl(var(--nodu-accent) / 0.5);
}
```

- [ ] **Step 4: Run the sidebar test to verify it passes**

Run:

```bash
cd /Users/peetax/Projekty/crewflow && npm test -- src/views/uuid-mine-scope-identity.test.tsx
```

Expected:

```text
PASS  src/views/uuid-mine-scope-identity.test.tsx
  ...existing tests...
  ✓ renders the nodu sidebar pilot styles for authenticated mine scope
```

- [ ] **Step 5: Commit the sidebar changes**

```bash
cd /Users/peetax/Projekty/crewflow
git add src/components/layout/Sidebar.tsx src/views/uuid-mine-scope-identity.test.tsx src/index.css
git commit -m "feat: apply nodu sidebar pilot"
```

## Task 4: Restyle the dashboard header, cards, timelog rows, and event list

**Files:**
- Modify: `src/views/DashboardView.tsx`
- Modify: `src/index.css`
- Test: `src/views/DashboardView.test.tsx`

- [ ] **Step 1: Write the failing dashboard presentation test**

Replace the shell-only test in `src/views/DashboardView.test.tsx` with a full dashboard presentation test:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DashboardView from './DashboardView';

vi.mock('../context/AppContext', () => ({
  useAppContext: () => ({
    role: 'crewhead',
    searchQuery: '',
    setCurrentTab: vi.fn(),
    setTimelogFilter: vi.fn(),
    setSelectedEventId: vi.fn(),
    setEventTab: vi.fn(),
  }),
}));

vi.mock('../features/events/queries/useEventsQuery', () => ({
  useEventsQuery: () => ({
    data: [
      {
        id: 1,
        name: 'Akce jedna',
        job: 'JOB-001',
        city: 'Praha',
        startDate: '2026-04-20',
        endDate: '2026-04-20',
        filled: 6,
        needed: 8,
      },
    ],
  }),
}));

vi.mock('../features/timelogs/queries/useTimelogsQuery', () => ({
  useTimelogsQuery: () => ({
    data: [
      {
        id: 11,
        cid: 7,
        eid: 1,
        status: 'pending_ch',
        days: [{ date: '2026-04-20', start: '08:00', end: '16:00', breakMinutes: 30 }],
      },
    ],
  }),
}));

vi.mock('../features/receipts/queries/useReceiptsQuery', () => ({
  useReceiptsQuery: () => ({ data: [] }),
}));

vi.mock('../features/invoices/queries/useInvoicesQuery', () => ({
  useInvoicesQuery: () => ({ data: [] }),
}));

vi.mock('../features/timelogs/services/timelogs.service', () => ({
  getTimelogDependencies: () => ({
    contractors: [{ id: 7, name: 'Test Contractor', ii: 'TC', rate: 250, bg: '#F6E7DA', fg: '#1A1816' }],
  }),
}));

describe('DashboardView nodu pilot', () => {
  it('keeps stat cards monochrome and highlights the timelog job badge in orange', () => {
    render(<DashboardView />);

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Self-billing')).toHaveClass('nodu-stat-chip');
    expect(screen.getByText('JOB-001')).toHaveClass('nodu-job-badge');
    expect(screen.queryByTestId('stat-accent-dot')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the dashboard test to verify it fails**

Run:

```bash
cd /Users/peetax/Projekty/crewflow && npm test -- src/views/DashboardView.test.tsx
```

Expected:

```text
FAIL  src/views/DashboardView.test.tsx
+ Expected the element to have class:
+   nodu-job-badge
```

- [ ] **Step 3: Implement the dashboard visual pilot**

Update the `DashboardView.tsx` wrappers and key rows:

```tsx
<motion.div
  className="text-[hsl(var(--nodu-text))]"
  initial={{ opacity: 0, y: 10 }}
  animate={{ opacity: 1, y: 0 }}
>
  <div className="mb-6">
    <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[hsl(var(--nodu-text))]">Dashboard</h1>
    <p className="mt-1 text-[13px] text-[hsl(var(--nodu-text-soft))]">{roleLabel} · Duben 2026</p>
  </div>
```

```tsx
<div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
  <div className="nodu-surface rounded-[26px] p-5 lg:col-span-3">
    <h2 className="mb-4 text-[15px] font-semibold text-[hsl(var(--nodu-text))]">Timelogy ke zpracovani</h2>
```

```tsx
<div className="text-[11px] text-[hsl(var(--nodu-text-soft))]">
  {event.name} <span className="nodu-job-badge">{event.job}</span>
</div>
```

```tsx
<button
  key={event.id}
  onClick={() => openEventDetail(event.id)}
  className="block w-full rounded-2xl border border-transparent px-1 py-1 text-left transition-colors hover:border-[hsl(var(--nodu-border))] hover:bg-white/70"
>
```

Add the shared helpers in `src/index.css`:

```css
.nodu-job-badge {
  @apply inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold;
  background: hsl(var(--nodu-accent-soft));
  color: hsl(var(--nodu-accent));
  border: 1px solid hsl(var(--nodu-accent) / 0.18);
}

.nodu-progress-track {
  background: hsl(var(--nodu-paper-strong));
}

.nodu-progress-fill {
  background: linear-gradient(90deg, hsl(var(--nodu-accent)), hsl(var(--nodu-accent) / 0.72));
}
```

- [ ] **Step 4: Run the focused dashboard tests**

Run:

```bash
cd /Users/peetax/Projekty/crewflow && npm test -- src/views/DashboardView.test.tsx src/components/shared/StatCard.test.tsx
```

Expected:

```text
PASS  src/views/DashboardView.test.tsx
PASS  src/components/shared/StatCard.test.tsx
```

- [ ] **Step 5: Run the broader regression suite**

Run:

```bash
cd /Users/peetax/Projekty/crewflow && npm test -- src/views/uuid-mine-scope-identity.test.tsx src/context/AppContext.test.tsx src/views/DashboardView.test.tsx src/components/shared/StatCard.test.tsx
```

Expected:

```text
PASS  src/views/uuid-mine-scope-identity.test.tsx
PASS  src/context/AppContext.test.tsx
PASS  src/views/DashboardView.test.tsx
PASS  src/components/shared/StatCard.test.tsx
```

- [ ] **Step 6: Commit the dashboard pilot**

```bash
cd /Users/peetax/Projekty/crewflow
git add src/views/DashboardView.tsx src/index.css src/views/DashboardView.test.tsx
git commit -m "feat: apply nodu dashboard pilot"
```

## Task 5: Final verification and handoff

**Files:**
- Modify: none
- Verify: `src/index.css`, `src/components/layout/AppLayout.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/shared/StatCard.tsx`, `src/views/DashboardView.tsx`

- [ ] **Step 1: Run the full targeted pilot verification**

Run:

```bash
cd /Users/peetax/Projekty/crewflow && npm test -- src/views/DashboardView.test.tsx src/components/shared/StatCard.test.tsx src/views/uuid-mine-scope-identity.test.tsx src/context/AppContext.test.tsx
```

Expected:

```text
PASS  4 test files passed
```

- [ ] **Step 2: Run lint on touched files**

Run:

```bash
cd /Users/peetax/Projekty/crewflow && npm run lint
```

Expected:

```text
eslint exited with code 0
```

- [ ] **Step 3: Build the app to validate the pilot styles**

Run:

```bash
cd /Users/peetax/Projekty/crewflow && npm run build
```

Expected:

```text
vite v8...
✓ built in ...
```

- [ ] **Step 4: Create the final integration commit**

```bash
cd /Users/peetax/Projekty/crewflow
git add src/index.css src/components/layout/AppLayout.tsx src/components/layout/Sidebar.tsx src/components/shared/StatCard.tsx src/components/shared/StatCard.test.tsx src/views/DashboardView.tsx src/views/DashboardView.test.tsx src/views/uuid-mine-scope-identity.test.tsx
git commit -m "feat: ship nodu dashboard pilot"
```
