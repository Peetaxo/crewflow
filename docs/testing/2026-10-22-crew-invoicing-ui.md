# Skutečný průchod fakturací v demo rozhraní - 22. 10. 2026

**Výsledek: obě možnosti fakturace prošly celým skutečným UI průchodem až ke stažení PDF a záznamu úhrady. Zůstávají dva potvrzené nálezy v obnovování přehledů a stahování souborů.**

Ověřovaný zdroj: `9b9813f8bd2facd4caf074a1eef6bbbc608d722f`. Prohlížečový přístup na `http://127.0.0.1:8098/app` nyní funguje. Všechny obchodní kroky níže proběhly klikáním a formuláři přes Browser Use, nikoli spuštěním dřívějšího API pilotu. Crew, CH a COO měli tři samostatné fiktivní Auth účty; přepínač vývojových rolí se nepoužíval.

## Co skutečně prošlo

| Průchod v obrazovkách | Výsledek |
|---|---|
| COO vytvoří klienta, projekt a dvě samostatné třídenní akce a přiřadí pracovníka | PASS. Projekt `GUI2210`, odběratel je koncový klient projektu. První akce 12.-14. 10., druhá 15.-17. 10. |
| Crew otevře vlastní výkazy a uloží neúplný koncept | PASS. První den 7 h, další dny zatím prázdné. Po zavření a znovuotevření zůstalo 7 h uložených |
| Odeslání neúplného výkazu | PASS. Aplikace odmítla chybějící časy a označila konkrétní datum |
| Crew odešle celý první výkaz, CH jej vrátí s důvodem, Crew opraví a znovu odešle, CH předá COO | PASS. Oprava prvního dne ze 7 na 8 h; konečný výkaz má 24 h a historie důvodu zůstala zachovaná |
| CH předá druhý úplný výkaz a COO schválí oba náhledy | PASS. U každé akce tři denní záznamy, 24 h × 250 Kč = 6 000 Kč, správný dodavatel a koncový odběratel |
| Jedna akce, několik denních záznamů, jeden podklad | PASS. Dvě samostatné akce vytvořily přesně dva podklady a následně dvě faktury |
| Crew nahraje vlastní PDF a CH jej skutečně stáhne a vrátí s důvodem | PASS. První verze měla záměrně chybný účet. Stažené bajty přesně odpovídaly prvnímu uploadu |
| Crew nahraje opravený originál a CH jej stáhne a přijme | PASS. Obě verze zůstaly v historii. Vznikl přijatý doklad `UI-2026-001` na 6 000 Kč; druhá verze má správný účet |
| Jednotlivý self-billing | PASS. Bez zaškrtnutí explicitního souhlasu nebylo možné potvrdit vystavení. Po potvrzení vznikla jedna faktura `SF-2026-89F2803A-0001` na 6 000 Kč a server dokončil PDF |
| Oddělení oprávnění | PASS v ovládaném UI. CH měl přijetí/vrácení originálu; COO měl záznam úhrady. Crew viděl pouze své dvě skutečné faktury a neměl tlačítka pro přijetí nebo úhradu |
| COO zaznamená úhradu obou dokladů | PASS. Obě faktury mají stav `paid` a záznam konkrétního COO i času |
| Nové přihlášení Crew a skutečné stažení obou PDF | PASS. Obě úhrady i částky zůstaly. Stažený přijatý originál je bajtově totožný s opravenou druhou verzí, nikoli s vrácenou první verzí |
| Obsah a vzhled PDF | PASS. Oba druhy mají jednu čitelnou stránku. Self-billing obsahuje správné číslo, identity, 24 h, celkem 6 000 Kč, data a účet. Chybějící IBAN je pravdivě uvedený, bez QR platby |
| Odkaz do nastavení fakturace na mobilní šířce | PASS po dokončení přechodu. Trvalý souhlas je vypnutý; rozhraní výslovně uvádí pouze budoucí schválení a vyžaduje zaškrtnutí |

Vytvoření nové faktury po zapnutí trvalého souhlasu se v tomto GUI běhu neopakovalo. To má dřívější samostatný integrační důkaz; současný průchod používá jednotlivý souhlas. Nejde o test dvou fyzických zařízení ani o nové ovládání nativního iPhonu.

## Potvrzené nálezy

### 1. Přehledy po vlastních změnách ukazují starší hodiny a počítadla

Po potvrzeném uložení konceptu ukazoval editor správných 7 h, ale karta seznamu stále 0 h. Po následném odeslání úplných 23 h ukázal editor 23 h / 5 750 Kč, zatímco souhrnná karta ještě 7 h / 1 750 Kč. Po opravě na 24 h se obdobně rozcházely souhrn a počítadla stavů. Nové přihlášení zobrazilo správná data.

