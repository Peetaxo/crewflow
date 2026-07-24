# Crew Mobile Workflow Design

**Datum:** 2026-07-21

## Cil

Navrhnout prvni workflow-first etapu mobilni aplikace pro Crew tak, aby clen crew mohl na telefonu projit hlavni provozni tok od prihlaseni na akci po odeslani vykazu ke schvaleni. Desktopovy management zustava zachovany jako pracovni prostredi pro CrewHead a COO.

Prvni etapa neresi finalni generovani self-billing faktur ani smluv o dilo. Tyto dokumenty jsou navazujici faze po stabilizaci workflow.

## Hlavni Workflow

Zakladni provozni tok:

1. CH nebo COO vypise akci.
2. Crew se na akci prihlasi.
3. CH nebo COO schvali konkretniho clena crew na akci.
4. Schvalenemu clenovi crew se v aplikaci zobrazi akce jako jeho prirazena smena.
5. Pro schvaleneho clena crew je pripraveny draft timelog.
6. Po akci nebo v prubehu akce Crew vyplni odpracovane dny a casy.
7. Crew odesle vykaz ke schvaleni.
8. CH vykaz zkontroluje, pripadne upravi a posle dal na COO nebo vrati Crew.
9. COO schvali vykaz finalne nebo ho vrati.
10. Finalne schvaleny vykaz prechazi do stavu pripraveno k vyplaceni.

Tento tok ma byt v mobilni aplikaci viditelny jako postupny stav konkretni osoby na konkretni akci, ne jako sada oddelenych CRUD obrazovek.

## Role A Pohledy

### Crew

Crew pouziva mobil primarne pro:

- hledani a prihlaseni na dostupne akce,
- kontrolu schvalenych smen,
- vyplneni a odeslani hodin,
- sledovani stavu schvalovani,
- kontrolu vlastnich faktur, uctenek a budoucich vyplatnich dokumentu.

Crew na mobilu vidi pouze vlastni data.

### CrewHead

CrewHead zustava primarne desktopova role. V prvni mobilni etape neni nutne prestavet jeho management pohled. CH musi nadale videt desktopovy provozni panel, schvalovani a moznost upravovat hodiny tam, kde to workflow dovoluje.

### COO

COO zustava primarne desktopova role pro finalni schvaleni a financni prehled. V prvni etape se nemeni princip, ze COO vidi az hodiny posunute po CH kontrole a neresi vnitrni kompromisy mezi CH a Crew.

### Budouci Mobilni Rozsah Pro CH A COO

Mobilni aplikace nema zustat pouze pro Crew. Po stabilizaci Crew workflow musi postupne vzniknout i mobilni pohledy pro CH a COO. CH potrebuje na telefonu minimalne kontrolovat a schvalovat prihlasene crew na akce, resit zadosti o odhlaseni a schvalovat nebo vracet vykazy. COO potrebuje mobilne videt finalni frontu ke schvaleni a provadet finalni rozhodnuti bez nutnosti plne desktopove administrace. Tento rozsah neni soucast prvni Crew etapy, ale je povazovany za navazujici produktovy smer.

## Mobilni Navigace

Mobilni navigace pro Crew muze mit vlastni kratke popisky nez desktop. Desktopove nazvy zustavaji plne a popisne, mobilni taby mohou byt kratke kvuli sirce displeje.

Minimalni mobilni oblasti:

- smeny,
- akce,
- schvalovani,
- faktury,
- uctenky.

Prvni implementace muze pouzit kratke pracovni popisky `Smeny`, `Akce`, `Schv.`, `Fakt.` a `Uct.`. Presne mobilni nazvy a ikony se doladi vizualne v samostatnem kroku. Prvni etapa musi hlavne zajistit, ze se Crew dostane ke vsem oblastem, ke kterym ma pristup dnes.

## Mobilni Zadani Timelogu

Desktopovy editor timelogu muze zustat tabulkovy, podobne jako soucasny modal `Upravit vykaz`. Mobilni editor ma byt jina interakce nad stejnymi daty.

Mobilni tok:

1. Crew otevre schvalenou akci nebo svuj draft vykaz.
2. Zobrazi se souhrn vykazu: stav, celkem hodin, odmena a pripadne cestovne.
3. Pod souhrnem je kalendar nebo kalendarovy vyber dnu.
4. Dny, ve kterych je akce vypsana, jsou vyrazne zvyraznene.
5. Dny, ve kterych uz jsou zadane hodiny, maji jasny indikator.
6. Dny mimo termin akce jsou sede, ale klikatelne.
7. Po kliknuti na den se otevira mobilni bottom sheet pro upravu dne.

### Uprava Dne

Bottom sheet pro jeden den obsahuje:

- datum,
- cas od,
- cas do,
- typ prace nebo fazi akce,
- volitelnou poznamku,
- akci ulozit den.

Cas se na mobilu vybira po 15 minutach. Preferovana interakce je scroll/picker nebo krokovani, ne primarne rucni psani do textoveho pole.

Poznamka je volitelna vsude:

