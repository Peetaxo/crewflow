# Etapa 4 — výchozí připravenost a varianty provozu

29. 10. 2026, průzkum nad zdrojem `49251fc`, tehdy shodným s nově načteným `origin/main`. **Směr řešení uživatel přijal; konkrétní konfigurace a nasazení nejsou provedené.** Následně rozhodl doménu, veřejný hosting a skutečné pozvánky odložit až na závěr po dokončení a místním ověření aplikace. Etapa 3 zůstává uzavřená; veřejná akceptace etapy 4 je odložená, nikoli dokončená.

## Doporučení pro malý začátek a pozdější růst

Zachovat nynější React/Capacitor aplikaci a Supabase. Web hostovat jako statickou aplikaci u spravovaného poskytovatele, před prvními skutečnými pozvánkami použít stabilní vlastní doménu a ověřeného e-mailového odesílatele. Kapacitu později zvyšovat podle měřené zátěže, objemu příloh a datových přenosů. Počet registrovaných lidí sám nestačí k určení potřebného výkonu.

| Varianta | Přínos | Omezení / vhodnost |
| --- | --- | --- |
| Spravovaný statický hosting + současný Supabase + vlastní doména | Málo provozní správy; stejný základ pro pilot i následný provoz | Doporučená varianta. Doména a odesílání vyžadují nastavení DNS; rozpočet se zvyšuje až podle potřeb. |
| Stávající firemní webhosting + současný Supabase | Využije existující účet, doménu a případně náklady | Použitelný, pokud umí HTTPS, přímé SPA cesty, potřebné hlavičky a AASA JSON bez přesměrování. Existující vhodný hosting zatím nebyl určen. |
| Vlastní server a samostatná správa databáze | Větší kontrola nad provozem | Pro současný malý pilot není doložená potřeba; přidává správu aktualizací, dostupnosti a záloh. |

Konkrétní navrhovaná sestava, **dosud neobjednaná**:

