# Společná evidence směn a podklady pro fakturu člena crew

Datum: 2026-09-04

Stav: Uživatel potvrdil produktový směr a chování společné evidence. Tento písemný návrh čeká na závěrečnou kontrolu před implementačním plánem. Nejde o hotovou funkci ani o souhlas s nasazením dalších změn do Staff.

## Stručně pro uživatele

Produkce může propojit přípravy, instalaci a deinstalaci. Člen crew otevře evidenci z kterékoliv své propojené směny a vždy se dostane do stejného společného výkazu. Uvnitř vyplňuje hodiny odděleně podle směn, ale údaje ukládá a výkaz odesílá z jednoho místa. Směna, na kterou není přiřazený, se mu v této evidenci vůbec nezobrazí.

Schvalovatel vidí rozpis i součet a může příslušný krok schválit společně. Nadále se dodržují současná oprávnění a pořadí schvalování.

Nezávisle na propojení směn může produkce v detailu člověka vybrat podklady pro jednu fakturu. Výběr může obsahovat jednu akci, související směny nebo například deset starších nesouvisejících akcí s různými jobnumber. Výběr pro Petra neovlivní Janu a nevytvoří provozní vazbu mezi těmito akcemi.

## Co tento návrh nahrazuje

Nahrazuje produktové pojetí v `2026-09-03-production-event-grouping-design.md`, které spojovalo provozní propojení a rozsah faktury do jedné obecné fakturační skupiny spravované z detailu akce.

Původní implementace na `609ee4f` zůstává výchozím stavem, nikoli cílovým chováním. Zejména se ruší předpoklady, že faktura musí odpovídat právě jedné obecné skupině a že propojení nemůže měnit společný způsob vykazování a schvalování. Přesné historické vazby faktur se tím neruší ani nepřepisují.

## Potvrzené požadavky

- Podporovat obě nezávislé funkce: propojené směny pro společný proces a individuální výběr podkladů pro jednu fakturu.
- Propojení a výběr podkladů spravují CrewHead a COO. Crew je nespravuje, ale vyplňuje vlastní evidenci.
- Správu přesunout do detailu crew. Detail akce zůstává vstupem do evidence, nikoli místem editoru fakturační skupiny.
- Jedna nepropojená akce musí fungovat bez povinného zakládání jakékoliv skupiny.
- Propojení je výslovná volba produkce. Nikdy nevzniká automaticky podle jobnumber, názvu nebo data.
- Shodné jobnumber může patřit různým akcím; odlišné jobnumber samo nebrání společné faktuře.
- Přípravy, instalace a deinstalace zůstávají samostatnými vypsanými položkami pro plánování a obsazení.
- Z libovolné přiřazené propojené směny se otevírá stejná evidence stejného člověka, nikoli její kopie.
- Ve společném výkazu nejsou ani prázdné či zamčené sekce nepřiřazených směn. Nejsou tam vůbec.
- Viditelnost samotných akcí v kalendáři nebo nabídce směn se tím nemění.
- Rozpracované hodiny lze doplňovat průběžně. Odeslání a kontrola proběhnou společně za příslušné části člověka.
- Podklady pro fakturu lze připravit před dokončením schvalování. Uložení výběru samo nic nevystavuje, neschvaluje ani neposílá účetním.

## Dvě samostatné vazby

### A. Propojení směn a společný výkaz člověka

Propojení uchovává stabilní identitu a přesný seznam vypsaných směn. Jedna směna patří nejvýše do jednoho aktivního provozního propojení, aby její evidence neměla dva různé společné kontexty.

Společný výkaz je nadřazený pracovní kontext konkrétního crew profilu. Obsahuje jeho kanonické výkazy za relevantní přiřazené směny. Nejde o jeden výkaz za celou crew. Původní výkazy a jejich řádky zůstávají zdrojem hodin, cestovného, poznámek, sazeb, projektových vazeb a historie.

Propojení se uplatní na příslušné členy crew, ale nikomu nevytvoří nové přiřazení. Člověku přiřazenému ke dvěma ze tří směn vzniká dvoučástový přehled. U člověka s jedinou přiřazenou směnou zůstane jediná část. Žádná směna jiného člověka se nepřenese.

### B. Individuální výběr podkladů pro fakturu

Výběr má vlastní identitu, jednoho dodavatele a přesný seznam jeho podkladů. Není odvozený pouze z aktuálního členství směn a nesmí se samovolně rozšiřovat při připojení další směny.

