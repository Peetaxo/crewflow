# Mobilní formulář akce — příprava realizace

Tento dokument zaznamenává ověřené vstupy; není dokončeným implementačním plánem a neznamená nasazení změn.

## Výchozí stav

- Větev: `codex/mobile-event-form`, založená z `55e46b6`.
- Pracovní kopie: `/Users/peetax/Projekty/crewflow/.worktrees/mobile-event-form`.
- Instalace závislostí: `npm ci --offline`, úspěšná, beze změny zámku závislostí.
- Výchozí ověření: `npm test -- --reporter=dot`, 95 souborů / 911 testů prošlo, exit 0.
- Soubory `src/views/TimelogsView.tsx` a `src/views/TimelogsView.test.tsx` v původní pracovní kopii obsahují cizí rozpracované změny. Zůstaly nedotčené.
- Náhled stále běží odděleně na `http://127.0.0.1:60245/`. Produkční aplikace, data ani vývojové instalace se při této přípravě nezměnily.

## Ověřené databázové návaznosti

Read-only kontrola schématu a definic funkcí propojeného projektu dne 2026-09-04:

1. `events` má termín, `phase_schedules`, `phase_times`, `day_types` a `contact_profile_id`. Nemá samostatný uložený nový model oddělující hranice akce od denních předvoleb ani vazbu na cíleného schvalovatele.
2. `timelog_days.time_from` a `time_to` jsou nullable textové sloupce, ale to nestačí k podpoře prázdných konceptů.
3. `public.assign_event_crew` vyžaduje v nově vytvářeném výkazu neprázdné oba časy každého dne a převádí je na `time` pro ověření.
4. `public.save_timelog_atomic` obdobně odmítá prázdné časy i pro koncept. Při řazení vkládaných dnů navíc převádí uložené řetězce na `time`; nová podpora prázdných konceptů musí řešit i toto místo.
5. `timelog_approvals` ani `timelog_approval_rounds` ve schématu `public` nebyly nalezeny. Výběr schvalovatele proto nelze pokládat za hotovou funkcionalitu jen na základě existujících TypeScript typů.

Žádná databázová mutace ani migrace nebyla provedena. Před implementací databázové části je nutné ověřit související stavové přechody a zachovat serverový zákaz odeslání neúplných výkazů; nepřesouvat tuto ochranu jen do UI.

## Rozsah potvrzený uživatelem

- Celoobrazovkový mobilní formulář, povinný kontakt, viditelný nepovinný popis a místo srazu, odstranění dresscodu z editoru.
- Začátek a konec celé akce oddělené od plánů směn a skutečných hodin.
- Volitelný rozpis fází podle dnů s nepovinnými časy a výjimečně více fázemi za den.
- Zachovat název „Rozdělit akci na fáze“.
- Žádné nové samostatné přihlášení crew na fáze; to řeší produkce po domluvě. Stávající přihlášení na celou akci se nemění.

## Rozhodnutí uživatele

Uživatel výslovně požaduje zobrazit „Schvaluje také hodiny“ a zajistit funkční schvalování v této dodávce. Odložení schvalování není součástí rozsahu. Realizace zahrnuje uloženého výchozího schvalovatele akce, předání po kontrole CH, serverové oprávnění pouze pověřené osoby a bezpečné stavové přechody. Další schvalovatelé se podle posledního upřesnění odkládají. Výběr kontaktu nesmí udělovat roli.

Implementace bude rozdělena na ověřitelné technické části (termín a koncepty, cílené schvalování, formulář), ale teprve propojení všech částí splní požadavek. Následující implementace musí respektovat ověření a aktualizaci iOS vývojových instalací podle `AGENTS.md`.

## Další ověřené návaznosti schvalování

**Aktualizace podle následné odpovědi uživatele:** Fakturace má být zatím oddělená od schvalování hodin. Přepínač rolí se nyní nemění, slouží uživateli k testování. Zavedení skutečných dalších schvalovatelských účtů bude řešeno později; není to blokace implementace a izolovaných testů. Níže uvedené otázky popisují předchozí audit a jsou tímto rozhodnutím vyřešené. Funkční přepínač „Schvaluje také hodiny“ zůstává v rozsahu. Není autorizováno zakládání uživatelů ani změna jejich rolí.

