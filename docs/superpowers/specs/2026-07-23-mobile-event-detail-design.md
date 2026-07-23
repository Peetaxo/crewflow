# Mobile Event Detail Design

**Datum:** 2026-07-23

## Cil

Upravit mobilni detail akce pro roli Crew tak, aby pusobil jako prakticka mobilni obrazovka k jedne konkretni akci, ne jako zmenseny desktopovy web. Detail ma Crew rychle odpovedet na otazky kde, kdy, s kym a co ma delat. Akce vuci teto udalosti maji byt stale dostupne v plovoucim spodnim panelu.

Desktopovy detail pro CrewHead a COO zustava v teto etape zachovany.

## Schvaleny Smer

Schvalena je varianta s informacnim detailem a plovoucim kontextovym panelem:

- zadna karta `Moje workflow` ani `Moje akce`,
- zadna globalni mobilni navigace v detailu akce,
- detail akce je primarne informacni,
- dole stale plave kontextovy panel pro praci s danou akci,
- odhlaseni nespousti akci okamzite, ale otevre potvrzovaci modal.

Mockup byl odladovan ve visual companionu jako `mobile-event-detail-floating-actions-v3.html`.

## Mobilni Rozlozeni

Mobilni detail akce pro Crew bude mit tyto oblasti:

1. Horni lista se zpet sipkou a stavem ucasti.
2. Hlavicka akce s nazvem, job numberem, klientem a pripadne fazi nebo typem prace.
3. Mapovy blok nebo vizualni blok mista.
4. Informacni karta s mistem, datem/casem a kontaktem.
5. Sekce `Kde se potkame`, pokud je vyplnene misto srazu nebo meeting point.
6. Sekce `Prirazena crew`, kde Crew vidi pouze lidi prirazene na akci.
7. Sekce `Popis akce`, pokud je vyplneny popis, dresscode nebo dalsi instrukce.
8. Plovouci spodni akcni panel.

Obsah detailu se scrolluje pod plovoucim panelem. Spodni panel zustava stale viditelny a nesmi zakryvat posledni obsah bez moznosti doscrollovat.

## Plovouci Akcni Panel

V detailu akce se pro mobilni Crew skryje bezna spodni navigace `Smeny / Akce / Schvalovani / Faktury / Uctenky`.

Misto ni se zobrazi kontextovy panel v ramci detailu akce:

- primarni akce `Evidence prace`,
- sekundarni akce pro odhlaseni, pokud je Crew na akci prirazena a nema aktivni zadost o odhlaseni.

Primarni akce `Evidence prace`:

- pokud existuje vlastni timelog pro danou akci, otevre ho,
- pokud je Crew prirazena a timelog jeste neexistuje, vytvori nebo otevre draft podle soucasneho workflow,
- pokud Crew neni prirazena, nebude tato akce dostupna.

Sekundarni akce odhlaseni:

- bude zobrazena jako kratka ikonova akce,
- prvni klepnuti pouze otevre potvrzovaci modal,
- zadost o odhlaseni se odesle az po explicitnim potvrzeni.

## Potvrzovaci Modal Odhlaseni

Po klepnuti na sekundarni odhlasovaci akci se zobrazi modal:

- nadpis ve smyslu `Opravdu pozadat o odhlaseni?`,
- kratke vysvetleni, ze zadost musi schvalit CH nebo COO,
- akce `Zustat na akci`,
- akce `Pozadat`.

Tlacitko `Zustat na akci` modal zavre bez zmeny.
Tlacitko `Pozadat` zavola existujici flow pro zadost o odhlaseni.

Odhlaseni se nikdy neposle jednim nechtenym klepnutim z detailu akce.

## Stavove Varianty Panelu

Panel se prizpusobi stavu Crew vuci akci:

- prirazena Crew: `Evidence prace` + odhlaseni,
- prirazena Crew s cekajici zadosti o odhlaseni: `Evidence prace` + informacni stav `Odhlaseni ceka`,
- cekajici prihlaska: stav `Ceka na schvaleni` a moznost zrusit prihlasku podle existujiciho workflow,
- neprihlasena Crew: primarni akce pro prihlaseni na akci podle existujicich pravidel,
- akce bez moznosti akce pro Crew: panel se skryje nebo zobrazi pouze informacni stav.

Prvni implementace se muze soustredit na nejdulezitejsi prirazeny stav, ale kod musi mit jasne misto pro ostatni stavy, aby nevznikly duplicitni akce v obsahu detailu.

## Kontakt A Mapa

Soucasny model akce obsahuje:

- `city`,
- `meetingLocation`,
- `contactPerson`,
- `startTime`,
- `endTime`,
- `description`,
- `dresscode`.

