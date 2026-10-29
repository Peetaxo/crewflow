# Nodu — průběžná akceptace první verze

Vytvořeno 29. 10. 2026 podle dokončovacího plánu. **První verze není přijatá.** Tento soubor je průběžný záznam, nikoli finální provozní nebo bezpečnostní souhlas.

| Část | Stav a důkaz |
| --- | --- |
| Etapy 0–1 | Ověřený místní základ, lidská aktivace/přihlášení/obnova; [roadmapa](../superpowers/plans/2026-10-27-nodu-completion-roadmap.md) |
| Etapa 2 | Oprávnění a dashboard ověřené i pro dosavadní živý backend; [záznam](2026-10-27-stage-2-verification.md) |
| Etapa 3 | Aktuálnost mezi účty a web/iOS simulátorem; [záznam](2026-10-27-multi-account-refresh.md) |
| Místní část etapy 7 | Typový úklid a bezpečnostní regrese; [přesná verze, kontroly a zařízení](2026-10-29-local-cleanup.md) |
| Etapy 4–5 | Doména, veřejné prostředí a skutečný pilot odložené na přání uživatele; nepřijaté |
| Etapa 6 | Skutečné APNs na fyzickém iPhonu dosud neověřené |
| Etapa 8 | Konečný audit a řízený bezpečnostní test nedokončený; místní regrese nejsou konečná akceptace |

Místní testovací aplikace nodu test a nodu sync nejsou veřejná distribuce. Běžná vývojová aplikace `cz.nodu.app` používá dosavadní živý backend; nové profilové zabezpečení se zatím ověřovalo pouze v disposable místním pilotu. Úplný backend, distribuční sestavení a veřejné HTTPS odkazy je nutné ověřit po skutečném nasazení.

Před konečným přijetím doplnit přesný release commit, nasazené migrace/funkce, veřejnou adresu, iOS distribuci a sestavení, skutečná zařízení a síť, výsledky pilotu/push/auditu a přijetí všech závažných nálezů. Rozsah milníků A/B zůstává podle roadmapy beze změny.

## Obnovení přístupu a provozní kontakt — nedokončené

Místní obnova hesla prošla. Pro veřejnou verzi je nutné určit schválenou HTTPS cestu, odesílatele a postup náhrady pozvánky bez nového profilu či ztráty historie, ověřit omezení frekvence a přerušení nejasného doručení. Kontakt a odpovědná osoba pro provozní problém zatím nejsou pro vydání určené; doplnit před skutečným pilotem. Žádná testovací hesla, tokeny ani privátní kontakty do tohoto záznamu nepatří.