Serverový výkaz, konečný schvalovací náhled, podklady i vystavené faktury měly správné hodnoty. Problém je v obnovení odběratelů dat po vlastním zápisu. Před širším pilotem je vhodné sjednotit obnovu seznamů, souhrnů a počítadel po uložení i přechodu kola; není tím prokázaná potřeba zavádět Realtime.

Důkaz: `saved-draft-stale-list.txt` a skutečné mezikroky Browser Use. Místa pro navazující opravu: `src/features/shift-workflows/SharedTimelogEntry.tsx`, `shift-evidence-write.ts`, `src/views/TimelogsView.tsx` a jejich odběratelé přehledových dat. Přesná příčina v kódu se v této kontrolní úloze neopravovala.

### 2. Jeden klik na PDF vytvoří dvě stažené kopie

Opakovaně se při jednom kliknutí stáhly dvě totožné kopie: název bez přípony pořadí a následně `(1)`. Po druhém stažení stejného přijatého originálu přibyly `(2)` a `(3)`. Obsah všech příslušných kopií souhlasil s očekávaným dokumentem.

Podezřelé místo je `src/features/invoices/services/invoice-pdf-download.ts:10`: nejprve se volá `window.open` s `noopener,noreferrer` a při prázdném návratu následně navigace stejného okna na tentýž odkaz. Potvrzeným výsledkem je dvojí download v tomto prohlížeči; dopad na ostatní prohlížeče se zde neměřil.

Důkazy: `own-download-check.private.json`, skutečné vrácené cesty Browser Use a stažené soubory. Oprava má zajistit jeden download na jeden klik bez ztráty možnosti stáhnout soubor při zablokování nového okna.

## Prostředí, ochrana dat a hranice výsledku

Původní lokální server neběžel a dočasné spouštěcí soubory již chyběly. Byl obnoven nad aktuálním ověřovaným main s výslovným lokálním API `http://127.0.0.1:55321`, bez načtení konfigurace Staff. Doplnily se místní závislosti a dvě již existující migrace aktuální aplikace. Všechna původní obchodní pole se rekurzivně porovnala před i po přípravě schématu. Žádný obchodní zápis ani testovací faktura nevstoupily do Staff; žádný nový hosted klíč, deployment nebo změna nativní instalace nebyly součástí této kontroly.

Před zapnutím lokálního PDF workeru se trvale zachytilo všech 24 existujících pending job řádků a dočasně se odložily. Kód všech 14 sledovaných souborů/assetů tří invoice funkcí souhlasil s obsluhovanými kopiemi; nastavení funkcí se lišilo pouze vysvětlujícím komentářem. Worker probudila skutečná UI operace přes trigger, Cron nebyl nainstalovaný. Jediná nová PDF úloha dokončila první pokus.

Dočasné odložení starých jobů na PostgreSQL `infinity` způsobilo u CH chybu načítání: přísný frontendový validátor správně odmítl 24 neplatných časů `available_at`. To je problém přípravy testu, nikoli chyba skutečných nových podkladů. Po dokončení workeru se dispatch vypnul a oplotil, doložila se skutečná dokončená HTTP odpověď a teprve poté se přesně obnovilo **24/24 celých původních řádků** a odstranil recorder. Validátor produkční aplikace se neoslaboval. Po obnově znovu prošel skutečný parser čerstvých Auth snapshotů za Crew, CH i COO a UI kontrola pokračovala přijetím originálu a oběma úhradami.

Závěrečné porovnání zachovalo **1 158/1 158 původních řádků přes 27 tabulek**, včetně všech původních finančních snapshotů a jobů. Konečný lokální stav: dispatch vypnutý, Cron 0, HTTP fronta 0, aktivní claimy 0, pomocné recordery 0. Nové označené testovací doklady zůstaly k prohlédnutí.

Původní podezření na nefunkční mobilní odkaz do nastavení se při cílené kontrole s čekáním na dokončení přechodu nepotvrdilo. Mobilní nastavení fungovalo při šířce 684 px; dočasný desktopový viewport byl před koncem zrušen. Dřívější přípravné chyby a čekání prohlížečového nástroje nejsou vydávané za dobu odezvy aplikace. Celá automatická sada aplikace se během této kontrolní úlohy znovu nespouštěla; produkční kód se neměnil.

Soukromé podklady jsou v `/Users/peetax/Projekty/.crewflow-ui-pilot-20261022/`: `final-verification.private.json`, `pdf-verification.private.json`, `cleanup.json`, `worker-drain.private.json`, příslušné snímky a DOM záznamy. Hesla, tokeny a úplné snímky původních dat zůstávají mimo Git. Ukázkové výsledky obrazovek: `coo-both-paid.jpg`, `crew-both-paid.jpg`, `crew-both-paid-mobile.jpg`, `mobile-billing-settings-pass.jpg`.
