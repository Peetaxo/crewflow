# Produkcí řízené skupiny pro společnou fakturaci

Datum: 2026-09-03

Stav: Schváleno uživatelem 2026-09-03, včetně rolí CrewHead a COO a volitelné společné fakturace přes více Job Number. Uživatel zdůraznil, že půjde o výjimečnou možnost, nikoli výchozí chování. Následuje implementační plán první etapy.

## Cíl a první etapa

Umožnit produkci výslovně určit, které vypsané události se mají fakturovat společně. Běžným případem jsou části jedné skutečné akce, například nakládka, instal a deinstal. Volitelně může skupina zahrnovat i různé skutečné akce, včetně akcí s různými Job Number, aby jednomu členovi crew stačila jedna společná faktura.

Jde o skupinu pro fakturaci, nikoli o sloučení akcí nebo projektů. Výchozím chováním zůstávají samostatné akce; společnou fakturaci vždy výslovně nastavuje produkce.

První samostatná implementační etapa zahrnuje správu tohoto propojení a jeho zobrazení. Upload faktur, vytěžování údajů, schvalování dokumentů a předání účetním budou navazující etapou. Tato první etapa sama neodstraní ruční přenos faktur do PowerApps.

## Potvrzená rozhodnutí

- Jeden Job Number může obsahovat více různých skutečných akcí. Není identitou akce pro fakturaci.
- Jedna skutečná akce může mít více samostatně vypsaných částí.
- Části jedné akce propojuje pouze produkce. Crew propojení nevytváří ani neupravuje.
- Pro tuto funkci jsou produkcí obě uživatelem potvrzené role: `crewhead` a `coo`.
- Propojení nemění způsob vypisování, obsazování nebo schvalování jednotlivých směn.
- Cílově půjde nahrát vlastní fakturu společně s výkazy nebo později. Nahrání nebude znamenat automatické schválení k proplacení.

Schválené pravidlo: cílem příjmu faktur bude jedna aktivní faktura jednoho dodavatele za jednu produkcí určenou fakturační skupinu, nebo za jednu samostatnou nepropojenou událost, s historií opravených verzí. Toto pravidlo nahrazuje původní striktní omezení na jednu skutečnou akci.

Omezení „pouze produkce“ se v tomto návrhu vztahuje na propojování směn. Budoucí nahrávání vlastní faktury členem crew zůstává součástí dohodnutého směru; v první etapě se ještě nepřidává.

## Návaznost na současnou aplikaci

Současný typ `Event` v `src/types.ts` představuje samostatně vypsanou položku a může obsahovat více dnů a fází. Několik těchto položek může podle uživatele dohromady tvořit jednu skutečnou akci. Návrh jejich existující identitu zachovává a nezavádí novou provozní hierarchii akcí.

Současné faktury už mohou odkazovat na více výkazů a událostí. Jejich existující vazby, částky, dokumenty ani stavy se touto etapou nemění. Nové skupiny se zpětně neodvozují z historických faktur.

Současný `resolveSingleInvoiceClient` v `src/features/invoices/services/invoice-customer-resolution.ts` odvozuje odběratele přes projekt a jeho klienta. Pro budoucí příjem crew faktur nelze bez ověření předpokládat, že koncový klient projektu je také firmou, které crew fakturuje. Tato etapa resolver nemění a jeho výsledek nepovažuje za automatické schválení společné faktury.

Současné `EventsView` a `EventDetailView` povolují správu akcí rolím `crewhead` a `coo`. Samostatná role `produkce` v typu `Role` není.

### Potvrzená oprávnění

Pro tuto funkci produkce znamená současné správce akcí: `crewhead` a `coo`. Uživatel výslovně potvrdil obě role. Role `crew` má pouze čtení informací, ke kterým již má přístup. Nevzniká nová role ani nové oprávnění spravovat samotné události.

## Zvolený přístup

Přidat explicitní skupinu pro společnou fakturaci. Skupina má vlastní stabilní identitu a srozumitelný název. Může zahrnovat několik částí jedné akce nebo několik samostatných akcí. Job Number a projekt patří nadále jednotlivým událostem, nikoli celé skupině.

