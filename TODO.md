# TODO

Stav po místním technickém úklidu, 29. 10. 2026. Pořadí a akceptaci určuje
[plán dokončení nodu](docs/superpowers/plans/2026-10-27-nodu-completion-roadmap.md).
Místní test nenahrazuje skutečný pilot ani konečné přijetí první verze.

## Zbývá pro první verzi

- [ ] Dokončit místní technický úklid a bezpečnostní regrese podle
  [podrobného plánu](docs/superpowers/plans/2026-10-29-local-cleanup.md).
  Přesné výsledky, commit a zařízení patří do navazující evidence.
- [ ] Ověřit skutečné APNs doručení na fyzickém iPhonu, preference a vazbu na účet.
  Historie a simulovaný banner jsou ověřené; mobilní push zůstává samostatná
  akceptace. [Důkaz](docs/testing/2026-10-22-notifications-simulator.md).
- [ ] Na závěr připravit veřejnou doménu, hosting, schváleného odesílatele,
  aktivační/obnovovací HTTPS odkazy a distribuci iOS. Na přání uživatele odložené;
  [předpoklady](docs/testing/2026-10-29-stage-4-readiness.md).
- [ ] Projít skutečný pilot vybraných lidí, opravit jeho nálezy a zkontrolovat
  výsledný backend i distribuované mobilní sestavení.
- [ ] Dokončit bezpečnostní review, řízený test etapy 8 a opakované ověření oprav.
  Před těmito výsledky první verzi neoznačovat za přijatou.

## Doložené hotové části

- [x] Supabase backend, skutečné přihlášení a role. Předpoklady „napojit backend“
  a „přidat účty“ jsou překonané. [Oprávnění](docs/testing/2026-10-27-pilot-access.md),
  [místní aktivace a obnova](docs/superpowers/plans/2026-10-26-member-onboarding-completion-verification.md).
- [x] Importované profily mohou záměrně zůstat bez loginu. Přístup se přidává
  řízenou pozvánkou a aktivací; plošně nezakládat Auth účty všem importovaným lidem.
  Veřejné pozvánky jsou stále čekající část výše.
- [x] Vlastní faktura, self-billing, položky a vazby výkazů/účtenek, atomické zápisy
  do Supabase, PDF a záznam úhrady. Ověřený scénář zahrnuje klienty i čitelné PDF.
  [Ověření fakturace](docs/testing/2026-10-22-crew-invoicing-ui.md).
- [x] Starý návrh obecného billing batch s více Job Number nahradilo přijaté
  pravidlo jedné faktury za celý schválený výkaz pracovníka pro jednu akci.
  Fungující fakturaci nepřestavovat podle překonaného návrhu.
- [x] Přehled a výkazy mají sjednocené období/počty a aktuální měsíc;
  [etapa 2](docs/testing/2026-10-27-stage-2-verification.md).
- [x] Obnovování mezi účty, návrat, zachování konceptů, konflikt a oddělení relací
  prošly na webu a iOS simulátoru; [etapa 3](docs/testing/2026-10-27-multi-account-refresh.md).
- [x] Místo akce a zamčená mapa jsou implementované a ověřené;
  [důkaz](docs/superpowers/plans/2026-09-23-locked-event-map.md).
- [x] Mobilní přehled crew, nejbližší směna a karty směn jsou implementované;
  [ověření](docs/testing/2026-10-12-crew-mobile-ux-verification.md).
- [x] Kontrola kolizí při přiřazení na akci je implementovaná; dialog ukazuje
  kolize a blokuje kolidující přiřazení. Pokrývají ji dialogové a servisní testy.
- [x] Existují klienti, účtenky, sklad a flotila, jejich obrazovky a datové služby.
  Přítomnost sekce není úplná provozní akceptace všech budoucích rozšíření.
- [x] Existuje skládací desktopový sidebar a samostatná mobilní navigace.
  Jiný vysouvací drawer je případný nový návrh.

## Zachovaná rozpracovaná práce

- [ ] Původní změny Info.plist a manažerského měsíčního filtru/kompaktního
  přepínače ve TimelogsView a jeho testu zůstávají v původním checkoutu.
  Případně integrovat cíleně po porovnání s novějšími opravami, nepřepisovat celé
  soubory. [Záznam zachování](docs/testing/2026-10-27-completion-baseline.md).
- [ ] Staré dirty worktrees a ignorované .env.local zachovat, dokud nebude
  doložené převzetí každé potřebné změny. Hromadné mazání není úklid.

## Nápady a další rozvoj mimo dokončení první verze

- [ ] Další čitelnost kalendáře a akcí; nadcházející akce crew případně tabulkově.
  Navázat na existující obrazovky, nezačínat je znovu.
- [ ] Prověřit konkrétní hlášení grafu/hodin projektů: pouze instal, Gala Brno.
  Samotný redesign projektu není důkaz opravy těchto konkrétních případů.
- [ ] Dokončit přechod na UUID ve všech doménách a odstranit zbývající fallbacky
  contractors[0] v účtenkách/flotile. Skutečná Auth/profile identita už existuje;
  numerické kompatibilní indexy zatím nejsou odstraněné z celé aplikace.
- [ ] Dopracovat náborovou pipeline. Kandidáti se načítají ze Supabase, ale posun
  kandidáta má ještě místní větev; automatické zakládání z Tally je odložené.
- [ ] Export do tabulky / CSV / XLSX a funkční export Call Sheet. Samotné tlačítko
  bez obsluhy není hotová funkce.
- [ ] Napojení Toggl.
- [ ] Hromadná zpráva podle Job Number.
- [ ] Firemní oblečení.
- [ ] Plný offline režim.
- [ ] Zpětná vazba a hodnocení crew nad rámec současného zobrazení hodnocení.
- [ ] Náhradníci.
- [ ] Další procesy aut, účtenek a skladu; nahradit ukázkové dokumenty flotily.
- [ ] Odstranění shadow snapshotů/hydratačních guardů a plošný přechod na Realtime
  posoudit samostatně podle potřeby. Etapa 3 cíleným obnovováním splnila současnou
  akceptaci bez této migrace.
- [ ] Další produktové priority a hranice demo/provozního workflow doplňovat
  konkrétními požadavky do roadmapy. Chybu textu/diakritiky zaznamenat s přesným
  místem; plošné poškození kódování aktuální kontrola nepotvrdila.
