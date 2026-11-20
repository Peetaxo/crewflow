# Vlastní faktura přiložená k výkazu

## Průchod v aplikaci

Crew může v **Evidenci hodin** volitelně přiložit vlastní PDF a odeslat ho spolu s hodinami. U souboru vyplní stejné údaje jako při dnešním nahrávání v části **Moje faktury**. Jde o jedno PDF pro celý odesílaný výkaz a jednoho odběratele. Odběratele nodu předvyplní podle směn. Pokud jej nelze jednoznačně určit, Crew může odeslat hodiny a fakturu řešit po přípravě podkladu. U odeslané přílohy aplikace zobrazí, že čeká na schválení hodin.

Příloha zůstává u výkazu, když jej CH vrátí nebo požádá o potvrzení upravených hodin. Při dalším odeslání ji Crew může ponechat, vyměnit nebo odebrat. Oprava poznámky sama o sobě nevyžaduje nové PDF.

Po finálním schválení COO nodu porovná zadanou částku se schválenou částkou v podkladu. Pokud se shodují, odběratel je stejný a podklad je připravený, převede přílohu na originál čekající na kontrolu CH. CH dostane jedno upozornění s odkazem na konkrétní podklad, zkontroluje PDF a originál přijme nebo vrátí s důvodem. Po přijetí se výkaz zobrazí jako **Fakturováno**.

Pokud se částka nebo odběratel změnili, Crew dostane v aplikaci důvod a odkaz, kde může nahrát opravené PDF. Původní soubor zůstane dostupný v historii a ke kontrole CH přejde až platný doklad. Při chybějících údajích odběratele nebo jiné blokaci se použije dosavadní postup pro doplnění podkladu. Doklad se vyhodnotí znovu, až bude podklad připravený.

## Souběh s vystavením v nodu

Volitelné přiložení je určené pro Crew bez aktivního trvalého souhlasu v okamžiku volby. Odeslaná vlastní faktura představuje rozhodnutí pro tento výkaz. Pokud člen později zapne trvalý souhlas, u tohoto výkazu má přednost odeslaný originál. Výkaz bez odeslané faktury přejde při platném trvalém souhlasu k automatickému vystavení. Pokud podklad po schválení čeká na rozhodnutí Crew, výzva otevře volbu mezi vlastním PDF a jednorázovým vystavením v nodu.

## Uložení a kontrola

- Přílohu připojit k vlastníkovi, výkazu a sadě zahrnutých směn. Při opětovném odeslání téže sady ji přenést do dalšího kola. Po sloučení či rozdělení sady předat Crew výzvu k ověření přílohy proti novému podkladu.
- Pro předběžné PDF použít soukromé úložiště a současné serverové ověřování souboru, limitu 5 MiB a údajů o faktuře. Na serveru ověřit vlastníka i platnost vazby při odeslání, převodu do fakturačního podkladu a stažení. Přístup k samotné kontrole zůstává podle stávajících pravidel pro originály.
- Využít stávající přijetí, vrácení a historii originálů po převedení dokladu. Server před zařazením ke kontrole ověří shodu částky, odběratele a zdrojových výkazů. Opakování odeslání nebo schválení musí být bezpečné i po výpadku sítě a vytvořit nejvýše jeden aktivní doklad a jedno upozornění pro každý přechod.
- Upozornění na originál ke kontrole použít i při nahrání PDF až po schválení. Příjemcem je CH, který výkaz předal COO, pokud má stále přístup. Pokud takového CH nelze určit, položka je k vyřízení ve stávající frontě **Faktury**. Při vrácení originálu dostane Crew důvod a odkaz na podklad.

## Přijetí pro pilot

- Celý průchod se stejnou částkou od odeslání hodin s PDF po upozornění CH, otevření přesného podkladu, přijetí PDF a stav **Fakturováno**.
- Vrácení výkazu a opětovné odeslání po opravě poznámky bez dalšího nahrávání. Po změně částky, odběratele nebo sady směn se vyžádá zásah Crew a původní soubor zůstane v historii.
- Stažení přílohy pouze oprávněným účtem. Opakování neúspěšného nahrání, odeslání i schválení bez více originálů, faktur nebo duplicitních zpráv.
- Výkaz bez přílohy, nahrání originálu po schválení a automatické vystavení s trvalým souhlasem. Ověřit rovněž zapnutí trvalého souhlasu mezi odesláním výkazu s PDF a jeho schválením.
