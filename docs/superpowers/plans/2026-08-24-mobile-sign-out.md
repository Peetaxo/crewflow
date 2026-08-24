# Mobile Sign Out Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Přidat do mobilního Nastavení okamžité odhlášení, které ukončí pouze relaci na aktuálním zařízení.

**Architecture:** `SettingsView` zobrazí mobilní akci pouze při zapnuté autentizaci a zavolá existující `AuthContext.signOut()`. Sdílený `AuthProvider` bude dál vlastnit čištění lokálního stavu, ale Supabase Auth zavolá s `scope: 'local'`, takže stejné bezpečné chování použije mobil i desktop.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library, Supabase JS Auth, shadcn `Button`, Sonner toast.

---

## Struktura souborů

- `src/app/providers/AuthProvider.tsx`: společný odhlašovací tok a lokální Supabase scope.
- `src/app/providers/AuthProvider.test.tsx`: regresní test rozsahu odhlášení.
- `src/views/SettingsView.tsx`: mobilní tlačítko, stav probíhajícího požadavku a chybová hláška.
- `src/views/SettingsView.test.tsx`: mobilní viditelnost, okamžité volání, blokace během požadavku a chyba.

### Task 1: Omezit Supabase odhlášení na aktuální zařízení

**Files:**
- Modify: `src/app/providers/AuthProvider.test.tsx`
- Modify: `src/app/providers/AuthProvider.tsx:331`

- [ ] **Step 1: Zpřesnit mock a napsat selhávající očekávání**

V `AuthProvider.test.tsx` nechat mock přijmout options a v testu `clears persisted UI session before signing out` požadovat lokální scope:

```tsx
const signOutMock = vi.fn(async (_options?: { scope?: string }) => ({ error: null }));

// v mocku Supabase
signOut: (options?: { scope?: string }) => signOutMock(options),

// v testu
expect(signOutMock).toHaveBeenCalledWith({ scope: 'local' });
```

- [ ] **Step 2: Spustit test a ověřit správný RED stav**

Run:

```bash
npm test -- src/app/providers/AuthProvider.test.tsx
```

Expected: FAIL, protože produkční `signOut()` zatím options neposílá.

- [ ] **Step 3: Implementovat minimální změnu Supabase volání**

V `AuthProvider.tsx` změnit pouze volání klienta:

```tsx
const { error } = await supabase.auth.signOut({ scope: 'local' });
```

- [ ] **Step 4: Spustit cílený test a ověřit GREEN stav**

Run:

```bash
npm test -- src/app/providers/AuthProvider.test.tsx
```

Expected: celý soubor PASS bez chyb.

### Task 2: Přidat mobilní akci do Nastavení

**Files:**
- Create: `src/views/SettingsView.test.tsx`
- Modify: `src/views/SettingsView.tsx`

- [ ] **Step 1: Napsat testovací scénáře před produkčním kódem**

Vytvořit `SettingsView.test.tsx` s úplným nastavením a scénáři:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsView from './SettingsView';

const state = vi.hoisted(() => ({
  isMobile: true,
  isAuthRequired: true,
  signOut: vi.fn<() => Promise<void>>(),
  toastError: vi.fn(),
}));

vi.mock('../hooks/use-mobile', () => ({
  useIsMobile: () => state.isMobile,
}));

vi.mock('../app/providers/useAuth', () => ({
  useAuth: () => ({
    currentProfileId: 'profile-1',
    isAuthRequired: state.isAuthRequired,
    profile: { firstName: 'Petr', lastName: 'Heitzer', email: 'petr@example.com' },
    signOut: state.signOut,
  }),
}));

vi.mock('../context/useAppContext', () => ({
  useAppContext: () => ({
    darkMode: false,
    setDarkMode: vi.fn(),
    settingsSection: 'menu',
    setSettingsSection: vi.fn(),
  }),
}));

vi.mock('../features/crew/services/crew.service', () => ({
  getContractors: () => [],
  subscribeToCrewChanges: () => () => undefined,
  updateContractor: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: state.toastError },
}));

