# Registrace přes Tally a aktivace účtu crew

Datum: 20. 10. 2026

Stav: produktový návrh k revizi; potvrzené požadavky jsou oddělené od navržených technických pravidel.

Výchozí revize aplikace: `535fa0a`.

## Účel

Propojit současný náborový formulář Tally s účtem v aplikaci nodu tak, aby zájemce mohl po odeslání formuláře získat přístup bez běžného ručního schvalování. Dokončení účtu musí fungovat v prohlížeči na telefonu i na počítači. Stejný účet následně používá mobilní aplikace.

Tento návrh nahrazuje pro první provoz obecné povinné schvalování všech nových členů popsané v návrhu z 24. dubna. Pohovor může dál proběhnout podle potřeby, ale běžnou aktivaci účtu neblokuje.

## Potvrzené požadavky

- Současný formulář `https://tally.so/r/q4WOgd` se ponechá včetně znění otázky o fyzické práci.
- Zájem o manuální práci i preference lehčí výpomoci umožňují automatickou pozvánku.
- Zájem pouze o administrativní výpomoc automatickou pozvánku neumožňuje.
- Zkušenost z eventů se eviduje jako samostatná odpověď. Odpověď „ne“ neznamená začátečníka ani nevypovídá o zkušenostech z jiných oborů.
- IČO, životopis, práce s nářadím a četnost práce nejsou dodatečnými automatickými vyřazovacími podmínkami. Věk se nepoužije k automatickému rozhodování o přístupu.
- Přihlášení bude přes e-mail a vlastní heslo. Pozvánka slouží k aktivaci účtu.
- Všichni současní členové mají sazbu 250 Kč/h. Novým profilům se 250 Kč/h nastaví automaticky; oprávněný správce může sazbu individuálně změnit.
- Opakovaný formulář nebo pozvánka nepřepíše individuálně změněnou sazbu, roli ani ověřené provozní údaje.
- Jeden člověk má jeden provozní profil, ke kterému zůstávají připojené jeho akce, výkazy a faktury.

## Doporučené řešení a alternativy

Doporučená první verze ponechá Tally jako jediný veřejný vstup registrace a doplní přímo existující napojení do aplikace. Zpracování odpovědi, příprava účtu a zasílání pozvánky budou oddělené kroky se zaznamenaným výsledkem.

Alternativa s ručním potvrzením každé přihlášky přidává provozní práci a čekání. Ruční kontrola proto zůstane pouze pro nejasné případy. Samostatný nový registrační formulář v aplikaci by vyžadoval udržovat dvě vstupní cesty; do první verze nepatří. Tlačítko registrace na webu aplikace otevře Tally.

## Cesta nového zájemce

### 1. Odeslání Tally

Zájemce vyplní současný formulář. Aplikace přijme podepsané oznámení o dokončeném odeslání, uloží odpověď a zdroj přihlášky a zaznamená výsledek zpracování. Rozpracovaný formulář účty nezakládá.

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
| Rozpor mezi e-mailem Tally, profilem a Cal.com | Nepřepisovat ověřenou identitu; předat případ ke kontrole |

Nový profil získá sazbu 250 Kč/h serverově. Změny sazeb zůstávají ve stávajícím administrativním workflow a nemění uložené finanční podklady již uzavřené práce. Hromadná změna sazeb starých profilů není součástí tohoto projektu.

### 4. Aktivační e-mail

E-mail obsahuje oslovení, důvod přijetí zprávy, stručný popis přístupu do aplikace, tlačítko aktivace, informaci o platnosti odkazu a kontakt podpory. Heslo se e-mailem neposílá.

Zpráva se posílá na e-mail konkrétní pozvánky. Vstupní formulář nemůže změnit přihlašovací e-mail existujícího účtu. Oprava překlepu se řeší opravou cíle pozvánky oprávněným správcem a vydáním nové pozvánky na opravenou adresu, bez automatického slučování podle jména.

Navržená platnost odkazu je 24 hodin. Nové zaslání vytvoří aktuální pozvánku; neaktivuje účet a neobnoví pozastavený přístup. Veřejné vyžádání nové pozvánky podléhá omezení četnosti a vždy vrací obecnou odpověď bez zveřejnění existence účtu.

