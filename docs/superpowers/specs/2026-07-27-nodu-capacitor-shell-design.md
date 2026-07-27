# nodu Capacitor Shell Design

**Datum:** 2026-07-27

## Cil

Pripravit aplikaci `nodu` tak, aby stavajici React/Vite aplikace mohla bezet jako mobilni aplikace pro iOS a Android mimo Safari nebo bezny prohlizec. Cilem teto etapy neni prepis do Swift/Kotlin, ale vytvoreni nativniho obalu, ve kterem budeme dal ladit mobilni workflow.

## Rozhodnuti

- Mobilni shell bude postaveny na Capacitoru.
- Sdilena aplikace zustava jedna React/Vite codebase.
- Nazev aplikace bude `nodu`.
- Vychozi bundle id bude `cz.nodu.app`.
- Vite build vystup `dist` bude zdroj pro nativni shell.
- iOS a Android projekty se budou verzovat v repozitari, protoze budou potreba pro realne vydavani, opravy ikon, opravneni a native nastaveni.

## Proc Capacitor

Capacitor dava aplikaci native kontejner a zaroven zachova rychlost vyvoje ve webove codebase. Pro soucasny produkt je to vhodnejsi nez paralelne stavet SwiftUI a Kotlin aplikaci, protoze hlavni riziko je porad workflow, role, schvalovani, evidence hodin a mapy.

## Testovaci Strategie

Rychle UI zmeny se budou dal kontrolovat ve web preview. Vse, co souvisi s mobilnim chovanim, se bude navic overovat v iPhone Simulatoru a pozdeji v Android emulatoru. Pred provozem bude nutne testovani na realnem iPhonu a Android telefonu, hlavne kvuli klavesnici, safe-area, mape, prihlaseni a spodnim panelum.

## Mimo Rozsah Teto Etapy

- App Store a Google Play publikace.
- Ikony, splash screen a branding pro store.
- Push notifikace.
- Offline rezim.
- Prepis UI do nativnich komponent.

## Hotovy Stav

Etapa je hotova, kdyz repozitar obsahuje Capacitor konfiguraci, iOS a Android projekt, build se da synchronizovat do native shellu a je jasny prikaz nebo postup pro otevreni iPhone Simulatoru pres Xcode.
