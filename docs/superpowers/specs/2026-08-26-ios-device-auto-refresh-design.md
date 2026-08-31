# Automatická aktualizace iOS simulátoru a telefonu

## Cíl

Po každém úspěšném sloučení změn do větve `main` udržovat vývojovou instalaci aplikace NODU aktuální v předvoleném iOS simulátoru a, pokud je dostupný, také ve spárovaném reálném iPhonu. Aktualizace zařízení není produkční nasazení.

## Rozsah

Automatizace bude uložena přímo v repozitáři jako jeden verzovaný projektový příkaz. Pracovní postup po merge do `main` tento příkaz spustí až po úspěšných testech a ověření výsledného `main`.

Automatizace obslouží:

- webový produkční build vložený do Capacitor aplikace,
- synchronizaci nativního iOS projektu,
- předvolený iOS simulátor,
- spárovaný vývojový iPhone dostupný přes kabel nebo Wi-Fi,
- jednoznačný závěrečný souhrn pro obě zařízení.

Mimo rozsah jsou TestFlight, App Store, produkční Netlify deploy a vzdálená aktualizace telefonu, který není dostupný pro lokální Xcode nástroje.

## Spouštění

Primární rozhraní bude nový npm příkaz určený k ručnímu i agentnímu použití. Projektový pracovní postup stanoví, že se příkaz spustí po každém úspěšném merge do `main`.

Automatizace nebude implementována jako skrytý Git `post-merge` hook. Merge a pull tak nebudou bez upozornění blokovány dlouhým Xcode buildem a stejný verzovaný příkaz půjde samostatně zopakovat při diagnostice.

Příkaz odmítne plnou aktualizaci, pokud není spuštěn nad větví `main`, pokud pracovní kopie obsahuje neuložené sledované změny nebo pokud lokální `main` neodpovídá `origin/main`. Testovací režim bude možné spustit bez instalace do zařízení.

## Tok aktualizace

1. Zjistit aktuální commit a ověřit čistý, synchronizovaný `main`.
2. Spustit webový build.
3. Spustit `cap sync ios`, aby nativní projekt obsahoval nový webový obsah a aktuální pluginy.
4. Vybrat předvolený simulátor. Pokud je vypnutý, automatizace jej může spustit, sestaví aplikaci, nainstaluje ji a ověří její spuštění.
5. Vyhledat předvolený spárovaný iPhone podle CoreDevice identifikátoru. Dostupnost přes Wi-Fi a kabel se považuje za rovnocennou.
6. Je-li iPhone dostupný, sestavit podepsanou aplikaci pro zařízení, nainstalovat ji a spustit.
7. Vypsat commit a stav každého cíle.

Simulátor a telefon dostanou obsah ze stejného commitu `main`. Build pro simulátor a build pro fyzické zařízení zůstávají oddělené, protože používají odlišné platformy a podepisování.

## Konfigurace

Stabilní projektové hodnoty budou mít bezpečné výchozí nastavení:

- Xcode projekt `ios/App/App.xcodeproj`,
- scheme `App`,
- bundle identifier `cz.nodu.app`,
- známý předvolený simulátor,
- Xcode destination UDID známého spárovaného iPhonu,
- CoreDevice identifikátor stejného iPhonu pro zjištění dostupnosti, instalaci a spuštění.

Xcode destination UDID a CoreDevice identifikátor se nesmí zaměňovat: `xcodebuild` a `devicectl` pro stejný fyzický telefon používají rozdílné identifikátory.

Identifikátory bude možné přepsat proměnnými prostředí, aby změna telefonu nebo simulátoru nevyžadovala úpravu logiky skriptu. Citlivé údaje, hesla ani podpisové klíče se do repozitáře neuloží; použije se existující Xcode signing a systémové párování.

## Chování při chybách

Tyto chyby ukončí příkaz s neúspěšným návratovým kódem:

- nečistý nebo nesynchronizovaný `main`,
- neúspěšný webový build,
- neúspěšný Capacitor sync,
- neúspěšný build, instalace nebo spuštění simulátoru,
- dostupný iPhone, na kterém selže build, podepsání, instalace nebo spuštění.

Nedostupný iPhone příkaz nezastaví. Simulátor se aktualizuje a závěrečný výsledek výslovně uvede `telefon čeká na instalaci`. Tím se nezamění nedostupnost zařízení za úspěšnou aktualizaci.

## Výstup

Závěrečný souhrn bude obsahovat:

- krátký hash commitu `main`,
- `simulátor: aktualizován` nebo konkrétní chybu,
- `telefon: aktualizován`, `telefon: čeká na instalaci` nebo konkrétní chybu,
- způsob dostupnosti telefonu, pokud jej systémový nástroj poskytne.

Úspěšný návratový kód znamená, že simulátor byl aktualizován a telefon byl buď aktualizován, nebo nebyl dostupný a byl správně označen jako čekající.

## Testovatelnost

Logika zjišťování stavu, výběru zařízení a klasifikace výsledku bude oddělena od spouštění systémových příkazů. Testovací režim nebude provádět build ani instalaci a ukáže plánované kroky.

Automatické testy pokryjí alespoň:

- dostupný simulátor a dostupný telefon,
- vypnutý simulátor, který se má spustit,
- nedostupný telefon jako neblokující stav,
- dostupný telefon s chybou instalace jako blokující stav,
- odmítnutí jiné větve nebo nečistého `main`,
- přepsání identifikátorů konfigurací prostředí,
- správný závěrečný souhrn a návratové kódy.

Po implementaci se provede skutečná zkouška na předvoleném simulátoru a na aktuálně spárovaném iPhonu přes Wi-Fi.

## Pracovní pravidlo

Dokončení budoucí změny po merge do `main` zahrnuje spuštění tohoto aktualizačního příkazu. Výsledek se uživateli hlásí odděleně pro simulátor a telefon. Pokud telefon čeká na instalaci, lze příkaz později zopakovat bez nového merge.