Provozní e-maily využijí ověřenou odesílací doménu a vlastní e-mailovou službu připojenou k Supabase Auth. Odesílací adresa, veřejná HTTPS adresa aplikace a kontakt podpory budou součástí konfigurace konkrétního nasazení. Jejich nastavení se před zapnutím ověří skutečnou testovací zprávou na výslovně určenou adresu.

### 5. Aktivace účtu

Aktivační stránka funguje v běžném prohlížeči a nevyžaduje předchozí instalaci mobilní aplikace. Otevření stránky samo neaktivuje účet ani nespotřebuje jednorázový odkaz; potvrzení provede člověk vlastní akcí.

Po ověření pozvánky se zobrazí formulář pro nastavení vlastního hesla a kontrolu předvyplněného jména a telefonu. E-mail pozvánky zde nelze volně přepsat. Heslo spravuje Supabase Auth; aplikace je neukládá do profilu ani provozních záznamů.

Účet se stane aktivním po serverovém ověření správné pozvánky, e-mailu a dokončení nastavení hesla. Do té doby má případná přihlašovací relace přístup pouze k vlastním krokům aktivace. Přerušení lze dokončit znovu; nepřipravuje se další provozní profil.

Po aktivaci člověk zůstane přihlášený a pokračuje do prvního uvedení do aplikace.

### 6. První vstup

Krátké uvedení vysvětlí prohlížení směn, podání přihlášky, potvrzení koordinátorem a následné vykazování práce. Hlavní pokračování vede na nabídky směn. Potvrzení konkrétní směny zůstává samostatným rozhodnutím koordinátora.

Jméno, e-mail a telefon se převezmou z dokončené aktivace. Fakturační údaje se mohou doplnit v profilu později; jejich absence neblokuje prohlížení nabídek. Tento projekt nezavádí nové pravidlo pro přijetí na směnu, uzavírání smluv ani výplatu. Stávající kontrola úplnosti fakturačních údajů zůstává zachovaná.

První uvedení je možné přeskočit a později otevřít z nápovědy. Jeho zobrazení není podmínkou oprávnění.

### 7. Další přihlášení a obnova

Další přihlášení používá e-mail a heslo ve webové i mobilní aplikaci. Přihlášení nabídne obnovu zapomenutého hesla. Neaktivní účet pokračuje v aktivaci; pozastavenému účtu se zobrazí odpovídající stav a kontakt podpory.

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

### Příjem Tally a opakování

- Přijímat pouze podepsané dokončené odpovědi schváleného formuláře. Odmítnout neplatný podpis, neočekávaný formulář a neplatnou strukturu.
- Rozhodující pole a volby mapovat podle ověřených stabilních identifikátorů formuláře. Text otázky se nemění. Neznámá volba směřuje ke kontrole, nikoli k automatickému přístupu.
- Přijetí odpovědi a uložení úlohy pro pokračování proběhne trvale před potvrzením úspěchu Tally. Odesílání e-mailu neběží jako nezaznamenaná práce po skončení požadavku.
- Identifikátor odeslání zajistí opakovatelné zpracování. Opakovaná doručení nemění individuální sazbu, roli, ruční omezení ani ověřené kontakty.
- Při souběhu se musí zachovat jeden provozní profil a jeden účet. Po nejasném výsledku vytvoření účtu se nejprve ověří skutečný stav a teprve potom pokračuje.
- Zasílání má uložený stav, omezené opakování a možnost ruční nápravy. Vzácná duplicitní zpráva při nejasném potvrzení poskytovatele nesmí vytvořit druhý účet ani druhé oprávnění.

### Identita a oprávnění

