# Crew: mobilní seznam a detail

Datum: 2026-10-12

## Cíl a rozhodnutí

Zlepšit rychlé hledání lidí pro obsazování akcí i kontrolu konkrétního člověka na telefonu. Volíme responzivní karty/řádky a detail s kontaktem nahoře. Pouhé zúžení stávající tabulky by ponechalo příliš mnoho administrativních sloupců; samostatná mobilní aplikace by zbytečně zdvojila data a navigaci.

## Seznam

Jedna sada položek: na mobilu karty, na desktopu řádky. Zobrazit jméno, město, hodnocení, přímý telefon/e-mail a poslední aktivitu. Sazba, dovednosti, spolehlivost, počet akcí i IČO/DIČ patří do detailu. Lokální hledání bez ohledu na diakritiku zahrnuje jméno, město a kontakt a kombinuje se s existujícím globálním hledáním. Počet výsledků a rozlišené prázdné stavy, bez dalších filtrů. Úprava a smazání v nabídce každého člověka; otevření detailu funguje klávesnicí. Hodnocení zůstává dostupné pouze managementu.

Poslední aktivitu zaznamenat při otevření přihlášené aplikace v popředí, návratu do popředí a interakci; nejvýše jednou za minutu. Nezaznamenávat anonymní, lokální ani vývojové impersonované relace. Nová tabulka `profile_activity` uchovává jeden serverový čas na profil; RPC bez parametrů odvozuje vlastní profil z auth.uid(). Přímé zápisy zakázány, čtení managementu a vlastnímu uživateli přes RLS. Seznam obnovuje aktivity jednou za minutu pouze v popředí; nezjištěný čas má popisek „Zatím bez aktivity“, chyba načtení „Aktivita nedostupná“. Žádný historický backfill z přihlášení nebo aktualizace profilu.

## Detail

Stejný detail a pořadí souhrnů pro CrewHead i COO; dostupné akce nadále podle oprávnění. Jméno, město, sazba a přímé kontakty nahoře. Aktuální přehled: nejbližší směna, počet a hodiny výkazů pending_ch/pending_coo ke schválení, samostatný počet vrácených/čekajících na potvrzení a odeslané faktury k proplacení. Proplacené faktury a schválené hodiny jsou v podružném souhrnu, popisky odpovídají rozsahu výpočtu.

Hlavní obsah tvoří tři přepínače: Směny, Výkazy a Faktury. Směny obsahují nadcházející přiřazené výkazy, seřazené podle nejbližšího pracovního dne. Výkazy zahrnují i staré drafty a vrácené záznamy a zachovávají společné schvalovací karty a oprávnění editoru. Na telefonu se historie zobrazuje kartami, na desktopu tabulkou. Odhad odměny je označen jako odhad a obsahuje hodiny, cestovné a povolené stravné. Faktury mají zalamovatelný identifikátor, částku, stav a datum i prázdný stav. Chybějící profil zobrazí návrat do seznamu, nesmí shodit obrazovku.

Sazba a poznámka jsou dostupné pod hlavním obsahem. Administrativní profil/fakturační údaje a fakturační graf jsou rozbalovací. Na mobilu se posouvá celá stránka, bez pevné výšky a skrytého vnořeného scrollu. Zachovat aktuální přiřazení a osobní read-only souhrn společné evidence, přesné UUID navigace a přístupová pravidla. Schéma se mění pouze přidáním evidence aktivity; bez změn existujících obchodních dat nebo nových závislostí.

## Ověření a dokončení

Testovat skutečné souhrny a filtry, nedostupný profil, přístup k draftům, editor podle role a kontaktní odkazy. Vizuálně zkontrolovat 375/390/412 px, desktop a tmavý režim v aplikaci na syntetických lokálních datech. Spustit cílené testy, kompletní sadu, build a kontrolu změněných souborů. Začlenit do synchronizovaného main v čisté kopii a spustit předepsanou obnovu simulátoru a telefonu; dostupnost a výsledek každého zařízení uvést zvlášť. Původní rozpracované soubory zachovat.
