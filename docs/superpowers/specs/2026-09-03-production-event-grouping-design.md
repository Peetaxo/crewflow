# Propojení směn jedné akce pro fakturaci

Datum: 2026-09-03

Stav: Uživatel schválil směr a správu propojení pouze produkcí. Tento písemný návrh čeká na kontrolu před implementačním plánem. Součástí kontroly je níže uvedené mapování produkce na současná oprávnění.

## Cíl a první etapa

Umožnit produkci výslovně propojit samostatně vypsané části jedné skutečné akce, například nakládku, instal a deinstal. Propojení vytvoří spolehlivý základ pro jednu fakturu jednoho člena crew za celou akci.

První samostatná implementační etapa zahrnuje správu tohoto propojení a jeho zobrazení. Upload faktur, vytěžování údajů, schvalování dokumentů a předání účetním budou navazující etapou. Tato první etapa sama neodstraní ruční přenos faktur do PowerApps.

## Potvrzená rozhodnutí

- Jeden Job Number může obsahovat více různých skutečných akcí. Není identitou akce pro fakturaci.
- Jedna skutečná akce může mít více samostatně vypsaných částí.
- Části jedné akce propojuje pouze produkce. Crew propojení nevytváří ani neupravuje.
- Propojení nemění způsob vypisování, obsazování nebo schvalování jednotlivých směn.
- Pro první verzi příjmu faktur je cílem jedna aktivní faktura jednoho dodavatele za jednu skutečnou akci, s historií opravených verzí.
- Cílově půjde nahrát vlastní fakturu společně s výkazy nebo později. Nahrání nebude znamenat automatické schválení k proplacení.

Omezení „pouze produkce“ se v tomto návrhu vztahuje na propojování směn. Budoucí nahrávání vlastní faktury členem crew zůstává součástí dohodnutého směru; v první etapě se ještě nepřidává.

## Návaznost na současnou aplikaci

Současný typ `Event` v `src/types.ts` představuje samostatně vypsanou položku a může obsahovat více dnů a fází. Několik těchto položek může podle uživatele dohromady tvořit jednu skutečnou akci. Návrh jejich existující identitu zachovává.

Současné faktury už mohou odkazovat na více výkazů a událostí. Jejich existující vazby, částky, dokumenty ani stavy se touto etapou nemění. Nové skupiny se zpětně neodvozují z historických faktur.

Současné `EventsView` a `EventDetailView` povolují správu akcí rolím `crewhead` a `coo`. Samostatná role `produkce` v typu `Role` není.

### Navržené mapování oprávnění ke kontrole

Pro tuto funkci bude produkce znamenat současné správce akcí: `crewhead` a `coo`. Role `crew` má pouze čtení informací, ke kterým již má přístup. Nevzniká nová role ani nové oprávnění spravovat samotné události.

Toto mapování je návrhem k potvrzení, nikoli tvrzením, že uživatel výslovně označil všechny CrewHead za produkci. Pokud produkce znamená jinou množinu lidí, musí se návrh upravit před implementací; nelze to obejít plošným povolením všem přihlášeným.

## Zvolený přístup

Přidat explicitní společnou vazbu pro související události. Skupina má vlastní stabilní identitu a srozumitelný název skutečné akce. Job Number slouží pouze jako kontext projektu.

Alternativy:

- Výběr událostí členem crew až při uploadu faktury: menší příprava na straně produkce, ale rozdílné zařazení stejných směn různými lidmi. Uživatel tento způsob propojování pro první verzi nechce.
- Automatické seskupování podle Job Number, názvu nebo data: neodpovídá potvrzeným pravidlům. Shoda těchto údajů nesmí sama vytvořit členství ve skupině.

## Pravidla propojení

1. Samostatná nepropojená událost zůstává samostatnou akcí. Produkce nemusí vytvářet skupinu pro každou položku.
2. Jedna vypsaná událost může patřit nejvýše do jedné skupiny.
3. V první verzi skupina patří do jednoho projektu a propojuje pouze události tohoto projektu. Stejný textový Job Number bez platné projektové vazby není dostatečný důkaz příslušnosti.
4. V jednom projektu může existovat libovolný počet oddělených skupin i samostatných akcí.
5. Produkce může skupinu vytvořit, pojmenovat a přiřadit k ní existující události. Stejnou vazbu může nastavit i při zakládání nové události.
6. Při odebrání události ze skupiny se událost nesmaže; stane se samostatnou akcí. Pokud zůstane ve skupině jediná událost, skupina si zachová identitu. Odstranit lze jen prázdnou skupinu, na kterou neodkazuje faktura.
7. Přesun události z jiné skupiny vyžaduje výslovné potvrzení. Stejně tak změna projektu nesmí zanechat neplatné členství ve skupině původního projektu.
8. Propojení nepřepisuje původní názvy, data, obsazení, výkazy, sazby, schvalovatele ani schvalovací stavy.
9. Historická data se automaticky neslučují. Produkce propojuje jen konkrétní vybrané položky.

