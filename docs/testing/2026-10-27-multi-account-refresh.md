# Nodu — aktuálnost dat mezi účty a zařízeními

Etapa 3, 27. 10. 2026. **Stav: dokončeno.** Funkční akceptace web/iOS, integrace do main i refresh běžné vývojové instalace na simulátoru a fyzickém iPhonu prošly. Výchozí main `ffeae85139ef20affa83d064f41442c5394013da`, ověřený a nainstalovaný zdroj aplikace `c0b1d909121f041d7fc41e5a5f694ea543763f76`.

## Prostředí a cíl

Oddělený místní Supabase pilot `crewflow-onboarding-pilot-20261020`, API `http://127.0.0.1:55431`. Nové syntetické účty Sync crew, Sync ch, Sync coo a Sync crewB; metadata a náhodně generovaná testovací hesla jsou pouze v privátním pilotním adresáři. Původní lidský onboardingový účet, jeho heslo, živý backend a fakturační demo se nemění.

Cíl plánu: úspěšný vlastní zápis ihned v UI; obnovení po otevření seznamu a návratu do aplikace; cizí zápis na aktivní obrazovce nejpozději do 30 s. Obnovení musí zachovat rozepsaný obsah, bezpečný konflikt a oddělení účtů.

## Výchozí skutečná reprodukce

- Web crew `127.0.0.1:8108`, CH `:8109`, COO `:8110`, každá samostatný původ a skutečná Auth relace. Všechny tři náhledy používají nezměněný výchozí main; nestačí přepínač místní role.
- CH přiřadil Sync crew přes skutečný dialog Obsadit crew. Vlastní UI potvrdilo PRIRAZEN; vznikl vlastní koncept s 8 hodinami. Crew jej v Přehledu vidělo při následném pozorování, přesný první okamžik této změny nebyl zachycen, proto se z toho neodvozuje splnění limitu.
- Crew otevřelo vlastní společnou evidenci a skutečně stisklo Odeslat vše ke kontrole. REST následně potvrdil `pending_ch`, verze serveru **2026-10-27 17:01:10.058838 UTC**.
- Aktivní otevřená fronta CH v **17:03:21.638 UTC** stále ukazovala **Čeká na kontrolu 0 / Koncepty 15**, včetně starého konceptu téhož NODU SYNC výkazu. Neaktuálnost je doložená nejméně **131 sekund po serverovém zápisu**. **Výchozí limit 30 s neprošel.** Privátní skutečný AX záznam: `/private/tmp/nodu-stage3-baseline-ch-20261027.txt`.
- Lokálnímu pilotu chyběly počáteční řádky v `shift_workflow_state` a `billing_group_state`, předepsané existujícími migracemi. Po kontrole prázdných workflow/group tabulek byly doplněné přesné hodnoty `(true,0)` v jedné transakci. Žádné existující skupiny, role ani profily se neopravovaly přepisem. Původní neplatný prázdný management přehled se tím odděluje od vlastní chyby obnovování.

## Rozsah opravy

Provozní query akcí, výkazů, účtenek, společné evidence a faktur mají obnovování po 20 sekundách a při otevření, návratu do popředí a obnovení spojení. Navigace obnovuje aktivní domény i tehdy, když jejich query drží připojený badge. Globální QueryClient nastavení zůstává stejné; nepřibyl Realtime ani změna závislostí.

Obnova nerestartuje bootstrap ani editor. Starší otevřený editor posílá zachycenou verzi; novější globální snapshot mu nesmí tiše podstrčit jinou verzi. Při konfliktu zůstává rozepsaný obsah a lze výslovně načíst aktuální podklad. Při změně identity se synchronně vyřadí query, soukromé snapshoty, hydratace i pozdní odpovědi; sessionStorage uchovává pouze povolenou navigaci. Auth přechody jsou serializované i mezi kartami; provozní UI čeká na ověřený profil a roli.

