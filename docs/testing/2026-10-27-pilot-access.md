# Nodu — ověření přístupů před skutečným pilotem

Datum: **27. 10. 2026**. Etapa 2.1: serverová oprava je nasazená a ověřená, klient je v main a aktualizovaném simulátoru. Simulátor i fyzický iPhone byly následně úspěšně aktualizované při opravě souladu crew Přehledu a Výkazů. [Závěrečné ověření etapy 2](2026-10-27-stage-2-verification.md).

## Oprava a nové ověření

- Živý projekt Staff má aplikovanou migraci **`20261027121722_disable_self_role_switching`**. RPC má zachovanou signaturu, ale je SECURITY INVOKER, prázdný search_path a vždy vrací SQLSTATE **42501**. PUBLIC, anon, authenticated i service_role nemají EXECUTE. Aktuální role žádného uživatele se nepřepisuje; oprávněná administrace rolí COO zůstává oddělená.
- V živém backendu prošel transakční SQL regresní test včetně odmítnutí přímého volání a porovnání původních rolí. Počet i otisk všech rolí byly před a po přesně stejné. Privátní předchozí definice je zachovaná mimo Git.
- Stejná migrace bezpečně přebírá již dříve lokálně ověřenou INSERT politiku: pouze skutečné CH/COO a pouze `user_id IS NULL`. Zákaz podstrčení cizí Auth identity byl ověřen přes SDK se skutečnými testovacími relacemi a musí vracet přímo **42501**, nikoli jen jinou databázovou chybu.
- AuthProvider pro skutečnou relaci odmítá změnu role ještě před RPC; lokální vývojová relace pouze mění vlastní místní pohled. Mobilní i desktopové přepínače byly z UI odstraněné. Nezávislé review serveru i klienta dokončeno; zjištěná slabina negativního testu byla opravena a znovu ověřena.
- Místní REST/Auth/Storage test používá oddělené syntetické crew A, crew B, CH a COO. Kontroluje přímé změny `user_roles`, RPC zvýšení role, nedůvěryhodná user metadata, vlastní/cizí profily, výkazy, položky faktur, přiřazení, originály PDF, management INSERT a privátní pomocné funkce pozvánek. Původní role mimo vyhrazené testovací identity zůstávají přesně shodné. Hesla jsou náhodná pouze v paměti; metadata fixture zůstávají v soukromém pilotním adresáři.
- Doplňující anonymní test odhalil veřejné RPC `list_event_crew_assignments`: živá definice odpovídá repozitáři, ale původní živý grant dovoloval i anon. Migrace **`20261027123811_restrict_anonymous_crew_roster`** je již nasazená a ověřená: PUBLIC/anon nemají přístup, přihlášení mají původní omezený seznam jmen a přiřazení. Obsahuje úplnou kanonickou definici, aby fungovala i při migraci databáze bez dříve ručně vytvořené funkce; tento scénář byl ověřen RED/GREEN uvnitř rollback-only transakce.
- Konečná rozšířená matice **17 skutečných API skupin prošla**, včetně anonymních čtení všech uvedených domén a pozitivního seznamu crew pro všechny čtyři přihlášené role. Privátní log: `/private/tmp/nodu-stage2-access-api-complete-20261027.log`. SQL regrese pro role i seznam crew prošly také přímo v živé databázi bez změny původních rolí.
- Existující test pozvánek byl aktualizovaný, aby vyžadoval odmítnutí zvýšení role a používal administrativně připravenou syntetickou COO identitu pro test allowlistu. **14 integračních skupin prošlo**, včetně skutečného zachyceného e-mailu a pozitivních i negativních API cest. Veřejné doručování a onboarding nejsou tímto zapnuté.
- Příprava testovacích příloh zjistila, že místní pilot neměl bucket ani SELECT politiky úložiště. Doplněn soukromý `invoice-pdfs` a přesné existující politiky z repozitáře; živé úložiště je již mělo. Nebyly uvolněné INSERT/UPDATE/DELETE politiky klientům.

