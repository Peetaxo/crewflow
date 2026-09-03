# Historie v mobilním filtru „Moje akce“

## Schválený záměr

V mobilním Nodu má filtr **Moje akce** zahrnovat také minulost. Nahoře budou probíhající a budoucí akce, pod nimi proběhlé. Uživatel tento návrh odsouhlasil v konverzaci a požádal o úpravu aplikace.

## Chování

- Změna platí jen pro mobilní seznam akcí v roli crew při zapnutém filtru „Moje akce“.
- Zachová se dnešní význam „moje“: aktuální uživatel je přiřazený do crew dané akce. Samotná čekající přihláška nestačí. Nově se nezavádí ověřování skutečné účasti podle výkazů.
- Seznam zobrazí všechny dostupné přiřazené akce bez spodní hranice data. Textové vyhledávání nadále funguje.
- Skupina **Aktuální a nadcházející** obsahuje akce, které končí dnes nebo později. Probíhající akce budou první, budoucí budou následovat od nejbližšího začátku. Vícedenní akce zůstane jedinou kartou.
- Skupina **Proběhlé** obsahuje akce, které skončily před dneškem, seřazené od nejnovějšího konce zpět. Rozdělení se řídí místním kalendářním datem, stejně jako stávající seznam.
- Prázdná skupina se nevykreslí. Pokud nejsou žádné moje akce, zobrazí se „Zatím tu nemáš žádné přiřazené akce.“ bez zavádějící zmínky o zvoleném datu.
- V tomto filtru se skryje výběr počátečního data, protože zobrazuje celou historii. Po přepnutí na jiný filtr se výběr data vrátí a zachová jeho předchozí hodnotu.
- Ostatní mobilní filtry, role crewhead/coo a desktopový seznam i kalendář zůstanou beze změny.
- Otevírání detailu akce a stávající oprávnění i akce na kartách zůstanou zachované.

## Technické hranice

Současné `src/views/EventsView.tsx` vyřazuje historii jak ve filtru seznamu, tak při seskupování výskytů podle data. V režimu „Moje akce“ je nutné upravit obě místa a oddělit řazení aktuálních a minulých akcí. Znovu se použijí stávající karty, vzhled a načtená data. Není součástí změny upravovat databázi, oprávnění, přiřazení lidí ani výkazy.

## Ověření

Testy v `src/views/EventsView.test.tsx` nejprve prokážou současné vynechání přiřazené historické akce. Následně ověří její zobrazení, oddělení a pořadí skupin, dnešní hranici, vícedenní akce, vyloučení cizích a pouze čekajících akcí, vyhledávání, prázdný stav a obnovení datového filtru po opuštění „Moje akce“. Stávající testy ochrání ostatní role a zobrazení.

Před dokončením proběhnou relevantní testy a sestavení. Podle projektového `AGENTS.md` dokončení zahrnuje začlenění do synchronizovaného `main` a `npm run ios:refresh:devices` z čisté pracovní kopie s existující lokální konfigurací. Výsledky simulátoru a fyzického iPhonu budou uvedeny zvlášť. Nejde o produkční nasazení.