Skutečný iOS pokus našel ještě mizení společných řádků po chybě načtení. Oprava `c0b1d90` zachovává poslední snapshot a počty, ale zakáže otevření/schválení, dokud nedorazí úspěšný aktuální read. Toto je ověřené také reálným QueryClientem, ne pouze mockem hooku. Podrobný postup a kontrolní body: [plán etapy 3](../superpowers/plans/2026-10-27-stage-3-multi-account-refresh.md).

## Skutečné účty, klienti a měření

Závěrečné syntetické účty **Sync final crew / ch / coo / crewB** mají nezávislé skutečné Supabase Auth relace. Weby běží na `127.0.0.1:8111`, `:8112`, `:8113`. Crew současně používá iPhone 17 Pro Simulator, iOS 26.5, UDID `B337323A-264B-4AAC-9236-BEAAB3701659`, samostatnou aplikaci **nodu sync**, bundle `cz.nodu.app.refreshverification`. Nativní sestavení `c0b1d90` bylo sestaveno, nainstalováno a spuštěno přes XcodeBuildMCP. Jeho skutečně zabalené assety používají místní proxy `127.0.0.1:55441 → :55431`; nejde o živý projekt. Lidský **nodu test** (`cz.nodu.app.manualinvitations`) zůstává oddělený.

Měří se od kliknutí na skutečný zapisující UI prvek do prvního zachyceného zobrazení nového stavu na již otevřené obrazovce příjemce. Čísla jsou **konzervativní horní meze včetně doby zápisu**, nikoli přesný okamžik příchodu paketů. Během měření se příjemce ručně neobnovoval ani nepřepínal. Časy začátku jsou UTC, desetinné hodnoty v sekundách.

| Přechod / začátek 27. 10. UTC | Web jiného účtu | iOS crew | Výsledek |
| --- | ---: | ---: | --- |
| CH přiřadí crew, 18:56:11.889 | crew ≤14,818 | ≤18,528 | nová směna a koncept |
| Crew odešle, 18:58:03.671 | CH ≤14,437 | ≤15,452 | Čeká na kontrolu |
| CH vrátí, 18:59:26.965 | crew ≤4,117 | ≤11,477 | Vráceno k opravě + důvod |
| Crew opraví a odešle, 19:00:49.584 | CH ≤19,252 | ≤9,845 | Čeká na kontrolu |
| CH předá COO, 19:02:36.815 | COO ≤11,702; crew ≤15,542 | ≤27,464 | Čeká na schválení |
| COO potvrdí aktuální náhled, 19:04:42.624 | crew ≤19,879 | ≤25,180 | Schváleno, 2 000 Kč |
| COO zaznamená úhradu faktury, 19:13:23.297 | crew ≤19,319 | ≤9,925 | Úhrada zaznamenána |

**Všech sedm přechodů splnilo limit 30 s na webu i iOS.** Společná evidence patřila akci „NODU SYNC – opakované měření“ dne 29. 10.; její pozdější název při testu návratu je „NODU SYNC – návrat z pozadí“. Privátní metadata vymezují přesné vlastněné UUID, stejné finální účty a testovací fakturu s příponou `-timing`.

Vlastní úspěšný zápis se propsal bez čekání na interval: přiřazení potvrdilo vlastní CH UI jako PRIRAZEN; úhrada se v zapisujícím COO UI ukázala nejpozději za **1,166 s** od kliknutí. První průchod odesláním ukázal crew vlastní stav již za 0,577 s s indikátorem Ukládání; samotný optimistický stav se nepovažuje za serverové potvrzení.

V prvním průchodu nebyly některé odečty simulátoru zachycené včas (například přiřazení až za 30,214 s a odeslání za 39,301 s). Tyto vzorky **nejsou vydávané za splnění limitu**. Proto se celá matice opakovala na finálním sestavení se záchytem uvnitř jednoho běhu ovládání UI; tabulka uvádí tuto úplnou závěrečnou matici.

## Návrat, chyba spojení, koncept a konflikt

