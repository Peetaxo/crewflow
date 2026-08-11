# Mobile Native Testing

## Rychle web preview

Pro rychle ladeni UI pouzij `npm run dev` a otevri lokalni adresu v browser preview. Tohle je porad nejrychlejsi misto pro upravy layoutu, textu, workflow a komponent.

## Live nativni preview pro iPhone Simulator

Pro prubezne ladeni v iPhone Simulatoru pouzij live rezim:

1. Spust `npm run dev:mobile`.
2. V druhem terminalu spust `npm run cap:sync:ios:live`.
3. Spust aplikaci `nodu` v iPhone Simulatoru.

Appka pak cte UI z lokalniho dev serveru na `http://127.0.0.1:8085`, takze vetsina zmen se projevi po refreshi nebo restartu appky bez dalsiho `cap:sync`.

## Live preview pro realny telefon

Realny telefon potrebuje adresu Macu v lokalni siti. Pouzivej jen na duveryhodne Wi-Fi, protoze dev server bude dostupny ostatnim zarizenim v siti.

1. Spust `npm run dev:phone`.
2. V druhem terminalu spust live sync s IP Macu:

```bash
MOBILE_DEV_HOST=192.168.1.20 MOBILE_DEV_PORT=8085 npm run cap:sync:ios:live
```

3. Spust aplikaci `nodu` na realnem iPhonu pres Xcode.

Realny telefon musi byt na stejne Wi-Fi jako Mac a musi videt adresu Macu. Pro Android se pouzije `npm run cap:sync:android:live`.

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
- Zmena vstupu, mapy, bottom panelu nebo navigace: browser preview a live iPhone Simulator.
- Vetsi workflow: live iPhone Simulator, Android Emulator a potom realny telefon.
- Pred dokoncenim baliku zmen: `npm run cap:sync` a kontrola normalni zabalene appky.
