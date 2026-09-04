# Mobilní formulář akce a oddělení termínu od směn

Datum: 2026-09-04

Stav: produktový směr odsouhlasen v konverzaci; písemné shrnutí čeká na kontrolu uživatele před implementačním plánem. Aplikace zatím nebyla změněna.

## Cíl a rozsah

Založení i úprava akce mají být na mobilu pohodlné a přehledné. Formulář nemusí vyžadovat plán pracovní doby na každý den. Termín celé akce se nesmí zaměňovat za denní směnu ani za skutečně vykázané hodiny.

Návrh má dvě navazující části:

1. Mobilní formulář a bezpečné oddělení termínu od předvyplňování výkazů. Tyto změny tvoří společný celek: samotné přejmenování nebo přesunutí polí by změnilo jejich význam bez opravy jejich použití.
2. Propojení kontaktní osoby s konkrétním schvalovatelem. Cílené schvalování je samostatná implementační oblast; tento návrh neznamená schválení nasazení staršího schvalovacího návrhu beze změn.

## Mobilní obrazovka

- Formulář zabírá celou dostupnou obrazovku včetně respektování horní a dolní bezpečné oblasti.
- Pevná hlavička a spodní hlavní akce; mezi nimi posuvný obsah. Otevřená klávesnice nesmí zakrýt právě upravované pole ani znemožnit uložení.
- Nad formulářem se nezobrazují ovladače podkladové obrazovky, přepínač rolí ani plovoucí tlačítko plus.
- Vytvoření: „Nová akce“ a „Vytvořit akci“. Úprava: „Upravit akci“ a „Uložit akci“.
- Převážně jeden sloupec, text editovatelných polí alespoň 16 px a dotykové cíle alespoň 44 px. Související krátká pole mohou být vedle sebe, pokud se vejdou bez ořezu.
- Zachovat existující projektové předvyplňování, mapový výběr a ochranu neuložených změn. Nevracet starší mobilní větev jako celek.
- Dresscode odstranit z tohoto formuláře, neodstraňovat historické hodnoty z dat.
- Adresa a vstup do mapového výběru zůstávají dostupné. Prázdná mapa nezabírá místo ve formuláři.
- Popis akce a Místo srazu jsou nepovinné, ale viditelné bez rozbalování.
- Pod Pokročilým nastavením zůstávají fáze/rozpis a existující nastavení návrhů časů od crew.

## Termín akce

### Jeden den

Jedno datum akce a časy Začátek / Konec. Konec musí být po začátku; přechod přes půlnoc se zadává pomocí Více dní a následujícího data.

### Více dní

Dvě zřetelně oddělené skupiny v přirozeném pořadí:

1. Začátek akce: datum začátku + čas začátku první den.
2. Konec akce: datum konce + čas konce poslední den.

Každá skupina má vlastní nadpis. Datum a čas mohou být vedle sebe, na úzké obrazovce se skládají pod sebe. Pořadí pro klávesnici i čtečku odpovídá vizuálnímu pořadí.

- Termín vyjadřuje hranice celé akce, nikoli každodenní pracovní dobu nebo nepřetržitou práci.
- Nezobrazovat denní interval typu „08:00–17:00“ jako souhrn vícedenní akce. Stačí počet kalendářních dní.
- Přepnutí na jeden den používá datum začátku i pro konec. Při opětovném zapnutí Více dní během stejné editace zachovat dříve zadané koncové datum; případný neplatný rozsah vyžaduje opravu.
- Datum i čas obou hranic musí tvořit platný interval. U vícedenní akce je možné začít první den později než je hodina konce posledního dne.
- Zakládání akce nevyžaduje každodenní rozpis. Plán směn/fází je volitelný.

## Pravidla předvyplňování výkazů

| Situace | Návrh časů nového záznamu |
| --- | --- |
| Existuje explicitní rozpis příslušného dne/fáze | Použít jeho plánované časy. |
| Jednodenní akce bez explicitního rozpisu | Nabídnout časy akce jako upravitelný návrh. |
| Vícedenní akce bez explicitního rozpisu pro daný den/fázi | Nechat Od / Do nevyplněné. |

Explicitní rozpis má přednost i u jednodenní akce. Žádný návrh sám o sobě není potvrzením odpracovaných hodin.

- Crew může navržené časy upravit podle skutečnosti.
- Rozpracovaný výkaz smí obsahovat nevyplněné časy. Neúplný záznam nevytváří odpracované hodiny a jeho součet nesmí být NaN.
- Odeslání ke kontrole vyžaduje úplné a platné časy všech odesílaných záznamů. Chyba musí označit konkrétní den/záznam; uživatelská data se nesmějí ztratit.
- Prázdný čas se při otevření, automatickém uložení ani opětovném načtení nesmí změnit na 08:00 nebo 17:00.
- Pouhé otevření výkazu nepovažovat za potvrzení návrhu.
- Stejná pravidla platí pro mobilní i desktopový editor a všechny vstupy pro vytvoření nebo odeslání výkazu.