Při problému klienta lze vrátit klientský balík při zachované serverové blokaci. Návrat nesmí znovu povolit zranitelné samovolné přepisování rolí. Běžné role ani existující profily se migrací nemění; soukromý předchozí SQL snapshot slouží pro řízenou opravu vpřed.

## Původní audit před opravou

Následující část zachycuje výchozí stav zjištěný před nasazením, nikoli současná oprávnění.

## Ověřený cíl a metoda

Aktivní propojený Supabase projekt **Staff** (`gkxbluqkugprwcpdephk`) byl identifikován podle místního `supabase/.temp/project-ref` a seznamu projektů konektoru. Přes `execute_sql` byly čteny pouze systémové katalogy `pg_proc`, `pg_namespace`, `pg_policies`, definice funkcí a `has_function_privilege`. Nebyla změněna role žádného uživatele, politika, grant, účet ani data; funkce přepínání rolí nebyla spuštěna.

## Potvrzený nález: vlastní zvýšení role

Živá `public.set_current_user_role(public.app_role)`:

- běží jako **SECURITY DEFINER**, `search_path=public`;
- kontroluje pouze, že `auth.uid()` není NULL;
- smaže všechny role aktuálního Auth uživatele a vloží zadané `p_role`;
- má `EXECUTE` pro `authenticated`; katalog navíc potvrzuje i účinné `EXECUTE` pro `anon`.

Definice neomezuje požadovanou roli ani neověřuje administrátorské nebo oddělené vývojové oprávnění. Přihlášený člen tak má serverovou cestu k vlastnímu zvýšení role na COO. Jde o **blokující nález pro skutečné pozvánky a pilot**. Zjištění vychází z aktuální definice a grantů; neproběhla demonstrace změnou role v živém účtu. Anonymní volající sice může vstoupit do funkce, ale kontrola NULL identity jeho změnu odmítne.

Repozitářový `supabase/user-role-switching.sql` obsahuje stejnou funkční definici. Na rozdíl od skutečného stavu obsahuje `REVOKE ALL ... FROM public` a následný grant pouze `authenticated`; jeho nasazení samo neřeší zvýšení role přihlášeným uživatelem.

Živé RLS na `user_roles` obsahuje vlastní čtení a správu pro COO přes `has_role`. Toto omezení nebrání zápisu přes výše uvedenou privilegovanou funkci. `has_role(uuid, app_role)` je rovněž SECURITY DEFINER a dostupná anon/authenticated; samotná tato skutečnost nedokládá další zvýšení oprávnění.

## Profily a onboarding

Živý `profiles` má SELECT/UPDATE pro vlastníka a CrewHead/COO. V přečteném seznamu nemá INSERT politiku. Funkce `crew_onboarding_create` a `crew_onboarding_manual_prepare` nebyly v živém `public` nalezeny. To odpovídá oddělenému místnímu onboardingu, nikoli ověřené dostupnosti skutečných pozvánek.

Dříve schválená místní management INSERT politika nebyla přenášena do živého projektu. Oprávnění zapisovat profil bez Auth identity a zákaz podstrčení cizí identity se musí ověřit v celém navazujícím balíku.

## Zbývající akceptace

- Připravit samostatnou opravu serverových oprávnění a UI; vývojové zkoušení pohledů zachovat v odděleném testovacím režimu.
- Ověřit přes skutečná API jako anon, crew A, crew B, CH a COO pozitivní a negativní případy pro role, profily, výkazy, přiřazení, faktury, přílohy a pozvánky.
- Ověřit management INSERT jen bez připojené cizí Auth identity a zachování legitimních pracovních kroků.
- Připravit konkrétní ověřený balík s návratem zpět před případnou žádostí o živý zásah. Tento čtecí audit neopravuje backend a není důkazem úplné izolace účtů.