Soucasny model akce neobsahuje samostatne telefonni cislo kontaktu ani souradnice. Prvni implementace proto:

- zobrazi kontakt jako text,
- pokud bude pozdeji doplneno telefonni cislo, radek kontaktu se zmeni na klikatelne volani,
- mapovy blok pouzije dostupne misto (`meetingLocation` nebo `city`) a pripravi UX pro otevreni map,
- presna mapa se muze napojit pozdeji, az budou k dispozici kvalitnejsi adresni udaje nebo souradnice.

Design nesmi blokovat budouci rozsireni o `contactPhone`, `locationAddress`, `latitude` a `longitude`.

## Prirazena Crew

Crew v mobilnim detailu vidi pouze prirazene lidi:

- jmeno,
- avatar nebo inicialy,
- pripadne fazi/pozici, pokud ji uz dokazeme odvodit z existujicich dat,
- zadne schvalovaci akce managera,
- zadne odmitnute nebo cekajici zadatele v Crew pohledu.

Manager pohledy pro zajemce, schvalovani, odmitnute a odhlasene zustavaji mimo tuto mobilni Crew etapu.

## Navigace A Role

Mobilni detail se zapina pouze pro roli `crew`. Pokud je uzivatel CH, COO nebo CrewHead, i na uzkem viewportu se zatim pouzije desktopovy management pohled.

V `AppLayout` se musi rozlisit:

- mobilni Crew shell na beznych Crew obrazovkach, kde zustava globalni mobilni navigace,
- mobilni Crew detail akce, kde se globalni navigace skryje a zobrazi se kontextovy panel detailu.

Skryti navigace se ma ridit stavem `currentTab === 'events'` a existujicim `selectedEventId`.

## Komponenty A Data Flow

Navrhovane upravy:

- `EventDetailView` dostane prehlednejsi mobilni Crew vetvu pro informacni detail.
- Plovouci panel bude oddeleny jako vnitrni cast mobilni vetve nebo mala lokalni komponenta.
- Potvrzovaci modal odhlaseni bude lokalni stav v mobilnim detailu.
- `AppLayout` nebude renderovat `MobileCrewNav`, pokud je otevren mobilni detail akce.
- Existujici funkce `requestEventWithdrawal`, `withdrawEventApplication`, `applyForEvent` a editace timelogu zustanou zdrojem pravdy pro workflow.

Data zustavaji stejna jako dnes. Prvni implementace nema menit databazi.

## Chovani Pri Otevreni Evidence

Klik na `Evidence prace` vyuzije stejnou logiku jako dnesni mobilni/detailove otevreni timelogu:

- najde vlastni timelog podle aktualniho profilu a akce,
- pokud ho lze editovat, otevre editaci,
- pokud neexistuje a Crew je prirazena, vytvori novy draft podle dat akce,
- pokud existuje, ale neni editovatelny, otevre informacni stav nebo nepovoli editaci podle pravidel timelogu.

Samotny mobilni editor timelogu zustava tim, co bylo odladeno v predchozi etape.

## Testovani

Implementacni plan ma pokryt:

- mobilni Crew detail skryje globalni `MobileCrewNav`, kdyz je otevreny detail akce,
- bez otevreneho detailu akce mobilni Crew navigace zustava viditelna,
- CH/COO/CrewHead stale vidi desktopovy detail i na mobilnim viewportu,
- prirazena Crew vidi plovouci panel s `Evidence prace`,
- klik na `Evidence prace` otevre existujici vlastni timelog nebo pripravi novy draft,
- klik na odhlaseni pouze otevre potvrzovaci modal,
- potvrzeni modalu zavola zadost o odhlaseni,
- zruseni modalu neodesle zadnou zadost,
- v Crew pohledu se zobrazuje pouze prirazena crew, ne cekajici nebo odmitnuti zajemci.

## Mimo Rozsah

Tato etapa neresi:

- mobilni manager detail pro CH/COO,
- schvalovani zajemcu v mobilnim detailu,
- skutecne mapove API se souradnicemi,
- samostatne telefonni cislo kontaktni osoby v databazi,
- pozice jako plnohodnotny novy datovy model,
- PWA instalaci nebo nativni wrapper,
- zmeny desktopoveho detailu mimo nutne zachovani stavajiciho chovani.

## Shrnuti Rozhodnuti

- Mobilni detail akce bude info-first.
- `Moje workflow` a podobne karty se v detailu nepouziji.
- Globalni mobilni navigace se v detailu akce skryje.
- Kontext akce prevezme plovouci spodni panel.
- `Evidence prace` je hlavni akce pro prirazenou Crew.
- Odhlaseni musi mit potvrzovaci modal.
- Prvni implementace zustava nad existujicimi daty a bez zmen databaze.
