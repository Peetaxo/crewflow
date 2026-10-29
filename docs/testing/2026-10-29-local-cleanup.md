# Místní technický úklid nodu — 29. 10. 2026

**Průběžný záznam: ověření čistého main a zařízení ještě probíhá.** Doména, veřejný hosting, skutečné rozesílání a veřejné spuštění zůstávají na přání uživatele odložené. Tento záznam neuzavírá první verzi ani celý bezpečnostní audit.

## Zdroj a rozsah

Výchozí čerstvě načtený `origin/main`: `ec88626`. Implementace v `e83b5fb`, `fde7eda`, `5090657`, `34d5976` a `474ac34`. Podrobný [plán úklidu](../superpowers/plans/2026-10-29-local-cleanup.md).

- Doplněný ručně vedený Supabase kontrakt všech 36 existujících tabulek: Insert/Update/Relationships a Views podle migrací a skutečně instalovaného SDK. Stávající Row a RPC deklarace zachované. Povinné hodnoty bez defaultu jsou povinné i při insertu, včetně `profile_activity.last_active_at`.
- Opravené zbývající callery a testovací fixtures: numerické kompatibilní ID se neslévá s UUID, DTO odpovídají JSON hranici, tabulky/RPC jsou typované. Přidány `npm run typecheck` a společné `npm run check` s nejvýše dvěma Vitest workery. Kontroly a compiler nastavení nebyly oslabeny; bez nového `any` nebo potlačení diagnostik.
- Skutečný běžný Supabase singleton má `detectSessionInUrl: false`. Cizí implicitní URL callback už při inicializaci nepřepisuje existující účet. Explicitní aktivace, oddělená obnova a běžné přihlášení dál procházejí.
- Nová migrace chrání profilové `id`, `user_id` a sazbu. Běžný klient nemůže měnit identitu ani vlastní sazbu; CH/COO mohou spravovat sazby, důvěryhodná serverová aktivace zachovává profil a historii. Osobní/kontaktní údaje zůstávají upravitelné.
- Opraveny konkrétní české popisky v AssignCrewModal, bez změny layoutu; `TODO.md` odpovídá současným důkazům.

## Automatické ověření před integrací

Node 24.15.0, npm 11.12.1, TypeScript 5.8.3, Supabase SDK 2.103.0; stejné závislosti bez upgradu.

| Kontrola | Nově zjištěný výsledek |
| --- | --- |
| Výchozí app typecheck | exit 2, **108 diagnostik**; [úplný výpis](2026-10-29-cleanup-baseline-types.txt) |
| Finální `npm run typecheck` | exit 0, **0 diagnostik**, včetně testů |
| `npm run lint` | exit 0 |
| Plný Vitest `--maxWorkers=2` | **219 souborů, 2 878 testů prošlo**, standardní timeout 5 s |
| `npm run build` mimo sandbox | exit 0, **1,53 s**; známá upozornění na chunky/dynamické importy nejsou chyba buildu |
| `git diff --check` | exit 0 |

První úplný test odhalil jediný zastaralý očekávaný text `Prirazen`; očekávání bylo opraveno na `Přiřazen` a nový úplný běh prošel. Druhý společný příkaz prošel typecheck/lint/testy, ale Vite se uvnitř sandboxu zastavil ještě před bannerem; po ověření nečinného procesu byl ukončen (exit 143). **Tento společný běh se nevydává za úspěšný.** Stejný build stejného kódu mimo sandbox prošel; následný společný příkaz patří do ověření čistého main níže.

Spec a následné nezávislé quality review databázového kontraktu a callerů skončily PASS. Profilová ochrana má rovněž nezávislé spec a následné quality PASS bez materiálních nálezů.

## Skutečné místní bezpečnostní regrese

Pouze dosavadní disposable pilot `.crewflow-onboarding-pilot-20261020`, API `http://127.0.0.1:55431`, Docker DB `supabase_db_crewflow-onboarding-pilot-20261020`. Bez lidských hesel a bez zápisu do živého projektu.

**Relace:** test importuje skutečný singleton s instalovaným SDK. Před opravou 3 případy `/activate`, `/reset-password`, `/login` nahradily ordinary session příchozí implicitní relací (RED). Po opravě se zachová účet, callback se zpracovává explicitně, heslové přihlášení dál ukládá relaci. Samostatné fixture originy izolují skutečné SDK storage kanály. Souvisejících 85 auth/activation/recovery testů prošlo také při nezávislém review.

