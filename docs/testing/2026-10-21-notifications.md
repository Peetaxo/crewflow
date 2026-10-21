# NODU: upozornění — stav připravený k revizi, 21. 10. 2026

Změny jsou v samostatné větvi `codex/notifications-20261020`. Nejsou sloučené do
`main`, nejsou nasazené do databáze a vývojové instalace nebyly obnovené.

**Nejnovější stav:** uživatel výslovně schválil databázové nasazení i odeslání kódu
do `Peetaxo/crewflow`. Větev byla spojena s aktuálním mobilním onboardingem z main.
Prošlo všech **2 419 testů / 196 souborů** a vývojový webový build. Předchozí údaje
o chybějícím souhlasu níže jsou historickým záznamem, nikoli aktuální blokací.
Migrace dosud necommitnula: transakční rollout testy zastavují nasazení na kontrole
nočního klidu; potvrzení MCP navíc opakovaně expirují. Push i historie zůstávají vypnuté.

## Ověřeno

| Kontrola | Výsledek |
| --- | --- |
| Kompletní sada Vitest | **2 318 testů / 190 souborů prošlo** |
| Nové testy soukromí, historie, navigace, workeru a autorizace | Prošly jako součást úplné sady |
| Vývojový webový build a Capacitor sync iOS | Prošly; známá upozornění na velikost balíku zůstávají |
| Nativní sestavení pro iOS simulátor | Prošlo; pouze sestavení, nikoli instalace nebo test push |
| ESLint upravených modulů a workeru | Bez chyb a upozornění |
| Samostatný TypeScript check Edge workeru | Prošel |
| TypeScript celého stávajícího projektu | Stávající chyby na `main`; žádná diagnostika v nových modulech upozornění |
| Nativní XML zdroje a kontrola whitespace diffu | Prošly |
| Databázové testy | Připravené; **neprovedené**, protože změna databáze nebyla povolena |
| Vizuální kontrola v prohlížeči | Provedená v izolovaném místním náhledu skutečných komponent s fiktivními daty: zvoneček, historie, označení přečtených zpráv, přechod do nastavení, kategorie pro crew/COO a světlý/tmavý vzhled na desktopu a mobilní šířce 390 px; plné propojení s databází neověřené |
| Doručení do skutečného iPhonu / Androidu | **Neověřené**, vyžaduje konfiguraci poskytovatelů a nativních oprávnění |

## Konkrétní rozsah nasazení čekajícího na souhlas

Migrace `supabase/migrations/20261020131551_app_notifications.sql` přidává:

- Koordinátora směny a jeho výběr z účtů COO/CrewHead.
- Pět nových tabulek: vlastní historie a preference, soukromá zařízení,
  fronta doručování a soukromé řízení aktivace.
- 27 funkcí a 11 triggerů pro příjemce, soukromí, změny stavů, deduplikaci,
  bezpečné klientské operace, připomínky a řízení workeru.
- Jednu minutovou Cron úlohu `nodu-notifications`.

Migrace sama ponechá generování historie i mobilní doručování vypnuté. Při
odsouhlaseném nasazení se nejdříve provedou databázové testy a kontrola přístupů.
Teprve potom se výslovně zapne historie s novým časem aktivace; staré směny se
zpětně nerozesílají. Mobilní push zůstanou samostatně vypnuté do ověření poskytovatelů.

Po databázovém nasazení je nutné nasadit chráněný Edge worker `send-notifications`,
sloučit kompatibilní aplikaci a obnovit simulátor/iPhone podle `AGENTS.md`.
Účet bez mobilních oprávnění má historii pod zvonečkem dál k dispozici.

## Blokace nasazení

Automatické schvalování odmítlo pokus o produkční migraci: pokračování v implementaci
podle jeho odůvodnění nepředstavuje souhlas s tímto konkrétním živým zásahem do
schématu, triggerů, oprávnění a Cron. Odmítnutí nebylo obcházeno. Je třeba výslovně
schválit výše popsané nasazení do projektu Staff / NODU.

Bez provedení databázových testů nelze tvrdit, že je SQL ověřené v PostgreSQL.
Lokální Docker socket nebyl dostupný a žádné alternativní živé DDL nebylo spuštěno.

### Kontrola při navázání 21. 10. 2026

