# Kontext aplikace

## Co je Event Helper

Event Helper je interni aplikace pro eventovou / produkcni firmu na rizeni externiho crew.
Slouzi jako provozni panel pro planovani akci, obsazovani lidi, kontrolu vykazu, schvalovani a navaznou fakturaci.

Aktualni podoba aplikace odpovida interaktivnimu produktu / prototypu, ktery uz ma jasnou domenovou logiku a hlavni workflow.

## Hlavni uzivatele

- Crew
- CrewHead
- COO
- pripadne dalsi interni operacni role

## Hlavni domeny

- Klienti
- Projekty (Job Numbers)
- Akce
- Crew / kontraktori
- Timelogy
- Schvalovani
- Faktury
- Nabor

## Hlavni workflow

1. Zalozi se klient a projekt.
2. K projektu se priradi konkretni akce.
3. Na akci se obsazuje crew.
4. Po akci vznikaji timelogy.
5. Timelogy schvaluje nejprve CrewHead a pak COO.
6. Po finalnim schvaleni se automaticky generuji self-billing faktury.
7. Aplikace drzi prehled i nad naborovou pipeline novych lidi.

## Role a pristupy

### Crew

- vidi pouze svoje data
- sidebar: Moje smeny, Akce, Moje timelogy, Moje faktury
- pozdeji muze mit i Profil / Nastaveni
- muze pracovat se svymi vykazy a sledovat stav faktur
- nema pristup ke klientum, projektum, cizimu crew ani schvalovani

### CrewHead

- role pro operativni rizeni crew
- vidi vse, co aktualne odpovida provoznimu rizeni
- sidebar: Dashboard, Moje smeny, Klienti, Projekty, Akce, Crew, Timelogy, Schvalovani, Faktury, Nabor, Nastaveni
- provadi prvni stupen schvaleni timelogu
- neprovadi finalni schvaleni COO

### COO

- ma siroky provozni a financni prehled
- sidebar: Dashboard, Moje smeny, Klienti, Projekty, Akce, Crew, Timelogy, Schvalovani, Faktury, Nastaveni
- nevidi modul Nabor
- provadi finalni schvaleni timelogu

## Schvalovani a self-billing

- rozdil mezi CrewHead a COO je hlavne ve schvalovacim kroku
- CrewHead schvaluje prvni stupen
- COO schvaluje druhy a finalni stupen
- po finalnim schvaleni COO se automaticky vytvori self-billing faktura
- faktura se odesle brigadnikovi
- brigadnik ma 72 hodin na namitku
- pokud neprijde namitka, faktura se uzavira a jde k proplaceni

Z toho plyne:

- Faktury muze videt CrewHead i COO
- Faktury nejsou samostatna manualni agenda, ale navazny automaticky krok po schvaleni timelogu
- Crew vidi pouze svoje vlastni faktury

## Dulezite produktove principy

- Aplikace neni obecny admin, ale interni operacni system pro event crew management.
- Job Number je dulezity spojovaci prvek mezi projektem, akci, vykazy a fakturaci.
- Dulezita je rychla orientace v provozu: co chybi obsadit, co ceka na schvaleni, co ceka na fakturaci.
- Hodnota produktu stoji hlavne na plynulosti workflow, ne jen na jednotlivych CRUD obrazovkach.

## Aktualni stav produktu

- Frontend je postaveny jako Vite + React aplikace.
- Data jsou aktualne lokalni / seedovana v aplikaci.
- UI uz pokryva hlavni provozni use-casy.
- Dalsi logicky krok je postupny prechod z prototypu na realny nastroj s perzistenci a stabilnim workflow.

## Na co myslet pri navrhovani zmen

- Navrhy by mely podporovat realnou praci internich roli, ne jen pridavat dalsi tabulky.
- Prioritu maji zmeny, ktere zjednodusi denni operativu.
- Je vhodne drzet ceske nazvoslovi v commitech a v pracovnich poznamkach.
- Pokud bude neco nejasne, je lepsi navrhovat z pohledu eventove agentury / produkcni firmy nez z pohledu obecne SaaS sablony.
