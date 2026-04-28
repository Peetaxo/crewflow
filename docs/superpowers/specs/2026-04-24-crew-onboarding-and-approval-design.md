# Crew Onboarding And Approval Design

## Cíl

Navrhnout jednotný identity a onboarding model pro další uživatele aplikace tak, aby:

- admin mohl vytvořit člena crew a poslat mu onboarding link,
- uživatel se mohl registrovat i sám,
- oba vstupy vedly do stejného `profile` / `profileId` modelu,
- nové účty typu `crew` procházely schvalováním před plnou aktivací,
- admin při schvalování mohl doplnit sazbu, tagy, typ spolupráce a upravit profil.

Tento mini-projekt se týká identity, onboardingu a approval workflow. Není součástí současného CRUD rollout pro `Projects`, `Clients` a `Crew update/delete`.

## Kontext

Současná aplikace už používá `profileId` jako hlavní identitu pro runtime flow a write operace. `Crew create` zatím není napojený na budoucí login dalších uživatelů. Chybí vrstva, která propojí:

- administrativní založení člena crew,
- autentizaci přes e-mail a heslo,
- onboarding chybějících údajů,
- self-registration,
- schvalování a aktivaci účtu.

## Požadavky

### Funkční

Systém musí podporovat dva vstupy:

1. **Admin invite flow**
   - admin založí nebo předpřipraví člena crew,
   - zadá e-mail,
   - uživateli odešle onboarding link,
   - uživatel otevře link, doplní chybějící údaje a nastaví heslo,
   - pokud už jsou údaje vyplněné, onboarding se zkrátí jen na potvrzení a nastavení hesla.

2. **Self-registration flow**
   - uživatel se registruje sám,
   - vyplní potřebné údaje,
   - nový účet je vždy role `crew`,
   - nový účet nejde rovnou do aktivního stavu, ale čeká na schválení adminem.

### Approval workflow

Admin musí mít při schvalování možnost:

- schválit nebo zamítnout uživatele,
- nastavit sazbu,
- doplnit tagy,
- potvrdit typ spolupráce / smlouvy,
- upravit profilové údaje před aktivací.

### Login

- přihlášení bude přes **e-mail + heslo**,
- onboarding link slouží k dokončení účtu, ne jako trvalý způsob loginu,
- e-mail z pozvánky bude předvyplněný, ale uživatel ho může změnit,
- session se pak chová stejně jako u běžného loginu.

## Doporučený model

### Jednotný profile-first model

Doporučená varianta je jeden společný identity model nad `profiles`, nikoliv oddělené tabulky pro invite a self-registration.

Každý budoucí uživatel prochází jedním profile-first tokem:

- `invited`
- `pending_approval`
- `active`
- `rejected`

Tento stav reprezentuje onboarding a approval lifecycle konkrétního člena crew.

### Proč tato varianta

- sedí na současný `UUID / profileId` model,
- admin invite i self-registration vedou do stejného cíle,
- nevznikají dva konkurenční identity modely,
- approval workflow je explicitní a dobře auditovatelný,
- budoucí `Crew create` se může napojit přímo na tento model.

## Datový model

### Profiles jako source of truth

`profiles` zůstane hlavní source of truth pro identitu člena crew.

Profil bude obsahovat:

- základní osobní údaje,
- kontaktní údaje,
- fakturační údaje,
- administrativní metadata jako sazba, tagy a typ spolupráce,
- stav onboardingu / schvalování.

### Nová logická pole

Spec předpokládá rozšíření profilu nebo navázané approval vrstvy o pole typu:

- `onboarding_status`
  - `invited`
  - `pending_approval`
  - `active`
  - `rejected`
- `collaboration_type`
  - typ spolupráce / smlouvy
- `invited_email`
  - původní e-mail pozvánky pro audit a předvyplnění
- volitelně `approved_at`, `approved_by`, `rejected_at`, `rejected_by`

Přesný fyzický návrh tabulek a migrace se upřesní v implementačním plánu, ale architektonický požadavek je jasný:

- **nevytvářet druhý paralelní identity model**,
- onboarding a approval stav musí být navázaný na stejnou UUID identitu, která už dnes řídí aplikaci.

## Uživatelské toky

### 1. Admin invite flow

1. Admin vytvoří nebo připraví základní crew profil.
2. Vyplní e-mail pro pozvánku.
3. Systém vytvoří invite token / onboarding link.
4. Uživatel otevře link.
5. Systém načte odpovídající profil.
6. Pokud profil nemá povinné údaje, onboarding formulář je vyžádá.
7. Uživatel nastaví heslo.
8. Profil přejde minimálně do stavu `pending_approval`, pokud admin ještě nepotvrdil finální aktivaci.

