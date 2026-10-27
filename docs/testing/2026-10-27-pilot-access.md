# Nodu — ověření přístupů před skutečným pilotem

Datum: **27. 10. 2026**. Etapa 2.1: **probíhá**, pouze první čtecí kontrola definic a grantů. Celková akceptace oprávnění není splněná.

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
