#!/usr/bin/env bash
set -euo pipefail

ensure_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo
    echo "Chybi prikaz '$1'. Nejdriv ho nainstalujte a potom spustte skript znovu."
    exit 1
  fi
}

ensure_command git
ensure_command node
ensure_command npm

echo
echo "CrewFlow startup"
echo "Slozka: $(pwd)"

branch="$(git branch --show-current)"
status_output="$(git status --porcelain)"

echo
if [[ -n "$status_output" ]]; then
  echo "Repozitar obsahuje lokalni zmeny."
  echo "Nejdriv je commitnete nebo odlozte, potom teprve prechazejte mezi zarizenimi."
  echo "git pull ted preskakuju, aby nevznikl konflikt."
else
  echo "Stahuji aktualizace z GitHubu pro branch '$branch'..."
  git pull --ff-only
fi

echo
echo "Kontroluji zavislosti..."
npm install

echo
echo "Spoustim dev server..."
npm run dev
