# Backup

Sinds 19 november 2026 staat de projectmap buiten Dropbox (`C:\Users\alexx\dev\clausula`).
Dropbox was tot dan de backup. Nu:

| Wat | Waar | Hoe |
|---|---|---|
| Code, alle branches (ook niet gepusht) | GitHub + `Dropbox\Clausula-backup\clausula.bundle` | nachtelijke taak |
| `.env` en `.env.local` | `Dropbox\Clausula-backup\env` en `env.local` | nachtelijke taak |
| Geheugen van Claude Code | `Dropbox\Clausula-backup\claude-geheugen\` | nachtelijke taak |

Niet in deze backup: de database en Storage (Supabase) — die vallen onder Supabase zelf.

De oude map staat als archief in `Dropbox\Clausula-ARCHIEF-verhuisd-2026-11`; daar wordt niet
meer in gewerkt.

## De nachtelijke taak

`scripts/backup-naar-dropbox.mjs` (ook met de hand: `npm run backup`). Overgenomen uit
SamenOuders. Eén bestand per soort, telkens overschreven — Dropbox bewaart de vorige versies.
De bundle wordt eerst buiten Dropbox gemaakt en met `git bundle verify` gecontroleerd; een
kapotte overschrijft dus nooit die van gisteren. Het script logt geen inhoud van bestanden.

Na elke draai staat er een verslag in `laatste-backup.json`. De sessiestand (`npm run
stand`, ook bij elke sessiestart) meldt een backup die mislukt is, nooit gedraaid heeft of
ouder is dan 60 uur. Alles goed: geen regel. De logica staat in `src/backup/backup.js`,
getest in `tests/unit/backup.test.js`.

Installeren (eenmalig, als jezelf):

```
powershell -ExecutionPolicy Bypass -File C:\Users\alexx\dev\clausula\scripts\backup-taak-installeren.ps1
powershell -Command "Start-ScheduledTask -TaskName 'Clausula backup'"
powershell -Command "Get-ScheduledTaskInfo -TaskName 'Clausula backup'"
```

`LastTaskResult` 0 = goed. Elke nacht om 03:00; stond de computer uit, dan zodra hij weer
aan is. Er verschijnt dan kort een venster van Node.

## Terugzetten

In een lege map:

```powershell
git clone "$env:USERPROFILE\Dropbox\Clausula-backup\clausula.bundle" clausula
cd clausula
git remote set-url origin https://github.com/alenders-prog/clausula.git
copy "$env:USERPROFILE\Dropbox\Clausula-backup\env" .env
copy "$env:USERPROFILE\Dropbox\Clausula-backup\env.local" .env.local
npm ci
```

Branches die niet gepusht waren, staan na de kloon als `origin/<naam>`; `git switch <naam>`
maakt er weer een lokale branch van. Het geheugen van Claude Code terug naar
`%USERPROFILE%\.claude\projects\<sleutel>\memory`, met als sleutel het pad met elk teken
behalve letters, cijfers en `-` vervangen door `-` (`c--Users-alexx-dev-clausula`).
