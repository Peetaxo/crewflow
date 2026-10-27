# Dokončení nodu a příprava první verze — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to follow this roadmap task by task. Před změnou konkrétního subsystému navázat na jeho existující návrh a podrobný plán. V jednu chvíli implementovat jeden úkol; tento dokument sám nespouští implementaci ani nasazení.

**Goal:** Dokončit rozpracované části nodu, ověřit skutečný provoz s více lidmi a uzavřít první verzi pro web a iOS.

**Architecture:** Zachovat stávající React aplikaci, Supabase backend a Capacitor iOS. Dokončovat jednotlivé oblasti v malých ověřitelných změnách; hotovou fakturaci a onboarding rozšiřovat pouze podle konkrétních zbývajících potřeb. Obnovování dat řešit ve stávající datové vrstvě bez plošného přepisu.

**Tech Stack:** React, TypeScript, TanStack Query, Supabase Auth/Postgres/Edge Functions/Storage, Capacitor iOS, Vitest, ESLint, Vite.

---

Datum plánu: **27. 10. 2026**. Výchozí ověřený vzdálený main: `ddc3101`. Jde o řídicí plán několika samostatných oblastí, jejich pořadí a akceptace; přesné patche se připravují po ověření aktuálního stavu příslušné oblasti.

## Rozsah a dva milníky

**Milník A — připravený a úspěšně dokončený malý pilot:** nový člověk dostane skutečnou pozvánku, aktivuje účet a na vlastním zařízení projde prací od přiřazení po zaplacenou fakturu. Crew, CH a COO pracují ve vlastních účtech a vidí aktuální údaje. Splněné etapy 0–5; mobilní push není podmínkou tohoto pilotu.

**Milník B — uzavřená první verze:** splněný milník A, funkční iOS push a dokončený technický úklid podle etap 6–7. Každé rozhodnutí o odložení mění rozsah tohoto milníku výslovně; čekající krok se neoznačuje jako hotový.

První verze cílí na web a iOS, kde už probíhá vývoj a ověřování. Android/FCM je navazující samostatná etapa. Auta, účtenky, rozšiřování skladu, Toggl, offline režim, oblečení, hodnocení crew, náhradníci a automatické přebírání zájemců z Tally zůstávají mimo tento dokončovací plán. Existující části zůstávají dostupné podle dosavadního rozsahu.

## Výchozí stav

| Oblast | Doložený stav při sestavení plánu |
|---|---|
| Vlastní faktura a self-billing | Obě cesty prošly klikacím demem až po PDF a úhradu; opravy neaktuálních souhrnů a dvojího stažení ověřené |
| Výkazy a formulář člena | Kompaktní původní i společné výkazy a formulář přes celou obrazovku začleněné |
| Onboarding | Lokální aktivace, pozvánky, obnova hesla a krátký úvod připravené; celý poslední lidský mobilní průchod čeká |
| Skutečné pozvánky | Lokální schránka zachytává zprávy; veřejně dostupný nový onboarding a skutečné odesílání nejsou zapnuté |
| Upozornění | Historie zapnutá a vyzkoušená; mobilní push vypnutý a neověřený |
| Dashboard | Desktop stále obsahuje „Duben 2026“; součet schválených hodin nemá měsíční filtr |
| Automatické ověření | Záznam z 26. 10. uvádí 2 733 úspěšných testů a 109 existujících typových diagnostik; nejde o nově spuštěné ověření tohoto plánu |
| Pracovní kopie | Hlavní lokální checkout je o 21 commitů za origin/main a má nesouvisející změny; existují starší pracovní větve a draft PR #6 |

## Pravidla práce a dokončení

