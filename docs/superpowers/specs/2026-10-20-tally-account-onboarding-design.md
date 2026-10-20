# Registrace a aktivace účtu crew

Datum: 20. 10. 2026

Stav: produktový návrh k revizi; potvrzené požadavky jsou oddělené od navržených technických pravidel.

Výchozí revize aplikace: `535fa0a`.

## Účel

Sjednotit cestu od přihlášky nebo pozvání k aktivnímu účtu v aplikaci nodu. Prvním připojeným zdrojem bude současný náborový formulář Tally; společný systém musí umožnit i další vstupy bez druhého modelu účtů nebo profilů.

Hlavní uživatelský průchod se navrhuje pro mobilní aplikaci. Webová verze umožní dokončení i bez instalace a použití na počítači. Obě verze používají stejný účet, profil, heslo, sazbu a oprávnění.

Tento návrh nahrazuje pro první provoz obecné povinné schvalování všech nových členů popsané v návrhu z 24. dubna. Pohovor může dál proběhnout podle potřeby, ale běžnou aktivaci účtu neblokuje.

## Potvrzené požadavky

- Současný formulář `https://tally.so/r/q4WOgd` se ponechá včetně znění otázky o fyzické práci.
- Tally je první připojený zdroj přihlášek, nikoli jediná přípustná cesta registrace. Systém počítá i s pozvánkou správce a budoucí registrací přímo v aplikaci nebo přes jiný formulář.
- Mobilní aplikace je preferovaný způsob používání. Aktivace i obnova hesla musí mít plnohodnotný mobilní průchod a funkční webové pokračování.
- Aktivační pozvánka platí 48 hodin od prvního odeslání aktuální pozvánky.
- Zájem o manuální práci i preference lehčí výpomoci umožňují automatickou pozvánku.
- Zájem pouze o administrativní výpomoc automatickou pozvánku neumožňuje.
- Zkušenost z eventů se eviduje jako samostatná odpověď. Odpověď „ne“ neznamená začátečníka ani nevypovídá o zkušenostech z jiných oborů.
- IČO, životopis, práce s nářadím a četnost práce nejsou dodatečnými automatickými vyřazovacími podmínkami. Věk se nepoužije k automatickému rozhodování o přístupu.
- Přihlášení bude přes e-mail a vlastní heslo. Pozvánka slouží k aktivaci účtu.
- Všichni současní členové mají sazbu 250 Kč/h. Novým profilům se 250 Kč/h nastaví automaticky; oprávněný správce může sazbu individuálně změnit.
- Opakovaný formulář nebo pozvánka nepřepíše individuálně změněnou sazbu, roli ani ověřené provozní údaje.
- Jeden člověk má jeden provozní profil, ke kterému zůstávají připojené jeho akce, výkazy a faktury.

## Doporučené řešení a alternativy

Doporučená první verze připojí Tally ke společné službě pro vyhodnocení přihlášky, dohledání profilu, přípravu účtu a pozvání. Tally bude jedním vstupním adaptérem. Společná pravidla a životní cyklus účtu nebudou závislé na jeho názvech polí, webhooku nebo identifikátorech.

| Vstup | Rozsah a návaznost |
| --- | --- |
| Současný formulář Tally | První automatický vstup, stávající otázky a dohodnuté vyhodnocení |
| Pozvánka od oprávněného správce | Stejná aktivace a jeden profil, správce zaznamená důvod pozvání |
| Budoucí registrace přímo v mobilní nebo webové aplikaci | Připojí se ke stejným pravidlům, identitě uživatele a aktivaci |
| Jiný formulář nebo integrace | Vlastní ověření vstupu a mapování odpovědí, společné zpracování přihlášky |

Alternativa s ručním potvrzením každé přihlášky přidává provozní práci a čekání. Ruční kontrola proto zůstane pro nejasné případy. Vlastní registrační formulář není nutné dodat současně s prvním napojením Tally; návrh tuto možnost zachovává. Tlačítko registrace v mobilní i webové verzi zatím otevře Tally a po přidání jiného vstupu se může změnit bez přestavby aktivace.