- `handle_timelog_approved()` v dosavadním nasazení při `pending_coo → approved` vytváří koncept faktury, položky a vazby výkazů/účtenek, mění účtenky na `attached` a výsledný výkaz na `invoiced`. Uživatel rozhodl finanční efekt oddělit; implementace odstraní tento automatický trigger a ponechá explicitní fakturaci.
- V propojeném projektu nejsou přihlásitelní COO; jediný profil s uživatelským účtem má CH. Zavedení dalších účtů je odloženo a není překážkou implementace ani testů se syntetickými účty. Implementace nebude sama vytvářet live účty ani udělovat role kontaktům.
- `set_current_user_role()` skutečně přepisuje serverové role volajícího na libovolný požadovaný typ. Uživatel výslovně ponechává přepínač pro vývojové testování. V této dodávce se funkce ani role stávajících účtů nemění; ostré zabezpečení přepínače zůstává samostatnou budoucí prací.
- Guard cíleného schvalování musí pokrýt přímé REST zápisy i `transition_timelog_statuses_atomic`, `save_timelog_atomic` a import `import_approved_timelog_atomic`; import dnes připouští i `pending_coo` a jeho marker se vyhodnocuje před běžnými rolemi.
- UI vstupy jsou v `ApprovalsView`, `TimelogsView` a `EventDetailView`; hydratace v `loadTimelogsSnapshot` a `getSupabaseAppData`. Nestačí napojit jedinou obrazovku. Aktuální subscription je lokální, nikoli Realtime.

## Izolované databázové ověření

- Spuštěna lokální Colima a testovací kontejner `crewflow-event-form-db`, Postgres `public.ecr.aws/supabase/postgres:17.6.1.104`, port pouze `127.0.0.1:55439`.
- Schéma bez dat exportováno CLI z propojeného projektu do `/private/tmp/crewflow-schema-before-20260904.sql` a úspěšně načteno do kontejneru.
- Ověřeno: lokální `events` i `profiles` obsahují 0 řádků. Žádná skutečná uživatelská data nebyla kopírována; nebyly provedeny aplikační migrace ani zápisy do live dat.
- Aktuální Supabase changelog načten; dokumentace RLS a práv ověřena přes dokumentační konektor. Lokální testy budou používat samostatné syntetické účty a transakce s rollbackem, ne měnit live uživatele.

## Dokončený technický základ, nikoli hotová dodávka

Commit `f4480841b96b168ea7b5fcef5a91312427401640` na větvi implementuje samostatná pravidla verze 2 pro předvolby směn, volné dny, více fází a zachování skutečných hodin. Navazující `290a023dce7def54219f8efe659f171cfdf0f5f7` řeší výčet dnů při přechodu na letní/zimní čas ve verzi 2, bez změny původní funkce pro starý model. Nová verze zatím není aktivována ve formuláři ani ukládána do databáze.

Nezávisle spuštěné ověření hlavním agentem:

- Cílené testy: 3 soubory / 56 testů, exit 0.
- Celý suite: 96 souborů / 952 testů, exit 0.
- `npm run build`: exit 0; existující varování o velkých bundlech, neúčinných dynamických importech a starém Browserslist datasetu.
- Spec review a následná samostatná kontrola kvality: vyhovuje omezenému doménovému Task 1, včetně opravy DST. Nejde o schválení dosud neimplementovaného formuláře ani schvalování.

Původní pauza na rozhodnutí o finančním efektu a přepínači rolí byla vyřešena následným upřesněním uživatele výše. Plány persistence, cíleného schvalování a formuláře jsou uložené. Formulář, serverové schvalování ani iOS instalace nejsou dokončené. Nebyla provedena migrace live schématu, push ani device refresh.

## Navazující databázový základ

Commit `a1e200c` přidává verzi rozpisu a podporu prázdných konceptů v atomických RPC, odložené kontroly úplnosti a zámek proti souběžné úpravě předaných hodin. Oprava `180f1fd` sjednocuje chybový token všech neúplných odesílaných výkazů; `7773fa9` přidává index pro opakované kontroly dnů. Spec review i nezávislé quality review vyhovují. Hlavní agent ověřil celý suite 97 souborů / 956 testů a build před přidáním indexu; poslední úzký indexový test ověřil implementer i reviewer (5/5). Hlavní agent také spustil úspěšně celý rollback SQL test na původním i čistě obnoveném schématu. Nová migrace stále není nasazená do propojeného projektu.