- V jednu chvíli implementovat jeden úkol. Pokud čeká na heslo, účet nebo službu, uložit přesný bod pokračování a posunout jiný nezávislý úkol; čekající akceptaci nepřeskočit. Zjištěné nové problémy přidávat k příslušné etapě a určit jejich dopad na její dokončení.
- U každé etapy vést stav **čeká / probíhá / čeká na uživatele nebo službu / ověřeno** a připojit konkrétní důkaz. Pořadí v plánu není tvrzení, že je etapa spuštěná.
- Dokončení znamená výsledek v aplikaci, ověření příslušného scénáře, začlenění do main a aktualizované vývojové instalace podle `AGENTS.md`. Samotný webový build nestačí.
- Po změně aplikace použít čistý ověřený main, zachovat ignorovanou `.env.local` a spustit `npm run ios:refresh:devices`. Simulátor a fyzický iPhone vykazovat samostatně. Nedostupný telefon je čekající instalace; dostupný telefon s chybou sestavení, podpisu, instalace nebo spuštění je neúspěšný krok.
- Regresní test přidat pro měněné chování. Před začleněním spustit odpovídající testy, lint a build; plošné ověření opakovat při integračním milníku nebo novém důvodu.
- Živý zásah připravit jako konkrétní ověřený balík s návratem zpět a postupovat podle platného oprávnění. Tento plán sám není pokyn k odeslání skutečných pozvánek ani k zapnutí produkčních funkcí.
- Testovací hesla zadává uživatel přímo do aplikace. Tajné klíče, aktivační odkazy a soukromé osobní údaje nepatří do plánu ani evidence v Gitu.

## Etapa 0 — Sjednotit pracovní základ

**Stav: ověřeno.** Nové výsledky a rozhodnutí o zachované práci: [výchozí ověření](../../testing/2026-10-27-completion-baseline.md). Základ `ddc3101`; 2 733 testů prošlo s nejvýše dvěma workery, lint a build prošly, typecheck má 109 známých diagnostik.

**Výstup:** jedna ověřená výchozí verze a zachované rozpracované změny. Nejde zatím o plošný technický úklid.

- [x] Ověřit aktuální vzdálený main a vybrat čistou pracovní kopii pro navazující změny.
- [x] Zachovat a porovnat místní změny `ios/App/App/Info.plist`, `src/views/TimelogsView.tsx` a `src/views/TimelogsView.test.tsx` s aktuálním main. Oddělit dosud potřebnou práci od změn již začleněných jinou cestou.
- [x] Zapsat výchozí commit, prostředí, stav testů a aktuální typové diagnostiky do `docs/testing/2026-10-27-completion-baseline.md`. Použít skutečně zjištěné výsledky, nepřebírat historická čísla jako nově ověřená.
- [x] Tento plán používat jako seznam k dokončení; původní `TODO.md` ponechat jako zásobník nápadů do závěrečné aktualizace.

**Hotovo, když:** další práce vychází z čistého aktuálního main a žádné původní rozpracované soubory nebyly ztracené ani přepsané.

## Etapa 1 — Uzavřít místní průchod nového člena

**Stav: ověřeno 27. 10. 2026.** Celý navazující místní průchod prošel skutečným UI v nodu test s lidským zadáním obou hesel. Ověřena identita crew a 250 Kč/h, úvod, odhlášení/přihlášení, relace po restartu, obnova, odmítnutí starého hesla a chybové stavy pozvánek. Jednorázovost obnovy navíc potvrzuje skutečné API. [Úplný záznam a rozlišení důkazů](2026-10-26-member-onboarding-completion-verification.md).

**Závislost:** etapa 0. **Rozdělení práce:** Codex připraví prostředí a ověří uloženou identitu; uživatel projde zadáním hesel a mobilními obrazovkami.

Navázat na `docs/superpowers/plans/2026-10-26-member-onboarding-trial-guide.md` a odpovídající záznam `2026-10-26-member-onboarding-completion-verification.md` v aktuálním main. Testovací aplikace je **nodu test** v simulátoru; běžná vývojová aplikace nodu je samostatná instalace.

