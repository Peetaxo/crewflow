# Výkazy a faktury: vizuální úprava pro desktop i mobil

Uživatel výslovně potvrdil obě obrazovky a obě velikosti zobrazení. Původní přiložené snímky faktur ukazují starší UI v mobilní a desktopové podobě. Přechod na novou fakturační obrazovku způsobil commit `ecede98` z 15. 10. při zavedení souhlasu a obou způsobů fakturace; oprava jednorázového stažení PDF tento vzhled neměnila.

## Co se změnilo

- Měsíc a stavové filtry výkazů jsou před společnými i staršími kartami. Crew používá stejný měsíční výběr na mobilu i desktopu; rozsah managementu zůstává zachovaný.
- Společný výkaz má oddělenou hlavičku osoby a stavu, akci s job číslem a obdobím, souhrny hodin a odměny a výraznou akci otevření/kontroly. Desktop využívá prostor vedle sebe, mobil skládá obsah pod sebe. Nulové doplňky nezaplňují základní kartu.
- Aktuální důvod vrácení je zvýrazněný; po dalším schválení zůstává dohledatelný v rozbalovací historii. Opravené je i chybné hlášení prázdného seznamu při výsledku složeném pouze ze společných karet.
- Fakturace zachovává podklady a skutečné faktury ve dvou sekcích. Karty mají stav, akci/číslo, částku a strukturované údaje o stranách, práci a datech. Podrobné adresy, dny a výpočty jsou v přesném rozbalovacím náhledu; volba self-billingu i nahrání originálu jej automaticky otevře. Souhlas se nevynucuje skrytě ani neobchází.
- Data se zobrazují česky bez posunu kalendářního dne časovým pásmem; chybějící nebo neplatné historické údaje mají pravdivý popisek.

Bez změn API, databáze, RLS, finančních výpočtů, vystavování, oprávnění, číslování nebo stahování PDF.

## Ověření

Cílené regresní testy před opravami selhaly pro nesprávné pořadí ovládání, chybějící desktopový měsíc, viditelný starý důvod vrácení, chybějící otevření přesného náhledu, technický zápis dat a nepravdivý prázdný stav. Po úpravě prošly, včetně integračního ověření celého kola přes kanonické UUID a historie po přechodu kola. Po přidání označené vnořené souhrnné oblasti se integrační testy počtu karet zpřesnily na skutečné oblasti „Společný výkaz“, nikoli všechny oblasti v dokumentu; kontrola identity a úplnosti se zachovala.

Celá sada před zapojením souběžných změn: **2 569 testů / 201 souborů**. Po začlenění aktuálního `origin/main` (`b8732f7`, úpravy jmen a fullscreen formuláře crew): **2 589 testů / 201 souborů**, build a ESLint změněných TS/TSX prošly. Spec review a následné code-quality review obou částí schválily konečný stav; jediný nález falešného prázdného stavu byl opraven a znovu schválen.

Skutečný Browser Use v lokálním Supabase demu na portu 8098:

| Kontrola | Výsledek |
|---|---|
| Desktop 1280 × 900, výkazy Crew | Měsíc i stav před kartou. Předchozí měsíc zobrazil prázdný výsledek a nulová počítadla; návrat obnovil říjnový výkaz 24 h / 6 000 Kč. |
| Mobil 390 × 844 a 320 × 720 | Výkazy i fakturace: šířka dokumentu odpovídá viewportu (390/390 a 320/320), bez vodorovného scrollu stránky. |
| Pořadí mobilních ovladačů | Dolní hrana ovládání 200,5 px, začátek karty 224,5 px. |
| Historie výkazu | Po rozbalení je dostupný důvod vrácení a všechny skutečné kroky včetně opětovného odeslání a finálního schválení. |
| Self-billing na 320 px | Přesný finanční náhled se otevřel, checkbox zůstal nezaškrtnutý a tlačítko vystavení zakázané. Faktura se nevystavovala. |
| Vlastní originál | Náhled zůstal otevřený a formulář nahrání dostupný. Žádný nový soubor se nenahrával. |
| Světlý a tmavý režim | Obě obrazovky ověřené v nodu tématech; původní světlá preference obnovena. |
| Role | Crew, CH a COO načetli své příslušné přehledy; CH nemá úhrady. Všechny původní rozhodovací a platební regrese prošly. |
| Zachování dat | Celých **1 230/1 230** zachycených řádků přes 27 obchodních tabulek zůstalo beze změny, včetně dřívějších dvou zaplacených testovacích faktur a novějšího schváleného výkazu. |

Tato vizuální kontrola neopakovala vystavení, přijetí ani úhradu faktur. Tyto operace mají předchozí úplný pilot; tato změna kontrolovala jejich zachované ovladače a testy. Lokální worker ani Cron se nezapínal a žádná testovací finanční data se nezapisovala do Staff.

Soukromé důkazy jsou v `/Users/peetax/Projekty/.crewflow-ui-pilot-20261022/`: `layout-timelogs-desktop.jpg`, `layout-timelogs-390.jpg`, `layout-timelogs-320.jpg`, `layout-timelogs-dark.jpg`, `layout-billing-desktop.jpg`, `layout-billing-390.jpg`, `layout-billing-dark-390.jpg`, `layout-billing-exact-320.jpg` a `layout-after.private.json`. Snímky obsahují pouze místní testovací demo. Úplné databázové snímky a přihlašovací údaje zůstávají mimo Git.

## Začlenění a vývojové instalace

Implementace je začleněná a zveřejněná v `main` jako `0228b2c`. Přímo na začleněném zdroji znovu prošlo **2 589 testů / 201 souborů**, produkční build, ESLint upravených TS/TSX a kontrola diffu. Pozdější souběžné commity do `0a407c9` přidaly pouze dokumentaci druhé práce; zdroj aplikace je proti ověřené verzi totožný. Demo na 8098 nyní běží z tohoto hlavního checkoutu. Po restartu a obnovení stránky znovu ověřeny faktury i filtry výkazů na desktopu a mobilu, viewport prohlížeče obnoven a záložka ponechána uživateli.

- **Simulátor:** povinný `npm run ios:refresh:devices` s existujícím týmem sestavil, nainstaloval a spustil novou aplikaci na iPhone 17 Pro / iOS 26.5. Vizuálně ověřeno umístění filtru nad výkazy a nová fakturační obrazovka. Původní role CH obnovena. Jde o krátkou kontrolu zobrazení; celý fakturační průchod se zde neopakoval.
- **Fyzický iPhone:** zařízení bylo dostupné; build nyní čeká při podpisu frameworků na systémovou aplikaci SecurityAgent. Aktualizace telefonu zatím **není potvrzená**. Uživatel byl požádán, aby případný dialog klíčenky vyřídil přímo na Macu; ovládání této aplikace nástroj z bezpečnostních důvodů odmítá. Výsledek instalace a spuštění se doplní po dokončení podpisu.

Ignorovaná `.env.local` zůstala beze změny (ověřeno shodným SHA-256). Nativní zobrazení používá Staff; během kontroly se nevytvářely ani neměnily finanční záznamy. Soukromé nativní snímky `layout-simulator-timelogs.jpg` a `layout-simulator-invoices.jpg` proto nejsou určeny jako veřejné demo důkazy.

Pomocný čistý checkout a již začleněná větev zůstaly zachované: automatická kontrola odmítla jejich odstranění kvůli riziku smazání práce. Ostatní pracovní checkouty se neměnily.
