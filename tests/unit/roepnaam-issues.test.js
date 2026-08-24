import { describe, it, expect } from 'vitest';
import { bouwRoepnaamIssues, maakRoepnaamIssue } from '../../src/rapport/roepnaam-issues.js';

const W_ERWIN = { roepnaam: 'Erwin', formeelVolledig: 'Jan Willem Huzen' };
const W_NICKY = { roepnaam: 'Nicky', formeelVolledig: 'Nické Meijerink' };

const OP = {
  bestandsnaam: 'ouderschapsplan.pdf',
  tekst: 'OUDERSCHAPSPLAN\nJan Willem Huzen geboren te Deventer op 06-11-1986.\nDe kinderen verblijven bij de moeder.',
};
const CONVENANT = {
  bestandsnaam: 'convenant.pdf',
  tekst: 'CONVENANT\nRekeningnummer NL28 RABO 0328582298 op naam van Erwin Huzen wordt toebedeeld aan de man.\nSlotbepaling.',
};

describe('bouwRoepnaamIssues', () => {
  it('plaatst de kaart alleen bij het document waar de roepnaam in staat', () => {
    const { perBestand } = bouwRoepnaamIssues([W_ERWIN], [OP, CONVENANT]);
    expect([...perBestand.keys()]).toEqual(['convenant.pdf']);
    expect(perBestand.get('convenant.pdf')).toHaveLength(1);
  });

  it('neemt de passage uit dát document, niet uit een ander', () => {
    const { perBestand } = bouwRoepnaamIssues([W_ERWIN], [OP, CONVENANT]);
    const passage = perBestand.get('convenant.pdf')[0].passage;
    expect(passage).toContain('Erwin Huzen');
    expect(CONVENANT.tekst).toContain(passage);
    expect(OP.tekst).not.toContain(passage);
  });

  it('plaatst bij meerdere documenten als de naam in allebei staat', () => {
    const beide = { bestandsnaam: 'op2.pdf', tekst: 'Erwin haalt de kinderen op.' };
    const { perBestand } = bouwRoepnaamIssues([W_ERWIN], [beide, CONVENANT]);
    expect([...perBestand.keys()].sort()).toEqual(['convenant.pdf', 'op2.pdf']);
    expect(perBestand.get('op2.pdf')[0].passage).toBe('Erwin haalt de kinderen op.');
  });

  it('matcht op heel woord — "Jan" valt niet in "Janssen"', () => {
    const w = { roepnaam: 'Jan', formeelVolledig: 'Johannes Pietersen' };
    const janssen = { bestandsnaam: 'janssen.pdf', tekst: 'Mevrouw Janssen woont in Holten.' };
    const jan     = { bestandsnaam: 'jan.pdf',     tekst: 'Jan haalt de kinderen op.' };
    const { perBestand, ongeplaatst } = bouwRoepnaamIssues([w], [janssen, jan]);
    expect([...perBestand.keys()]).toEqual(['jan.pdf']);
    expect(ongeplaatst).toHaveLength(0);
  });

  it('matcht wel als het woord tegen leestekens aan staat', () => {
    const w = { roepnaam: 'Jan', formeelVolledig: 'Johannes Pietersen' };
    const doc = { bestandsnaam: 'x.pdf', tekst: 'Hierna te noemen "Jan", verder de man.' };
    const { perBestand } = bouwRoepnaamIssues([w], [doc]);
    expect(perBestand.get('x.pdf')[0].passage).toContain('Jan');
  });

  it('houdt de kaart bij alle documenten als de roepnaam nergens voorkomt', () => {
    const w = { roepnaam: 'Zeger', formeelVolledig: 'Pieter de Vries' };
    const { perBestand, ongeplaatst } = bouwRoepnaamIssues([w], [OP, CONVENANT]);
    expect([...perBestand.keys()].sort()).toEqual(['convenant.pdf', 'ouderschapsplan.pdf']);
    expect(ongeplaatst).toEqual([w]);
    expect(perBestand.get('ouderschapsplan.pdf')[0].passage).toBe('');
  });

  it('verdeelt meerdere waarschuwingen onafhankelijk van elkaar', () => {
    const opNicky = { bestandsnaam: 'op.pdf', tekst: 'Nicky brengt de kinderen naar school.' };
    const { perBestand } = bouwRoepnaamIssues([W_ERWIN, W_NICKY], [opNicky, CONVENANT]);
    expect(perBestand.get('op.pdf').map(i => i.onderwerp))
      .toEqual(['Roepnaam "Nicky" niet formeel geïntroduceerd']);
    expect(perBestand.get('convenant.pdf').map(i => i.onderwerp))
      .toEqual(['Roepnaam "Erwin" niet formeel geïntroduceerd']);
  });

  it('slaat onvolledige waarschuwingen over', () => {
    const { perBestand } = bouwRoepnaamIssues([{ roepnaam: 'Erwin' }, null], [CONVENANT]);
    expect(perBestand.size).toBe(0);
  });

  it('gaat om met lege invoer', () => {
    expect(bouwRoepnaamIssues().perBestand.size).toBe(0);
    expect(bouwRoepnaamIssues([W_ERWIN], []).perBestand.size).toBe(0);
  });

  it('negeert documenten zonder bestandsnaam', () => {
    const { perBestand } = bouwRoepnaamIssues([W_ERWIN], [{ tekst: 'Erwin Huzen' }, CONVENANT]);
    expect([...perBestand.keys()]).toEqual(['convenant.pdf']);
  });
});

describe('maakRoepnaamIssue', () => {
  it('houdt de kaartvorm die het rapport verwacht', () => {
    const i = maakRoepnaamIssue(W_ERWIN, 'een passage');
    expect(i).toMatchObject({
      ernst: 'midden', dimensies: ['volledigheid'],
      afgehandeld: false, opmerking: '', passage: 'een passage',
    });
    expect(i.aanbeveling).toContain('gebruik de geboortennaam "Jan"');
  });
});