## Cesta nového zájemce

### 1. Přihláška nebo pozvání

V prvním automatickém vstupu zájemce vyplní současný formulář Tally. Jeho adaptér přijme podepsané oznámení o dokončeném odeslání, uloží odpověď a zdroj přihlášky a předá společnému zpracování rozpoznané údaje. Rozpracovaný formulář účty nezakládá.

Společná přihláška obsahuje zdroj, identifikátor události daného zdroje, kontaktní údaje, pracovní preference a samostatné odpovědi o zkušenostech. Další formulář předá stejný význam údajů svým adaptérem. Ruční pozvání je autorizovaná operace správce se zdrojem a důvodem; nevyžaduje uměle vytvářet odpověď Tally.

Rozhodnutí se vztahuje pouze k přístupu do aplikace. Samotný přístup neslibuje přidělení směny ani nepotvrzuje schopnost konkrétní práci vykonat.

### 2. Vyhodnocení odpovědi

| Odpověď na současnou otázku o fyzické práci | Výsledek pro přístup | Evidence preference |
| --- | --- | --- |
| Manuální práce včetně montáže a manipulace nevadí | Lze připravit pozvánku | Manuální výpomoc |
| Preferuje lehčí výpomoc, třídění a dekorace | Lze připravit pozvánku | Lehčí výpomoc |
| Preferuje administrativní výpomoc | Pozvánka se nepřipraví | Pouze administrativa |
| Odpověď chybí, je neznámá nebo obsahuje protichůdné volby | Ke kontrole | Původní odpověď se zachová |

Ostatní odpovědi zůstanou věcnými informacemi. Nezaloží automatické hodnocení spolehlivosti, celkové zručnosti ani obecný štítek začátečníka. Preference lehčí práce není důvod k zamítnutí účtu ani potvrzení vhodnosti pro těžkou manipulaci.

U administrativního zájmu se zachová přihláška s důvodem nezaložení přístupu. Případná automatická odpověď s vysvětlením se připraví jako samostatná komunikační šablona; první verze zde neposílá zamítací e-mail.

### 3. Dohledání profilu a příprava účtu

Systém hledá přesnou shodu normalizovaného e-mailu. Existující jednoznačný profil se použije znovu a jeho historie se zachová. Shoda pouze jména nebo telefonu není oprávněním připojit účet k existujícímu profilu. Více odpovídajících profilů nebo rozporné kontakty vyžadují kontrolu.

| Situace | Chování |
| --- | --- |
| Nový zájemce bez existujícího profilu a účtu | Vytvořit jeden profil se sazbou 250 Kč/h a připravit účet crew |
| Jednoznačný existující profil bez účtu | Navázat pozvánku na tento profil, zachovat jeho sazbu a historii |
| Již aktivní účet | Nezakládat další účet, neměnit heslo ani přístup; použít běžné přihlášení a obnovu hesla |
| Pozvánka čekající na aktivaci | Zachovat stejný profil; opakovaná událost sama nevyvolá další pozvánku |
| Pozastavený účet nebo ruční zákaz pozvání | Zachovat omezení a předat případ ke kontrole |
| Rozpor mezi e-mailem přihlášky, profilem a dalšími zdroji, například Cal.com | Nepřepisovat ověřenou identitu; předat případ ke kontrole |

Nový profil získá sazbu 250 Kč/h serverově. Změny sazeb zůstávají ve stávajícím administrativním workflow a nemění uložené finanční podklady již uzavřené práce. Hromadná změna sazeb starých profilů není součástí tohoto projektu.

### 4. Aktivační e-mail

E-mail obsahuje oslovení, důvod přijetí zprávy, stručný popis přístupu do aplikace, tlačítko aktivace, informaci o platnosti odkazu a kontakt podpory. Heslo se e-mailem neposílá.

