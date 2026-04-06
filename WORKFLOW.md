# Workflow spoluprace

Tento soubor popisuje, jak na projektu pracujeme a jak se maji zachazet zmeny.

## Zakladni princip

- Zmeny se nejdriv pripravi lokalne v projektu.
- Po kazde smysluplne hotove zmene se zkontroluje preview aplikace.
- Po potvrzeni, ze je zmena v poradku, se ulozi commit do gitu.
- Nasledne se commit posle i na GitHub, aby byl projekt synchronizovany mezi zarizenimi.
- Na kazdem zarizeni se pracuje v jeho vlastni git slozce, ne pres ZIP kopii projektu.

## Dohodnuty postup

1. Udelat zmenu v aplikaci.
2. Nahodit nebo obnovit preview server.
3. Overit, ze preview skutecne bezi.
4. Zkontrolovat ji v preview.
5. Pokud je vysledek v poradku, vytvorit cesky pojmenovany commit.
6. Po commitu udelat push na GitHub.
7. Na dalsim zarizeni pred pokracovanim udelat git pull.

## Prace mezi vice zarizenimi

- Kazde zarizeni ma mit vlastni lokalni git clone stejneho repozitare.
- Nepouzivat opakovane stahovani `.zip` z GitHubu jako bezny zpusob synchronizace.
- Pred zacatkem prace na notebooku, PC nebo MacBooku vzdy udelat `git pull`.
- Pokud jsou lokalni necommitnute zmeny, nejdriv je commitnout nebo odlozit, a az potom delat `git pull`.
- Po dokonceni smysluplne zmeny udelat `git push`, aby se dalo plynule navazat na dalsim zarizeni.

### Shrnuty scenar

1. Na zarizeni A udelat zmenu.
2. Overit preview.
3. Commit.
4. Push na GitHub.
5. Na zarizeni B udelat pull.
6. Pokracovat v praci.

## Preview

- Po vetsi uprave je potreba znovu nahodit nebo overit dev server.
- Na preview se neodkazuje, dokud neni overene, ze port opravdu odpovida.
- Pokud preview spadne, ma se nejdriv znovu spustit a zkontrolovat.
- Neni dovolene posilat preview odkaz jen podle stareho logu nebo predchoziho spusteni.

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