- `profiles.id` zůstává provozní identitou. Vazba na účet používá `profiles.user_id`; kandidát má explicitní vazbu na tento profil.
- Současný trigger při vytvoření Auth účtu automaticky zakládá profil. Implementace musí tento krok sladit s připojením existujícího profilu, aby nevytvořil duplicitní identitu. Vazbu určuje důvěryhodná serverová operace, nikoli upravitelná metadata klienta.
- Role, sazba a aktivace se autorizují serverově. Vývojářské přepínání rolí nesmí novým uživatelům umožnit získat skutečná vyšší oprávnění.
- Omezení neaktivního a pozastaveného účtu platí také pro databázové operace, veřejně volatelné funkce a dokumenty, nejen pro viditelnost obrazovek. Musí účinkovat i u existující relace.
- Přímé volání registrace Supabase nesmí obejít požadovaný vstup a získat provozní přístup. Případný samotný Auth účet není oprávněním k provozním datům.
- Změna přihlášeného účtu nesmí zobrazit soukromé údaje předchozího člověka. Zachová se současná izolace dat podle identity.
- Tokeny, hesla, plné pozvánkové odkazy a kompletní odpovědi formuláře nepatří do veřejných protokolů ani analytiky. Životopis a původní odpovědi nejsou běžně přístupné ostatním členům crew.

### Existující účty

Před zapnutím se jednorázově identifikují stávající provozní účty a zachová se jejich aktivní přístup. Samotné rozšíření schématu nesmí odhlásit správce nebo znepřístupnit existující provoz. Chybějící či rozporná propojení profilů se vypíší ke kontrole.

Starší kandidáti nedostanou hromadně pozvánku změnou aplikace. Případné dopozvání je samostatný, výslovně spuštěný krok nad zvolenou skupinou. Ruční pozvání současného člena použije stejnou aktivaci a zachová jeho profil.

## Postupné dodání

1. **Jeden celý průchod na testovacích datech:** propojení jednoho profilu, sazba 250 Kč/h pro nový profil, pozvánka do lokální schránky, vlastní heslo, aktivace, první přihlášení a obnova hesla. Zahrnout omezení přístupu před aktivací.
2. **Automatický vstup Tally:** přesné mapování stávajících odpovědí, vyhodnocení pravidla a trvalé zpracování s ochranou proti souběhům a duplicitám.
3. **Provozní dohled:** stav přihlášky, účtu a odesílání, opakování pozvánky, ruční kontrola nejasností a pozastavení přístupu.
4. **Ověření a omezené zapnutí:** celý průchod na telefonu a počítači, kontrola e-mailové konfigurace a konkrétních oprávnění. Automatické zasílání se zapne až pro výslovně určený cíl a rozsah pilotu.

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
| Přerušení nebo prošlý odkaz | Srozumitelné pokračování nebo nový odkaz ke stejnému profilu |
| Pokus o provozní operaci před aktivací | Odmítnutí na serveru i při přímém volání |
| Pozastavení a následný nový formulář nebo obnova hesla | Přístup zůstává pozastavený |
| Změna účtu na stejném zařízení | Žádné zobrazení dat předchozího člověka |
| Přímá registrace mimo Tally | Žádné obejití rozhodnutí o provozním přístupu |
| Aktualizace aplikace se starými kandidáty | Žádné hromadné automatické pozvánky |

## Rozsah první verze

Součástí jsou aktivace, přihlášení, obnova hesla, napojení Tally, jednotný profil, výchozí sazba a dohled nad přístupem. Automatické smlouvy, nový systém hodnocení lidí, přestavba směn, sociální přihlášení a distribuce aplikace přes App Store patří do samostatných projektů.

## Podklady

- [Současný formulář Tally](https://tally.so/r/q4WOgd).
- [Původní návrh identity a schvalování](2026-04-24-crew-onboarding-and-approval-design.md).
- [Tally: webhooks, podpis a opakované doručení](https://tally.so/help/webhooks).
- [Supabase: odesílání e-mailů přes vlastní SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
- [Supabase: e-mailové šablony a přednačítání odkazů](https://supabase.com/docs/guides/auth/auth-email-templates).

Technický stav vychází ze souborů `supabase/functions/tally-candidate-webhook/index.ts`, `supabase/migrations/20260408103107_.sql`, `src/app/providers/AuthProvider.tsx`, `src/pages/Index.tsx`, `src/App.tsx`, `src/views/RecruitmentView.tsx` a stávajícího modelu `profiles` v uvedené revizi aplikace. Konfigurace živého e-mailového poskytovatele ani doručení do skutečných schránek nebyly touto dokumentací ověřeny.