Zpráva se posílá na e-mail konkrétní pozvánky. Vstupní formulář nemůže změnit přihlašovací e-mail existujícího účtu. Oprava překlepu se řeší opravou cíle pozvánky oprávněným správcem a vydáním nové pozvánky na opravenou adresu, bez automatického slučování podle jména.

Platnost pozvánky je 48 hodin od jejího prvního odeslání. Pouhé otevření nebo technické opakování stejné zprávy tuto dobu neprodlužuje. Výslovné nové zaslání vytvoří novou aktuální pozvánku na dalších 48 hodin a předchozí zneplatní; neaktivuje účet a neobnoví pozastavený přístup. Veřejné vyžádání nové pozvánky podléhá omezení četnosti a vždy vrací obecnou odpověď bez zveřejnění existence účtu.

E-mail obsahuje jeden HTTPS odkaz, který na podporovaném telefonu umožní pokračování v nainstalované aplikaci a jinak zobrazí webovou aktivační stránku. Na ní je možné pokračovat v prohlížeči nebo otevřít dostupný ověřený způsob instalace mobilní aplikace. Po instalaci člověk znovu otevře původní odkaz z e-mailu. Nepředpokládá se automatické přenesení rozpracované pozvánky přes obchod s aplikacemi.

Provozní e-maily využijí ověřenou odesílací doménu a vlastní e-mailovou službu; stejná konfigurace odesílatele se použije pro e-maily Supabase Auth, jako je obnova hesla. Odesílací adresa, veřejná HTTPS adresa aplikace, dostupný instalační odkaz a kontakt podpory budou součástí konfigurace konkrétního nasazení. Jejich nastavení se před zapnutím ověří skutečnou testovací zprávou na výslovně určenou adresu.

### 5. Aktivace účtu

Stejný aktivační průchod bude dostupný v mobilní aplikaci i na webu. Rozložení a ovládání se nejdříve navrhují pro telefon. Otevření odkazu samo neaktivuje účet ani nespotřebuje pozvánku; potvrzení provede člověk vlastní akcí.

| Kde se otevře odkaz | Pokračování |
| --- | --- |
| Telefon s nainstalovanou podporovanou aplikací | Aktivace v aplikaci; při neotevření aplikace nabídne web také tlačítko pro otevření |
| Telefon bez aplikace | Web nabídne instalaci a možnost dokončit aktivaci v prohlížeči |
| Po instalaci aplikace | Opětovné otevření původního e-mailového odkazu pokračuje ke stejnému profilu |
| Počítač | Aktivace ve webové verzi |
| Účet již aktivovaný v jiné verzi | Běžné přihlášení stejným e-mailem a heslem |

Po ověření pozvánky se zobrazí formulář pro nastavení vlastního hesla a kontrolu předvyplněného jména a telefonu. E-mail pozvánky zde nelze volně přepsat. Heslo spravuje Supabase Auth; aplikace je neukládá do profilu ani provozních záznamů.

Účet se stane aktivním po serverovém ověření správné pozvánky, e-mailu a dokončení nastavení hesla. V prvním pilotu před dokončením nevzniká přihlašovací účet ani relace. Běžně přerušený formulář lze otevřít znovu; nepřipravuje se další provozní profil. Pokud se ztratí odpověď při vytváření účtu, server nejprve ověří vyhrazený účet. Jestli nelze bezpečně určit výsledek, další pokus zůstane zablokovaný a správce vydá novou pozvánku ke stejnému profilu. Původní pozvánka ani případný opožděný požadavek potom nemohou dokončit aktivaci nebo přepsat heslo.

Po aktivaci člověk zůstane přihlášený v prostředí, kde ji dokončil, a pokračuje do prvního uvedení do aplikace. Web a mobil mají vlastní přihlašovací relace. Aktivace ve webovém prohlížeči proto neslibuje automatické přihlášení v později nainstalované aplikaci; tam člověk použije stejné zvolené heslo.

### 6. První vstup

