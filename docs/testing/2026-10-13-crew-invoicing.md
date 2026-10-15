# Ověření fakturace crew

Lokální automatizované ověření k 15. 10. 2026 prošlo. Ověřený main je zveřejněný a vývojové instalace v simulátoru i na iPhonu jsou aktualizované a spuštěné. Databáze a dvě přihlášením chráněné služby jsou nasazené. **Aktivace serverového workeru a plánovače čeká na samostatné potvrzení nového tajného klíče. Celý průchod skutečným demo rozhraním a screenshot dema zůstávají PENDING kvůli policy blokaci prohlížeče.** Databázové, autentizované API a komponentové testy celý UI pilot nenahrazují.

Ověřovaný základ je `f5ec8309e5d2f855105754d169d536358c61e390`: hotová obrazovková část `2d710f086716be5404c95345cad14142a206df22` spojená s publikovaným `main` na `2e61fa0a77699d6a4155ee83eaea57cd4289c25a`. Přehledy projektů a událostí z této hlavní větve zůstaly zachované. Task 4 přidává autentizované pilotní kontroly a dvě úzké opravy typů popsané níže. Poslední úplné aplikační kontroly již zahrnují obě opravy.

## Rozsah a stav implementace

Jeden úplný výkaz pracovníka za jednu akci, včetně několika denních řádků, tvoří jeden podklad. Úplné konečné schválení provádí COO. Vlastní nahrané PDF přijímá nebo vrací **CH**. Pracovník může místo nahrání výslovně potvrdit self-billing jedné faktury; volitelný trvalý souhlas v nastavení platí pouze pro budoucí úplná schválení. Odběratelem je klient projektu. Podklady čekající na rozhodnutí jsou oddělené od skutečných faktur.

Backend `7238ab7`, dokumenty a worker `fb3cdb2` i konečná obrazovková část `2d710f0` prošly samostatnou nezávislou kontrolou specifikace a následnou kontrolou kvality. Nálezy předchozích kontrol byly opravené před těmito konečnými souhlasy. Dokončený automatizovaný díl Task 4 na `a14ca378a0c2d880e588b6c4028d5401df466c6b` prošel nezávislou kontrolou specifikace a konečnou kontrolou kvality i propojení celého řešení. Konečný reviewer navíc spustil 21 souborů / 155 testů a samostatně porovnal všech 486 původních řádků; nenašel zbývající zásadní nález. Zbývající aktivace plánovače a blokovaný UI pilot jsou oddělené od těchto výsledků.

## Zveřejnění a vývojové instalace

Ověřená hlavní větev `88e2c35a0853665275fae6de86e084373da40cba` je od 15. 10. 2026 zveřejněná na `origin/main` bez force push. Po začlenění do čistého main znovu prošlo **185 souborů / 2 300 testů** (59,72 s), lint a build. Původní nesouvisející změny v pracovním adresáři uživatele zůstaly zachované. Logy: `rollout-main-tests.log`, `rollout-main-lint.log`, `rollout-main-build.log`.

Na Staff byly úspěšně nasazené přesně migrace **20261013125432 / crew_invoice_billing** a **20261015061924 / invoice_pdf_storage_and_schedule**, se zachováním původních verzí; hosted historie má 24 migrací. Nasazený `generate-invoice-pdf` je **ACTIVE v11 / verify_jwt=true**, `upload-invoice-document` **ACTIVE v1 / verify_jwt=true**. Obě funkce použily Docker bundler a zkontrolované soubory, bez `--use-api` a bez prune. Ostatní webhooks zůstaly na původních verzích.

Před a po migracích souhlasí počty i přesné datové otisky všech **15 chráněných tabulek / 1 311 existujících řádků**. U faktur se porovnávala původní pole bez šesti nově přidaných metadat. Nové statements, consents, jobs i statement invoices zůstaly prázdné; nevznikla živá testovací faktura ani souhlas. Přesné porovnání hosted advisors: **žádný nový WARN**, security WARN **30 → 26**, performance WARN **91 → 91**. Přibylo pouze 20 INFO o zatím nepoužitých indexech nových prázdných tabulek; tyto indexy chrání budoucí vazby a dotazy a zůstávají zachované. Důkazy: `hosted-{before,after}-rollout-20261015.json`, `hosted-rollout-advisor-delta.json` a soukromé preservation výsledky.

