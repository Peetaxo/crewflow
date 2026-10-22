# Sjednocené a kompaktní karty výkazů

Původní výkazy i výkazy s uloženým společným schvalovacím kolem nyní používají stejnou komponentu `TimelogSummaryCard`, včetně původních karet po lidech i ve skupinách po akci. Členství společného kola zůstává zachované; starší data se nepřevádějí ani nemigrují.

Karty mají menší odsazení a souhrny; desktop řadí akci vedle hodin, částky a otevření. Crew ve vlastním seznamu neopakuje své jméno na každé kartě. Původní dny a poznámka jsou v rozbalení, aktuální důvod vrácení a změny čekající na souhlas zůstávají viditelné. Historie a úplný editor zůstávají dostupné. Akční tlačítka zachovávají 44px dotykovou výšku. Výpočty, rozhodovací obsluhy, oprávnění a pořadí filtrů zůstávají zachované.

## Ověření

- Výchozí dvě sady: 24 testů prošlo. Dvě nové regrese původního výkazu na desktopu/mobilu nejprve selhaly; po změně ověřují souhrn 11 h / 2 750 Kč, zavřené dny, rozbalení obou dnů a původní editovací callback.
- Celá sada po implementaci: **2 591 testů / 201 souborů**, build a ESLint upravených souborů prošly. Nezávislé review schválilo základ i následnou desktopovou úpravu; koncový prázdný řádek byl odstraněn. Reviewer nezávisle spustil relevantní sady (43 a následně 36 testů); bez funkčních či bezpečnostních nálezů.
- Živé demo 8098: stejné přihlášení Crew zobrazuje tři společné karty a nový jasně označený původní testovací výkaz `UI2210 původní výkaz – 4 dny`, čekající na CH, 40 h / 10 000 Kč. Dny mají 6 + 11 + 14 + 9 h a výkaz nemá členství ve společném kole.
- Mobil **390 × 844**: stejná první společná karta má **214,875 px místo 361 px** (o 40,5 % méně), původní karta 207,875 px. Desktop **1280 × 900**: všechny čtyři karty 153,875 px. Na **320 × 720** odpovídá šířka dokumentu viewportu, bez vodorovného scrollu.
- Rozbalení původního výkazu ukázalo všechny čtyři dny a časy. Otevření společného schváleného výkazu ukázalo celé tři dny, 24 h / 6 000 Kč, ve stávajícím editoru pouze pro čtení; nic se neukládalo.
- Skutečné přihlášení CH: ověřen pohled po akci i po lidech, dny, poznámka a původní ovladače schválení/vrácení/úpravy. COO: původní výkaz čekající CH je pouze pro čtení a po rozbalení neobsahuje poznámku ani CH/editační ovladače. Žádné rozhodnutí se neprovedlo.
- Světlé i tmavé téma ověřeno; původní světlá preference obnovena.
- Lokální data: **1 230/1 230 původních řádků ve 27 tabulkách beze změny**. Přibyl jen samostatný testovací event, výkaz a čtyři dny. Worker zůstal vypnutý, faktury a úhrady beze změn. Žádná testovací data nevznikla ve Staff.

Soukromé důkazy mimo Git v `/Users/peetax/Projekty/.crewflow-ui-pilot-20261022/`: `compact-mixed-desktop.jpg`, `compact-mixed-390.jpg`, `compact-mixed-320.jpg`, `compact-original-expanded-390.jpg`, `compact-mixed-dark.jpg`, `compact-before.private.json`, `compact-after.private.json` a `compact-fixture.private.json`.

## Vývojové instalace

Změna byla začleněna a zveřejněna v main jako `d88e800`. Na tomto zdroji znovu prošlo všech **2 591 testů / 201 souborů**, produkční build, ESLint a `git diff --check b687113`. Demo na 8098 běží z hlavního checkoutu a po obnovení zobrazuje všechny čtyři karty. Původní preference vzhledu i viewport prohlížeče jsou obnovené. Pomocný checkout je zachovaný.

- **Simulátor:** povinný `npm run ios:refresh:devices` aplikaci sestavil, nainstaloval a spustil. Na reálných původních záznamech z uživatelova snímku ověřen nový vzhled, měsíc a filtr nad kartami, souhrny a rozbalení všech čtyř dnů; hodnoty zůstaly shodné. Žádná změna se neukládala.
- **Fyzický iPhone:** sestavení, podpis a instalace proběhly úspěšně. Spuštění systém odmítl s důvodem `Locked`; celý refresh proto skončil kódem 1. Telefon zatím není označený jako úspěšně aktualizovaný. Uživatel byl požádán o odemčení, potom zbývá zopakovat spuštění již nainstalovaného sestavení.

Všech **17/17 souborů** produkčního webového buildu je bajtově shodných s obsahem nainstalovaných balíků simulátoru i iPhonu. Ignorovaná `.env.local` zůstala beze změny (ověřeno SHA-256). Nativní soukromé důkazy mimo Git: `compact-simulator-original.jpg` a `compact-simulator-original-expanded.jpg`; obsahují reálná Staff data, proto se nepřidávají do repozitáře.
