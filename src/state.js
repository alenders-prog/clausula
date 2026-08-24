// src/state.js — Canonieke definitie van de centrale app-state.
//
// Geen unittest, en dat is opzet: dit bestand bevat uitsluitend een objectliteral
// zonder gedrag. Een test zou hooguit herhalen welke sleutels erin staan, en dat
// bewijst niets — hij zou samen met de code meebewegen bij elke wijziging.
//
// Schrijvers staan hieronder per property; die lijst is de enige documentatie
// van wie wat aanraakt, en dus het waardevolste deel van dit bestand.
// Wordt in Fase 3 geïmporteerd als ES-module; tijdens Fase 2 is window.app
// inline gedefinieerd in index.html en staat dit bestand als referentie.
//
// Eigenaren (schrijvers) per property — zie ook docs/fase0-inventarisatie.md:
//   dossierId    ← zetDossierContext, laadDossier, wizardflow
//   dossierNaam  ← zetDossierContext, laadDossier, wizardflow
//   screeningId  ← analyseDocument, opslaan, laadScreening
//   classificatie← analyseDocument, toonRapport, laadScreening
//   rapport      ← analyseDocument, cycleCardCheck, autoSlaOp (15+ schrijvers)
//   documenten   ← analyseDocument, toonRapport
//   docIdx       ← tab-switching, renderDocPanel
//   bestanden    ← laadScreening, renderDocPanel
//   primaireBest ← laadScreening, renderDocPanel
//   tray         ← trayVoegToe, trayRender, zetDossierContext, wis

export const app = {
  // Dossier-context
  dossierId:    null,  // uuid | null
  dossierNaam:  null,  // string | null

  // Actieve screening / analyse
  screeningId:   null,  // uuid | null
  classificatie: null,  // object | null  { doc_type, namen_map, ... }
  rapport:       null,  // object | null  volledige analyse-output
  documenten:    [],    // array — per-doc rapporten bij multi-doc analyse
  docIdx:        0,     // number — actief tabblad in multi-document view

  // Document-viewer
  bestanden:    [],    // array — File-objecten of storage-refs
  primaireBest: [],    // array — primaire bestanden per doc (geneste array)

  // Upload-tray
  tray: [],            // array — { id, bestand, type, bestandsnaam, ... }
};

if (typeof window !== 'undefined') window.app = app;
