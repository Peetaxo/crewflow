# Přiložení vlastní faktury k výkazu

**Cíl** je přijmout PDF spolu s hodinami a doručit originál správnému CH po schválení odpovídajícího fakturačního podkladu.

**Architektura** používá předběžnou přílohu vlastněnou serverově ověřeným členem Crew. Odeslání naváže přílohu na kolo schvalování v jedné transakci. Finální schválení převede odpovídající přílohu do existující kontroly originálů. Historie a odkazy na podklady využívají stávající aplikaci.

[Odsouhlasený návrh](../specs/2026-11-20-invoice-with-hours-design.md)

## 1. Databázový postup

- [x] Zapsat rollback regresi pro vazbu na účet a výkaz, původní a opakované odeslání, shodnou a rozdílnou částku, příjemce CH a souběh s auto-vystavením. Spustit proti místní fakturační databázi a potvrdit výchozí selhání.
- [x] Přidat migraci s evidencí předběžného PDF, ověřením oprávněného vlastníka při registraci a načtení a transakčním propojením s existujícím odesláním kola. Rozhraní pro stávající odeslání zachová dosavadní volání.
- [x] V existující tvorbě podkladu vyhodnotit konkrétní zdrojové výkazy, odběratele a částku. Pro shodu převzít dokument do stavu `document_pending`, při neshodě uložit důvod pro Crew a zastavit automatické vystavení pro tento podklad. Stav blokovaného podkladu znovu vyhodnotit při jeho zpřístupnění.
- [x] Vytvořit unikátní upozornění na kontrolu pro oprávněného CH z předání výkazu. Po vrácení upozornit Crew. Spustit databázové regrese pro role, fakturaci, vlastnictví dokumentů a historii upozornění.

## 2. Upload a evidence hodin

- [x] Pokrýt špatný typ/velikost, údaje a jejich opakované odeslání. Nový handler využije validaci z `supabase/functions/upload-invoice-document/request.ts` a zachová přístup k úložišti na serveru.
- [x] V `src/features/shift-workflows/SharedTimelogEditor.tsx` umožnit volitelně vybrat PDF, zadat údaje a ponechat, vyměnit nebo odebrat dříve odeslanou přílohu. Stávající odeslání hodin a běžný režim bez finančního souhlasu budou dostupné podle výsledku serverového načtení.
- [x] Do `shift-workflows.batch-commands.ts`, `shift-workflows.batch-gateway.ts` a `shift-evidence-session.ts` předat volbu dokumentu jako součást verzovaného odeslání. Ověřit retry i opuštění editoru při přepnutí účtu.

## 3. Upozornění a aktivní doklad

- [x] Přidat `billingStatementId` do cíle upozornění, otestovat přechod do Faktur a zaměření správné karty.
- [x] Na kartě podkladu ukázat vlastníkovi důvod neshody a možnost získat odeslané PDF. Pro platný originál použít existující akce CH.
- [x] Ověřit celý prohlížečový průchod Crew → CH → COO → Fakturováno a shodu obsahu staženého originálu.
- [ ] Po integraci zkontrolovat vývojové instalace podle AGENTS.md.

Místní transakční sada už pokrývá stav Fakturováno, zachování PDF po vrácení, nesoulad částky, vlastníka původního PDF, slučování a pozdější nahrávání ke kontrole správnému CH. Historii předběžných PDF čte rozšířené RPC. Původní klient dostává původní datový tvar a kanonickou cestu každého přijatého dokladu.

Playwright ověřil nahrání skutečného syntetického PDF v Evidenci hodin, jedno upozornění CH, zaměření přesného podkladu, přijetí originálu a výsledek v Crew filtru Fakturováno. Nahrávání běželo přes místní adaptér stejného handleru a skutečný místní Auth, API a úložiště. Prošlo pět databázových sad (5, 139, 10, 17 a 37 kontrol), 720 cílených testů klienta a osm testů handleru.
