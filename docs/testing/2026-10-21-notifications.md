# NODU: upozornění — ověření a nasazení, 21. 10. 2026

Aktuální větev: `codex/notifications-rollout-20261021`. Uživatel výslovně schválil
nasazení do Staff/NODU a odeslání do `Peetaxo/crewflow`; potvrzení MCP řeší ručně.
Oprávnění pluginu nebyla změněna. Databáze i chráněný Edge worker jsou nasazené.
Integrace do main a obnova vývojových instalací jsou následující krok.

## Ověření

| Kontrola | Výsledek |
| --- | --- |
| Kompletní sada Vitest po spojení s onboardingem | **2 419 testů / 196 souborů prošlo** |
| Vývojový webový build a Capacitor sync iOS | Prošly; známá upozornění na velikost balíku a dynamické importy zůstávají |
| Nativní sestavení pro iOS simulátor po spojení pluginů | Prošlo přes XcodeBuildMCP bez chyb a upozornění |
| SQL a PL/pgSQL syntaxe | Prošel celý soubor, 22 PL/pgSQL funkcí a testovací DO blok přes pglast 7.21 |
| Databázové scénáře | **37 kontrol prošlo**, při migraci i při samostatném opakování |
| Izolace účtů a přístupy | Anonym nemůže číst historii; klient nemůže vkládat zprávy, číst zařízení, autorizovat worker ani přebírat frontu |
| Bezpečnost odesílacího endpointu | GET bez klíče 405; POST bez klíče 401; POST s neplatným klíčem 401 |
| Zkušební data po testech | **0 účtů, 0 zpráv, 0 zařízení, 0 úloh** |
| Vizuální kontrola | Skutečné komponenty ve fiktivním místním náhledu: desktop, mobilní šířka 390 px, světlý/tmavý vzhled, historie, přečtené zprávy, nastavení a role crew/COO; nešlo o test propojení se serverem |
| Mobilní doručení | Zatím neověřené; Apple a Firebase nejsou nakonfigurované, push zůstává vypnuté |

TypeScript celého původního projektu obsahuje existující chyby; předchozí kontrola
nezjistila diagnostiku v nových modulech upozornění. ESLint modulů a samostatný
TypeScript Edge workeru prošly před spojením s onboardingem.

## Nasazená databázová část

Projekt Staff: `gkxbluqkugprwcpdephk`. Zaznamenaná verze migrace:
`20261021120809_app_notifications.sql`. Lokální existující migrační soubor byl
přejmenován podle verze skutečně zapsané MCP, aby budoucí CLI nepovažovalo stejnou
změnu za chybějící migraci.

Migrace přidává koordinátora směny, historii a preference, soukromá zařízení,
frontu doručování, řízení aktivace, funkce a triggery událostí a připomínek.
Cron `nodu-notifications` běží jednou za minutu; s vypnutou historií i push
negeneruje zprávy ani nevolá doručovacího poskytovatele.

Po migraci jsou `history_enabled=false` a `push_enabled=false`. Historie bude
zapnuta s čerstvým časem aktivace až po integraci kompatibilní aplikace. Staré
směny se zpětně nerozesílají. Zapnutí push je samostatný pozdější krok po ověření
skutečných zařízení.

## Opravy a význam testů

Rozvrh převádí časy z textových řádků i typovaných návrhů přes validovaný
`notification_time`. Podmínka nočního klidu obsahuje závorkovaný CASE; místní
regresní kontrola odmítá původní neplatnou syntaxi.

Test nočního klidu nyní nejdříve dokončí `claim_notification_push` a teprve pak
kontroluje stav úlohy. Původní jediný výraz OR četl stav pomocí poddotazu před
provedením funkce s vedlejším účinkem a mohl hlásit neúspěch i při správném
odložení. Test běží v úmyslně vrácené subtransakci; neprovádí volání poskytovatelů.

Při spojení s mobilním onboardingem jsou zachovány pluginy Capacitor App i Push
Notifications a `loggingBehavior: 'none'` chránící aktivační odkazy. Závislosti
checkoutu jsou samostatné; původně sdílený node_modules jiného checkoutu nebyl měněn.

## Přezkoumané advisories

Nová INFO upozornění na RLS bez politik se týkají tří soukromých tabulek:
klientské role mají odebraná práva a přístup je úmyslně jen přes úzce řízené RPC.
Sedm nových upozornění na SECURITY DEFINER odpovídá záměrným klientským API:
každé ověřuje přihlášení a vlastní identitu, výběr kontaktů navíc vyžaduje COO/CH.
Anonymní ani worker API nebyla klientům zpřístupněna. Výkonnostní kontrola nepřidala
nové WARN nálezy; nové nepoužité indexy jsou očekávané před prvním provozem.

Odkazy na pravidla:
- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index

## Mobilní doručování

Edge Function `send-notifications`, verze 1, je aktivní. Ověřuje vlastní soukromý
serverový klíč ještě před převzetím práce z fronty. Klientské role klíč ani tokeny
zařízení nevidí. Neplatné či chybějící ověření bylo otestované přes skutečné HTTP.

Firebase zatím není nakonfigurované. Návrh používá jen Firebase Cloud Messaging
pro Android; iOS používá přímo Apple APNs. Účty, data, historie a pravidla zůstávají
v Supabase. Firebase není podmínkou spuštění historie ani iOS push.

Pro skutečné mobilní doručení zbývá Apple capability a provisioning, APNs klíče,
Firebase konfigurace Androidu a serverový účet FCM, následně ověření na skutečném
iPhonu a Androidu. Přesný postup je v
`supabase/functions/send-notifications/README.md`. Klíče nepatří do `VITE_*`.