Krátké uvedení vysvětlí prohlížení směn, podání přihlášky, potvrzení koordinátorem a následné vykazování práce. Hlavní pokračování vede na nabídky směn. Potvrzení konkrétní směny zůstává samostatným rozhodnutím koordinátora.

Jméno, e-mail a telefon se převezmou z dokončené aktivace. Fakturační údaje se mohou doplnit v profilu později; jejich absence neblokuje prohlížení nabídek. Tento projekt nezavádí nové pravidlo pro přijetí na směnu, uzavírání smluv ani výplatu. Stávající kontrola úplnosti fakturačních údajů zůstává zachovaná.

První uvedení je možné přeskočit a později otevřít z nápovědy. Jeho zobrazení není podmínkou oprávnění.

### 7. Další přihlášení a obnova

Další přihlášení používá e-mail a heslo ve webové i mobilní aplikaci. Přihlášení nabídne obnovu zapomenutého hesla s návratem do mobilní aplikace, pokud je dostupná, a funkčním dokončením na webu. Neaktivní účet pokračuje v aktivaci; pozastavenému účtu se zobrazí odpovídající stav a kontakt podpory.

Obnova hesla sama nemění rozhodnutí o přístupu, sazbu ani roli. Prošlá nebo již použitá pozvánka nabídne odpovídající cestu k novému odkazu nebo běžnému přihlášení.

## Evidence pro správce

Výsledek vstupního vyhodnocení, stav účtu a stav e-mailu jsou oddělené informace. Pohovor i přijetí na konkrétní směnu mají vlastní průběh a z aktivace se automaticky neodvozují.

| Oblast | Stavy |
| --- | --- |
| Vyhodnocení přihlášky | Způsobilý pro pozvání; pouze administrativa; ke kontrole |
| Účet | Bez účtu; čeká na aktivaci; aktivní; pozastavený |
| Odeslání pozvánky | Připraveno; zpracovává se; odesláno poskytovateli; chyba; vrácená zpráva, pokud ji poskytovatel hlásí |

Odeslání poskytovateli se neoznačuje jako jisté doručení. Otevření e-mailu se nepoužívá jako důkaz aktivace.

Správce vidí zdroj a čas přihlášky, rozhodující odpověď, výsledek s důvodem, propojený profil, čas odeslání a dokončení aktivace a chybu vyžadující zásah. Pozvánku může zopakovat, opravit chybné údaje nebo přístup pozastavit. Změny rozhodnutí a přístupu se zaznamenávají s autorem, časem a důvodem.

Pro první verzi je navržena správa přístupů a individuální sazby pro roli COO. Crew vidí a mění pouze své povolené osobní a fakturační údaje; nemůže si změnit sazbu, roli ani stav aktivace. Crewhead může používat pracovní preference při plánování, bez automatického rozšíření přístupu k náborovým dokumentům a správě účtů.

## Technické hranice

### Společný proces a adaptéry vstupů

- Doménové zpracování přihlášky, profilu a pozvánky přijímá obecný zdroj a normalizované údaje. Nezávisí na Tally payloadu, popiscích otázek ani konkrétním klientovi.
- Tally adaptér ověřuje podpis a formulář a mapuje stávající odpovědi. Případný formulář přímo v aplikaci a další integrace mají vlastní validaci vstupu a použijí stejné společné zpracování.
- Pracovní preference mají společný význam: manuální výpomoc, lehčí výpomoc, pouze administrativa, nerozpoznáno. Zkušenost z eventů zůstává samostatným údajem.
- Jedinečnost události vychází ze zdroje a jeho identifikátoru odeslání. Jeden člověk může přijít více zdroji, aniž by vznikl další účet nebo se přepsaly ruční úpravy.
- Připojení nového zdroje je výslovná konfigurace s určenými pravidly. Samotné nezpracované vytvoření Auth účtu není schváleným vstupem registrace.

### Příjem Tally a opakování