Může obsahovat podklady z několika propojených procesů i jednotlivé samostatné výkazy. Výběr celé propojené akce je zkratka pro výběr konkrétních podkladů, nikoli povinnost vždy fakturovat celou skupinu. Fakturační výběr nemění již provedená schválení hodin.

Výběr není faktura ani označení podkladů za vyfakturované. Finální doklad bude odkazovat na přesné zahrnuté podklady a jejich ověřenou podobu. Součet po směnách a jobnumber zůstane dohledatelný i při jedné souhrnné faktuře.

## Ovládání

### Produkce v detailu crew

- `Propojit směny` otevře jednoduchý výběr souvisejících vypsaných směn. Před potvrzením jasně uvede, že jde o společné provozní propojení uplatněné i na další přiřazené lidi, ne pouze o fakturu právě otevřeného člověka.
- `Vybrat podklady pro fakturu` pracuje pouze s výkazy tohoto člověka. Nabídne vyhledávání, stav schválení, původní akci, jobnumber, datum a částku. Zobrazí součet i počet položek.
- Formulář nebude vyžadovat vymyšlení názvu „fakturační skupiny“. Přehled se označí podle souvisejících směn; stabilní identita na zobrazovaném názvu nezávisí.
- Položka použije název směny a jobnumber, pod nimi termín. Název projektu se přidá jen tehdy, pokud pomáhá odlišit položku; shodný název projektu a směny se zbytečně neopakuje.
- Přidání dalšího projektu nebo přesun směny z existujícího propojení musí mít srozumitelný náhled dopadu a výslovné potvrzení. Původní projekty se nemění.

### Crew

Tlačítko `Evidence práce` v libovolné vlastní propojené směně vyřeší její společný kontext a otevře stejný formulář. Přímý vstup z přehledu výkazů používá tentýž kontext, aby nevznikla druhá cesta s jinými daty.

Formulář má části podle přiřazených směn a jejich skutečných dnů. Dny mezi přípravami a instalací se automaticky nestávají pracovními dny. Každá část zachová současná pole evidence a validaci; pod nimi je součet. `Uložit rozpracované` uloží zadané údaje a `Odeslat ke schválení` odešle přesně zobrazené způsobilé části v jednom společném kroku.

### Schvalovatel

Jeden přehled pro jednoho člověka obsahuje rozpis všech jeho částí, součet a stavy. Společné schválení znamená provedení aktuálního oprávněného kroku nad přesnou množinou výkazů, ne přeskočení CH, COO ani případných existujících dalších podmínek. Při rozdílných oprávněních se nic mimo oprávnění nepřidá potichu; přehled vysvětlí, proč nelze schválit celý výběr najednou.

Samotné dokončení schválení hodin nevytvoří fakturu ani ji nepředá k proplacení. Před implementací se ověří i existující serverové triggery a návazné operace, aby tento požadavek platil skutečně na serveru, ne pouze v novém formuláři.

## Navržená bezpečná pravidla první implementace — ke kontrole

Tato pravidla doplňují odsouhlasený běžný průchod a jsou součástí písemného návrhu, který uživatel ještě zkontroluje.

1. **Průběžné ukládání:** chybějící údaje v pozdější směně nebrání uložení rozpracované evidence. Při odeslání musí všechny zahrnuté části projít současnou validací. Prázdná část se tiše nevynechá a plánovaný čas se nepovažuje automaticky za skutečně odpracovaný.
2. **Společné rozhodnutí:** odeslání, příslušné schválení nebo vrácení aktuálního společného kola se uloží jako celek, nebo vůbec. Vrácení celku zachová vyplněné údaje; schvalovatel označí důvod a dotčenou část. Opravené společné kolo projde potřebným schválením znovu. Historická samostatná schválení se zpětně nepřepisují.
3. **Změny členství:** první implementace dovolí vytvořit nebo změnit provozní propojení pouze tehdy, pokud všechny dotčené existující výkazy zůstávají v rozpracovaném stavu a nejsou součástí aktivního výběru faktury. Jakmile začalo schvalování, změna propojení se odmítne s vysvětlením. Starší schválené akce lze stále spojit pro fakturu pomocí nezávislé funkce B.
4. **Změna přiřazení:** existující pravidla přiřazení a ochrany odeslaných výkazů zůstávají v platnosti. U rozpracované evidence se po změně přiřazení obnoví skutečný seznam částí. Již odeslané společné kolo má přesný seznam výkazů; nově přidané přiřazení se do něj samo neodešle. Nová část se ukáže samostatně jako čekající na další odeslání, nikoli jako již schválená.
5. **Výběr pro fakturu:** může obsahovat rozpracované i schvalované podklady, ale zobrazuje, na co čeká. Jeden podklad patří nejvýše do jednoho aktivního uloženého výběru nebo aktivní faktury. Zrušení přípravného výběru uvolní jeho položky bez změny hodin či schválení; zrušení skutečné faktury zůstává samostatnou operací s vlastní historií.
6. **Předání faktury:** vyžaduje všechny zahrnuté podklady schválené, ověřeného dodavatele a skutečného odběratele, shodnou měnu a kontrolu částky na stejné výpočtové bázi. Chybějící či změněný podklad nezmizí z výběru potichu; další krok se zastaví a vyžádá kontrolu. Shoda jobnumber není důkazem shody odběratele.
7. **Opakování a konflikty:** dvojklik nebo ztracená odpověď nesmí vytvořit další výkaz, druhé kolo ani duplicitní podklady. Souběžná změna vyžaduje obnovení a nové potvrzení. Po nejednoznačné odpovědi se nejprve ověří výsledek; klient nesmí vydávat neověřený stav za úspěch.