Poznámka: pokud admin předvyplní většinu údajů, onboarding je kratší. Pokud nic nevyplní, uživatel doplní kompletní profil sám.

### 2. Self-registration flow

1. Uživatel otevře veřejnou registraci.
2. Vyplní požadované údaje.
3. Vznikne profil role `crew`.
4. Stav účtu je `pending_approval`.
5. Admin účet schválí nebo zamítne.
6. Při schválení doplní admin chybějící administrativní metadata.
7. Teprve potom je účet `active`.

### 3. Approval flow

Při schvalování admin:

- schválí / zamítne,
- nastaví sazbu,
- doplní tagy,
- vybere nebo potvrdí typ spolupráce,
- může upravit osobní a fakturační údaje,
- tím převede profil do aktivního stavu.

## Role a oprávnění

- nově registrovaný nebo pozvaný uživatel je vždy `crew`,
- vyšší role (`crewhead`, `coo`) se nepřidělují při registraci,
- změna vyšší role zůstává pod admin kontrolou,
- neschválený uživatel nesmí mít plný přístup do aplikace.

## UI a UX požadavky

### Onboarding stránka

Onboarding musí umět:

- načíst profil z pozvánky,
- zobrazit předvyplněné údaje,
- vyžádat pouze chybějící povinné údaje,
- umožnit změnit e-mail,
- nastavit heslo,
- srozumitelně ukázat, co se stane dál.

### Self-registration formulář

Formulář musí:

- být jednoduchý a srozumitelný,
- sbírat jen údaje nutné pro založení profilu,
- nevynucovat sazbu ani tagy,
- umožnit vyplnění fakturačních údajů,
- po odeslání jasně sdělit, že účet čeká na schválení.

### Admin approval UI

Admin rozhraní musí ukázat:

- čekající registrace / pozvánky,
- základní profilové informace,
- možnost doplnit sazbu,
- možnost doplnit tagy,
- možnost nastavit typ spolupráce,
- tlačítka `schválit` / `zamítnout`.

## Error handling

Systém musí ošetřit:

- expirovaný nebo neplatný onboarding link,
- onboarding link k již aktivnímu účtu,
- duplicitní e-mail,
- pokus o self-registration pro již existující aktivní účet,
- přerušení registrace nebo nekompletní onboarding,
- zamítnutý účet.

Chybové zprávy mají být srozumitelné a uživatelsky čitelné, ne jen technické.

## Bezpečnost

- onboarding link musí být jednorázový nebo bezpečně expirovatelný,
- heslo se nastavuje až při dokončení onboardingu,
- neschválený účet nesmí dostat přístup k běžnému provozu,
- změna e-mailu během onboardingu musí být bezpečně validovaná,
- approval operace musí být auditovatelná.

## Implementační pořadí

Mini-projekt má být rozdělen do těchto fází:

### Fáze 1: Identity + approval foundation

- rozšířit model o onboarding / approval stav,
- zavést jednoznačný stavový tok,
- připravit vazbu na `profiles`.

### Fáze 2: Admin invite flow

- admin vytvoří základní profil,
- odešle onboarding link,
- uživatel dokončí účet a nastaví heslo.

### Fáze 3: Self-registration flow

- veřejná registrace,
- vytvoření profilu `crew`,
- přechod do `pending_approval`.

### Fáze 4: Admin approval UI

- schvalování a zamítání,
- doplnění sazby, tagů a typu spolupráce,
- aktivace účtu.

## Co není součástí tohoto mini-projektu

- Google login nebo jiné sociální přihlášení,
- pozdější role escalation při registraci,
- plný HR / payroll workflow,
- automatické generování smluv,
- redesign celé login oblasti mimo nutné onboarding a approval obrazovky.

## Definice hotovo

Mini-projekt bude považovaný za hotový, když:

- admin dokáže pozvat nového člena crew,
- uživatel dokáže dokončit onboarding a nastavit heslo,
- uživatel se dokáže self-register,
- self-registered účet čeká na schválení,
- admin dokáže účet schválit nebo zamítnout,
- admin při schválení doplní sazbu, tagy a typ spolupráce,
- aktivní účet funguje jako běžný login do aplikace přes `e-mail + heslo`,
- vše je navázané na stávající UUID / `profileId` model bez druhého identity stromu.