- Přijímat pouze podepsané dokončené odpovědi schváleného formuláře. Odmítnout neplatný podpis, neočekávaný formulář a neplatnou strukturu.
- Rozhodující pole a volby mapovat podle ověřených stabilních identifikátorů formuláře. Text otázky se nemění. Neznámá volba směřuje ke kontrole, nikoli k automatickému přístupu.
- Přijetí odpovědi a uložení úlohy pro pokračování proběhne trvale před potvrzením úspěchu Tally. Odesílání e-mailu neběží jako nezaznamenaná práce po skončení požadavku.
- Identifikátor odeslání zajistí opakovatelné zpracování. Opakovaná doručení nemění individuální sazbu, roli, ruční omezení ani ověřené kontakty.
- Při souběhu se musí zachovat jeden provozní profil a jeden účet. Po nejasném výsledku vytvoření účtu se nejprve ověří skutečný stav a teprve potom pokračuje.
- Zasílání má uložený stav, omezené opakování a možnost ruční nápravy. Vzácná duplicitní zpráva při nejasném potvrzení poskytovatele nesmí vytvořit druhý účet ani druhé oprávnění.

### Pozvánka na 48 hodin

Platnost pozvánky spravuje vlastní serverový záznam s cílovým profilem a e-mailem, otiskem kryptograficky náhodného tajemství, časem prvního odeslání, koncem platnosti a stavem použití či odvolání. Tajemství umožňuje pouze dokončení konkrétní pozvánky; není to provozní přihlašovací relace ani obecný reset hesla.

Po vlastní potvrzující akci člověka server ověří platnost, cílovou identitu a aktuální stav účtu a umožní krátkodobý ověřovací krok Supabase Auth pro nastavení hesla. Otevření odkazu ani tento krok neprodlouží 48hodinovou hranici. Dokončení se autorizuje serverově a jednorázově; po aktivaci se pozvánka zneplatní. Souběžná dokončení nesmějí změnit jiný účet nebo opakovaně nastavovat heslo již aktivního uživatele. Oprava přerušeného dokončení používá zaznamenaný stav stejné operace.

Podle dokumentace Supabase sdílejí nativní e-mailové odkazy nastavení expirace také s obnovou hesla a změnou e-mailu. Proto se kvůli dvoudenní pozvánce plošně neprodlužuje životnost těchto dalších ověřovacích prostředků. Hesla a běžné relace dál spravuje Supabase Auth.

### Mobilní a webové pokračování

- Veřejný HTTPS odkaz použije ověřené Universal Links nebo App Links na podporovaných platformách a má funkční webovou stránku pro pokračování.
- Mobilní klient zpracuje odkaz při spuštění zavřené aplikace i při návratu do již spuštěné aplikace. Současná konfigurace Capacitor sama o sobě nezajišťuje toto směrování; jde o součást implementace aktivace.
- Přesměrování smí vést pouze na povolenou doménu a povolené mobilní cíle. Pozvánkové tajemství ani přihlašovací tokeny se nepředávají do obchodu s aplikacemi nebo analytiky.
- Odkaz funguje na jiném zařízení a v jiném prohlížeči, než kde vznikla přihláška. Dokončení nezávisí na lokálním stavu prohlížeče, který odeslal Tally.
- Mobilní i webový klient používají stejnou serverovou kontrolu platnosti a jednorázového dokončení. Stav aktivace se neukládá jen do paměti konkrétního klienta.
- Obnova hesla má stejné směrování mezi mobilem a webem, ale vlastní pravidla a platnost ověřovacího kroku. Již přihlášený jiný člověk musí při aktivaci výslovně přejít na identitu pozvánky; aktivace nesmí přepsat jeho účet.

### Identita a oprávnění

