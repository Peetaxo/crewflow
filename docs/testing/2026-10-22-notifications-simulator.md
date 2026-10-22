# Upozornění: testování v simulátoru, 22. 10. 2026

## Aktivace a ověřené výsledky

Po konkrétním souhlasu uživatele byla 22. 10. v 10:00:03 UTC zapnuta historie.
Následný dotaz potvrdil `history_enabled=true`, `push_enabled=false` a aktivní Cron.
Tento stav nahrazuje informaci o čekající aktivaci v záznamu z 21. 10.

Databázová sada `supabase/tests/app-notifications.sql` znovu prošla všech 37 kontrol.
Její dočasné účty, události a zprávy se vracejí zpět v subtransakci.

Pro vizuální test byla interním emit API vytvořena jediná zpráva
„TEST: Upozornění v NODU“ pro ověřený vlastní účet Petra Heitzera (CH).
Deduplication key: `simulator-smoke-20261022-1018`.
Cílem zprávy je pouze přehled akcí, bez změn skutečné směny.
Nejde o ověření triggeru skutečné obchodní události; ty pokrývá databázová sada.

Při nastavení identity tohoto účtu a role `authenticated` v transakci API
`get_my_notifications` vrátilo zprávu a počet nepřečtených 1. Transakce byla
vrácena zpět. NODU bylo následně přeneseno do popředí na iPhone 17 Pro / iOS 26.5
a screenshot skutečné aplikace potvrdil oranžové číslo 1 u zvonečku.
Zpráva zůstává nepřečtená pro ruční test. Jiným uživatelům nebyla testovací
zpráva vytvořena a push zůstává vypnutý.

## Ruční kontrola otevření

1. V běžícím simulátoru v roli CH otevřít zvoneček.
2. Ověřit nadpis a text zprávy „TEST: Upozornění v NODU“.
3. Klepnout na zprávu: má se otevřít přehled akcí.
4. Vrátit se do zvonečku: zpráva má být přečtená a počet nepřečtených se sníží.

Tyto kroky zatím nejsou vizuálně potvrzené. XcodeBuildMCP runtime snapshot
neposkytuje interakční cíle uvnitř tohoto WebView.

## Samostatný test systémového banneru

Soubor `fixtures/nodu-banner-test.apns` je platný JSON pro lokální simulaci
v iOS Simulatoru. Neobsahuje klíče, tokeny ani identifikátor skutečné zprávy.
Nepřidává položku do historie a neověřuje navigaci na konkrétní zprávu.

V běžném macOS terminálu z kořene repozitáře:

```sh
xcrun simctl push B337323A-264B-4AAC-9236-BEAAB3701659 cz.nodu.app docs/testing/fixtures/nodu-banner-test.apns
```

Alternativou je přetáhnout `.apns` soubor do okna simulátoru. Pro zobrazení
banneru musí mít aplikace udělené systémové oprávnění k upozorněním. V produkčním
nastavení je tlačítko aktivace push zatím záměrně nedostupné, proto je při testu
nutné ověřit i stav tohoto oprávnění; samotné vložení payloadu nezaručuje banner.

Terminál agenta nyní nemá přístup ke CoreSimulatorService (`Operation not
permitted` / connection invalid). Dostupné MCP nástroje pro simulátor neobsahují
vložení push payloadu. Proto nebyl systémový banner zatím odeslán ani potvrzen.
Připojení debuggeru bylo odpojeno; jeho DAP backend neumožňuje vyhodnocování LLDB
výrazů. Aplikace po kontrole běží normálně.

Skutečné APNs/FCM doručení, registrace zařízení a mobilní push jsou stále
neověřené a vypnuté. Apple účet uživatel odložil do dokončení funkcí a vzhledu.