Testovací `crewflow-event-form-db` nyní běží s poslední verzí migrace a bez fixture dat. `crewflow-event-form-replay` je zastaven a zachovává syntetická data souběhového testu; neslouží k opakování stejného rollback fixture. Čisté opakování opravené migrace je v zastaveném `crewflow-event-form-replay-contract` (před posledním indexovým dodatkem), kde hlavní agent po testu ověřil 0 events/profiles/auth.users. Read-only kontrola propojeného projektu potvrdila, že před migrací neexistuje schéma `private`. Bezpečnostní advisors baseline: 1 informační chybějící policy na interní sekvenci, 3 mutable search_path, 9 anon a 19 authenticated definer upozornění a vypnutá ochrana uniklých hesel. Jde o existující nálezy, nikoli výsledek dosud nenasazených migrací; při rollout se kontroluje změna tohoto seznamu.

## Obnovení a čerstvé ověření 2026-09-23

- Práce pokračuje po vypnutí počítače. Změny zůstaly zachované v oddělené pracovní kopii; původní změny `TimelogsView`, jeho testu a `Info.plist` v hlavní kopii jsou nedotčené.
- Základ formulářového stavu je dokončen a nezávisle schválen po spec i quality review (do `614a500`). Zaměřené testy helperu a event service: 150/150. Chyby plánovaných časů identifikují datum, český název fáze i konkrétní řádek.
- Cílené schvalování v databázi, aplikační službě a ovládání výkazů již prošlo samostatnými implementacemi a oběma review. Samotný nový formulář se nyní implementuje; dodávka ještě není hotová.
- Z propojeného vývojového projektu `gkxbluqkugprwcpdephk` byl pořízen nový **schema-only** export bez řádkových dat: `/Users/peetax/Projekty/crewflow-local-backups/mobile-event-form/schema-before-20260923.sql`.
- V novém izolovaném kontejneru `crewflow-event-form-replay-20260923` (stejný Postgres 17.6.1.104, bez zveřejněného portu) proběhlo načtení tohoto schématu, migrace rozpisu, její rollback test, migrace cíleného schvalování, její rollback test a opakování testu rozpisu se všemi novými ochranami. Vše s `ON_ERROR_STOP=1`, bez chyb. Žádný test nepoužil live databázi.
- Souběhový test předání hodin a mazání akce prošel i nad touto čerstvou databází: mazání skutečně čekalo na zámek výkazu, předání nečekalo na zámek akce a mazání skončilo řízeným `event_has_protected_timelogs` bez částečného odstranění. Přesměrování testu měnilo pouze název lokálního kontejneru za běhu, nikoli uložený test. Vlastní syntetické fixture byly odstraněny.
- Kontrola katalogu potvrdila RLS na `timelog_approvals`, pouze SELECT pro authenticated, žádný přístup anon; veřejné RPC jsou invoker, interní definery mají prázdný search_path a anon bez EXECUTE. Triggerová ochrana není přímo spustitelná ani authenticated. Po testech 0 events/profiles/auth.users/timelogs/approvals.
- Read-only advisors baseline vývojového projektu je beze změny oproti dřívějšímu seznamu. Nové migrace zatím stále nejsou aplikované na propojený projekt.
- Skutečná kontrola TypeScriptu musí používat `npx tsc -p tsconfig.app.json --noEmit`, nikoli kořenový config bez souborů. Projekt má existující diagnostiky (193 v aktuální hlavní pracovní kopii, 121 ve feature před novým UI; prostředí závislostí se liší). Tvrzení o zeleném kořenovém `tsc --noEmit` není důkazem kontroly aplikace. Nově zavedené diagnostiky je nutné oddělit a opravit; globální oprava nesouvisejících typů není součástí tohoto úkolu.

## Skutečný formulář a vizuální ověření 2026-09-23

