/**
 * tests/unit/opslag-waarschuwing.test.js
 *
 * Op 1 september 2026 verdween een analyse van $0,34. De gegevens waren eenduidig:
 * api_verbruik had vier geslaagde fasen, screeningen had geen rij, Storage geen bestand,
 * en de updated_at van het dossier — die `opslaan()` als láátste stap bijwerkt — stond
 * nog op het tijdstip waarop het dossier was aangemaakt.
 *
 * Deze module beslist of de gebruiker weg mag. De tests gaan vooral over de andere kant:
 * niet waarschuwen als er niets te verliezen valt. Een waarschuwing die altijd komt,
 * leert men wegklikken — en dan is hij minder waard dan geen waarschuwing.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  opslagToestand, magWeg, VEILIG, BEZIG, MISLUKT, ONOPGESLAGEN,
} from '../../src/opslag-waarschuwing.js';

describe('opslagToestand', () => {
  it('laat gaan als er geen rapport op het scherm staat', () => {
    const t = opslagToestand({ heeftRapport: false, screeningId: null, bezig: false, laatsteFout: '' });
    expect(t.toestand).toBe(VEILIG);
    expect(magWeg(t)).toBe(true);
  });

  it('laat gaan als het rapport is opgeslagen', () => {
    const t = opslagToestand({ heeftRapport: true, screeningId: 'abc', bezig: false, laatsteFout: '' });
    expect(t.toestand).toBe(VEILIG);
  });

  it('houdt tegen zolang het opslaan loopt', () => {
    // Dit is het raam waarin het misging: het rapport staat op het scherm, het opslaan
    // is begonnen en duurt seconden, en niets houdt een vertrek tegen.
    const t = opslagToestand({ heeftRapport: true, screeningId: null, bezig: true, laatsteFout: '' });
    expect(t.toestand).toBe(BEZIG);
    expect(magWeg(t)).toBe(false);
    expect(t.melding).toMatch(/nog opgeslagen/);
  });

  it('houdt tegen bij een rapport dat nooit is weggeschreven', () => {
    const t = opslagToestand({ heeftRapport: true, screeningId: null, bezig: false, laatsteFout: '' });
    expect(t.toestand).toBe(ONOPGESLAGEN);
    expect(magWeg(t)).toBe(false);
  });

  it('noemt de fout als een poging is gestrand', () => {
    const t = opslagToestand({
      heeftRapport: true, screeningId: null, bezig: false,
      laatsteFout: "Uploaden van 'convenant.pdf' mislukt: new row violates row-level security policy",
    });
    expect(t.toestand).toBe(MISLUKT);
    expect(t.melding).toMatch(/convenant\.pdf/);
    expect(t.melding).toMatch(/opnieuw op te slaan/);
  });

  it('meldt een mislukte poging ook als er al een screeningId is', () => {
    // Een heranalyse werkt een bestaande rij bij. Strandt die update, dan staat er in
    // de database nog de vórige versie en op het scherm de nieuwe. Ook dat is verlies.
    const t = opslagToestand({
      heeftRapport: true, screeningId: 'abc', bezig: false, laatsteFout: 'netwerkfout',
    });
    expect(t.toestand).toBe(MISLUKT);
  });

  it('laat bezig vóór mislukt gaan', () => {
    // Tijdens een nieuwe poging is de vorige fout niet meer het verhaal.
    const t = opslagToestand({
      heeftRapport: true, screeningId: null, bezig: true, laatsteFout: 'oude fout',
    });
    expect(t.toestand).toBe(BEZIG);
  });

  it('overleeft een lege aanroep', () => {
    expect(opslagToestand().toestand).toBe(VEILIG);
    expect(magWeg(opslagToestand())).toBe(true);
    expect(magWeg(VEILIG)).toBe(true);          // ook een kale toestandsnaam mag
  });
});

// ── Bedrading ──────────────────────────────────────────────────────────────

describe('index.html gebruikt de toestand ook echt', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

  it('markeert het opslaan als bezig en weer als klaar', () => {
    expect(html).toMatch(/_opslaanBezig = true;/);
    expect(html).toMatch(/finally \{\s*_opslaanBezig = false;/);
  });

  it('onthoudt de fout in plaats van hem alleen te tonen', () => {
    // Niet alleen .message: de code, hint en details van een Supabase-fout zeggen samen
    // pas wat er misging (42501 = RLS, 23502 = verplichte kolom leeg). Zonder die drie
    // was "opslaan mislukt" op 1 september niet te herleiden.
    expect(html).toMatch(/_opslaanLaatsteFout = \[err\.message, err\.code/);
    expect(html).toMatch(/err\.hint, err\.details\]/);
    expect(html).toMatch(/console\.error\('\[opslaan\] mislukt:'/);
  });

  it('houdt zowel de app-terugknop als het sluiten van het tabblad tegen', () => {
    expect(html).toMatch(/function gaTerug\(\) \{[\s\S]{0,400}window\.magWeg/);
    expect(html).toMatch(/addEventListener\('beforeunload'[\s\S]{0,200}huidigeOpslagToestand/);
  });

  it('biedt een tweede kans in plaats van alleen een melding', () => {
    // Zonder deze knop is de enige uitweg de analyse opnieuw draaien — twee minuten
    // en ruim dertig dollarcent, voor werk dat al gedaan is.
    expect(html).toMatch(/opslagOpnieuwBtn/);
    expect(html).toMatch(/opslag-fout-balk/);
  });
});

// ── Opslaan mag niet aan "geslaagd" hangen ─────────────────────────────────
//
// De werkelijke oorzaak van 1 september 2026, gevonden via de console: er stond géén
// enkele [opslaan]-regel terwijl het rapport volledig op het scherm stond. opslaan()
// werd dus niet aangeroepen.
//
// `geslaagd` wordt gezet ná toonRapport(). Struikelt er iets ná het tekenen, dan ziet
// de mediator een compleet rapport en wordt er niets bewaard. Drie dingen maakten dat
// onzichtbaar: de catch logde niets, het foutvak ligt achter het rapport, en de wizard
// leest `geslaagd || wizardDicht` — waardoor een mislukking ná het openen van het
// skelet net zo stil afsluit als een succes.

describe('een rapport op het scherm wordt bewaard, ook na een struikeling', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const blok = html.slice(html.indexOf('// ── Opslaan, óók als de analyse niet netjes eindigde'),
                          html.indexOf('function toonAnalyseFoutBalk'));

  it('slaat ook op als geslaagd false is maar er een rapport staat', () => {
    expect(blok).toMatch(/else if \(app\.rapport && Object\.keys\(app\.rapport\)\.length\)/);
    // Twee aanroepen: de geslaagde tak en de struikeltak. Eén zou betekenen dat er
    // precies één van de twee gevallen bewaard wordt — en het mislukte geval is nu
    // juist het geval dat ertoe doet.
    expect(blok.match(/await opslaan\(\);/g) || []).toHaveLength(2);
  });

  it('logt de fout in plaats van hem alleen in een verborgen vak te zetten', () => {
    expect(html).toMatch(/console\.error\('\[analyse\] afgebroken vóór het opslaan:'/);
  });

  it('zegt tegen de mediator dat het rapport niet compleet hoeft te zijn', () => {
    expect(html).toMatch(/function toonAnalyseFoutBalk/);
    expect(html).toMatch(/Deze analyse is niet netjes afgerond/);
  });
});

// ── Alleen het rapport van DEZE run ────────────────────────────────────────
//
// Reviewbevinding van 1 september 2026 (kandidaat 6 van zes; de verificatiestap
// bevestigde noch weerlegde ze, dus zelf nagetrokken — en deze klopte).
//
// De terugval die verlies moest voorkomen, toetste alleen of er een rapport op het
// scherm stond. Maar `app.rapport` wordt nooit leeggemaakt bij een nieuwe analyse, en
// het progressief renderen spreidt bewust het vorige rapport erin zodat `_concepts` een
// heranalyse overleeft. Struikelt analyseDocument vóór dat renderen, dan staat er nog
// het rapport van het dossier dat daarvóór openstond — en werd dát opgeslagen onder het
// huidige dossier.
//
// Van "de analyse is weg" naar "het rapport van mevrouw A staat in het dossier van
// mevrouw B" is geen vooruitgang.

describe('de terugval slaat alleen het rapport van deze run op', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

  it('geeft elke analyse een vers merk, niet het hergebruikte runId', () => {
    // app.analyseRunId valt terug op app.screeningId, en dat is bij een nieuw dossier
    // nog de waarde van het vorige — precies het geval dat we moeten vangen.
    expect(html).toMatch(/const _runMerk = crypto\.randomUUID\(\);\s*\n\s*app\.analyseMerk = _runMerk;/);
    expect(html).not.toMatch(/_runMerk = app\.analyseRunId/);
  });

  it('stempelt dat merk op het rapport tijdens het progressief renderen', () => {
    expect(html).toMatch(/_analyse_merk: app\.analyseMerk/);
  });

  it('slaat alleen op als het merk overeenkomt', () => {
    expect(html).toMatch(/else if \(app\.rapport\?\._analyse_merk === _runMerk\)/);
  });

  it('meldt het geval waarin er wél een rapport staat maar van een andere run', () => {
    // Stil overslaan zou dezelfde blinde vlek geven als de fout die dit hele hoofdstuk
    // veroorzaakte: iets gaat niet door en niemand kan zien dat het niet doorging.
    expect(html).toMatch(/niet van deze run — niet opgeslagen/);
  });
});
