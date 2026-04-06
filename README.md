# CrewFlow

CrewFlow je interni aplikace pro eventovou / produkcni firmu na rizeni externiho crew.

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
git clone https://github.com/Peetaxo/crewflow.git
cd crewflow
npm install
npm run dev
```

### macOS

```bash
git clone https://github.com/Peetaxo/crewflow.git
cd crewflow
npm install
npm run dev
```

## Kazdodenni postup

### Kdyz zacinam pracovat na zarizeni

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
