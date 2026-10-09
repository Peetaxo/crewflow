# Správa propojených směn v sekci Akce

Propojení příprav, instalace a deinstalace se nastavuje u akcí, protože platí pro všechny skutečně přiřazené členy crew. Detail člověka zůstává místem pro jeho vlastní přehled a budoucí individuální výběr akcí na fakturu. Tento přesun nemění společnou evidenci ani proces schvalování.

Uživatel po kontrole návrhu odsouhlasil 9. října 2026 hlavní vstup v sekci Akce a přehled s úpravou existujícího propojení v detailu akce. Stávající nasazená verze zatím spravuje propojení z detailu crew; následující rozsah je schválený pro implementaci.

## Zvolené umístění

Hlavní tlačítko **Propojit směny** bude v existující sekci Akce na mobilu i desktopu. Detail akce nabídne přehled a úpravu jejího existujícího propojení ve stejném dialogu. Umístění správy v detailu crew se ruší, protože neprávem naznačuje individuální nastavení. Samostatná nová navigační sekce není součástí změny.

## Sekce Akce a detail akce

- CH a COO dostanou hlavní tlačítko **Propojit směny** v sekci Akce. V detailu propojené akce se zobrazí její členové a tlačítko **Upravit propojení**. Detail nepropojené akce nenabízí druhý hlavní vstup pro vytváření.
- Nový výběr začíná prázdný a vyžaduje alespoň dvě výslovně označené směny. Není vázaný na aktuální akci, člověka, zobrazený měsíc ani filtr seznamu. Nestačí jen otevřít nebo zavřít dialog; nic se neuloží bez výslovného potvrzení.
- Výběr vychází z akcí dostupných správci, nikoliv ze směn jednoho člověka. Není potřeba hledat člena crew společného všem směnám a lze propojit i směny bez přiřazených lidí. Pozdější přiřazení tím není automaticky vytvořeno.
- Název, jobnumber a datum rozliší jednotlivé směny. Jednoduché vyhledávání podle názvu a jobnumber umožní najít další akci i ve větším seznamu. Jobnumber nezpůsobuje automatické propojení ani neomezuje výběr jen na stejný projekt.
- Při otevření již propojené akce se načte právě její existující skupina a celý její aktuální výběr. Při úpravě lze členy výslovně přidat nebo odebrat, včetně odpojení aktuální akce; taková změna se před uložením vypíše. Zrušení celé skupiny nemaže akce ani jejich výkazy.
- Dialog výslovně vysvětlí, že propojení platí pro všechny přiřazené lidi, každý vyplňuje pouze své směny a propojení nevytváří fakturu.

## Detail člena crew

Tlačítko pro vytváření propojení i možnost otevřít jeho úpravu se odstraní. U směn zůstane pouze informace o společné evidenci, omezená na skutečné přiřazení daného člověka. Z historického výkazu se nesmí odvozovat nové přiřazení.

Pokud jsou propojené tři směny a Petr je přiřazený jen na dvě, jeho osobní informace popisuje tyto dvě, nikoliv nepřiřazenou třetí. Propojení a rozpis hodin ostatních lidí tím nezískává právo měnit. Jeho evidence a schvalování zůstávají samostatné od ostatních členů crew.

Budoucí výběr libovolných schválených akcí na jednu fakturu bude individuální v detailu člověka. Tento přesun jej ještě nepřidává.

## Zachované kontroly a data

Správu nadále provádí jen CH nebo COO. Zachovají se kontroly všech dotčených výkazů a skupin: propojení lze měnit jen u konceptů bez historie schvalování, kol a vazeb na fakturu. Přesuny z jiné skupiny a propojení různých projektů vyžadují dosavadní výslovná potvrzení. Uložení používá stejné atomické požadavky, verze a opakování při nejasné odpovědi.

Změna účtu, role, otevřené akce nebo zdroje dat ukončí původní dialog a jeho rozpracované akce. Konflikt vyžaduje obnovení dat a opětovnou kontrolu výběru; nedostupní vybraní členové nesmějí potichu zmizet. Chyba načtení ponechá ostatní části detailu použitelné, ale neumožní uložit neúplný podklad.

Databázové tabulky, existující propojení a schvalovací mechanismus se nemění. Nevznikne migrace, převod dat, nové přiřazení crew, faktura ani integrace s účetními. Dosavadní serverové kontroly zůstávají autoritou.

## Rozsah implementace

Oddělit globální správu propojení od osobního informačního přehledu. Výběr pro správce nesmí záviset na `profileId`; osobní přehled naopak potřebuje autoritativní přiřazení konkrétního člověka. Znovu využít existující editor, výpočet dopadu, atomické příkazy a společnou evidenci, bez přepisování schvalování nebo nesouvisejících částí rozsáhlých detailů.

## Ověření

- Vytváření funguje z přehledu Akce; úprava z detailu kterékoliv propojené akce. Obojí na mobilu i desktopu pro CH i COO; crew nemá ovládání správy.
- Lze vytvořit propojení bez jediného společně přiřazeného člověka, včetně zatím neobsazených směn. Přiřazení lidí se nezmění.
- Nové propojení začíná prázdné a neuloží se s jediným členem. Výběr není omezený filtrem přehledu. Existující propojení zachová celý výběr i při hledání; odpojení aktuální akce se výslovně zobrazí.
- Různé jobnumber i přesuny mezi skupinami ponechají potvrzení; všechny historické a fakturační blokace zůstanou účinné.
- Detail crew nabízí jen osobní informaci, bez vytvoření, úpravy nebo zrušení skupiny. Nepřiřazené části se nezobrazují.
- Původní společný editor, odeslání a schvalování nadále fungují, včetně ochrany změny identity a konfliktů.
- Po implementaci proběhnou cílené i regresní testy, webový build a vizuální kontrola. Ověřený kód se integruje do čistého synchronizovaného `main`, následně se aktualizují a samostatně ověří simulátor a dostupný iPhone podle `AGENTS.md`.