**Profil:** finální SQL regrese spuštěná uvnitř transakce s dočasným odstraněním triggeru selhala očekávaně: běžnému crew prošla sazba 999, sazba NULL, změna ID a kombinovaný zápis telefonu+sazby. Vše se vrátilo rollbackem při ukončení spojení. Stejná původní regrese s ochranou prošla až po závěrečný `ROLLBACK` (exit 0). Ověřuje i podvržené JWT metadata, osobní údaje, cizí profil, skutečné CH/COO role, service attachment, reálné aktivační RPC/Auth trigger a zachování sazby i historie. Guard je SECURITY INVOKER s prázdným search_path a odebraným přímým EXECUTE pro klienty.

HTTP regrese použila nově vytvořené syntetické Auth účty a skutečné podepsané crew/CH/COO relace. Citlivé změny vrací HTTP 403/42501, cizí řádek RLS filtruje, povolené úpravy procházejí. Test po sobě odstranil jen vlastní fixtures a potvrdil úplnou shodu původních profilů, rolí, výkazů a dnů. Zákaz redirectu drží klíče na přesném místním originu; neplatný JSON nevypisuje tělo odpovědi. Snapshot selže při dosažení místního PostgREST limitu 1000, místo aby přijal zkrácené porovnání. Výchozí počty 197/75/17/3 jsou pod limitem.

Nově zopakovány také rollback SQL sady `self-role-escalation`, `crew-roster-access`, `crew-invitations-access`, `crew-onboarding-access`: všechny exit 0. Místní databázový advisor vrátil 0 chyb a 9 existujících WARN (3 search_path u budget funkcí, 6 permissive budget/warehouse politik); tento úkol nepotvrzuje jejich neškodnost ani nezavírá etapu 8.

**Ochrana profilových sloupců je aplikovaná pouze v místním pilotu. Migrace `20261029135122` zatím není v živém backendu.** Před vzdáleným pilotem musí projít samostatným přesným nasazovacím balíkem a opakovaným API ověřením. Běžné aktualizované iOS instalace nadále používají dosavadní živý backend, proto se samotná instalace nesmí vydávat za nasazení této ochrany.

Soukromé raw logy jsou mimo Git v `/private/tmp`: `nodu-profile-guard-red-20261029.log`, `nodu-profile-guard-green-20261029.log`, `nodu-profile-http-green-20261029.log`, `nodu-cleanup-session-red-20261029.log`, `nodu-cleanup-full-check-final-20261029.log` a `nodu-cleanup-build-unsandboxed-20261029.log`. Neobsahují hesla či tokeny; citlivé snapshoty se nevypisují.

## Zachovaná práce a poznámky

PR [#6](https://github.com/Peetaxo/crewflow/pull/6) byl uzavřen jako překonaný, bez merge jeho staré větve. Tree `6eb1cf6` a již začleněného `67d48bb` je shodný (`b1efbd048c2fb42a01754baebba11bf30fc092d9`); pozdější notifikační změny jsou již v main. To není důkaz APNs doručení.

Staré větve a dirty worktrees zůstávají zachované včetně ignorovaných konfigurací. Větve `backup/mobile-app-pre-integration-20260819` a `feature/free-event-map-workflow` mají 71 neprokázaně překonaných commitů, proto nebyly odstraněny. Původní tři rozpracované soubory z baseline nebyly přepsány; manažerský měsíční filtr/kompaktní přepínač výkazů je stále samostatná zachovaná práce, nikoli automaticky zastaralý patch.

Vizuální kontrola lokálního webu `VITE_APP_DATA_SOURCE=local`, port 8114, potvrdila popisek **Spolehlivý** v dialogu Obsadit crew. Syntetická akce `LOCAL-CLEANUP` existuje pouze v místním prohlížečovém režimu; neproběhl zápis do živých dat. Ostatní opravené větve popisků ověřují testy. Plošné mojibake v src/public nebylo nalezené; širší korektura zbývajících textů bez diakritiky patří do konkrétních dalších nálezů.

## Čistý main a zařízení

Čeká na dokončení integrační kontroly a refresh podle AGENTS. Výsledky simulátoru a fyzického iPhonu budou uvedeny samostatně.
