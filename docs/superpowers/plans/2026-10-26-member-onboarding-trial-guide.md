# Vyzkoušení pozvání a prvního použití nodu

Tento postup je určený pro oddělený místní pilot. Tally není připojené a e-maily se zachytávají pouze v testovací schránce. Testovací aplikace v simulátoru se jmenuje **nodu test**; běžná aplikace nodu slouží běžnému vývojovému prostředí.

1. Otevřete správu na `http://127.0.0.1:8096/app` jako testovací správce. V **Crew → Nový člen** vyplňte jméno, příjmení, město a nový jedinečný testovací e-mail končící `@crewflow-onboarding.test`. Výchozí sazba je 250 Kč/h. Uložte profil.
2. V profilu člena použijte **Pozvat do aplikace**. E-mail najdete na `http://127.0.0.1:55434`. Aktivační pozvánka platí 48 hodin. Opakované pozvání nahradí předchozí platný odkaz.
3. Pro mobilní průchod otevřete testovací schránku v Safari **uvnitř simulátoru** a použijte odkaz **Otevřít v mobilní aplikaci**. Otevře se nodu test. Kliknutí na stejný odkaz v prohlížeči na Macu jej samo nepřenese do simulátoru.
4. V aktivačním formuláři dvakrát zadejte vlastní testovací heslo s alespoň 8 znaky a potvrďte aktivaci. Číslice, velká písmena ani speciální znaky nejsou povinné. Heslo zadávejte přímo do aplikace; není potřeba je posílat do chatu.
5. Po přihlášení se ukáže krátké uvedení. **Zobrazit směny** přejde na směny, **Přeskočit** pustí do aplikace. Průvodce můžete znovu otevřít v **Nastavení → Jak používat nodu**. Přihláška na směnu ještě neznamená potvrzené přidělení.
6. Ověřte odhlášení a nové přihlášení stejným e-mailem a heslem. Opětovné spuštění aplikace má zachovat platnou relaci.
7. Pro obnovu se odhlaste a na přihlašovací obrazovce vyberte **Zapomenuté heslo**. Zadejte stejný testovací e-mail. Nový e-mail ve schránce obsahuje odkaz platný 1 hodinu. Otevřete jej v simulátoru, nastavte jiné heslo a zvolte **Přihlásit se novým heslem**. Staré heslo už nemá fungovat.

Samotné otevření odkazu pro obnovu ani změna hesla nepřepne jiný účet právě přihlášený v aplikaci. Až volba pokračování k přihlášení jej místně odhlásí. Odkaz lze použít jen jednou; neplatný nebo expirovaný odkaz nabídne žádost o nový.

Celý pilot běží na notebooku. Pro jeho používání musí běžet notebook, místní kontejnery a náhled aplikace. Tento pilot neposílá pozvánky skutečným zájemcům.