- u bezneho dne akce,
- u dne mimo termin akce,
- u celeho vykazu,
- u CH upravy pro Crew.

Den mimo termin akce nesmi byt blokovany. Aplikace ho pouze vizualne oznaci jako den mimo vypsany termin, protoze realna prace muze vzniknout pred nebo po terminu akce domluvou mimo system.

## Stavovy Model V Prvni Etape

Prvni etapa se opira o existujici timelog stavy:

- `draft`,
- `pending_ch`,
- `pending_coo`,
- `approved`,
- `rejected`,
- pozdeji `invoiced` a `paid`.

Pravidla:

- Crew muze upravit vlastni `draft` a `rejected`.
- Crew muze odeslat `draft` nebo `rejected` ke schvaleni.
- CH muze upravit `pending_ch`, pridat volitelnou poznamku pro Crew, schvalit dal nebo vratit.
- COO dela finalni stavovy krok a neupravuje hodiny, dny, kilometry ani poznamku.
- Po finalnim COO schvaleni je vykaz pripraveny k vyplaceni.

## Navazujici Vyplaceni

Po finalnim schvaleni ma vzniknout jasna UI fronta `K vyplaceni`. V prvni etape muze byt odvozena ze stavu `approved`, neni nutne pridavat novy databazovy stav. Tato prvni mobilni etapa nemusi generovat dokumenty automaticky, ale musi nechat workflow ve stavu, ze dalsi krok je zrejmy.

Budouci pravidla:

- pokud ma clen crew ICO, pouzije se self-billing faktura,
- pokud nema ICO, pouzije se smlouva o dilo,
- smlouva o dilo vznika za kazdou akci zvlast,
- sablona smlouvy se vybira podle firmy nebo klienta, zatim NEXTLEVEL nebo JCHP.

Do smlouvy o dilo se budou doplnovat osobni udaje:

- jmeno a prijmeni,
- datum narozeni,
- trvaly pobyt,
- e-mail,
- telefon,
- bankovni ucet.

Do smlouvy o dilo se budou doplnovat udaje akce:

- akce nebo projekt,
- misto plneni dila,
- termin plneni dila,
- specifikace dila, rozsah a charakter plneni.

Generovani smluv a dokumentu je navazujici etapa. Soucasna specifikace ho zahrnuje pouze jako cilovy smer workflow.

## Preview A Overovani

Pri implementaci se musi kontrolovat desktop i mobil:

- desktop preview overuje, ze CH/COO management zustal pouzitelny a sidebar se nerozbil,
- mobilni preview overuje Crew flow na velikostech pro iPhone a Android,
- pro vizualni rozhodovani lze delat srovnavaci screenshoty desktop versus mobil.

Doporucene mobilni viewporty:

- iPhone: sirka priblizne 390 px,
- Android: sirka priblizne 412 px.

Po prvni funkcni verzi se ma workflow zkusit i na realnem telefonu, protoze safe-area, spodni navigace a touch targety se nejlepe overi rukou.

## Architektura

Prvni etapa ma zustat v jedne React aplikaci. Nema vznikat oddelena mobilni aplikace, Xcode projekt ani duplicitni routing.

Principy:

- jedna sada dat a opravneni,
- desktop a mobil mohou mit rozdilne komponenty pro stejne workflow,
- mobilni komponenty maji byt izolovane tak, aby nekomplikovaly desktopovy modal,
- role-based pristupy zustavaji spolecne.

PWA a pripadny Capacitor/Xcode wrapper jsou dalsi etapy. Prvni etapa resi mobilni pouzitelnost a workflow.

## Testovani

Prvni implementacni plan ma pokryt minimalne:

- Crew navigace obsahuje vsechny dostupne oblasti i pri kratkych mobilnich popiscich.
- Desktop role stale vidi sidebar a management navigaci.
- Mobilni editor umozni pridat a upravit den timelogu.
- Dny mimo termin akce jsou povolene a vizualne odlisene.
- Casovy vyber pracuje po 15 minutach.
- Poznamka neni povinna pro ulozeni ani odeslani.
- Crew muze odeslat draft nebo rejected timelog.
- CH a COO pravidla schvalovani odpovidaji aktualnim opravnenim.

## Mimo Rozsah Prvni Etapy

Prvni etapa neobsahuje:

- generovani smlouvy o dilo,
- automaticke generovani self-billing faktury,
- PWA instalaci,
- nativni iOS nebo Android wrapper,
- push notifikace,
- kompletni redesign vsech desktop obrazovek.

## Shrnutí Rozhodnuti

- Priorita je workflow, ne jen mobilni obal.
- Cili se na iPhone i Android.
- Desktop a mobil mohou vypadat jinak.
- Desktopovy editor hodin muze zustat tabulkovy.
- Mobilni editor hodin bude kalendarovy.
- Dny mimo termin akce jsou povolene.
- Poznamka je vsude volitelna.
- Cas se vybira po 15 minutach.
- Smlouva o dilo bude v budoucnu za kazdou akci zvlast.