- `profiles.id` zůstává provozní identitou. Vazba na účet používá `profiles.user_id`; kandidát má explicitní vazbu na tento profil.
- Současný trigger při vytvoření Auth účtu automaticky zakládá profil. Implementace musí tento krok sladit s připojením existujícího profilu, aby nevytvořil duplicitní identitu. Vazbu určuje důvěryhodná serverová operace, nikoli upravitelná metadata klienta.
- Role, sazba a aktivace se autorizují serverově. Vývojářské přepínání rolí nesmí novým uživatelům umožnit získat skutečná vyšší oprávnění.
- Omezení neaktivního a pozastaveného účtu platí také pro databázové operace, veřejně volatelné funkce a dokumenty, nejen pro viditelnost obrazovek. Musí účinkovat i u existující relace.
- Přímé volání registrace Supabase nesmí obejít společná pravidla schváleného vstupu a získat provozní přístup. Budoucí oficiální registrační obrazovka tato pravidla použije; není závislá na existenci odpovědi Tally. Případný samotný Auth účet není oprávněním k provozním datům.
- Změna přihlášeného účtu nesmí zobrazit soukromé údaje předchozího člověka. Zachová se současná izolace dat podle identity.
- Tokeny, hesla, plné pozvánkové odkazy a kompletní odpovědi formuláře nepatří do veřejných protokolů ani analytiky. Životopis a původní odpovědi nejsou běžně přístupné ostatním členům crew.

### Existující účty

Před zapnutím se jednorázově identifikují stávající provozní účty a zachová se jejich aktivní přístup. Samotné rozšíření schématu nesmí odhlásit správce nebo znepřístupnit existující provoz. Chybějící či rozporná propojení profilů se vypíší ke kontrole.

Starší kandidáti nedostanou hromadně pozvánku změnou aplikace. Případné dopozvání je samostatný, výslovně spuštěný krok nad zvolenou skupinou. Ruční pozvání současného člena použije stejnou aktivaci a zachová jeho profil.

## Postupné dodání

1. **Jeden celý průchod na testovacích datech:** společný profil a pozvání nezávislé na zdroji, sazba 250 Kč/h pro nový profil, pozvánka do lokální schránky s platností 48 hodin, vlastní heslo, aktivace, první přihlášení a obnova hesla. Ověřit hlavní průchod v mobilní aplikaci i webové pokračování bez instalace a omezení přístupu před aktivací.
2. **První automatický vstup Tally:** samostatný adaptér, přesné mapování stávajících odpovědí a předání společnému zpracování s ochranou proti souběhům a duplicitám. Ověřit také ruční pozvánku přes stejné jádro, bez nutnosti vytvářet odpověď Tally.
3. **Provozní dohled:** stav přihlášky, účtu a odesílání, opakování pozvánky, ruční kontrola nejasností a pozastavení přístupu.
4. **Ověření a omezené zapnutí:** celý průchod v nainstalované mobilní aplikaci, pokračování bez instalace a použití na počítači, kontrola e-mailové konfigurace a konkrétních oprávnění. Automatické zasílání se zapne až pro výslovně určený cíl a rozsah pilotu.

Detailní implementační plán se připraví po revizi tohoto návrhu. Produktový návrh ani lokální test neopravňuje sám o sobě k rozesílání pozvánek skutečným lidem nebo ke změně přístupů v provozu.

## Přijímací scénáře