## Návaznost na existující kód

Inspekce vychází z `609ee4f`; současně existující nesouvisející úpravy `TimelogsView.tsx` a jeho testu se nesmí přepsat.

- `src/features/billing-groups/billing-groups.model.ts`: nynější skupina má pouze ID, název a seznam akcí. Nemá identitu člověka a nestačí pro individuální fakturační výběr.
- `src/types.ts` a `src/features/timelogs/services/`: výkaz uchovává stabilní UUID, identitu akce a člověka, dny a vlastní stav. Tyto kanonické záznamy se zachovají; společný formulář nad nimi vytváří pracovní kontext, ne duplicitní hodinová data.
- `src/views/EventDetailView.tsx`: stávající vstup do evidence se přesměruje přes resolver společného kontextu; editor `EventBillingSection` se z detailu akce odstraní až po funkční náhradě v detailu crew.
- `src/views/CrewDetailView.tsx`: přirozené místo správy propojení a osobních podkladů. Sdílený doménový model musí používat také přehled výkazů a schvalování, nikoli samostatné výpočty ve třech obrazovkách.
- `src/features/invoices/services/invoices.service.ts`: již podporuje faktury s více výkazy a akcemi, kontrolu duplicit a rozpis podle jobnumber. Současné sestavení faktury vybírá schválené výkazy, proto se nesmí použít pro uložení přípravného výběru tak, aby neschválené položky tiše zahodilo.
- `src/features/invoices/services/invoice-customer-resolution.ts`: nyní odvozuje odběratele přes klienta projektu. U crew faktur musí navazující etapa ověřit skutečnou firmu, které člověk fakturuje; koncový klient akce není automaticky stejný odběratel.
- Návrh cíleného schvalování z 2026-08-19 je označený jako nenasazený. Nové společné schvalování musí vyjít ze skutečně dostupného kontraktu ověřeného před implementací, nikoli z předpokladu, že tento starší návrh je nasazen.

## Hranice odpovědností a bezpečnost

Oddělit správu provozního propojení, resolver vlastních částí, společné ukládání a schvalování a individuální výběr fakturačních podkladů. Každá část má vlastní stabilní identitu a kontrolu aktuální verze.

U vzdálených dat jsou rozhodující serverové UUID a autoritativní přiřazení a role. Jméno člověka, lokální číselné ID, jobnumber ani členství ve skupině nejsou oprávněním. Vlastnictví výkazů, způsobilost přechodu i přesnou množinu všech dotčených řádků musí ověřit server. Chybějící řádek nesmí vést k tichému částečnému úspěchu.

Víceřádkové operace vyžadují atomické uložení, očekávané verze a bezpečné opakování; několik po sobě jdoucích samostatných klientských zápisů společné schválení nezajišťuje. Nové veřejně dostupné objekty musí mít explicitní oprávnění a RLS, žádné anonymní zápisy ani obecný privilegovaný endpoint. UI a cache se oddělují podle přihlášeného uživatele a jeho role.

Nepřiřazené směny a cizí výkazy se nesmějí načíst do crew formuláře a pouze schovat CSS. Přístup k nabídce akcí se řídí současnými pravidly nezávisle na této funkci. Vývojový přepínač rolí se v rámci této změny neodstraňuje ani nepovažuje za produkční bezpečnostní záruku.

## Přechod ze starého řešení