**Serverové generování nových PDF ještě není aktivní.** Automatická schvalovací kontrola odmítla příkaz ukládající nový `INVOICE_PDF_WORKER_SECRET` do externího projektu, protože předchozí souhlas s nasazením nevyhodnotila jako výslovné schválení této změny přihlašovacích údajů. Příkaz se neprovedl. Nový klíč není uložený v Edge Secrets ani Vault; `process-invoice-pdfs` a minutový plánovač nebyly nasazené/aktivované. Soukromé mode-600 vstupy jsou připravené, uživatel dostal konkrétní žádost o potvrzení. Závislé kroky se neobcházejí a neprovedou se bez odpovědi. To omezuje i PDF jednotlivě potvrzeného self-billingu, protože jeho PDF používá stejný durable worker. Po potvrzení zbývá klíč/Vault, worker, jeden named Cron a skutečný hosted HTTP/Cron důkaz bez testovací faktury.

Čistá instalační kopie `crewflow-invoice-pdf-rollout-20261012` byla synchronizovaná s ověřeným `origin/main`; ignorované `.env.local` zůstalo bajtově stejné a podpisový tým byl dodaný prostředím. Předepsané `npm run ios:refresh:devices` na `88e2c35` skončilo **exit 0**: **simulátor aktualizovaný, nainstalovaný a spuštěný; fyzický iPhone 13 mini aktualizovaný, nainstalovaný a spuštěný**. Nová oddělená DerivedData cesta nevstoupila do cizích buildů. Log: `rollout-native-refresh.log`. Následný screenshot skutečného Staff přehledu v simulátoru `rollout-native-staff-launch.jpg` potvrzuje vykreslení bez nové uživatelské akce. Jde o nativní read-only smoke, nikoli screenshot fiktivního browser pilotu nebo test celého výběru souboru na telefonu.

Lokální demo server se znovu spustil na portech 8097–8100 nad ověřeným main se stejnou výslovně lokální API konfigurací a zachovanými účty. Jeho obnovení nečetlo ani neovládalo zablokovanou webovou stránku. Pracovní feature worktree se zatím uchovává pro dokončení čekající serverové aktivace.

## Konečné lokální kontroly

Těžké aplikační kontroly běžely postupně. Nezměnily se assertions, výběr testů ani časové limity. Příkazy běžely v uvedeném worktree; logy se ukládají soukromě pod `/private/tmp/crewflow-invoice-workflow-20261013/`.

| Kontrola | Skutečný výsledek | Exit | Soukromý log |
| --- | --- | --- | --- |
| `npm test -- --maxWorkers=2 --configLoader=runner` | **185 souborů / 2 300 testů PASS**, 58,83 s | 0 | `task4-full-final.log` |
| `npm run lint` | PASS | 0 | `task4-lint-final.log` |
| `npm run build` | PASS; zůstávají upozornění sestavovače na velikost balíku a neúčinné dynamické importy | 0 | `task4-build-final.log` |
| Skutečný `tsc -p tsconfig.app.json --pretty false` | Čistý aktuální main: **111 diagnostik**; konečný zdroj: **110**, **žádná nová normalizovaná signatura** | 2 / 2 | `task4-types-main.log`, `task4-types-current-green.log`, `task4-types-comparison-green.json` |
| Cílený test uploadu po opravě typů | **20 / 20 PASS** | 0 | `task4-upload-types-green.log` |
| Deno kontrola všech tří serverových vstupů | `generate-invoice-pdf`, `upload-invoice-document`, `process-invoice-pdfs` PASS | 0 | `task4-deno-check.log` |
| Skutečné testy PDF rendereru | **2 / 2 PASS** | 0 | `task4-deno-renderer.log` |
| Auth SDK, souběh a dokumentový pilot | Všechny tři skutečné localhost harnessy postupně PASS | 0 / 0 / 0 | `task4-billing-auth-final.log`, `task4-billing-concurrency.log`, `task4-documents-pilot.log` |
| Nově načtené čtyři Auth snapshoty a aktuální frontend parser | **4 / 4 PASS**, včetně nových kanonických podkladů | 0 | `task4-actual-parser.log` |