- **Doména:** vlastní adresa pro nodu nebo subdoména již vlastněné firemní domény; aplikace například na `app.<vlastni-domena>`. Dostupnost konkrétní domény ani její cena nebyly ověřené. Dočasná adresa hostingu je použitelná pro technický náhled; stabilní doména má předcházet skutečným pozvánkám a vazbě iOS odkazů.
- **Hosting:** Cloudflare pro statický web. Statické požadavky jsou podle [oficiálního ceníku Pages](https://developers.cloudflare.com/pages/functions/pricing/) zdarma; případné serverové Functions mají vlastní limity a účtování. Nynější backend zůstává v Supabase.
- **Databáze, přihlášení, soubory:** stávající Supabase. Pro omezený zkušební pilot může zůstat Free. Pro běžný provoz doporučit Pro kvůli provozním vlastnostem, nečekat pouze na naplnění databáze. [Ceník](https://supabase.com/pricing) uvádí Free 500 MB databáze / 1 GB souborů a pozastavení při neaktivitě, Pro od 25 USD měsíčně, 8 GB databáze, 100 GB souborů a denní zálohy databáze uchovávané 7 dnů; další náklady závisejí na využití a dalších projektech. Zálohy databáze nejsou tvrzením o záloze binárních příloh.
- **Pozvánky a obnova hesla:** například Resend s ověřenou vlastní odesílací doménou. [Transakční ceník](https://resend.com/pricing?product=transactional) uvádí Free 3 000 zpráv měsíčně, nejvýše 100 denně. Pozvánkový adaptér a SMTP pro Supabase Auth je nutné nastavit samostatně; Resend není automaticky nakonfigurovaný pouhou volbou služby. Výchozí [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp) je omezený na adresy členů organizace a není vhodný pro skutečné příjemce pilotu.
- **iOS:** pro vybrané externí lidi doporučit TestFlight, s funkčním webem jako dostupnou cestou. [Apple Developer Program](https://developer.apple.com/programs/whats-included/) stojí 99 USD ročně, pokud již není aktivní členství. [První externí TestFlight build](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers) prochází beta review. Stav členství, záznam aplikace a oprávnění v App Store Connect zatím nejsou ověřené.

Ceny ověřené 29. 10. 2026, v měnách poskytovatelů; nejde o schválení nákupu nebo závazný celkový rozpočet. První provoz lze připravit s ročním nákladem na doménu a bez měsíčního poplatku za uvedený statický hosting a malý objem e-mailů. Pro pravidelný provoz připočítat doporučený Supabase Pro a případně Apple členství. Volné tarify nejsou měřítkem ověřené provozní kapacity této aplikace.

## Skutečně přečtený stav živého projektu

Připojený Supabase projekt `gkxbluqkugprwcpdephk` (Staff), region `eu-west-3`, je ACTIVE_HEALTHY. Organizace hlásí tarif **Free**. `pg_database_size(current_database())` vrátil **25 275 539 bajtů**, přibližně 25,3 MB; jde o velikost databáze včetně její interní režie, nikoli odečet úložiště souborů nebo úplnou fakturační metriku.

Seznam živých Edge Functions neobsahuje `crew-invitations` ani `crew-onboarding`. Katalog potvrdil, že schéma `crew_onboarding_private` neexistuje a počet veřejných funkcí `crew_onboarding_%` je 0. Zdroj v main tedy nepředstavuje dostupný vzdálený onboarding. Nebyly čtené ani měněné SMTP tajné hodnoty, nebyl odeslaný e-mail a neproběhl zápis do živých dat.

## Zjištěné nutné změny před vzdáleným pilotem

Nezávislé read-only audity serveru a odkazů se shodují na těchto bodech:

1. **Oddělit vzdálený režim od místního testu.** `supabase/functions/crew-invitations/index.ts` i `handler.ts` povolují pouze pevné lokální API/Mailpit adresy; serverové SQL i klientská odpověď vynucují syntetickou doménu. Přidat výslovnou konfiguraci schváleného backendu a vzdáleného odesílání; současné místní ochrany ponechat.
2. **Omezit první rozesílání serverem.** Zachovat skutečný Auth bearer, seznam konkrétních oprávněných COO UUID a aktuální databázovou roli. Vymezit pilotní příjemce dvojicí uložený profil UUID + kanonický e-mail; přidat serverové omezení frekvence a možnost vypnout nové pozvánky bez mazání účtů či historie.
3. **Vyřešit neurčitý výsledek doručení.** Současné `handler.ts` ruší pozvánku po jakékoliv chybě odeslání/potvrzení; reálný poskytovatel ale mohl zprávu přijmout před timeoutem. Uchovat identitu pokusu, idempotentní opakování a bezpečné došetření přijatého/odmítnutého/neznámého výsledku. Nevydávat přijetí poskytovatelem za skutečné doručení. Výměna pozvánky a nejasný aktivační claim potřebují přesný provozní postup.
4. **Zveřejnit aktivační i obnovovací cestu.** Aktivace již umí přesný povolený HTTPS origin. `password-recovery-link.ts`, `PasswordRecoveryLinks.tsx`, `password-recovery.service.ts` a úvodní průvodce jsou dosud omezené na místní pilot. Zachovat kontrolu přesné cesty/originu, fragmenty pouze v paměti a oddělenou obnovovací relaci. Místní `nodu-test` a místní e-mailové šablony se nepoužijí pro vzdálený provoz.
5. **Doplnit webový fallback a iOS asociaci.** Hosting musí přímo obsloužit veřejné SPA cesty a `/.well-known/apple-app-site-association` jako JSON. Projekt nemá Associated Domains entitlement; AppDelegate již Universal Links předává Capacitoru. Přidat konkrétní schválenou doménu a podepsané application identifier. Ověřit skutečný klik z e-mailu při studené i spuštěné aplikaci, bez nainstalované aplikace a na druhé síti s vypnutým notebookem. Instalace nesmí být podmínkou dokončení webové aktivace/obnovy.
6. **Připravit přesný migrační a rollback balík.** Porovnat živou historii, přenést jen potřebné onboardingové objekty a připravit snapshot příslušných Auth triggerů/politik, profilových výchozích hodnot a Auth konfigurace. Nepouštět plošně všechny čekající migrace. Nasadit nejdříve vypnuté, otestovat negativní cesty a až poté řízeně povolit jednoho konkrétního příjemce. Zachovat dosavadní sazby, profily, vazby a historii.

## Dvě konkrétní kontroly před zapnutím

- **Vlastní citlivé profilové sloupce:** zdroj i živý katalog ukazují širokou self UPDATE politiku `user_id = auth.uid()`, UPDATE grant i na `hourly_rate`, `email` a `user_id` a pouze trigger pro `updated_at`. To vyžaduje izolovanou regresi a případnou opravu před vzdáleným pilotem, zejména zákazu vlastní změny sazby při zachování legitimních osobních úprav. Neproběhl pokus změnit sazbu existujícího člověka ani runtime důkaz zneužití. Předchozí ověření zachování sazby při aktivaci tuto kontrolu nenahrazuje.
- **Automatická URL relace:** skutečný singleton `src/lib/supabase.ts` neuvádí `detectSessionInUrl:false`; současný SDK umí implicitní callback uložit před React scrubem. Reprodukce/test musí použít skutečnou inicializaci singletonu a ověřit zachování existující relace při cizím aktivačním/obnovovacím callbacku. Nalezené izolované recovery testy toto nastavení skutečného singletonu netestují. Jde o zdrojové riziko k ověření, nikoli zde reprodukované převzetí účtu.

## Dosud otevřená rozhodnutí a další krok

Uživatel přijal směr vlastní doména + Cloudflare + současný Supabase + Resend a nechal prověřit dostupnost domény. Následně výslovně přesunul její řešení a veřejné spuštění na závěr po dokončení aplikace. Konkrétní doména, odesílatel a distribuce nejsou vybrané; jejich výběr teď neblokuje nezávislé místní opravy, technický úklid ani místní testování. Žádný tarif nebo doména se tím neobjednává.

Při pozdějším návratu k veřejnému spuštění znovu ověřit dostupnost domény a ceny, připravit konkrétní návrh a implementační plán s přesným hostem, odesílatelem, způsobem iOS distribuce, testovacím příjemcem a oprávněným COO. Navázat na uložené technické nálezy výše, izolované regrese, review a ověřený balík. Skutečné nasazení/odeslání první pozvánky má podle roadmapy samostatný schvalovací bod nad tímto konkrétním balíkem. Místně dokončená aplikace nepředstavuje dokončení skutečného pilotu ani konečné provozní přijetí.

V tomto průzkumu se nepořizovaly domény ani tarify, nevytvářely nové externí účty, neměnil produktový kód, živé schéma ani nastavení a neprováděla nová iOS instalace. Etapa 4 není dokončená.