- **Otevření seznamu:** reálná navigace Přehled → Výkazy → Faktury načítala příslušné podklady; připojené badge nejsou důvodem k přeskočení readu. Čerstvý remount, browser focus/visibility/online a souběh spotřebitelů navíc pokrývají regresní testy s QueryClientem.
- **Skutečný nativní návrat:** crew aplikace přešla tlačítkem Home do pozadí. CH skutečnou Auth operací přejmenoval vlastněnou akci, ACK **19:15:32.014 UTC**. Po návratu bez restartu byl v čase 2,604 s ještě starý název, v **10,056 s** již „NODU SYNC – návrat z pozadí“.
- **Rozepsaný text při výpadku:** do skutečného crew editoru se zadal text „Etapa 3 OFFLINE – tento rozepsaný text se nesmí ztratit.“ Proxy přerušila transport; editor zachoval text a nabídl „Výsledek uložení není potvrzen. Opakujte stejný požadavek.“ Po obnovení spojení prošlo výslovné opakování stejného požadavku; editor i skutečný serverový podklad obsahovaly tentýž text. Nevznikl druhý zápis.
- **Chybový seznam na finálním sestavení:** proxy vracela HTTP 503 (simulovaný výpadek backendu, nikoli vypnutí Wi-Fi zařízení). Web v **19:06:11.434 UTC** zobrazil „Data nemusí být aktuální“, obě uložené společné karty a zakázaná tlačítka. iOS po návratu v **19:10:47.421 UTC** také zachoval obě schválené karty, upozornění i retry. Po odstranění 503 a stisknutí „Zkusit obnovit“ úspěšný read odstranil varování a opět povolil otevření; následně fungovala běžná navigace i změna stavu faktury.
- **Souběžné schválení:** první COO měl otevřený serverový náhled; druhá skutečná COO relace mezitím schválila stejný podklad (ACK **18:45:19.622 UTC**). Potvrzení původního náhledu skutečným UI bylo odmítnuto: „Data se mezitím změnila. Obnovte výběr a znovu jej potvrďte.“ UI nabídlo nové načtení a zakázalo původní potvrzení. Žádné dvojí schválení.

## Oddělení identity

Po práci crew A se provedlo skutečné odhlášení a přihlášení jako **Sync final crewB**, bez mazání úložiště nebo reinstalace. Web od **19:18:14.858 UTC** ukazoval správný profil B; samostatně otevřené Moje faktury měly **0 / 0**, Moje účtenky byly prázdné. První účet měl dvě vlastní faktury a soukromou testovací účtenku, takže prázdný stav B není pouze shoda prázdných účtů.

Totéž prošlo na nativní aplikaci přes Nastavení → Odhlásit se → Přihlásit se: Přehled přivítal **Sync final crewB**, výdělek i čekající částka **0 Kč**, Výkazy **Vše 0 / Žádné záznamy** a faktury **K fakturaci 0 / Vystavené a přijaté faktury 0**. Kontrola proběhla přibližně v **19:26 UTC**. Přihlašovací údaje jsou jen generované místní testovací údaje; žádné lidské heslo se nezadávalo ani neměnilo. Soukromá data A se na B neobjevila.

## Automatická verifikace a review