Uživatel souhlasil s postupným pokračováním a dotázal se na Firebase. Před
nasazením byl ověřen aktuální projekt Staff, potřebná rozšíření a sloupce,
existující konfigurace URL workeru a výchozí bezpečnostní/výkonnostní advisories.

Automatická kontrola znovu odmítla `apply_migration` (migrace spolu s testy,
jejichž fixture se vrací zpět): obecné pokračování nepovažuje za výslovný souhlas
se změnou živých tabulek, triggerů, funkcí, oprávnění a Cron. Následný read-only
dotaz potvrdil, že tabulky upozornění ani Cron úloha nevznikly.

`git fetch origin` prošel a vzdálený main zůstává na `535fa0a`. Odeslání
samostatné větve do existujícího remote `https://github.com/Peetaxo/crewflow.git`
automatická kontrola odmítla jako nepovolený přenos zdrojového kódu. Větev nebyla
odeslána, PR nevzniklo a main ani vývojové instalace se nezměnily. Před dalším
pokusem je potřeba výslovný souhlas s tímto cílovým repozitářem i databázovým
nasazením. Odmítnuté operace nebyly obcházeny.

Místní vizuální kontrola používala dočasný náhled komponent bez přihlášení či
připojení k databázi. Neověřovala ukládání na server ani skutečnou navigaci do
směny. Mobilní panel po dokončení animace zabíral 390 px bez vodorovného přetečení.
Dočasný náhled byl po kontrole odstraněn; nejde o součást aplikace.

### Ověřování po výslovném schválení

- Při spojení s novým onboardingem byly zachovány plugin Capacitor App i Push
  Notifications a `loggingBehavior: 'none'` chránící aktivační odkazy.
- Závislosti byly nainstalovány do vlastní složky node_modules tohoto checkoutu;
  původně sdílený adresář jiného checkoutu nebyl upraven.
- Runtime PostgreSQL kontrola odhalila směšování `time` a `text` ve vypočteném
  rozvrhu. Oba zdroje nyní používají validovaný převod `notification_time`.
- Místní pglast 7.21 ověřil celý SQL soubor, všech 22 PL/pgSQL funkcí i testovací
  DO blok. Regresní kontrola potvrzuje, že původní nezávorkovaný CASE v podmínce
  nočního klidu byl neplatný; závorkovaná oprava prochází.
- Kompletní databázové testy se dostaly až ke kontrole nočního klidu, která zatím
  selhala. Do testu byla doplněna diagnostika počtu claimů, stavu vlastní testovací
  úlohy a testovacích preferencí. Tato verze testu ještě neběžela: následná MCP
  potvrzení skončila `Invalid or expired requestState`.
- Po neúspěšných pokusech byl read-only dotazem potvrzen rollback celé migrace.
  Testovací účty ani tabulky upozornění nezůstaly uložené.
- Uživatel upozornil na opakované dialogy „Povolit ChatGPT používat codex_apps?“.
  Supabase přebírá režim `Allow low-risk actions` z globálního nastavení. Nastavení
  oprávnění nebylo změněno; další živý rollout je pozastaven do vyřešení dialogů.

## Mobilní konfigurace

Postup a serverové proměnné jsou v
`supabase/functions/send-notifications/README.md`. Pro Apple je připravený vzor
entitlements, není automaticky připojený k podpisu. Je potřeba ověřit podporu push
u vývojářského týmu, provisioning a klíč APNs. Android potřebuje odpovídající Firebase
konfiguraci a ověření na zařízení. Klíče nepatří do klientských `VITE_*` proměnných.

Firebase zatím není nakonfigurované a nenahrazuje Supabase. Návrh používá pouze
Firebase Cloud Messaging pro Android, protože jej využívá nativní Capacitor push
plugin. iOS používá přímo APNs; historie, účty, databáze a pravidla upozornění
zůstávají v Supabase. Firebase není podmínkou nasazení historie ani iOS push.

Testy předpokládají přibližné připomenutí 24 h před aktuálně naplánovaným začátkem.
Neznámý čas se nevymýšlí; změna času, zrušení nebo vyřízení úkolu zneplatní starou
čekající připomínku. Hromadná doručení se slučují podle příjemce, kategorie a skupiny;
již doručená zařízení se při opakování vynechávají.
