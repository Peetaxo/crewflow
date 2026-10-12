# Kompaktní mobilní Crew karty

Uživatel schválil doporučenou kompaktní variantu: jméno a menší avatar, hodnocení vedle jména, město a krátká aktivita pod identitou, přímo dostupné Zavolat a E-mail. Cílem je zmenšit běžnou kartu přibližně na polovinu původní výšky při zachování čitelnosti a pohodlného ovládání.

Mobilní karta má hlavičku s identitou, hodnocením a nabídkou. Pod ní je jeden společný řádek aktivity a kontaktních akcí vedle sebe. Kontaktní číslo a adresa se na mobilu čtou v detailu; odkazy dál používají stejné tel/mailto adresy. Desktop od lg zachovává současné sloupce a vypsané kontakty. Každý kontakt má jediný odkaz a osoba jediný profilový ovladač v responzivním DOM.

Dlouhá jména a metadata se mohou zalomit, tlačítka mají dotykovou výšku alespoň 44 px. Hodnocení bez hodnoty je na mobilu úsporné, ale čtečka dostane text „Bez hodnocení“. Aktivita nerozlišuje domnělý offline stav od chybějícího záznamu. Při úzké šířce nebo větším písmu se spodní řádek smí rozdělit, bez horizontálního přetečení.

Hledání nadále funguje podle jména, města, telefonu i e-mailu. Detail profilu, UUID navigace, role, kalendář, založení, úprava a potvrzení smazání se nemění. Oprava automatického zoomu zůstává platná. Před dokončením se ověří rozměry a ovládání, hlavní větev a obě vývojové instalace.