- [x] Ověřit stav zachovaného pilotu, připraveného profilu a platnost pozvánky. Při expiraci vystavit náhradu pro tentýž profil, nevytvářet duplicitní účet.
- [x] Projít pozvánku z testovací schránky do nodu test, aktivovat účet heslem o nejméně 8 znacích a ověřit správné jméno, roli crew a sazbu.
- [x] Vyzkoušet přeskočení úvodu i jeho opětovné otevření z nastavení; projít vstup do směn.
- [x] Ověřit odhlášení, nové přihlášení a zachování relace po ukončení a spuštění aplikace.
- [x] Přes „Zapomenuté heslo“ projít obnovu od e-mailu po nové přihlášení. Potvrdit odmítnutí starého hesla a opakovaného použitého odkazu.
- [x] Ověřit srozumitelný stav pro expirovanou a neplatnou pozvánku a uložit výsledky do existujícího záznamu ověření.

**Hotovo, když:** poslední celý navazující průchod skutečně prošel obrazovkami a nezůstává čekající lidské potvrzení. API důkaz sám tuto etapu neuzavírá.

**Místa případných oprav:** `src/features/onboarding/`, `src/views/LoginView.tsx`, `supabase/functions/crew-onboarding/`, `supabase/functions/crew-invitations/`, `supabase/templates/recovery-pilot.html`.

## Etapa 2 — Oprávnění a správný dashboard

**Závislost:** etapa 0. Navazuje po etapě 1, ale při čekání na lidské zadání hesla může pokračovat samostatně. Tyto dvě ohraničené opravy provést odděleně; oprávnění jsou podmínkou skutečných pozvánek.

### 2.1 Uzavřít vývojové přepínání rolí pro běžné uživatele

**Stav: probíhá, pouze čtecí audit.** Aktuální živá definice a granty znovu potvrzují možnost vlastního zvýšení role přihlášeným uživatelem. Blokuje skutečné pozvánky; žádný živý zápis neproběhl. [Důkaz a neprovedené API scénáře](../../testing/2026-10-27-pilot-access.md).

- [x] Porovnat aktuální nasazenou definici `set_current_user_role` a související granty s `supabase/user-role-switching.sql`. Historický nález z auditu ověřit znovu proti skutečnému backendu.
- [ ] Zachovat vývojové zkoušení pohledů v odděleném testovacím režimu. Běžný uživatel nesmí změnit skutečnou roli sám sobě; samotné schování přepínače není splnění.
- [ ] Ověřit přímo API jako anon, crew A, crew B, CH a COO: role, cizí profily, výkazy, přiřazení, faktury, přílohy a pozvánky. Pozitivní případy musí dál fungovat podle role a vlastnictví.
- [ ] Ověřit, že profil bez účtu mohou založit pouze oprávněné vedoucí role a nemohou přitom podstrčit cizí Auth identitu. Lokálně schválené oprávnění se do živého prostředí nepřenáší bez této kontroly.
- [ ] Zaznamenat testované role, endpointy a skutečné výsledky do `docs/testing/2026-10-27-pilot-access.md`.

**Hotovo, když:** běžný crew nedokáže přímým voláním získat vyšší oprávnění ani cizí soukromé údaje a CH/COO mohou dokončit určené pracovní kroky.

**Místa změn:** `src/app/providers/AuthProvider.tsx`, `src/app/providers/AuthProvider.test.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/layout/AppLayout.tsx`, `supabase/user-role-switching.sql`, případná nová migrace vytvořená zavedeným CLI postupem.

### 2.2 Opravit období a souhrny dashboardu

**Stav: čeká.**

- [ ] Nahradit pevný „Duben 2026“ skutečně zobrazeným obdobím. Pro první verzi použít aktuální kalendářní měsíc; nepřidávat nový složitý filtr bez potřeby.
- [ ] Hodiny označené „tento měsíc“ počítat podle data jednotlivých odpracovaných dnů. Výkaz přes hranici měsíců přispívá do každého měsíce pouze svými příslušnými dny.
- [ ] Zachovat stavové fronty „čeká na mě“ napříč obdobími, aby oprava měsíčních statistik neschovala starší práci ke schválení.
- [ ] Ověřit hranici měsíce a roku, prázdný měsíc a role crew/CH/COO na mobilu i desktopu.

**Hotovo, když:** období v nadpisu odpovídá měsíčním hodnotám a seznam práce ke schválení dál obsahuje všechny relevantní nevyřízené položky.

