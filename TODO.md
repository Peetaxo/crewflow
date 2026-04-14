# TODO

Tento soubor je pracovni seznam napadu, poznamek a budouciho smerovani.
Muzes sem psat svoje napady a ja z nich pak muzu delat konkretni ukoly.

## Jak to pouzivat

- Pis sem napady volne a jednoduse.
- Klidne jen jednou vetou.
- Kdyz budes chtit, muzu z toho pozdeji udelat priority nebo roadmapu.

## Sablona pro zapis

- [ ] Nazev napadu
  Poznamka: proc to chceme nebo jak si to predstavujes

## Aktualni napady

- [ ] Opravit rozbitou diakritiku v rozhrani
  Poznamka: v casti souboru jsou texty spatne kodovane a kazi dojem z aplikace.

- [ ] Ujasnit, ktere casti jsou jen demo a ktere maji byt produkcni workflow
  Poznamka: pomuze to rozhodnout, co dotahnout jako prvni.

- [ ] Navrhnout dalsi produktove priority
  Poznamka: hlavne obsazovani crew, schvalovani, finance a perzistence dat.

- [ ] Zlepsit kalendar a zobrazeni akci
  Poznamka: akce by mely byt v kalendari prehlednejsi a lepe citelne.

- [ ] Pridat lokaci akce a zobrazeni na mape
  Poznamka: u akci chceme videt misto i vizualne na mape.

- [ ] Napojit aplikaci na backend
  Poznamka: postupny prechod z lokalnich dat na realnou perzistenci.

- [ ] Napojit aplikaci na toggl.com
  Poznamka: casy nebo vybrane zaznamy z Togglu propojit tak, aby se promitaly do firemniho nastroje.

- [ ] Vytvorit export do tabulky
  Poznamka: export dat pro dalsi zpracovani mimo aplikaci.

- [ ] Projekty: opravit graf a vypocet hodin
  Poznamka: zkontrolovat chyby v projektu, napriklad kdyz je jen instal nebo u Gala Brno.

- [ ] Crew detail: upravit sekci nadchazejicich akci
  Poznamka: mozna bude lepsi tabulkove zobrazeni.

- [ ] Pridat uzivatelske ucty
  Poznamka: priprava na vice uzivatelu a role.

- [x] Pridat klienty
  Poznamka: tato cast uz je v aplikaci dostupna.

- [ ] Napojit faktury
  Poznamka: dodelat realne navazani na fakturacni proces.

- [ ] Prepracovat model fakturace na billing batch
  Poznamka: jedna faktura ma umet obsahovat vice schvalenych timelogu a vice job number pro jednoho kontraktora.

- [ ] Navrhnout a zavest invoice_items a vazbu invoice_timelogs
  Poznamka: faktura nema byt 1:1 na timelog; polozky se maji seskupovat podle job number a timelogy se maji vazat pres spojovaci vrstvu.

- [ ] Dodelat write flow pro fakturaci do Supabase
  Poznamka: po vyberu schvalenych timelogu vytvorit fakturu, polozky faktury a teprve potom prepnout timelogy na invoiced.

- [ ] Sekce uctenky
  Poznamka: clen crew muze pridat uctenku nebo fakturu za vydaj, ktery zaplatil, a priradit ji ke konkretni akci / projektu.

- [ ] Napojit nabor
  Poznamka: dodelat realne propojeni naborove pipeline.

- [ ] Pridat zasouvaci sidebar
  Poznamka: zlepseni ovladani hlavne na mensich displejich.

- [ ] Zakomponovat firemni obleceni
  Poznamka: doplnit do procesu nebo detailu crew / akce.

- [ ] Hromadna zprava pres Job Number
  Poznamka: idealne pres webhook nebo podobnou integraci.

- [ ] Offline rezim
  Poznamka: aplikace by mela byt aspon castecne pouzitelna bez internetu.

- [ ] Hodnoceni crew
  Poznamka: doplnit zpetnou vazbu a kvalitu spoluprace.

- [ ] Refaktor identity na UUID
  Poznamka: odstranit zavislost na contractors[0] a lokalnich ciselnych id, prejit na skutecnou auth / profile identitu.

- [ ] Hlidac kolizi pri prirazeni na akci
  Poznamka: upozornit, pokud je clovek uz prirazeny na jinou akci.

- [ ] System nahradniku
  Poznamka: evidence zaloznich lidi pro pripad vypadku.

- [ ] Sekce sklad
  Poznamka: evidence vybaveni, materialu a dostupnosti veci pro akce.

- [ ] Sekce flotila
  Poznamka: sprava aut, voziku a dalsi techniky vcetne prirazeni na akce.