| Scénář | Očekávaný výsledek |
| --- | --- |
| Zájem o manuální práci | Jeden profil, sazba 250 Kč/h pro nový profil, připravená pozvánka |
| Preference lehčí práce | Stejná možnost aktivace, zachovaná preference |
| Pouze administrativa | Evidence důvodu, žádný automaticky založený přístup |
| Bez eventové zkušenosti, IČO nebo CV | Žádné automatické vyřazení a žádný obecný štítek začátečníka |
| Neznámá rozhodující odpověď nebo rozporná identita | Kontrola člověkem, žádné automatické propojení |
| Stejná odpověď přijde opakovaně či souběžně | Jeden profil a účet, zachované ruční změny |
| Existující profil s individuálně změněnou sazbou | Aktivace zachová sazbu i historii |
| Shodné jméno dvou lidí | Profily se automaticky nesloučí |
| Chyba odesílání a opakování | Přihláška se neztratí, stav je viditelný, nový účet nevznikne |
| Přednačtení odkazu poštovním systémem | Samo neaktivuje účet ani nespotřebuje pozvánku |
| Otevření mezi 24. a 48. hodinou od odeslání | Pozvánka stále umožní dokončení aktivace |
| Dokončení po 48 hodinách nebo použití odvolané pozvánky | Aktivace se odmítne a nabídne novou pozvánku |
| Opakované odeslání stejné zprávy poskytovatelem | Neposune původní konec platnosti |
| Výslovně vyžádaná nová pozvánka | Nových 48 hodin, původní odkaz neplatí |
| Přerušení nebo prošlý odkaz | Srozumitelné pokračování nebo nový odkaz ke stejnému profilu |
| Odkaz na telefonu s aplikací | Aktivace v aplikaci při studeném startu i v běžící aplikaci |
| Odkaz na telefonu bez aplikace | Funkční webové pokračování a dostupná instalační cesta |
| Instalace mezi přijetím pozvánky a aktivací | Opětovné otevření původního odkazu pokračuje ke stejnému profilu |
| Aktivace na webu a následný vstup v mobilní aplikaci | Běžné přihlášení stejným účtem, žádná nová registrace |
| Odkaz otevřený na jiném zařízení než přihláška | Platná aktivace bez závislosti na původním prohlížeči |
| Pokus o provozní operaci před aktivací | Odmítnutí na serveru i při přímém volání |
| Pozastavení a následný nový formulář nebo obnova hesla | Přístup zůstává pozastavený |
| Změna účtu na stejném zařízení | Žádné zobrazení dat předchozího člověka |
| Ruční pozvání správce bez odpovědi Tally | Stejná aktivace a profil se zaznamenaným zdrojem a důvodem |
| Později připojený schválený registrační vstup | Společná pravidla a identita, žádný druhý model účtů |
| Přímé volání registrace mimo schválené vstupy | Žádné obejití rozhodnutí o provozním přístupu |
| Aktualizace aplikace se starými kandidáty | Žádné hromadné automatické pozvánky |

## Rozsah první verze

Součástí jsou společný proces přihlášky a pozvání, mobilní a webová aktivace, přihlášení, obnova hesla, Tally jako první automatické napojení, ruční pozvánka, jednotný profil, výchozí sazba a dohled nad přístupem. Další registrační formuláře a integrace se mohou připojit následně ke stejnému základu. Automatické smlouvy, nový systém hodnocení lidí, přestavba směn, sociální přihlášení a samotné publikování aplikace do App Store patří do samostatných projektů; zpracování aktivačních odkazů v mobilní aplikaci je součástí této verze.

## Podklady

- [Současný formulář Tally](https://tally.so/r/q4WOgd).
- [Původní návrh identity a schvalování](2026-04-24-crew-onboarding-and-approval-design.md).
- [Tally: webhooks, podpis a opakované doručení](https://tally.so/help/webhooks).
- [Supabase: odesílání e-mailů přes vlastní SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
- [Supabase: e-mailové šablony a přednačítání odkazů](https://supabase.com/docs/guides/auth/auth-email-templates).
- [Supabase: společná expirace e-mailových ověřovacích prostředků](https://supabase.com/docs/guides/auth/auth-email-passwordless).
- [Supabase: pokračování přihlašování v mobilní aplikaci](https://supabase.com/docs/guides/auth/native-mobile-deep-linking).
- [Capacitor: Universal Links a App Links](https://capacitorjs.com/docs/guides/deep-links).

Technický stav vychází ze souborů `supabase/functions/tally-candidate-webhook/index.ts`, `supabase/migrations/20260408103107_.sql`, `src/app/providers/AuthProvider.tsx`, `src/pages/Index.tsx`, `src/App.tsx`, `src/views/RecruitmentView.tsx`, `capacitor.config.ts` a stávajícího modelu `profiles` v uvedené revizi aplikace. Konfigurace živého e-mailového poskytovatele, doručení do skutečných schránek ani nativní směrování aktivačních odkazů nebyly touto dokumentací ověřeny.