**Soubory:** `src/views/DashboardView.tsx`, `src/views/DashboardView.test.tsx`.

## Etapa 3 — Potvrdit aktuální data mezi účty a zařízeními

**Stav: čeká.**

**Závislost:** etapa 2. **Výstup:** spolehlivý provoz crew, CH a COO bez restartování aplikace.

- [ ] Ve třech samostatných účtech reprodukovat přiřazení člověka, odeslání výkazu, vrácení, opravu, schválení a změnu stavu faktury. Rozlišit již opravené obnovování po vlastním zápisu od aktualizace po zápisu jiného účtu.
- [ ] Stanovit pro pilot toto chování: úspěšný vlastní zápis se projeví ihned; po návratu do aplikace či otevření příslušného seznamu se data obnoví; změna jiného účtu se na aktivní obrazovce projeví nejpozději do 30 sekund. Jde o cílové kritérium, nikoli o doloženou vlastnost dnešní verze.
- [ ] Doplnit nejmenší potřebné obnovování ve stávajících query a lifecycle obsluhách podle výsledků reprodukce. Nespuštět kvůli tomu plošnou migraci na Realtime.
- [ ] Při ztrátě připojení ukázat neaktuální stav a možnost obnovení. Před nevratným schválením použít aktuální serverový podklad a při souběžné změně nabídnout nové načtení.
- [ ] Ověřit, že aktualizace nesmaže rozepsaný výkaz a že odhlášení nebo změna účtu nepřenese data předchozí osoby.
- [ ] Zapsat časové výsledky a kombinace zařízení do `docs/testing/2026-10-27-multi-account-refresh.md`.

**Hotovo, když:** všechny uvedené přechody splní cíl obnovování ve webu i iOS a žádná rozepsaná práce ani izolace účtů se neztratí.

**Místa změn podle reprodukce:** `src/lib/query-client.ts`, `src/lib/query-keys.ts`, `src/features/shift-workflows/useShiftWorkflows.ts`, `src/features/timelogs/services/timelogs.service.ts`, `src/app/providers/AuthProvider.tsx` a příslušné lifecycle obsluhy. Změny konfigurovat pro dotčené domény, nepřepínat všechny query plošně.

## Etapa 4 — Připravit skutečné pozvánky a dostupné prostředí

**Stav: čeká.**

**Závislosti:** etapy 1–3. **Potřebné vstupy od uživatele:** veřejná adresa aplikace, odesílací adresa a způsob distribuce iOS pro vybrané lidi. Tyto volby uzavřít na konkrétním návrhu této etapy; nebrzdí dokončení místního testu.

- [ ] Vybrat provozní adresu a hostované prostředí pro malý pilot. Ověřit otevření a přihlášení z druhé sítě při vypnutém notebooku.
- [ ] Připravit serverové nastavení pozvánek a obnovy hesla, přesměrování a schváleného odesílatele. Lokální adresy a schémata nodu test zachovat pouze pro místní pilot.
- [ ] Připravit a otestovat veřejné HTTPS odkazy: s nainstalovanou aplikací otevřou správný formulář v aplikaci, bez ní nabídnou funkční webovou cestu a srozumitelnou instalaci.
- [ ] Ověřit odpovídající serverové objekty a řízené zapnutí onboardingu v cílovém backendu; kód v main sám nedokládá provozní dostupnost funkce.
- [ ] Vytvořit plán nasazení s testovacím účtem, kontrolou zachování existujících profilů, omezením rozesílání na konkrétní adresáty a postupem vypnutí nových pozvánek při problému. Rozpracované účty a data se při vypnutí nemažou.
- [ ] Po příslušném schválení nasadit připravený balík a poslat jednu skutečnou zkušební pozvánku určenému příjemci. Ověřit doručení a celý průchod z e-mailu.
- [ ] Ověřit obnovu hesla, náhradu pozvánky a navázání na existující profil bez přepsání jeho sazby nebo historie.

**Hotovo, když:** člověk mimo vývojový notebook samostatně dostane pozvánku, aktivuje svůj účet a může se přihlásit i obnovit heslo. Tally není podmínkou; první lidi zveme ručně.

