# Zamknutý náhled mapy ve formuláři

Uživatel schválil změnu přes samostatný modal po návrhu v konverzaci.

- Náhled po výběru adresy i polohy je pouze pro čtení: neposouvá mapu, nezvětšuje ji a nemění souřadnice. Přejetí prstem má dál umožnit posouvání formuláře.
- Klepnutí na náhled nebo aktivace klávesnicí otevře stávající modal „Vybrat polohu“ se současnými souřadnicemi. Viditelný popisek: „Upravit polohu“. Tlačítko „Vybrat na mapě“ zůstává.
- Pouze „Potvrdit polohu“ přenese nový bod do draftu. Zrušit, křížek a Escape ponechají původní bod i otevřený formulář. Focus se vrátí na konkrétní spouštěcí prvek.
- Zachovat čitelnou a dostupnou atribuci mapy, ovládání klávesnicí, chování při selhání mapy a zákaz editace při ukládání formuláře.
- Bez změn vyhledávání adres, datového modelu, detailu akce nebo databáze. Stávající interaktivní režim komponenty mimo tento formulář se neodstraňuje.

## Ověření

Regresní testy skutečného formuláře a mapových komponent s mockovaným WebGL enginem: neinteraktivní preview, zahájení na aktuální poloze, potvrzení, všechna zrušení, návrat focusu, disabled při ukládání. Prohlížeč: kliknutí/klávesnice, scroll přes preview, přístupná atribuce, mobilní i desktopová šířka. Následuje full suite, build, review, integrace a vývojové instalace dle AGENTS.md.
