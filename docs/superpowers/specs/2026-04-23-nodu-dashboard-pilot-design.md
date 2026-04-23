# Nodu Dashboard Pilot Design

**Datum:** 2026-04-23

## Cíl

Navrhnout vratný vizuální pilot pro rebrand aplikace směrem k identitě `nodu.` bez zásahu do datové logiky a navigační struktury.

Pilot se týká pouze:
- [Sidebar.tsx](/Users/peetax/Projekty/crewflow/src/components/layout/Sidebar.tsx)
- [DashboardView.tsx](/Users/peetax/Projekty/crewflow/src/views/DashboardView.tsx)
- [AppLayout.tsx](/Users/peetax/Projekty/crewflow/src/components/layout/AppLayout.tsx)
- sdílených vizuálních tokenů v [index.css](/Users/peetax/Projekty/crewflow/src/index.css)

## Kontext

Současná aplikace používá funkční, ale spíše utilitární šedo-zelený vizuální jazyk.

Nový směr má vycházet z brandové reference `nodu.`:
- velmi světlý `off-white` základ
- skoro černá typografie
- jedna výraznější oranžová jako akcent
- jemný papírový podklad v hlavním pozadí
- měkké stíny a lehce editoriální, čistá prezentace

Současně musí zůstat zachované:
- stávající layout dashboardu
- stávající struktura sidebaru
- stávající obsah karet, badgeů a seznamů
- snadná možnost pilot vrátit nebo dále nerozšiřovat

## Scope pilotu

Pilot upraví pouze vizuální vrstvu.

Nemění se:
- business logika
- datové query
- navigační struktura
- pořadí sekcí dashboardu
- role-based chování sidebaru

Pilot zahrnuje:
- nové barevné tokeny pro pilotní plochy
- nové pozadí aplikace s jemnou papírovou texturou
- nový vzhled sidebaru
- nový vzhled dashboard headeru
- nový vzhled stat cards
- nový vzhled obou hlavních obsahových karet na dashboardu

## Vizuální směr

### Brand charakter

UI má působit:
- světle
- čistě
- klidně
- prémiově, ale ne okázale
- produktově, ne marketingově

Oranžová nesmí být dominantní plošná barva.

Je to akcent pro:
- aktivní navigaci
- job number badge v seznamu timelogů
- vybrané malé detaily ve stat cards
- vybrané progress a focus stavy

Většina datových údajů a čísel má být v tmavém, téměř černém textu.

### Pozadí

Hlavní page background bude:
- velmi světlý `off-white`
- s velmi jemnou papírovou texturou nebo vláknitým šumem
- textura má být spíš cítit než vidět

Textura se nesmí aplikovat na karty, formulářové prvky ani sidebar jako výrazný pattern.

Karty a ovládací prvky mají zůstat hladké a čitelné.

## Návrh sidebaru

Sidebar zachová současné bloky:
- logo / brand area
- collapse button
- search
- role switcher
- navigation
- settings
- profile block

### Vzhled sidebaru

Sidebar nebude výrazně tmavší než zbytek aplikace.

Od hlavní plochy se oddělí hlavně pomocí:
- měkkého stínu
- jemného teplého borderu
- lehce elevated dojmu

Nesmí působit jako těžký barevný panel.

### Aktivní navigační položka

Aktivní položka zůstane výrazněji akcentovaná:
- světle oranžové pozadí
- tmavý text
- jemný oranžový border nebo glow

Ostatní položky zůstanou převážně neutrální.

### Search a role switcher

Search field i role switcher budou vizuálně jemnější než dnes:
- světlé plochy
- teplé jemné bordery
- malé stíny nebo inset efekt
- oranžový focus stav

### Brand area

Horní část sidebaru má být připravená pro wordmark `nodu.`.

Pro pilot stačí:
- přepnutí na nový název / asset
- layout, který počítá s minimalistickým wordmarkem

Specifický detail loga:
- oranžový akcent má odpovídat referenci, kde je integrován do `u`
- v UI se tento princip chápe jako brand reference, ne jako nutnost všude opakovat stejný tvar

## Návrh dashboardu

### Zachovaná struktura

Zůstává stejná struktura jako v aktuálním [DashboardView.tsx](/Users/peetax/Projekty/crewflow/src/views/DashboardView.tsx):
- header s titulkem a podtitulkem
- první řada s pěti stat cards
- druhá řada se dvěma hlavními kartami
- vlevo `Timelogy ke zpracovani`
- vpravo `Nadchazejici akce`

