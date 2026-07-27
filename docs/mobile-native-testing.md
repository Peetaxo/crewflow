# Mobile Native Testing

## Rychle web preview

Pro rychle ladeni UI pouzij `npm run dev` a otevri lokalni adresu v browser preview. Tohle je porad nejrychlejsi misto pro upravy layoutu, textu, workflow a komponent.

## iPhone Simulator

1. Spust `npm run cap:sync`.
2. Spust `npm run cap:open:ios`.
3. V Xcode vyber iPhone simulator.
4. Stiskni Run.

Pouzivej pro kontrolu chovani mimo Safari: safe-area, klavesnice, spodnich panelu, mapy, prihlaseni a celkoveho pocitu mobilni aplikace.

## Android Emulator

1. Spust `npm run cap:sync`.
2. Spust `npm run cap:open:android`.
3. V Android Studiu vyber emulator.
4. Stiskni Run.

Pouzivej pro kontrolu Android klavesnice, zpet gest, vykresleni mapy a sirky beznych Android displeju.

## Realna zarizeni

Pred provozem otestuj realny iPhone i Android telefon. Simulator je dobry pro vyvoj, ale realne zarizeni nejlip odhali rozdily v touch gestech, vykonu mapy, session chovani a systemovych okrajich.

## Doporuceny rytmus

- Bezna UI zmena: browser preview.
- Zmena vstupu, mapy, bottom panelu nebo navigace: browser preview a iPhone Simulator.
- Vetsi workflow: iPhone Simulator, Android Emulator a potom realny telefon.
