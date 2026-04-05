# Workflow spoluprace

Tento soubor popisuje, jak na projektu pracujeme a jak se maji zachazet zmeny.

## Zakladni princip

- Zmeny se nejdriv pripravi lokalne v projektu.
- Po kazde smysluplne hotove zmene se zkontroluje preview aplikace.
- Po potvrzeni, ze je zmena v poradku, se ulozi commit do gitu.
- Nasledne se commit posle i na GitHub, aby byl projekt synchronizovany mezi zarizenimi.

## Dohodnuty postup

1. Udelat zmenu v aplikaci.
2. Zkontrolovat ji v preview.
3. Pokud je vysledek v poradku, vytvorit cesky pojmenovany commit.
4. Po commitu udelat push na GitHub.

## Pojmenovavani commitu

- Commit message psat cesky.
- Nazev ma byt kratky a srozumitelny.
- Preferovat popis vysledku zmeny.

### Priklady

- Vychozi stav projektu
- Pridani kontextu a TODO poznamek
- Uprava bocni navigace
- Oprava mobilniho zobrazeni
- Pridani filtru projektu

## Kdy nepushovat hned

- Pokud je zmena rozpracovana a jeste neni pripravena ke schvaleni.
- Pokud chceme nejdriv vyzkouset vice variant.
- Pokud si uzivatel preje nechat zmenu jen lokalne.

## Projektove poznamky

- Kontext aplikace je ulozen v souboru CONTEXT.md.
- Napady a budoucni ukoly jsou v souboru TODO.md.
- Pokud se domluvime na dalsich pravidlech, maji se doplnit sem.
