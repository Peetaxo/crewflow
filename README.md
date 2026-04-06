# Event Helper

Event Helper je interni aplikace pro eventovou / produkcni firmu na rizeni externiho crew.

## Jednotny workflow na vsech zarizenich

Na kazdem zarizeni pracujte v jedne stabilni git slozce napojene na stejny GitHub repozitar.
Nepouzivejte bezny postup pres stahovani `.zip`, protoze se tim ztraci historie, branch a vznikaji zmatky pri synchronizaci.

### Hlavni pravidlo

- notebook, PC i MacBook maji mit vlastni lokalni git clone
- pred zacatkem prace udelat `git pull`
- po hotove smysluplne zmene overit preview
- potom udelat `git add`, `git commit` a `git push`
- na dalsim zarizeni pred pokracovanim znovu udelat `git pull`

## Prvni nastaveni noveho zarizeni

1. Nainstalovat Git.
2. Nainstalovat Node.js a npm.
3. Naklonovat repozitar z GitHubu.
4. Ve slozce projektu spustit `npm install`.
5. Pro vyvoj pouzivat `npm run dev`.

### Windows

```powershell
git clone <url-vaseho-repozitare> event-helper
cd event-helper
npm install
npm run dev
```

### macOS

```bash
git clone <url-vaseho-repozitare> event-helper
cd event-helper
npm install
npm run dev
```

## Kazdodenni postup

### Kdyz zacinam pracovat na zarizeni

Nejjednodussi varianta je pouzit startovaci skript, ktery vas upozorni na lokalni zmeny a provede bezny start projektu.

### Windows

```powershell
.\start-project.ps1
```

### macOS

```bash
chmod +x ./start-project.sh
./start-project.sh
```

Skript:

- zkontroluje `git`, `node` a `npm`
- upozorni, pokud mate lokalni zmeny
- kdyz je repo ciste, udela `git pull --ff-only`
- spusti `npm install`
- spusti `npm run dev`

Pokud skript z nejakeho duvodu nechcete pouzit, plati stale rucni varianta:

```bash
git pull
npm run dev
```

### Kdyz jsem hotovy s jednou zmenou

```bash
git status
git add .
git commit -m "Cesky popis zmeny"
git push
```

### Kdyz prechazim na jine zarizeni

Na puvodnim zarizeni musi byt zmeny uz pushnute na GitHub.
Na novem zarizeni se pred pokracovanim vzdy udela:

```bash
git pull
```

## Preview

- vyvojovy server spoustet pres `npm run dev`
- preview odkaz posilat nebo pouzivat az po overeni, ze port opravdu odpovida
- po vetsi uprave preview znovu overit

## Poznamka k Windows a Macu

Repozitar ma mit jednotne konce radku pres `.gitattributes`, aby se mezi Windows a macOS neukazovaly hromadne falesne zmeny.