Kontrola typů aplikace **není čistá**. Srovnává stejný instalovaný TypeScript a závislosti nad původním `tsconfig.app.json` čistě archivovaného aktuálního main a konečné aplikace. Starší poměr 113/112 používal základ, který už obsahoval Task 2, a proto nebyl dostačujícím srovnáním celé funkce s novým main. Nové srovnání nejprve reprodukovalo dvě signatury Task 2: příliš široký typ uloženého dokumentu v testu a nenarrowovanou validační union při `strict: false`. Po schválené opravě používá test `Awaited<ReturnType<UploadStore["findDocument"]>>` a server explicitní `validation.ok === false`. Runtime pravidla, kontrola PDF a oprávnění zůstaly zachované. Výsledný poměr je 111/110 bez nové signatury; nejde o kontrolu pouze kořenového referenčního projektu.

Runner používá správný ESM zápis stejného aliasu. Předchozí zastavení načítání konfigurace a jeden dřívější zatížený StrictMode pád nejsou zatajené ani označené za prokázanou původní chybu; konečný celý běh se dvěma pracovníky prošel při původních assertions a limitech.

Deno běželo z připraveného binárního souboru verze 2.5.4 a soukromé cache. Jeho `check` nepodporuje navržený přepínač `--cached-only`; první pokus skončil pouze chybou použití. Skutečná kontrola následně prošla s `check --no-lock` z připravené cache. Renderer prošel s `test --no-lock --cached-only --allow-read`. Chyba nepodporovaného přepínače není typová chyba funkce.

### Databázové sady a hranice důkazu

Všechny následující sady používaly přesný lokální kontejner `supabase_db_crewflow-demo-20261012`, existujícího administrátora a startup `PGOPTIONS='-c session_preload_libraries='`. **Ve stejném spojení před každou sadou** se ověřilo skutečně prázdné nastavení i role `supabase_admin`. Heslo se četlo pouze uvnitř kontejneru. Oprávnění, RLS, assertions a trvalá konfigurace se neměnily. Samotné hostitelské `PGOPTIONS` kolem Supabase CLI není platný důkaz vypnutého hooku, protože jej tato CLI cesta ignoruje.

| Nezměněná sada | Výsledek |
| --- | --- |
| `invoice-billing.test.sql` | **139 / 139**, konečný `ROLLBACK` |
| `invoice-billing-review.test.sql` | **62 / 62**, konečný `ROLLBACK` |
| `invoice-billing-quality.test.sql` | **36 / 36**, konečný `ROLLBACK` |
| `invoice-document-owner-binding.test.sql` | **10 / 10**, konečný `ROLLBACK` |
| `shared-shift-rounds.sql` | **PASS**, všechna lifecycle zabezpečení zapnutá, konečný `ROLLBACK`; 41 výstupů pomocné kontroly a 50 výstupů očekávaného odmítnutí, bez číslovaného pgTAP plánu |
| `shared-shift-workflows.sql` | **PRECONDITION-BLOCKED**: zachované demo obsahuje dvě historická kola, sada vyžaduje zcela prázdný společný stav. Selhal první globální empty-state assert; odpojení vrátilo transakci. Nešlo o pád databáze. |

Čtyři fakturační sady dohromady představují **247 / 247 pgTAP kontrol** bez `not ok`. Logy jsou `task4-<název-sady>.log`, souhrn `task4-sql-final-results.json`. Moderní společná lifecycle sada není vydávána za 91 číslovaných pgTAP testů.

Vyhrazená prázdná databáze `crewflow_shared_shift_tests` v tomto kontejneru neexistuje. Zachované demo se kvůli starší foundation sadě neresetovalo, nemaže se jeho historie a nevypínaly se jeho triggery. Starší základová sada má oddělený dřívější důkaz popsaný v `supabase/tests/shared_shift_workflows.verification.md`; jeho wrapper dočasně vypíná pouze dva lifecycle triggery pro nemožné fixture zápisy a neprokazuje tyto lifecycle guards. Nejde o nový PASS aktuální foundation sady. Její původní ACL/RLS a moderní lifecycle test jsou odlišné důkazy.