## Datové hranice a kompatibilita

Oddělit tři významy: termín celé akce, volitelný plán směn a skutečně vykázané hodiny. Časy hranic nesmějí být univerzální záložní hodnotou pro každý den.

Současné `event.startTime` / `event.endTime` slouží také jako denní předvolba v `resolveTimelogDayDefaults` (`src/features/timelogs/services/timelog-day-ui.ts`) a v normalizaci/synchronizaci v `src/features/events/services/events.service.ts`. V `src/components/modals/MobileTimelogEditModal.tsx` je nutné zohlednit nové prázdné rozpracované hodnoty. Implementační plán musí dohledat i ostatní čtenáře a zapisovače těchto polí.

- Nový význam musí být v uložených datech jednoznačně odlišen od starého, například oddělenými poli s explicitní verzí významu. Konkrétní schéma patří do implementačního plánu po ověření aktuálního úložiště.
- Historické denní předvolby nepřeklasifikovat hromadně na hranice akce bez spolehlivého podkladu. Staré události musí zůstat čitelné s dosavadním významem, dokud je uživatel výslovně neupraví do nového modelu.
- Změna termínu nesmí přepsat již vyplněné výkazy, včetně rozpracovaných. Existující explicitní rozpis nesmí být přepsán jen změnou hranic akce.
- Zkrácení termínu nesmí tiše smazat výkazy mimo nový rozsah. Záznamy zůstávají dostupné.
- Zachovat současná pravidla časových pásem a směn přes půlnoc; nevytvářet výpočet odpracovaných hodin z délky celé akce.

## Kontakt a schvalování

- Kontaktní osoba je povinná a viditelná v hlavním formuláři. Crew v detailu akce potřebuje její identitu a dostupný telefon.
- Kontakt a schvalovatel jsou oddělené vztahy, i když často směřují na stejnou osobu.
- „Schvaluje také hodiny“ je výchozí volba pro kontakt, který má odpovídající schvalovací oprávnění.
- Po vypnutí se zobrazí výběr konkrétního schvalovatele COO. Pokud kontakt nemá oprávnění schvalovat, je nutné zvolit oprávněného schvalovatele; výběr kontaktu nikdy neuděluje novou roli.
- Zamýšlená posloupnost: kontrola CH, následně konkrétní schvalovatel COO. Případní další schvalovatelé se řeší při předání výkazu, ne povinně při založení akce.
- Ve formuláři nezobrazovat vysvětlení „Po tvé kontrole jako CH“, „Nejdřív kontrola CH, potom schválení kontaktní osobou“ ani „Další schvalovatele můžeš přidat při předání výkazu“.
- Před ostrým zapojením ověřit a samostatně naplánovat návaznost na `2026-08-19-targeted-timelog-approvals-design.md`. Pouhý výběr v UI nestačí: uložení, směrování výkazu a serverová oprávnění musí odpovídat zvolené osobě.
- Nenaznačovat funkční cílené schvalování v nasazeném formuláři, dokud není skutečně vynuceno. Tato část není záminkou k zavedení automatické fakturace ani k rozšíření oprávnění.

## Ověření před realizací a při implementaci

Náhled slouží k ověření rozložení. Neukládá skutečné akce, neimplementuje výkazy ani mapový výběr. Ukázková jména nejsou skutečná data.

Požadované testovací případy pro implementační plán:

- Mobilní šířky 320, 360 a 414 px, světlý/tmavý režim, klávesnice, bezpečné oblasti a posuv při otevřeném formuláři.
- Správné nadpisy a tlačítka pro vytvoření/úpravu, bez překrytí rolí nebo podkladovým plus.
- Přepnutí Jeden den / Více dní bez ztráty časů, zachování koncového data a správné pořadí polí.
- Akce pátek 14:00 až neděle 18:00 nesmí nabídnout směnu 14:00–18:00 pro každý den ani účtovat celé trvání.
- Jednodenní návrh, explicitní rozpis s předností a chybějící rozpis pouze některého dne.
- Uložení a opětovné načtení prázdného konceptu, nulový příspěvek neúplného záznamu k součtu, zákaz odeslání neúplného výkazu.
- Změna termínu bez přepsání historických hodnot, explicitních směn a existujících výkazů.
- Povinný kontakt, odlišný schvalovatel, kontakt bez oprávnění a zákaz automatického přidělení role.
- Viditelné nepovinné Popis akce / Místo srazu, chybějící dresscode v editoru, zachování jeho historických dat.

Při realizaci aplikace dodržet `AGENTS.md`: ověřená integrace do main, synchronizace s origin/main a aktualizace vývojových instalací. Dokumentace a samostatný náhled v této fázi nemění aplikaci ani instalace.