**Místa změn:** `supabase/functions/crew-invitations/`, `supabase/functions/crew-onboarding/`, `supabase/functions/_shared/activation-email.mjs`, `src/features/onboarding/local-pilot.ts`, `src/features/onboarding/NativeActivationLinks.tsx`, `src/features/onboarding/PasswordRecoveryLinks.tsx`, `ios/App/App/Info.plist`, veřejné linkové konfigurace zvoleného hostingu. Tajné hodnoty patří pouze do odpovídající serverové konfigurace.

## Etapa 5 — Dokončit skutečný malý pilot

**Stav: čeká.**

**Závislost:** etapa 4. **Rozsah:** 3–5 vybraných členů crew, CH a COO ve vlastních účtech; alespoň dvě zařízení a web+iOS. Počet lidí je návrh velikosti pilotu.

- [ ] Připravit kontaktní, identifikační a fakturační údaje pouze vybraných lidí. Potvrdit, kdo za které účty vystupuje a kdo řeší dotazy pilotu.
- [ ] Projít jednu celou skutečnou akci: přiřazení → přijetí informace → výkaz → vrácení s důvodem → oprava → CH → COO → fakturace → PDF → záznam úhrady.
- [ ] Rozdělit vlastní fakturu a self-billing mezi alespoň dva členy, aby se ověřily obě cesty. Skutečnou úhradu označit až podle skutečného zaplacení.
- [ ] Na další nově schválené práci ověřit trvalý souhlas se self-billingem. Samostatně ověřit jeho odvolání a to, že zapnutí nevystaví historické podklady. Záměrné chyby a negativní scénáře zkoušet v odděleném testu.
- [ ] Ověřit vícedenní práci a pravidlo jedné faktury za celý schválený výkaz pracovníka pro jednu akci. Kontrolovat částky, dny, odběratele, originály a chování po novém přihlášení.
- [ ] Na skutečných zařízeních potvrdit aktuální seznamy a izolaci účtů podle etap 2–3; historický důkaz z demo prohlížečů nezaměňovat za tento provozní výsledek.
- [ ] Všechny nálezy zapsat s reprodukcí, zařízením a dopadem do `docs/testing/2026-10-27-live-pilot.md`. Chyba oprávnění, identity, ztráta dat, chybná částka nebo nefunkční hlavní krok blokuje dokončení pilotu. Drobné vzhledové nálezy přiřadit k etapě 7.
- [ ] Opravit blokující nálezy a zopakovat dotčený navazující scénář včetně zařízení, kde selhal.

**Hotovo, když:** pilot skutečně dokončil pracovní a fakturační cyklus oběma cestami, částky souhlasí a nezůstává otevřená chyba blokující běžnou práci. Tím je splněn **milník A**.

Fakturaci neimplementovat znovu. Navázat na `docs/testing/2026-10-22-crew-invoicing-ui.md`; nový vývoj vychází jen z konkrétních nálezů pilotu.

## Etapa 6 — Dokončit iOS push upozornění

**Stav: čeká.**

**Závislost:** stabilní výsledek etapy 5. **Externí závislost:** potřebný Apple účet, přístupy a podepisování. Při chybějícím přístupu vykazovat čekající krok, ne úspěšné push.

- [ ] Podle `supabase/functions/send-notifications/README.md` ověřit Apple capability, provisioning a serverovou APNs konfiguraci pro skutečný distribuční způsob aplikace.
- [ ] Ověřit žádost o oprávnění, jeho zamítnutí a pozdější změnu, registraci zařízení a odpojení zařízení při odhlášení nebo změně účtu.
- [ ] Ověřit skutečné doručení na fyzický iPhone pro přidělení nebo změnu směny, vrácení výkazu a dostupnou fakturu. Zkoušet aplikaci otevřenou, na pozadí i ukončenou.
- [ ] Klepnutí musí otevřít správnou položku ve správném účtu. Ověřit noční klid, vypnutou kategorii, nezduplikování zpráv a neaktuální či zrušenou událost.
- [ ] Push zapnout v cílovém prostředí až po úspěšném testu; při problému musí jít doručování vypnout při zachované historii upozornění.
- [ ] Výsledky uložit do `docs/testing/2026-10-27-ios-push.md`. Simulovaný banner je pomocná kontrola, nikoli důkaz APNs doručení.