Existující obecné skupiny mohou obsahovat nesouvisející akce určené jen pro jednu fakturu. Proto se automaticky nepřevedou na provozní propojení, které by změnilo schvalování všem přiřazeným lidem.

Před nasazením se pouze přečte aktuální stav a připraví přesný přehled dopadu. Původní záznamy se zachovají; produkce případný převod výslovně potvrdí. Historické hodiny, přiřazení, faktury, částky a stavy se touto migrací neslučují ani neresetují. Původní souhlas s přidáním tabulek fakturačních skupin není souhlasem s převodem těchto dat nebo s novým schvalovacím mechanismem.

## Postup realizace

Tři samostatně ověřitelné etapy mají společný produktový směr, ale nemají se implementovat najednou jako jeden velký zásah.

1. **Propojené směny a společná evidence:** správa z detailu crew, jeden vstupní kontext ze všech vlastních směn, průběžné ukládání, společné odeslání a oprávněné schválení. Tato etapa nesmí být označena za hotovou jen po přesunutí tlačítka.
2. **Individuální přípravný výběr:** výběr přesných podkladů jednoho člověka, rezervace proti duplicitám, součty, stavy a obnova po změně podkladů. Bez automatického vytvoření faktury či předání účetní.
3. **Příjem faktury a předání:** samostatný podrobný návrh pro dokumenty, vytěžení s možností opravy, shodu částek a skutečného odběratele, verzování opravených faktur a účetní návaznost. Tato etapa musí vyřešit napojení na existující fakturační služby, nikoli je paralelně nahradit druhým účetním tokem.

Po kontrole tohoto dokumentu se připraví implementační plán etapy 1. Před etapami 2 a 3 se doplní jejich vlastní technické kontrakty a akceptační plány. Vystavování faktur jménem crew, změny PowerApps a nový způsob určování schvalovatelů nejsou automatickou součástí etapy 1.

## Akceptační scénáře

- Člověk přiřazený na všechny tři propojené směny otevře z každé z nich tutéž uloženou evidenci se třemi částmi.
- Člověk přiřazený jen na dvě směny uvidí přesně dvě části; třetí se neobjeví ani jako prázdný oddíl a nelze ji doplnit podvrženým požadavkem.
- Jeden člověk nesmí vidět ani měnit údaje jiného člověka. Změna role nebo odhlášení odstraní starý formulář a jeho data z aktivního kontextu.
- Uložení příprav a pozdější doplnění instalace nezduplikuje dny, hodiny, cestovné ani výkazy; zachová rozdílné termíny a platné sazby.
- Jedno odeslání zahrne přesně oprávněné části a jedno schválení provede právě daný krok. Konflikt jedné části nezanechá zbytek částečně posunutý.
- Dokončení schválení nevytvoří fakturu ani neprovede účetní předání, včetně případných existujících serverových automatizací.
- Vrácení společného kola zachová údaje a důvod opravy; následná oprava respektuje nové schválení i současná pravidla potvrzení změn crew.
- Nepropojená směna a její evidence fungují beze změny. Stejné jobnumber nepropojí nesouvisející akce.
- Změna propojení po odeslání hodin se odmítne bez poškození historických podkladů. Přidání přiřazení samo nepřidá práci do již odeslaného kola.
- V etapě 2 lze pro jednoho člověka vybrat deset starších akcí s různými jobnumber bez změny provozního propojení a bez nového schválení již schválených hodin.
- Přípravný výběr s čekajícím výkazem se uloží celý a přesně ukáže čekání; neoznačí položky za vyfakturované ani neodešle doklad účetní.
- Dva souběžné výběry nebo faktury si nepřisvojí stejný podklad. Ztracená odpověď a opakování nezaloží duplicity.
- Mobilní a desktopová varianta používají stejné údaje a pravidla. Po implementaci proběhne vizuální kontrola skutečné instalace v simulátoru, ne pouze přítomnosti prvků v testech.

Ověření implementace zahrne doménové a komponentové testy, serverové testy oprávnění a transakcí, důkaz souběhu a regrese současné evidence a fakturace. Před vzdáleným nasazením je nutné nové konkrétní schválení jeho rozsahu. Aktualizace vývojových instalací se řídí `AGENTS.md`.

## Aktuální krok

Tento dokument zachycuje návrh a doplňující pravidla ke kontrole. Žádná nová databázová změna, úprava aplikace ani instalace zařízení se při jeho sepsání neprovádí. Teprve po kontrole písemného návrhu následuje implementační plán.
