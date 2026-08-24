# Mobilní odhlášení

## Cíl

Přihlášený uživatel se musí umět odhlásit také v mobilní aplikaci. Desktopové odhlášení v postranním panelu zůstane beze změny.

## Rozhodnutí

- Na konec hlavní nabídky mobilního Nastavení přibude samostatná akce „Odhlásit se“ s ikonou odhlášení.
- Akce se zobrazí jen tehdy, když aplikace používá skutečné přihlášení (`isAuthRequired`). Vývojový režim bez přihlášení ji neuvidí.
- Klepnutí zahájí odhlášení ihned, bez potvrzovacího dialogu.
- Po dobu požadavku bude tlačítko zablokované, aby nešlo odhlášení odeslat vícekrát.
- Úspěšné odhlášení použije společný `signOut` z `AuthProvider`, který vyčistí uloženou relaci a zavolá Supabase Auth s `scope: 'local'`. Odhlásí se tím pouze aktuální zařízení; ostatní přihlášená zařízení zůstanou aktivní.
- Při chybě zůstane uživatel na obrazovce a uvidí chybovou hlášku. Tlačítko se znovu zpřístupní.

## Umístění a vzhled

Odhlášení bude na mobilu dole pod kartami Profil a Vzhled. Vizuálně půjde o zřetelnou sekundární/destruktivní akci, ne o třetí kartu nastavení. Na desktopu se tato nová mobilní akce nezobrazí, protože tam již existuje odhlášení v bočním panelu.

## Datový tok

1. Uživatel otevře Nastavení přes profilové kolečko.
2. Klepne na „Odhlásit se“.
3. Obrazovka Nastavení zavolá existující `signOut()` z kontextu autentizace.
4. Po úspěchu změna stavu autentizace vrátí aplikaci na přihlašovací obrazovku.
5. Při chybě se zobrazí toast a přihlášená obrazovka zůstane dostupná.

## Testování

- Test potvrdí, že přihlášený uživatel vidí v mobilním Nastavení akci „Odhlásit se“.
- Test potvrdí, že klepnutí volá `signOut` bez mezikroku potvrzení.
- Test potvrdí, že se akce nezobrazuje ve vývojovém režimu bez vyžadované autentizace.
- Test chyby potvrdí zobrazení hlášky a opětovné zpřístupnění tlačítka.
- Po cílených testech proběhne celý testovací balík a produkční build.

## Mimo rozsah

- Změny databáze, RLS nebo Supabase schématu.
- Změna desktopového odhlášení.
- Odhlášení ze všech zařízení nebo správa relací na jiných zařízeních.