describe('SettingsView mobile sign out', () => {
  beforeEach(() => {
    state.isMobile = true;
    state.isAuthRequired = true;
    state.signOut.mockReset().mockResolvedValue(undefined);
    state.toastError.mockReset();
  });

  it('signs out immediately from mobile settings', async () => {
    render(<SettingsView />);

    fireEvent.click(screen.getByRole('button', { name: 'Odhlásit se' }));

    await waitFor(() => expect(state.signOut).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('hides sign out outside authenticated mobile settings', () => {
    state.isMobile = false;
    const { rerender } = render(<SettingsView />);
    expect(screen.queryByRole('button', { name: 'Odhlásit se' })).not.toBeInTheDocument();

    state.isMobile = true;
    state.isAuthRequired = false;
    rerender(<SettingsView />);
    expect(screen.queryByRole('button', { name: 'Odhlásit se' })).not.toBeInTheDocument();
  });

  it('disables sign out while the request is pending', async () => {
    let finishSignOut: (() => void) | undefined;
    state.signOut.mockImplementationOnce(() => new Promise<void>((resolve) => { finishSignOut = resolve; }));
    render(<SettingsView />);

    const button = screen.getByRole('button', { name: 'Odhlásit se' });
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());

    finishSignOut?.();
    await waitFor(() => expect(button).toBeEnabled());
  });

  it('reports a sign out error and enables retry', async () => {
    state.signOut.mockRejectedValueOnce(new Error('Síť není dostupná.'));
    render(<SettingsView />);

    fireEvent.click(screen.getByRole('button', { name: 'Odhlásit se' }));

    await waitFor(() => expect(state.toastError).toHaveBeenCalledWith('Síť není dostupná.'));
    expect(screen.getByRole('button', { name: 'Odhlásit se' })).toBeEnabled();
  });

});
```

- [ ] **Step 2: Spustit nový test a ověřit správný RED stav**

Run:

```bash
npm test -- src/views/SettingsView.test.tsx
```

Expected: FAIL, protože mobilní akce ještě neexistuje.

- [ ] **Step 3: Implementovat minimální mobilní UI a obsluhu**

V `SettingsView.tsx`:

```tsx
import { ArrowLeft, LogOut, Moon, Palette, Sun, UserRound } from 'lucide-react';
import { useIsMobile } from '../hooks/use-mobile';

const { currentProfileId, isAuthRequired, profile, signOut } = useAuth();
const isMobile = useIsMobile();
const [isSigningOut, setIsSigningOut] = useState(false);

const handleSignOut = async () => {
  if (isSigningOut) return;
  setIsSigningOut(true);

  try {
    await signOut();
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'Odhlášení se nepodařilo.');
  } finally {
    setIsSigningOut(false);
  }
};
```

Pod existující grid karet v sekci `menu` přidat:

```tsx
{isMobile && isAuthRequired && (
  <div className="mt-6 max-w-3xl">
    <Button
      type="button"
      variant="outline"
      className="w-full text-[#d45d37]"
      disabled={isSigningOut}
      onClick={() => { void handleSignOut(); }}
    >
      <LogOut size={17} />
      {isSigningOut ? 'Odhlašuji…' : 'Odhlásit se'}
    </Button>
  </div>
)}
```

- [ ] **Step 4: Spustit cílené testy a ověřit GREEN stav**

Run:

```bash
npm test -- src/views/SettingsView.test.tsx src/app/providers/AuthProvider.test.tsx
```

Expected: oba testovací soubory PASS bez chyb.

### Task 3: Celkové ověření, commit a push

**Files:**
- Verify: celý repozitář

- [ ] **Step 1: Spustit statickou kontrolu změn**

Run:

```bash
git diff --check
```

Expected: žádný výstup a exit code 0.

- [ ] **Step 2: Spustit celý testovací balík**

Run:

```bash
npm test
```

Expected: všechny testy PASS, žádné selhání.

- [ ] **Step 3: Spustit produkční build**

Run:

```bash
npm run build
```

Expected: Vite build dokončený s exit code 0.

- [ ] **Step 4: Zkontrolovat rozsah změn**

Run:

```bash
git status --short --branch
git diff -- src/app/providers/AuthProvider.tsx src/app/providers/AuthProvider.test.tsx src/views/SettingsView.tsx src/views/SettingsView.test.tsx
```

Expected: pouze plánované soubory a tento plán; žádné cizí změny.

- [ ] **Step 5: Commitnout implementaci**

```bash
git add docs/superpowers/plans/2026-08-24-mobile-sign-out.md src/app/providers/AuthProvider.tsx src/app/providers/AuthProvider.test.tsx src/views/SettingsView.tsx src/views/SettingsView.test.tsx
git commit -m "feat: add mobile sign out"
```

- [ ] **Step 6: Pushnout schválenou větev `main`**

```bash
git push origin main
```

Expected: `main` na `origin` ukazuje na nový implementační commit.