- Implementace formuláře je v `136c77d`: celoobrazovkový mobilní dialog, samostatné hranice termínu, denní plán fází, povinná identita kontaktu (telefon je editovatelný, nikoli nově povinný), výběr zamýšleného schvalovatele a viditelné nepovinné údaje. Dresscode se neupravuje ani nemaže.
- Implementer ověřil 115 testových souborů / 1277 testů, build, scoped lint a diff check. Skutečný app typecheck má 118 stávajících diagnostik; tři nově odhalené chyby testovacího approval fixture byly odstraněny. Žádná nová diagnostika v modalu, planneru, mapě ani contact loaderu.
- Hlavní agent ověřil skutečnou aplikaci v odděleném local-only náhledu na portu 8086 se syntetickou akcí. Šířky 320/360/390/414 px nepřetékají; fullscreen má vlastní scroll a pevné záhlaví/zápatí, vstupy 16 px a bez automatického otevření klávesnice. Desktop 1100 px má centrovaný dialog 700 px. Tmavý i světlý motiv ověřeny; testovací motiv vrácen do světlého.
- Uložení a opětovné otevření třídenní akce zachovalo Instalaci / Provoz / Deinstalaci a noční 22:00–02:00. Ověřena cache při přepínání Více dní, fází a volného dne, ruční kontakt s telefonem, viditelný popis/místo srazu a povinná identita kontaktu. Zkrácení rozpisu vyvolalo potvrzení; zrušení zachovalo draft.
- Mapa se zobrazila nad formulářem se skutečnými dlaždicemi; vlastní Escape zavřel jen mapu. Výběr polohy zobrazil preview. Neuložené změny vyžádaly potvrzení a „Pokračovat v úpravách“ zachovalo rozepsané údaje.
- Nezávislé spec review následně našlo chybějící trim potvrzení při vypnutých fázích a chybějící návrat focusu z řízených dialogů. Opravy probíhají; tento záznam není konečné schválení UI ani dodávky.
- Databázový dry-run potvrdil přesně dvě očekávané čekající migrace (20260904121148 a 20260914135908), bez dalších změn. Zatím nebyly aplikovány. Oba nově použité testovací Postgres kontejnery byly po ověření zastaveny.
- Spárovaný iPhone je přes Wi-Fi dostupný, ale zamčený; diagnostika DDI proto selhala na zámku zařízení. Uživatel byl požádán o odemčení pro závěrečnou instalaci. Simulátor dosud neaktualizován.
- Oba nálezy UI opravil `c9cbced` a opakované nezávislé spec review vyhovuje (41 cílených testů). Návrat focusu z mapy i hlavního formuláře ověřil hlavní agent také ve skutečném prohlížeči. Dvě nově odhalené anotace časovačů mají explicitní browser typ; zůstává 116 existujících TS diagnostik (čistý main se stejnými závislostmi: 192).
- Hlavní agent znovu spustil celý suite po opravách: 115 souborů / 1284 testů, exit 0, a build, exit 0. Konečné quality/integration review nyní probíhá. Čistá kopie pro instalaci připravena v `/Users/peetax/Projekty/crewflow-device-refresh-4S3gC4`, dosud na původním main; ignorovaná `.env.local` zachována bez zveřejnění.

## Aplikované databázové změny 2026-09-23

- Po úspěšném fresh-schema replay a ověření přesného seznamu čekajících migrací byly CLI aplikovány `20260904121148_event_schedule_version_and_blank_drafts` a `20260914135908_targeted_event_approval` do propojeného vývojového projektu Staff. CLI skončilo exit 0, vzdálená historie obsahuje stejné verze jako repozitář. Žádné seed/role importy ani testovací live řádky.
- Následné read-only ověření: všech 174 historických akcí zůstává ve verzi 1; `timelog_approvals` má 0 řádků; profily zůstávají 41 / připojený účet 1 / připojené COO 0. Nové sloupce a defaulty odpovídají migracím. Automatický fakturační trigger je odstraněn podle rozhodnutí uživatele; explicitní fakturace zůstává.
- RPC a jejich interní protějšky mají očekávaný invoker/definer režim, prázdný search_path a žádné anon EXECUTE; triggerová funkce nemá ani authenticated EXECUTE. RLS aktivní; approval tabulka dostupná authenticated pouze přes SELECT, ne přímý UPDATE.
- Bezpečnostní advisors nemají žádný nový ani odstraněný nález proti dnešnímu baseline. Performance: neindexované FK 14 → 13, auth initplan 24 a permissive policies 66 beze změny. Přibylo pouze 9 informačních [dosud nepoužitých nových indexů](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index), očekávaných před prvním reálným provozem nových schvalovacích funkcí; indexy jsou záměrné pro FK a vyhledávání a nebyly odstraněny.
- Závěrečné quality review UI/cross-layer našlo dvě úzké návaznosti: explicitně vymazaný telefon nesmí obnovit profilový telefon (opraveno v `a190468`, 42 detail testů), a karta nejbližší směny musí ve v2 používat přiřazený den/čas místo začátku celé akce (oprava probíhá). Nejde o otevřený nález v již nasazených databázových migracích.
