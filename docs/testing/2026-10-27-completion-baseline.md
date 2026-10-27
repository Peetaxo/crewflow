# Nodu — výchozí stav dokončovacího plánu

Datum: **27. 10. 2026**. Etapa 0: **ověřeno** — navazující práce má čistý aktuální základ a původní rozpracované soubory jsou zachované.

## Pracovní základ

- Vzdálený GitHub `Peetaxo/crewflow`, větev `main`, byl nově ověřen přes GitHub API: **`ddc3101e1815c957e3109e54d45b61bb869f509f`**. Místní `origin/main` odpovídá stejnému commitu.
- Samostatná pracovní kopie: `/Users/peetax/Projekty/crewflow/.worktrees/nodu-completion-20261027`, větev `codex/nodu-completion-20261027`, vytvořená přímo z tohoto `origin/main`. Před přidáním evidence a kopie plánu byla čistá.
- Původní checkout `/Users/peetax/Projekty/crewflow` zůstává na `e767695`, 21 commitů za aktuálním main. Jeho pracovní změny nejsou základem navazující implementace a nebyly přepsány.
- Prostředí: Node **v24.15.0**, npm **11.12.1**, Vitest **4.1.4**. Závislosti jsou propojené s existující pracovní kopií onboardingu; shoda obou `package-lock.json` byla ověřena před propojením. Nebyl změněn lockfile ani instalována nová verze balíku.
- Původní ignorované konfigurace zůstávají na místě. Tato etapa nemění aplikaci ani nativní balík, proto nevytváří nový požadavek na refresh vývojových instalací.

## Zachování a porovnání místní práce

Kontrolní kopie a binární Git patch jsou mimo repozitář v `/Users/peetax/Projekty/.crewflow-completion-snapshot-20261027`; `manifest.json` obsahuje SHA-256. Po kontrolách byla znovu ověřena shoda všech původních souborů s kontrolní kopií. Nezapsaný generovaný adresář `vendor/capacitor-push-notifications/.swiftpm/` zůstává nedotčený na původním místě.

| Soubor | Zjištění a další zacházení |
|---|---|
| `ios/App/App/Info.plist` | Obsah po načtení přes `plistlib` je shodný s původním HEAD i aktuálním main. Liší se pouze odsazení a pořadí klíče `CFBundleVersion`. Nevyžaduje funkční přenos; původní soubor je zachovaný. |
| `src/views/TimelogsView.tsx` | Obsahuje dosud nezačleněný měsíční filtr pro management, kompaktní rozložení ovládání a odloženou inicializaci měsíce až po načtení query. Původní patch se na aktuální main čistě neaplikuje. Celý soubor se nesmí přenést: zrušil by novější společné kompaktní karty, opravu prázdného stavu a pořadí ovládání před kartami. Potřebné části později přenést samostatnými změnami se zachováním aktuálního chování. |
| `src/views/TimelogsView.test.tsx` | Pět nových testovacích případů pro management a inicializaci měsíce zůstává potřebnou evidencí této samostatné práce. Původní přírůstkový patch se na main aplikuje, celý starý soubor však obsahuje i starší podobu mocků a chybějí mu novější regresní testy. Nepřepisovat jím současné testy. |

Novější opravy souvisejících souborů v main: `1b7c870`, `10c2931`, `e8ebca5`, `b43807e`. Měsíční filtr schvalování je zachovaná rozpracovaná práce; jeho začlenění není součástí etapy 0 ani opravy měsíčních souhrnů dashboardu.

## Nově spuštěné kontroly

| Příkaz | Výsledek |
|---|---|
| `npm test` | Exit 1: 206 souborů prošlo, 4 selhaly; 2 727 testů prošlo, 6 selhalo. Čtyři původní chyby byly časové limity 5 sekund, dvě následné chyby obsahovaly duplicitní DOM po timeoutu. Běh sdílel prostředky s lintem, buildem a typecheckem. |
| Opakování 4 dotčených souborů s `--maxWorkers=2` | Exit 0: **4 soubory / 140 testů prošlo**, beze změny zdrojů. |
| `npm test -- --maxWorkers=2` | **Exit 0: 210 souborů / 2 733 testů prošlo**, 285,47 s, beze změny zdrojů. |
| `npm run lint` | **Exit 0**. |
| `npm run build` | **Exit 0**. Existující varování o velikosti balíku a neúčinných dynamických importech. |
| `npx tsc --noEmit -p tsconfig.app.json` | **Exit 2: 109 diagnostik v 37 souborech**. Jde o nově přepočítaný stav současného main; nejsou prohlášené za opravené. |
| `git diff --check` | **Exit 0** před zapsáním evidence; opakuje se po úpravě dokumentace. |

Úplný seznam typových diagnostik je v [příloze](2026-10-27-completion-baseline-types.txt). Všechny aplikační zdroje při těchto bězích odpovídaly ověřenému commitu main. Omezení souběhu není změna aplikace ani zvýšení časového limitu testů. První neúspěšný běh zůstává součástí evidence. Čistý opakovaný běh potvrzuje použitelný základ; pro navazující ověřování na tomto vytíženém počítači používat nejvýše dva testovací workery.

Podrobné místní logy: `/private/tmp/nodu-completion-baseline-tests-20261027.log`, `/private/tmp/nodu-completion-baseline-recheck-20261027.log`, `/private/tmp/nodu-completion-baseline-tests-bounded-20261027.log`, `/private/tmp/nodu-completion-baseline-lint-20261027.log`, `/private/tmp/nodu-completion-baseline-build-20261027.log`, `/private/tmp/nodu-completion-baseline-types-20261027.log`.

## Navazující práce

Celý místní průchod nového člena je uzavřený v [záznamu onboardingu](../superpowers/plans/2026-10-26-member-onboarding-completion-verification.md). První čtecí kontrola živých oprávnění je v [záznamu přístupů](2026-10-27-pilot-access.md); navazuje samostatná oprava oprávnění. `TODO.md` zůstává beze změny jako zásobník pro závěrečnou etapu.
