# Přehled výkazů a faktur: responzivní vizuální úprava

Uživatel požaduje kultivovanější UI obou obrazovek v desktopovém i mobilním pohledu; u výkazů výslovně měsíc a stavový filtr před obsahem. Přiložené snímky zobrazují starší fakturační UI ve dvou šířkách, nejsou požadavkem vrátit starou funkcionalitu.

## Vizuální směr

Navázat na existující nodu tokeny: světlé povrchy, teplá neutrální typografie, oranžová hlavní akce, barevné stavové štítky, zaoblené panely. Na telefonu skládat obsah do jednoho sloupce bez vodorovného posouvání stránky, na desktopu použít prostor pro souhrny a akce vedle sebe. Nevytvářet nový vzhled celé aplikace.

## Výkazy

Měsíc a stavové filtry umístit pod záhlaví a před všechny společné i starší karty. Crew dostane již existující měsíční výběr také na desktopu se stejným rozsahem a logikou jako na mobilu. Management si zachová existující rozsah dat. Souhrnná karta má jasně oddělenou identitu a stav, dvě označené souhrnné hodnoty (hodiny, odměna), směny s job číslem a obdobím, a zřetelnou hlavní akci. Nulové cestovné a jídlo nezobrazovat jako řetěz opakujících se nul. Historie je rozbalovací; poslední důvod vrácení je přímo vidět v aktuálně vráceném stavu, po schválení zůstává v historii.

## Fakturace

Uchovat oddělení podkladů od skutečných faktur. Seznam vést názvem akce nebo číslem faktury, stavem a částkou; dodavatele, odběratele, období a hodiny seskupit do srozumitelného souhrnu. Úplné adresy, účet, jednotlivé dny a cenový výpočet patří do rozbalovacího přesného náhledu. Před potvrzením self-billingu nebo nahráním originálu přesný náhled automaticky otevřít, aby pracovník mohl ověřit schvalované údaje. Kontrola CH, výslovný souhlas, blokace, read-only historie a původní dokumenty zůstávají dostupné a funkčně stejné.

## Hranice a ověření

Bez změn serverových API, oprávnění, finančních výpočtů, generování PDF a jeho jednorázového stažení. Ověřit skutečnou dostupnost rozbalovacích detailů, viditelnost finančního náhledu před souhlasem, pořadí ovládání a měsíční filtr desktop/mobile. Projít živé lokální demo v desktopové, 390px a 320px šířce; zkontrolovat dlouhé názvy a tmavý režim. Celá sada, build, lint změněných souborů, nezávislé review, integrace do main a předepsaná obnova obou vývojových instalací.