Tím se oddělí provozní evidence od společného dokladu bez nutnosti budovat současně druhou hierarchii skutečných akcí. Skupina sama nevytváří fakturu ani nepotvrzuje, že všechny její položky již lze proplatit.

Alternativy:

- Výběr událostí členem crew až při uploadu faktury: menší příprava na straně produkce, ale rozdílné zařazení stejných směn různými lidmi. Uživatel tento způsob propojování pro první verzi nechce.
- Zachování striktně stejného projektu pro celou skupinu: jednodušší výběr, ale neumožní uživatelem nově navržené výjimky. Revidovaný návrh proto tuto podmínku odstraňuje.
- Automatické seskupování podle Job Number, názvu nebo data: neodpovídá potvrzeným pravidlům. Shoda těchto údajů nesmí sama vytvořit členství ve skupině.

## Pravidla propojení

1. Samostatná nepropojená událost zůstává samostatnou akcí. Produkce nemusí vytvářet skupinu pro každou položku.
2. Jedna vypsaná událost může patřit nejvýše do jedné skupiny.
3. Skupina nemá jediný nadřazený projekt a může obsahovat události různých projektů a Job Number. Každá událost si zachovává vlastní projektovou vazbu.
4. V jednom projektu může existovat libovolný počet oddělených skupin i samostatných akcí. Ani shodný projekt, ani shodný Job Number nezakládá členství automaticky.
5. Produkce může skupinu vytvořit, pojmenovat a přiřadit k ní existující události. Stejnou vazbu může nastavit i při zakládání nové události.
6. Při odebrání události ze skupiny se událost nesmaže; stane se samostatnou akcí. Pokud zůstane ve skupině jediná událost, skupina si zachová identitu. Odstranit lze jen prázdnou skupinu, na kterou neodkazuje faktura.
7. Přesun události z jiné skupiny vyžaduje výslovné potvrzení. Připojení dalšího projektu do skupiny zobrazí upozornění a rozpis projektů před uložením; nesmí přepsat původní projekt žádné události.
8. Propojení nepřepisuje původní názvy, data, obsazení, výkazy, sazby, schvalovatele ani schvalovací stavy.
9. Historická data se automaticky neslučují. Produkce propojuje jen konkrétní vybrané položky.
10. Produkce musí mít oprávnění spravovat všechny události dotčené změnou. Znalost identity skupiny ani přístup k jedné její události neopravňuje ke změně jiných událostí.

## Chování v aplikaci

### Produkce

V detailu události bude dostupná akce „Společná fakturace“. Produkce zvolí existující fakturační skupinu nebo založí novou a vybere související události. Výběr nejprve nabídne události aktuálního projektu; volba „Zahrnout jiné projekty“ umožní výslovně rozšířit hledání. U položek bude původní název, termín, projekt a Job Number, aby se různé akce nedaly snadno zaměnit. Formulář pro založení nebo úpravu události umožní vybrat již existující fakturační skupinu; i zde se připojení do skupiny přes více projektů výslovně potvrdí.

Před uložením bude vidět výsledný seznam členů skupiny s rozdělením podle projektů a případné přesuny z jiných skupin. Po úspěšném uložení se v detailu objeví název fakturační skupiny a související položky, které má přihlášený uživatel právo zobrazit. Kalendář a seznam provozních akcí se nesloučí.

### Crew

Crew neuvidí ovládání pro vytváření, přejmenování nebo změnu členství. U svých dostupných událostí uvidí název fakturační skupiny a vlastní související výkazy, s rozlišením původní akce a Job Number. Přihlášení a obsazování zůstává po jednotlivých vypsaných položkách. Společná skupina pro produkci neznamená jednu fakturu za více členů crew: každý dodavatel fakturuje pouze své výkazy.

Členství ve skupině samo nezpřístupní další skryté události, výkazy jiných lidí, jejich sazby ani souhrnné náklady produkce.

## Rozdělení odpovědností a tok dat

- Správa skupin uchovává stabilní identitu, název a členství. Projekty jsou vlastností jednotlivých událostí. Správa zodpovídá za validaci změn a kontrolu oprávnění ke všem dotčeným událostem.
- Detail události umožňuje oprávněné produkci změnu navrhnout a potvrdit. Crew používá pouze čtecí variantu.
- Přehled souvisejících výkazů vybírá konkrétní výkazy dostupné aktuálnímu uživateli. Neodvozuje oprávnění jen ze znalosti ID skupiny.
- Budoucí příjem faktury použije identitu skupiny nebo samostatné události a uloží přesné zahrnuté výkazy. Není součástí ukládání skupiny.

