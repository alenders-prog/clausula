/**
 * Unit tests — de MfN-sectie in het rapport
 *
 * De sectie werd wél gebouwd maar stond op `display:none`, en werd alleen zichtbaar door
 * op de MfN-chip te klikken. De filterlogica toonde hem al bij "Alle issues" — die liep
 * alleen nooit vóór de eerste klik. Voor een mediator was hij daarmee onvindbaar.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const bron = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

describe('de sectie staat standaard aan', () => {
  it('rendert nergens meer met display:none', () => {
    // Twee renderplekken: de streamende weergave en het eindrapport. Zolang er één op
    // verborgen staat, is de sectie in dat pad weer onvindbaar.
    expect(bron).not.toMatch(/id="mfnSectie" style="display:none"/);
  });

  it('rendert op beide plekken', () => {
    expect((bron.match(/id="mfnSectie"/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('blijft door een dimensiefilter wél verbergbaar', () => {
    // Onder "Alle" hoort hij te staan, bij een specifieke dimensie niet.
    expect(bron).toMatch(/mfnSectie\.style\.display\s*=\s*dim === 'alle' \? '' : 'none'/);
  });
});

describe('printen', () => {
  it('begint op een nieuwe pagina', () => {
    const idx = bron.indexOf('#mfnSectie { display:block !important;');
    expect(idx).toBeGreaterThan(-1);
    expect(bron.slice(idx, idx + 200)).toMatch(/page-break-before:always/);
  });

  it('zet de sectie na het printen terug op wat hij wás', () => {
    // Stond hier 'none'. Dat haalde de sectie na één keer printen uit de gewone
    // weergave — precies de klacht die deze wijziging moest oplossen.
    expect(bron).toMatch(/mfnSectie\.style\.display = mfnStandVoorPrint/);
    expect(bron).toMatch(/const mfnStandVoorPrint/);
  });
});