## Matice požadovaného pilotu

**Auth API** znamená skutečné přihlášení Supabase SDK a skutečné RPC/Storage/Edge proti localhostu. **SQL** znamená skutečné databázové kontroly s nastavenými rolemi a claims, nikoli přihlášení SDK. **React komponenta** používá skutečnou komponentu s mockovanou I/O hranicí. Žádná z těchto úrovní sama není celý ovládaný UI pilot.

| Požadovaný okruh | Skutečná úroveň a důkaz | Výsledek |
| --- | --- | --- |
| Crew rozepsaný a konečný výkaz jedné třídenní akce | **Auth API**: `invoice-documents.integration.mjs`, `completeReportPilot`; neúplný draft, úplné odeslání jednoho kanonického reportu se třemi stabilními denními řádky | PASS |
| CH vrácení s důvodem → Crew oprava práce a nové odeslání → CH předání | **Auth API**: stejný pilot; první den se opraví ze 7 na 8 hodin, nové kolo zachová staré zamítnuté kolo a důvod. **SQL**: `shared-shift-rounds.sql` | PASS |
| COO přečte přesnou serverovou cenu a schválí celý podklad | **Auth API**: stejný pilot předá přesné ID quote, jeden report / tři dny / **7 030 Kč**. **SQL**: fakturační a shared sady. **React komponenta**: `approval-quote.test.tsx` ověřuje náhled a zachování quote při nejasné odpovědi | PASS |
| Crew vlastní PDF, správný typ/velikost/metadata a cizí přístup | **Auth API / Edge / Storage**: skutečný upload v dokumentovém harnessu, odmítnutí neplatných, nadlimitních, neaktuálních a cizích požadavků, zákaz veřejného zápisu | PASS |
| CH vrátí PDF → Crew nahraje opravenou verzi → CH přijme | **Auth API**: stejný harness, nová neměnná verze, historie i původní replay zachované. **React komponenta**: `components.test.tsx` nabízí rozhodnutí pouze CH a blokuje souběžný self-billing během kontroly originálu | PASS |
| Stáhne se přesně přijatý originál, včetně dostupné historie | **Auth API / Storage**: owner, CH i COO stahují obě skutečné verze; SHA256 souhlasí s nahranými bajty. `invoices.pdf_path` ukazuje na přijatou opravenou verzi; generátor ji odmítne přepsat | PASS |
| COO označí vlastní fakturu jako zaplacenou | **Auth API**: **7 030 Kč**; původní ID, číslo, částka, originální cesta a právní snapshoty zůstávají. První actor/profile/čas se zachovají i po odmítnuté opakované úhradě `PT409`. **React komponenta**: `InvoiceBillingView.test.tsx` odmítá falešný úspěch při chybějícím/nejasném výsledku | PASS |
| Jednotlivý self-billing → skutečné PDF → zaplaceno | **Auth API / Edge / Storage**: explicitní neplátce, **8 h 20 min / 2 083,33 Kč**; reálné selhání Storage, pokus 1, autorizovaný retry a dokončený pokus 2 pro stejné ID/číslo/snapshoty. Následuje úhrada a kontrola prvního auditu. **React komponenta**: `components.test.tsx` vyžaduje explicitní potvrzení přesného náhledu | PASS |
| Trvalý souhlas → budoucí schválení → automatická faktura/PDF | **Auth API + skutečný pg_cron/pg_net/Edge worker**: nové schválení, automatická faktura a cesta PDF bez klientského vystavení; plánovač skončil HTTP 200 `{"processed":2,"rendered":1}` | PASS |
| Odvolání trvalého souhlasu → další schválení čeká | **Auth API**: nový úplně schválený podklad je `ready`, bez `invoice_id`, bez vazby na grant a bez issue jobu. **SQL** navíc ověřuje budoucí rozsah souhlasu. **React komponenta** ověřuje výchozí vypnutí a explicitní úplné znění souhlasu | PASS |
| Znovupřihlášení a nezávislá relace | **Auth API**: nová skutečná Auth relace vlastníka načte obě uhrazené faktury s původními cestami a částkami. Concurrency harness používá dvě nezávislé Auth relace téhož vlastníka. Nejde o dva fyzické telefony ani dva ovládané prohlížeče | PASS na uvedené úrovni |
| Vlastník/cizí uživatel a přesně jedna faktura na úplný zdroj | **Auth API**: cizí účet nevidí nové faktury; přesné linky vlastního, self-billing a automatického podkladu. **Skutečný souběh**: sedm operací, jeden invoice a jeden source link, vítězná částka **7 030 Kč**, poražený HTTP 409 / `PT409` | PASS |
| Přesná frontendová data, změna identity a pozdní odpovědi | **Čtyři čerstvé Auth snapshoty + skutečný parser**: nový kanonický podklad a podklad po odvolání projdou. **React komponenty/služby**: `contract.test.ts`, `useBilling.test.tsx`, `actor-scope.test.tsx`, `upload-retirement.test.tsx`, `InvoiceBillingView.test.tsx`, `SettingsView.billing.test.tsx` pokrývají vazby, scope, callbacky, role a nastavení s mockovanou I/O hranicí | PASS |
| Celý skutečný UI průchod a screenshot | Ovládání prohlížeče nedokázalo načíst ani ovládat žádnou stránku. Žádný screenshot aplikace nevznikl | **PENDING – konkrétní policy blokace** |

