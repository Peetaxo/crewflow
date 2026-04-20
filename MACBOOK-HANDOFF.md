# MacBook Handoff

Tento soubor je určený jako rychlý start pro pokračování vývoje na novém zařízení.

## Důležitý princip

**Source of truth je GitHub repo, ne původní lokální složka na Windows.**

To znamená:
- na MacBooku neřešíš původní cestu na disku
- prostě naklonuješ aktuální repo z GitHubu
- a pokračuješ z nejnovějšího commitu na větvi `main`

## Co znamená `main`

- `main` je hlavní aktuální větev projektu
- po klonu se ti standardně stáhne právě tato větev
- je to nejnovější pracovní stav aplikace

## Než začneš s repem

Pokud chceš, aby nový Codex na MacBooku fungoval co nejpodobněji jako na původním stroji, udělej nejdřív tohle:

1. nainstaluj `Codex`
2. nainstaluj `superpowers` skills
3. ověř, že nový Codex skills opravdu vidí
4. teprve potom pokračuj klonem repa a vývojem

Repo samotné nestačí pro stejný AI workflow.  
Repo přenese kód, plány a specy, ale **nepřenese lokálně instalované skills ani lokální Codex konfiguraci**.

## Co udělat po klonu na MacBooku

1. Nainstalovat:
   - `git`
   - `Node.js` LTS
   - `npm`
   - `Codex`, pokud chceš pokračovat stejným AI workflow

2. Naklonovat repo:

```bash
git clone https://github.com/Peetaxo/crewflow.git
cd crewflow
```

3. Nainstalovat závislosti:

```bash
npm install
```

4. Vytvořit `.env.local`

Minimálně:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_APP_DATA_SOURCE=supabase
```

5. Spustit aplikaci:

```bash
npm run dev
```

## Co se přenese z GitHubu automaticky

- celý zdrojový kód
- `WORKFLOW.md`
- `TODO.md`
- `docs/...` plány a specy
- `supabase/...` SQL drafty

## Co se z GitHubu nepřenese

- `.env.local`
- lokální preview logy
- lokální konfigurace Codexu
- lokálně nainstalované skills v `~/.codex/...`

## Pokud chceš stejný Codex workflow jako na předchozím stroji

Na MacBooku bude potřeba:

1. nainstalovat Codex
2. znovu nainstalovat `superpowers`
3. ověřit, že skills jsou dostupné
4. otevřít tohle repo

Plány, specy a workflow poznámky už v repu jsou, takže ty se po klonu přenesou automaticky.

## Co si má nový Codex přečíst jako první

1. `MACBOOK-HANDOFF.md`
2. `WORKFLOW.md`
3. `TODO.md`
4. `docs/superpowers/specs/2026-04-15-invoice-workflow-design.md`
5. `docs/superpowers/plans/2026-04-15-uuid-identity-migration.md`

## Aktuální stav projektu

### Hotovo

- AppContext je zredukovaný na UI/navigation vrstvu
- service layer je zavedený pro hlavní domény
- Supabase read-only je napojené napříč hlavními doménami
- login přes email + heslo funguje
- dev login pro testování rolí funguje
- timelog approval write flow do Supabase funguje
- nový invoice create flow funguje
- invoice workflow bylo přepracované na:
  - faktura = skutečný dokument
  - create flow vybírá schválené timelogy/účtenky
  - jedna faktura může obsahovat více job number

### Rozpracováno

- migrace identity na UUID

Konkrétně:
- první UUID krok je hotový:
  - typy a hydratace už drží UUID metadata
  - contractor/profile vazby se už částečně přenášejí jako `profileId` / `contractorProfileId`
- další krok je:
  - přepnout `AuthProvider` tak, aby vystavil:
    - `currentProfileId`
    - `currentUserId`
    - `currentContractorId`
- potom teprve přepnout view typu:
  - `MyShiftsView`
  - `TimelogsView`
  - `ReceiptsView`
  - `InvoicesView`
  - `Sidebar`
  ze starého:
  - `contractors[0]`
  - `cid === 1`
  na skutečnou auth identitu

## Kde pokračovat

Pokud nový Codex navazuje, má pokračovat podle:

- `docs/superpowers/plans/2026-04-15-uuid-identity-migration.md`

Aktuálně je:

- **Task 1 hotový**
- **Task 2 další na řadě**

To znamená:

1. upravit `src/app/providers/AuthProvider.tsx`
2. vystavit current UUID identitu přihlášeného člověka
3. teprve potom jít do mine-scope view

## Poznámka k architektuře

Nevracet se zpět k:

- `contractors[0]`
- `cid === 1`
- implicitnímu „první contractor = aktuální uživatel“

Správný směr je:

- auth user
- profile UUID
- contractor/profile vazba přes skutečnou backend identitu

## Poznámka k fakturaci

Invoice workflow už je vědomě navržené takto:

- `approved` je stav timelogu
- `draft`, `sent`, `paid` jsou stavy faktury
- v seznamu `Faktury` mají být jen skutečně vytvořené faktury
- create flow vybírá schválené timelogy a účtenky
- faktura může obsahovat více `job_number`

K tomu existuje spec:

- `docs/superpowers/specs/2026-04-15-invoice-workflow-design.md`

## Doporučení pro přechod

Jakmile vše funguje na MacBooku:

- přestaň používat starou Windows kopii
- ať nevzniknou dvě paralelní pracovní verze projektu
