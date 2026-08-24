# PowerApps Timelog Sync Design

## Goal

Napojit read-only export z PowerApps/SharePoint schvalovani dokumentu na NODU tak, aby slo z komentaru navrhnout a bezpecne aplikovat timelogy pro uz existujici akce a prirazene lidi.

## Source Priority

PowerApps/SharePoint dokument je zdroj faktury, stavu schvaleni, cisla zakazky a komentare. Komentar je zdroj pravdy pro osobu; kdyz se lisi `Dodavatel` a jmeno v komentari, pouzije se jmeno z komentare. Grason/NODU akce je zdroj pro existujici akci, prirazeni crew a zacatek smeny.

## Matching

Automaticky aplikovatelny radek musi mit jednoznacneho clena crew, jednu odpovidajici akci podle job number, data a nazvu, a clovek musi byt na akci prirazeny. Sdilena job number bez jednoznacneho data nebo akce skonci jako `needs_review`.

## Timelog Rules

Schvaleny PowerApps dokument muze schvalit timelog na `approved`. Dokument ve stavu `ve schvalovani`, `novy` nebo nejasny match nevytvari schvaleny timelog. Pri `pausal/paušál` se bere zacatek z matched NODU/Grason akce a zapisuje se rozsah 5 hodin.

## UI

Sekce `Schvalovani` dostane preview tabulku `PowerApps timelogy`. U kazdeho radku bude dokument, osoba z komentare, nalezena akce, navrzene casy, stav matchingu a akce `Aplikovat`. Hromadny zapis bude jen pro jednoznacne aplikovatelne radky.

## Non-goals

V1 neuploaduje faktury z NODU do PowerApps, neoznacuje faktury jako zaplacene a nereseni nejasne pary automaticky.
