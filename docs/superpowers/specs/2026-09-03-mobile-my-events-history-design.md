# Nápověda k výběru data v mobilním seznamu akcí

## Upravený záměr

Uživatel původní návrh na automatické zobrazování historie odvolal. Filtr „Moje akce“, řazení i výběr počátečního data zůstanou beze změny. Novým návrhem je pouze upravit pomocný text prázdného mobilního seznamu v roli crew, aby upozornil na možnost vybrat datum ikonou kalendáře.

## Znění schválené uživatelem 3. září 2026

Hlavní věta zůstane:

> Od zvoleného data tu zatím nejsou žádné akce.

Pomocný text místo „Nove moznosti se tu objevi automaticky.“:

> Chceš zobrazit i starší akce? Klepni na ikonu kalendáře vlevo nahoře a vyber datum, od kterého je chceš vidět.

## Technické hranice

Úprava pouze v prázdném stavu `src/views/EventsView.tsx` pro `isMobileCrewEventFeed`, u všech jeho filtrů včetně „Moje akce“. Ostatní role a desktopové zobrazení si zachovají stávající text. Nebudou se měnit žádné podmínky filtrování, přiřazení, řazení, datum, ovládací prvky, databáze ani oprávnění.

## Ověření

Regresní test v `src/views/EventsView.test.tsx` nejprve selže na chybějícím novém pomocném textu, poté ověří jeho zobrazení v prázdném mobilním seznamu crew. Stávající testy ochrání výběr data a ostatní role i zobrazení. Vizuálně se ověří zalomení delší nápovědy na mobilní šířce.

Před dokončením proběhnou relevantní testy a sestavení. Podle projektového `AGENTS.md` dokončení zahrnuje začlenění do synchronizovaného `main` a `npm run ios:refresh:devices` z čisté pracovní kopie s existující lokální konfigurací. Výsledky simulátoru a fyzického iPhonu budou uvedeny zvlášť. Nejde o produkční nasazení.