**Hotovo, když:** fyzický iPhone prokazatelně přijímá skutečné zprávy a navigace, preference i vazba na účet fungují. Android/FCM se sleduje samostatně a bez skutečného testu se neoznačuje jako ověřený.

**Soubory:** `src/features/notifications/native-push.ts`, `src/features/notifications/NotificationSettings.tsx`, `src/features/notifications/NotificationsProvider.tsx`, `supabase/functions/send-notifications/push.ts`, `supabase/functions/send-notifications/worker.ts`, iOS capability a signing konfigurace.

## Etapa 7 — Technický úklid a uzavření první verze

**Stav: čeká.**

**Závislost:** etapa 5; závěrečná akceptace vyžaduje také dokončenou etapu 6. Technický úklid zůstává podle dosavadní dohody na konci, ale může pokračovat během čekání na Apple účet.

- [ ] Přepočítat skutečný aktuální seznam TypeScript diagnostik. Opravovat po souvisejících skupinách; neřešit je plošným `any`, vypnutím kontroly nebo hromadnými ignore komentáři.
- [ ] Dostat aplikační typecheck na nulu a přidat jeho běh do běžného ověřování projektu. Chyby patřící samostatnému serverovému runtime kontrolovat jeho vlastním odpovídajícím postupem.
- [ ] Opravit zbývající matoucí české texty a potvrzené vzhledové nálezy pilotu na mobilu a desktopu. Pomalé načítání řešit podle měření konkrétního hlavního kroku, ne plošným refaktorem.
- [ ] Aktualizovat `TODO.md`: hotové položky propojit s důkazy, ponechané nápady oddělit od nedostatků první verze a odstranit překonané předpoklady o chybějícím backendu, účtech nebo fakturaci.
- [ ] Porovnat staré větve a draft PR #6 se skutečně začleněným kódem; uzavřít pouze překonané položky. Pracovní kopie archivovat až po zachování veškeré dosud potřebné práce a místních konfigurací.
- [ ] Na výsledném main spustit závěrečné ověření: `npm test`, `npm run lint`, `npm run build`, `npx tsc --noEmit -p tsconfig.app.json` a `git diff --check`. Očekávaný výsledek každého příkazu je exit 0; známé typové chyby už nejsou přijatelná výjimka tohoto milníku.
- [ ] Pro přesně ověřený commit dokončit refresh podle `AGENTS.md`, samostatně potvrdit simulátor a fyzický iPhone a zkontrolovat, že nasazený backend a mobilní balík odpovídají ověřené verzi.
- [ ] Uložit `docs/testing/2026-10-27-v1-acceptance.md`: commit, cílové prostředí, zařízení, výsledky etap, případná výslovná rozhodnutí o rozsahu, postup obnovení přístupu a kontakt pro provozní problém.

**Hotovo, když:** milník A platí i na výsledné verzi, iOS push funguje, kontroly procházejí a všechny zbývající položky jsou výslovně zařazené až do další verze. Tím je splněn **milník B**.

## Pořadí navazující práce

1. Sjednotit pracovní základ a připravit místní pilot.
2. Dokončit lidský onboardingový průchod v nodu test.
3. Uzavřít oprávnění a opravit dashboard.
4. Ověřit a případně doplnit aktuálnost dat mezi účty.
5. Zpřístupnit skutečné pozvánky a prostředí pro vybrané lidi.
6. Dokončit malý skutečný pilot a opravit jeho blokující nálezy.
7. Doplnit iOS push.
8. Dokončit technický úklid a závěrečnou akceptaci.

**Etapy 0–1 byly uzavřené 27. 10. 2026.** Navazující pracovní celek je etapa 2: samostatně připravit opravu oprávnění podle potvrzeného živého nálezu a následně opravit dashboard. Skutečné pozvánky zůstávají podmíněné dalšími etapami.