Skutečný souběh skončil za 89 ms; hranice souběžné úhrady za 10 ms, oprava kilometrů a obnova úlohy po 9 ms. Zahrnoval dvě relace vlastníka, registraci ověřeného uploadu, serverové vystavení, přípravu COO, schválení jiného reportu a změnu identity dodavatele. Oprava kilometrového podkladu zachovala zmrazenou sazbu a částku **2 278 Kč**. Jde o výsledky `invoice-billing.concurrency.mjs`, nikoli o výkonový benchmark nebo fyzický mobilní test.

## Skutečné dokumenty, úklid a zachování historie

Konečný dokumentový běh je uložen v `/private/tmp/crewflow-demo-20261012/results/invoice-billing/task2-3095036b-7dce-49a9-b12e-5b8d525928f9/`. Předpona `task2` je stávající pojmenování harnessu; tento konkrétní běh patří k závěrečnému Task 4. `evidence.json` obsahuje skutečné identity a výsledky, `cleanup.json` potvrzuje obnovu a soukromý `worker-drain.private.json` její předpoklady.

Před integračními mutacemi se uložený soukromý snímek vztahoval na **27 tabulek / 486 původních řádků**. Po všech třech harness bězích zůstalo **486 / 486 přesně beze změny**, včetně profilů, částek, faktur, položek, dokumentů, zdrojové historie, reportů a původních job řádků. Přibyly pouze označené fiktivní účty/podklady těchto běhů. Historická uhrazená faktura `SF-2026-CREW-D-0001` zůstává **2 056 Kč / paid**.

Před prvním odložením dokumentový harness trvale uložil všech **24 přesných existujících queued/running job řádků**. Jeden vlastník úklidu nejprve zastavil a oplotil Cron, odčerpal **6 přímých HTTP požadavků a 1 požadavek Cron** s rozpoznaným dokončením a teprve potom obnovil **24 / 24 celých zachycených řádků**. Skutečný plánovaný běh nastal `2026-10-15T11:38:00.030374+02:00`. Konečný čtený stav má **0 testovacích plánovačů, 0 worker požadavků ve frontě, 0 pomocných ledgerů a 0 aktivních claim dotazů**. Všechny čtyři lifecycle triggery jsou zapnuté. Důkazy: `task4-protected-result.json`, `task4-cleanup-state.json` a uvedené cleanup/drain soubory. Root nezávisle přečetl skutečný receipt a comparator.

Před tímto během se zjistily starší obsluhované kopie funkcí. Po synchronizaci souhlasil obsah všech **20 sledovaných souborů a assetů** tří funkcí i jejich tří konfiguračních bloků se zkontrolovaným zdrojem. Po doloženém klidu bez Cron/fronty/claimů/ledgeru se restartoval pouze přesný lokální Edge runtime, aby nezůstal starý isolate. Readiness vrátilo 200/200/401; žádný autorizovaný worker nebyl spuštěn před snapshotem harnessu. Důkazy jsou `task4-edge-source-preflight.json`, `task4-edge-restart-preflight.log` a `task4-edge-readiness.log`.

