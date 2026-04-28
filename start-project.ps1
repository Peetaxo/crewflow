$ErrorActionPreference = "Stop"

function Ensure-Command {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    Write-Host ""
    Write-Host "Chybi prikaz '$Name'. Nejdriv ho nainstalujte a potom spustte skript znovu." -ForegroundColor Red
    exit 1
  }
}

Ensure-Command git
Ensure-Command node
Ensure-Command npm

Write-Host ""
Write-Host "Event Helper startup" -ForegroundColor Cyan
Write-Host "Slozka: $PWD"

$branch = (git branch --show-current).Trim()
$isDirty = -not [string]::IsNullOrWhiteSpace((git status --porcelain))

Write-Host ""
if ($isDirty) {
  Write-Host "Repozitar obsahuje lokalni zmeny." -ForegroundColor Yellow
  Write-Host "Nejdriv je commitnete nebo odlozte, potom teprve prechazejte mezi zarizenimi." -ForegroundColor Yellow
  Write-Host "git pull ted preskakuju, aby nevznikl konflikt." -ForegroundColor Yellow
} else {
  Write-Host "Stahuji aktualizace z GitHubu pro branch '$branch'..." -ForegroundColor Cyan
  git pull --ff-only
}

Write-Host ""
Write-Host "Kontroluji zavislosti..." -ForegroundColor Cyan
npm install

Write-Host ""
Write-Host "Spoustim dev server..." -ForegroundColor Cyan
npm run dev
