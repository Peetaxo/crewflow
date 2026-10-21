# NODU: upozornění — stav připravený k revizi, 21. 10. 2026

Změny jsou v samostatné větvi `codex/notifications-20261020`. Nejsou sloučené do
`main`, nejsou nasazené do databáze a vývojové instalace nebyly obnovené.

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
| Vizuální kontrola v prohlížeči | Neprovedená: lokální browser runtime a otevření lokálního HTML nebyly prostředím povoleny |
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

## Mobilní konfigurace

Postup a serverové proměnné jsou v
`supabase/functions/send-notifications/README.md`. Pro Apple je připravený vzor
entitlements, není automaticky připojený k podpisu. Je potřeba ověřit podporu push
u vývojářského týmu, provisioning a klíč APNs. Android potřebuje odpovídající Firebase
konfiguraci a ověření na zařízení. Klíče nepatří do klientských `VITE_*` proměnných.

Testy předpokládají přibližné připomenutí 24 h před aktuálně naplánovaným začátkem.
Neznámý čas se nevymýšlí; změna času, zrušení nebo vyřízení úkolu zneplatní starou
čekající připomínku. Hromadná doručení se slučují podle příjemce, kategorie a skupiny;
již doručená zařízení se při opakování vynechávají.