- Celý kandidát: `npm test -- --maxWorkers=1 --testTimeout=15000 --hookTimeout=15000`, **217 souborů / 2 870 testů prošlo**, exit 0. Log `/private/tmp/nodu-stage3-full-tests-rerun-20261027.log`, 779,35 s. První běh s limitem 5 s selhal na 10 timeoutech a jednom navazujícím duplicitním DOM při souběžné zátěži hostitele; je zachovaný v `/private/tmp/nodu-stage3-full-tests-20261027.log`. Před opakováním se kvůli těmto timeoutům neměnil produktový zdroj.
- Následná runtime oprava cache `c0b1d90`: **15 testů ve 3 souborech prošlo** se standardním timeoutem, včetně nového RED → GREEN testu s reálným QueryClientem. Log `/private/tmp/nodu-stage3-cached-rows-tests-20261027.log`. Těchto 15 je samostatné finální ověření; nejde o tvrzení, že plná sada byla znovu objevena po přidání tohoto testu.
- Ochrana verzí editoru: 164 cílených testů prošlo; scoped refresh/banner 93 testů v 8 souborech prošlo. Identity/hydratační a Auth gate regrese prošly v cílených sadách. Nezávislé spec i quality review všech těchto částí a dodatečné cache opravy skončilo PASS.
- `npm run lint` a `npm run build` po finální runtime opravě: exit 0. Logy `/private/tmp/nodu-stage3-lint-post-runtime-20261027.log`, `/private/tmp/nodu-stage3-build-post-runtime-20261027.log`. Build hlásí dosavadní upozornění na velikost chunku/dynamické importy.
- `npx tsc --noEmit -p tsconfig.app.json --pretty false`: exit 2, **108 dosavadních diagnostik**, přesná normalizovaná multiset shoda s výchozím stavem; žádná nová ani odebraná diagnostika. Log `/private/tmp/nodu-stage3-final-types-20261027.log`. Typový úklid zůstává v etapě 7.
- Po začlenění zdroje `c0b1d90` do origin/main a fast-forward synchronizaci čistého checkoutu: **58 testů v 6 souborech prošlo**, standardní timeout, exit 0. Zahrnuje finální cache opravu, refresh/banner i bootstrap gate. Log `/private/tmp/nodu-stage3-main-focused-20261027.log`; oba HEAD byly totožné a pracovní kopie čistá.

## Hranice a další etapy

Jde o skutečné místní účty a klienty **web + iOS simulátor**, nikoli o tvrzení, že časová matice proběhla na fyzickém telefonu nebo živém backendu. SDK harness `supabase/tests/multi-account-refresh.integration.mjs` odmítá jiný než přesný místní pilot a vymezuje vlastní syntetické fixture. Privilegované kroky pouze připravily tyto fixture; provozní přechody používaly skutečný Auth/RPC nebo UI. Do Git nepatří hesla ani servisní klíče.

Při navigaci do upozornění místní pilot hlásil chybějící `public.get_my_notifications(p_before_id)` v schema cache. Jde o omezení místního schématu pro upozornění, nikoli o úspěšně ověřené push notifikace; patří do etapy 6. Touto prací se nezapíná veřejný onboarding, nemění živá data a neuzavírá etapa 4.

## Integrace a běžné vývojové instalace

Zdrojové commity `b56f1ca` a `c0b1d90` jsou začleněné fast-forward do `origin/main`. Samostatný checkout `crewflow-stage2-refresh-20261027` byl před refreshem čistý, na větvi main, s `HEAD = origin/main = c0b1d90`; následně v něm prošlo 58 testů. Beze změny preflightu se spustilo:

```sh
IOS_REFRESH_DERIVED_DATA_ROOT=/private/tmp/nodu-stage2-ios-refresh-20261027 npm run ios:refresh:devices
```

Celý příkaz skončil **exit 0**. Log: `/private/tmp/nodu-stage3-ios-refresh-20261027.log`.

| Instalace běžného nodu `cz.nodu.app` | Výsledek |
| --- | --- |
| iPhone 17 Pro Simulator, iOS 26.5 | **BUILD SUCCEEDED, instalace a spuštění prošly**; výstup `simulator: updated` |
| Peetax, iPhone 13 mini, iOS 27.0.1 | **BUILD SUCCEEDED, podpis, instalace a spuštění prošly**; výstup `phone: updated`. Samostatný devicectl záznam potvrdil paired / wired / tunnel connected. |

Jde o místní vývojové instalace, nikoli produkční nasazení. Fyzický telefon prošel refreshem; časová matice výše je výslovně web + simulátor. XcodeBuildMCP výchozí projekt/bundle je vrácený na běžný nodu tohoto main. Jediná změna vzniklá `cap sync`, lokální cesty v `Package.swift` od symlinkovaných závislostí, byla po kontrole vrácená. Checkout je opět čistý a synchronizovaný. Ignorovaný `.env.local` je podle SHA-256 beze změny.

Původní pracovní kopie zůstala zachovaná: SHA-256 tří cizích rozpracovaných souborů (`Info.plist`, `TimelogsView.tsx`, jeho test) stále odpovídají snímku před touto prací. Řídicí roadmapa uzavírá pouze etapu 3; následuje etapa 4.
