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

Uživatel výslovně požaduje zobrazit „Schvaluje také hodiny“ a zajistit funkční schvalování v této dodávce. Odložení schvalování není součástí rozsahu. Realizace zahrnuje uloženého výchozího schvalovatele akce, předání po kontrole CH, volitelné další konkrétní schvalovatele, serverové oprávnění pouze pověřených osob a bezpečné stavové přechody. Výběr kontaktu nesmí udělovat roli.

Implementace bude rozdělena na ověřitelné technické části (termín a koncepty, cílené schvalování, formulář), ale teprve propojení všech částí splní požadavek. Následující implementace musí respektovat ověření a aktualizaci iOS vývojových instalací podle `AGENTS.md`.

## Další ověřené návaznosti schvalování

- `handle_timelog_approved()` dnes při `pending_coo → approved` vytváří koncept faktury, položky a vazby výkazů/účtenek, mění účtenky na `attached` a výsledný výkaz na `invoiced`. Uživatel dostal otázku, zda tento finanční efekt zachovat po schválení všemi pověřenými osobami, nebo jej oddělit. Změna zatím není rozhodnutá.
- V propojeném projektu nejsou přihlásitelní COO; jediný profil s uživatelským účtem má CH. Uživatel dostal otázku, koho zapojit jako druhého schvalovatele. Implementace nebude sama vytvářet účty ani udělovat role kontaktům.
- `set_current_user_role()` skutečně přepisuje serverové role volajícího na libovolný požadovaný typ. Pro důvěryhodné oprávnění nelze tuto zkušební funkci zachovat jako cestu k eskalaci. Uživatel dostal otázku na změnu přepínače na výběr pouze již přidělených rolí; zvlášť upozorněn, že nynější účet má pouze CH. Bez rozhodnutí se nemění oprávnění stávajícího účtu.
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

Další implementace schvalování a integrace do main čeká na rozhodnutí o finančním efektu a oprávněních. Formulář, serverové schvalování ani iOS instalace nejsou dokončené. Nebyla provedena migrace live schématu, push ani device refresh. Testovací Postgres byl při pauze zastaven bez smazání jeho schématu; obnoví se `docker start crewflow-event-form-db`.