Čerstvé snapshoty CH a COO obsahovaly každý 40 aktivních a 4 superseded podklady, 15 dokumentů a 47 bezpečně projektovaných job záznamů; oba běžné Crew účty měly ve vlastním scope prázdný seznam. Přesně **10 unikátních starších fiktivních podkladů** vytvořených před opravou kanonické schválené verze zůstává úzce rozpoznaných jako `needsSourceVerification`, pouze ke čtení. Nové kanonické podklady tento příznak nemají. Jejich staré částky, dokumenty ani raw verze se nepřepisovaly.

Nové skutečné PDF workeru má jednu stránku A4. Poppler jej vykreslil a implementátor i root stránku nezávisle vizuálně prohlédli: úplné identity a české adresy, **8 h 20 min / 2 083,33 Kč**, správná data a bankovní údaje, pravdivě chybějící IBAN, bez clippingu nebo překryvů. Důkaz je `task4-worker-invoice-1.png` a původní `worker-invoice.pdf` v adresáři běhu. Dřívějších šest vizuálně zkontrolovaných stran rendereru/workeru zahrnuje dlouhé identity, stránkování a stravné; toto je oddělený nový jednostránkový důkaz.

Soukromé přihlašovací údaje, tokeny, lease údaje, úplné snapshoty a PDF testovacího běhu zůstávají mimo Git. Všechny skutečné API testy výslovně ověřily `http://127.0.0.1:55321` a účty `@crewflow-demo.test`; ignorované `.env.local` směřující na Staff se pro ně nenačetlo.

## Známá omezení a dřívější incident

Při prvním Task 2 testu se odložilo 19 starších fiktivních úloh bez úplně uložených původních časů. Jeden čas se podařilo přesně obnovit; zbývajících **18 bylo vědomě nově provozně naplánováno** na `2026-10-15T06:32:23.247452Z` a tři staré běžící lease vypršely. **Nejde o přesné obnovení ztracených historických časů.** Atomická obnova a porovnání chráněných dat prokázaly zachované faktury, dokumenty, výkazy, částky a ostatní pole úloh. Pozdější skutečný aktivní SIGTERM důkaz opraveného úklidu prošel v Task 2; Task 4 jej zbytečně neopakoval a stop/fence/drain/restore helpers neměnil. Aktuální přesná obnova 24 řádků vychází z nově správně zachyceného stavu, nikoli z předstírané opravy starých ztracených časů.

Lokální databázový obraz PostgreSQL `17.6.1.106` má reprodukovaný pád odmítnutého volání staré soukromé funkce v diagnostickém session hooku `supautils`. Identický test při prázdném preloadu jednoho administrátorského spojení vrátí očekávané odmítnutí se stejnými ACL/RLS. **Výchozí lokální runtime proto není označený za PASS** a crash probe se neopakoval. Souvislost popisují [supabase/postgres#2112](https://github.com/supabase/postgres/issues/2112) a [supabase/supautils#214](https://github.com/supabase/supautils/issues/214). Dřívější čtení Staff ukázalo pro Data API `safeupdate`, zatímco management session načítá `supautils`; jde o porovnání konfigurace, nikoli živý hosted test odmítnutí. Lokální ověřovací díl Task 4 neprovedl žádný Staff zápis ani crash probe. Skutečné následné nasazení rootu a samostatné hosted porovnání jsou popsané výše; lokální a hosted počty upozornění se nesrovnávají jako stejná plocha.

Uživatel výslovně povolil výjimku Browse pro přesný localhost port 8098. Root následně jednou legitimně zopakoval připojení; nástroj přesto vrátil odmítnutí URL/protocol policy. **Žádné čtení ani ovládání prohlížeče neuspělo.** Omezení se neobcházelo jiným prohlížečem, CDP, headless nástrojem, snímkem OS ani nativním WebView. Úplný UI pilot a screenshot dema zůstávají PENDING; API upload a React test nejsou jejich náhrada. Později dokončený nativní read-only smoke test požadovaný `AGENTS.md` je samostatný důkaz instalace a spuštění, nikoli tento celý pilot.