Změny musí být ověřené na serveru, nikoli jen skrytím tlačítka. Při neúspěšném uložení se zobrazí chyba a stav nesmí budit dojem úspěšného propojení. Vícečlenná změna se uloží jako celek nebo vůbec; souběžná změna jinou produkcí vyžaduje obnovení a nové potvrzení výběru, ne tiché přepsání.

## Návaznost na budoucí společnou fakturu

Faktura bude spojena s jedním dodavatelem a fakturační skupinou nebo samostatnou událostí. Současně musí uchovat přesné zahrnuté výkazy a podklady platné při podání; nesmí být dynamickým součtem všech budoucích členů skupiny.

Pro příjem společné faktury navrhujeme tato produktová omezení:

- Jeden dodavatel, jedna skutečná odběratelská firma a jedna měna. První verze bude používat CZK. Odlišná odběratelská firma se nesmí skrýt pod jeden doklad jen proto, že produkce akce propojila.
- Odběratelem je firma, které crew fakturuje, nikoli automaticky koncový klient akce. Pokud skutečný odběratel chybí nebo položky nemají stejného odběratele, společnou fakturu nelze přijmout ke schválení. Produkce musí zadání rozdělit nebo opravit; systém si firmu nedomyslí.
- Rozpis po konkrétních akcích a Job Number. U každé části bude částka a zahrnuté výkazy; součet rozpisu musí odpovídat fakturované částce na stejné bázi. Pouhé vytěžení celkové částky z dokumentu tento rozpis nenahrazuje.
- Žádný výkaz nelze zahrnout do dvou aktivních faktur. Historie nahrazených verzí se nepovažuje za další aktivní fakturaci.
- Ke schválení celé faktury musí být vyřešeny všechny zahrnuté výkazy. Čekání nebo nesoulad u jedné akce může pozdržet celý společný doklad. Proto společná fakturace není automatickým výchozím chováním.

Tato pravidla popisují navazující etapu příjmu dokumentů, ne nový schvalovací mechanismus v první etapě skupin.

Dodatečné připojení, přejmenování nebo přesun směny nesmí potichu změnit již podanou fakturu. Změna výkazů zahrnutých do faktury bude důvodem ke kontrole nesouladu. Původní dokument a jeho vazby zůstanou dohledatelné. Pravidla oprav, uzavření akce a dalších později doplněných výkazů se rozpracují v samostatném návrhu příjmu faktur před jeho implementací.

## Ověření první etapy

- Bez výslovného propojení produkcí zůstanou dvě různé skutečné akce se stejným Job Number oddělené i pro fakturaci.
- Nakládka, instal a deinstal jedné akce lze výslovně propojit, i když mají různé termíny.
- Produkce může po výslovném potvrzení propojit události s různými projekty a Job Number; původní identita, projekt a rozpis položek zůstanou zachované.
- Jedna běžná nepropojená událost funguje beze změny.
- Crew nemůže propojení změnit ani přímým požadavkem mimo UI.
- Produkce nemůže propojit položky mimo svá oprávnění nebo tiše přepsat cizí souběžnou změnu. Samotný rozdílný projekt není důvodem zákazu.
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
- Samotné vytváření či příjem jedné faktury za více akcí: první etapa umožní pouze připravit příslušnou skupinu. Nesmí tuto možnost vydávat za hotový fakturační proces.
- Sloučení provozních akcí, projektů nebo jejich rozpočtů do jedné identity.
- Automatické změny historických dat nebo produkční databáze.

## Další krok

Na schválený návrh navazuje implementační plán pouze pro první etapu. Oprávnění pro CrewHead i COO i výjimečné propojení přes více Job Number jsou potvrzená a není potřeba se na ně ptát znovu. Následná realizace musí respektovat aktuální projektový postup v `AGENTS.md`, včetně ověření a aktualizace vývojových instalací aplikace. Tento dokument sám není implementací ani nasazením.