### Header

Header bude čistší a typograficky výraznější než dnes:
- tmavý titulek
- jemnější sekundární metadata
- bez zbytečných barevných dekorací

### Stat cards

Stat cards zůstanou kompaktní a datové.

Budou:
- převážně černobílé / neutrální
- s jemným borderem
- s měkkým stínem
- s malým oranžovým detailem jen tam, kde dává smysl

Nemají obsahovat:
- oranžové tečky u ikon
- velké oranžové plochy
- přehnané highlighty

### Timelogy ke zpracovani

Tato karta zůstane obsahově stejná, ale dostane kultivovanější hierarchii:
- tmavší jména a hodnoty
- čistší metadata
- jemnější oddělovače
- oranžově akcentovaný `job number` badge

Právě `job number` je v této sekci hlavní místo, kde bude oranžová zřetelněji vidět.

### Nadcházející akce

Karta zůstane strukturálně stejná.

Vizuálně se upraví:
- badge a metadata do čistšího tónu
- progress bar do jemnějšího, produktovějšího stylu
- textové hierarchy tak, aby hlavní údaje byly tmavé a čitelné

Oranžová zde má být spíše doplňková než dominantní.

## Tokeny a pravidla

### Barvy

Pilot má zavést minimálně tyto vizuální role:
- page background
- paper texture overlay
- surface / card
- surface muted
- primary text
- secondary text
- warm border
- accent orange
- accent orange soft
- active nav surface

Přesné HEX hodnoty nejsou součástí specu.

Důležitější je:
- správný kontrast
- podobnost k referenci `nodu.`
- zdrženlivé použití oranžové

### Stíny

Stíny mají být:
- měkké
- rozptýlené
- spíš světelné a produktové než tvrdé

Použijí se hlavně pro:
- oddělení sidebaru
- stat cards
- hlavní obsahové karty

### Bordery

Bordery nemají být studeně šedé.

Mají jít do jemně teplého neutrálu, aby lépe seděly s `off-white` podkladem.

## Technický přístup

Pilot má být implementovaný tak, aby byl snadno vratný a lokální.

Preferovaný přístup:
1. Rozšířit globální tokeny v [index.css](/Users/peetax/Projekty/crewflow/src/index.css).
2. Přidat několik pilotních utility tříd nebo pojmenovaných surface tříd pro `nodu.` skin.
3. Upravit [AppLayout.tsx](/Users/peetax/Projekty/crewflow/src/components/layout/AppLayout.tsx), aby page background uměl nést papírovou texturu.
4. Upravit [Sidebar.tsx](/Users/peetax/Projekty/crewflow/src/components/layout/Sidebar.tsx) bez změny jeho chování.
5. Upravit [DashboardView.tsx](/Users/peetax/Projekty/crewflow/src/views/DashboardView.tsx) a případně sdílené [StatCard.tsx](/Users/peetax/Projekty/crewflow/src/components/shared/StatCard.tsx), pokud to zjednoduší konzistentní vzhled.

## Vratnost

Pilot má být snadno odstranitelný.

To znamená:
- žádné zbytečné zásahy do ostatních view
- žádné přepisování celé design token architektury aplikace
- změny držet co nejvíc ve vrstvách použitých sidebar/dashboard pilotem

Pokud se směr neosvědčí, musí být možné:
- vrátit změny jen v několika souborech
- nebo ponechat tokeny a odstranit pouze jejich použití na pilotních obrazovkách

## Co tato změna neřeší

- redesign ostatních sekcí aplikace
- redesign modálů
- redesign tabulek mimo dashboard
- finální systematizaci design systému pro celou appku
- finální produkční podobu loga `nodu.`

## Kritéria přijetí

Pilot bude považovaný za úspěšný, pokud:
- sidebar a dashboard jasně působí jako nový brand `nodu.`
- layout a funkce zůstanou shodné se současnou implementací
- pozadí bude světlejší a jemně papírové, ale nebude rušit čitelnost
- většina datových údajů bude tmavá, ne oranžová
- aktivní položka sidebaru zůstane oranžově zvýrazněná
- v sekci `Timelogy ke zpracovani` bude oranžově zvýrazněný `job number`
- horní stat cards nebudou používat oranžové tečky jako dekoraci
- změna bude omezená na pilotní scope a půjde rozumně vrátit
