# Maakt (of vervangt) de geplande taak "Clausula backup" in Windows.
# Elke nacht om 03:00 scripts\backup-naar-dropbox.mjs; stond de computer uit, dan zodra hij
# weer aan is (StartWhenAvailable). Draaien als jezelf, geen beheerdersrechten nodig:
#
#   powershell -ExecutionPolicy Bypass -File scripts\backup-taak-installeren.ps1
#
# Controleren: Get-ScheduledTaskInfo -TaskName 'Clausula backup'  (LastTaskResult 0 = goed)
# Weghalen:    Unregister-ScheduledTask -TaskName 'Clausula backup' -Confirm:$false
#
# Overgenomen uit SamenOuders (DAL-53). Bewust alleen ASCII: Windows PowerShell 5.1 leest
# een .ps1 zonder BOM als ANSI.

$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node).Source

$actie = New-ScheduledTaskAction -Execute $node -Argument 'scripts\backup-naar-dropbox.mjs' -WorkingDirectory $project
$wanneer = New-ScheduledTaskTrigger -Daily -At 3:00
$instellingen = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 15)

Register-ScheduledTask -TaskName 'Clausula backup' -Force `
  -Description 'git-bundle, .env, .env.local en Claude-geheugen naar Dropbox\Clausula-backup. Zie docs/backup.md.' `
  -Action $actie -Trigger $wanneer -Settings $instellingen | Out-Null

Write-Host "Taak 'Clausula backup' staat klaar: elke nacht 03:00, node = $node, map = $project"
Write-Host "Nu een keer proberen: Start-ScheduledTask -TaskName 'Clausula backup'"