## Chování v aplikaci

### Produkce

V detailu události bude dostupná akce „Propojit směny“. Produkce zvolí existující společnou akci ve stejném projektu nebo založí novou a vybere související události. U položek uvidí původní název a termín, aby odlišila různé akce stejného projektu. Formulář pro založení nebo úpravu události umožní vybrat již existující společnou akci.

Před uložením bude vidět výsledný seznam členů skupiny a případné přesuny z jiných skupin. Po úspěšném uložení se v detailu objeví společný název a související položky, které má přihlášený uživatel právo zobrazit.

### Crew

Crew neuvidí ovládání pro vytváření, přejmenování nebo změnu členství. U svých dostupných událostí uvidí společný název akce a vlastní související výkazy. Přihlášení a obsazování zůstává po jednotlivých vypsaných položkách.

Členství ve skupině samo nezpřístupní další skryté události, výkazy jiných lidí, jejich sazby ani souhrnné náklady produkce.

## Rozdělení odpovědností a tok dat

- Správa skupin uchovává stabilní identitu, název, projekt a členství. Zodpovídá za validaci změn a kontrolu oprávnění.
- Detail události umožňuje oprávněné produkci změnu navrhnout a potvrdit. Crew používá pouze čtecí variantu.
- Přehled souvisejících výkazů vybírá konkrétní výkazy dostupné aktuálnímu uživateli. Neodvozuje oprávnění jen ze znalosti ID skupiny.
- Budoucí příjem faktury použije identitu skupiny nebo samostatné události a uloží přesné zahrnuté výkazy. Není součástí ukládání skupiny.

Změny musí být ověřené na serveru, nikoli jen skrytím tlačítka. Při neúspěšném uložení se zobrazí chyba a stav nesmí budit dojem úspěšného propojení. Vícečlenná změna se uloží jako celek nebo vůbec; souběžná změna jinou produkcí vyžaduje obnovení a nové potvrzení výběru, ne tiché přepsání.

## Návaznost na budoucí fakturu

Faktura bude spojena s dodavatelem a konkrétní skutečnou akcí. Současně musí uchovat přesné zahrnuté výkazy a podklady platné při podání; nesmí být dynamickým součtem všech budoucích členů skupiny.

Dodatečné připojení, přejmenování nebo přesun směny nesmí potichu změnit již podanou fakturu. Změna výkazů zahrnutých do faktury bude důvodem ke kontrole nesouladu. Původní dokument a jeho vazby zůstanou dohledatelné. Pravidla oprav, uzavření akce a dalších později doplněných výkazů se rozpracují v samostatném návrhu příjmu faktur před jeho implementací.

## Ověření první etapy

- Dvě různé skutečné akce se stejným Job Number zůstanou oddělené.
- Nakládka, instal a deinstal jedné akce lze výslovně propojit, i když mají různé termíny.
- Jedna běžná nepropojená událost funguje beze změny.
- Crew nemůže propojení změnit ani přímým požadavkem mimo UI.
- Produkce nemůže propojit položky různých projektů nebo tiše přepsat cizí souběžnou změnu.
- Odebrání či přesun člena nemaže událost, výkaz ani historické podklady faktury.
- Připojení člena nerozšíří viditelnost skrytých událostí ani údajů jiných členů crew.
- Mobilní a desktopová varianta dodržují stejná pravidla oprávnění a členství.
- Regresní testy ověří, že obsazování, editace událostí, schvalování hodin a současné faktury zůstaly funkční.

## Mimo rozsah této etapy

- Upload a automatické vytěžování faktur, jejich nové stavy a schvalování.
- Vystavování faktur za crew a souhlasy s tímto postupem.
- Role účetní, přehled k proplacení a automatické předání mimo aplikaci.
- Nové napojení PowerApps nebo změny tamního Document Approval.
- Přepracování kalendáře, obsazování nebo schvalování hodin.
- Slučování rozdílných skutečných akcí do jedné faktury.
- Automatické změny historických dat nebo produkční databáze.

## Další krok

Po kontrole tohoto dokumentu a potvrzení mapování produkčních oprávnění vznikne implementační plán pouze pro první etapu. Následná realizace musí respektovat aktuální projektový postup v `AGENTS.md`, včetně ověření a aktualizace vývojových instalací aplikace. Tento dokument sám není implementací ani nasazením.
