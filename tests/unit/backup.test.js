import { describe, expect, it } from 'vitest';
import { beoordeelBackup, kiesProjectmap } from '../../src/backup/backup.js';

describe('kiesProjectmap', () => {
  const mappen = ['C--Users-alexx-Dropbox-Clausula', 'c--Users-alexx-dev-clausula', 'c--Users-alexx-dev-samenouders'];

  it('maakt van het pad de mapnaam die Claude Code gebruikt (gezien 19 nov 2026)', () => {
    expect(kiesProjectmap('c:\\Users\\alexx\\dev\\clausula', mappen)).toBe('c--Users-alexx-dev-clausula');
    expect(kiesProjectmap('c:/Users/alexx/dev/clausula/', mappen)).toBe('c--Users-alexx-dev-clausula');
  });

  it('vindt de map ook als de schijfletter anders geschreven is', () => {
    expect(kiesProjectmap('C:\\Users\\alexx\\dev\\clausula', mappen)).toBe('c--Users-alexx-dev-clausula');
  });

  it('kiest niet de oude map in Dropbox', () => {
    expect(kiesProjectmap('C:\\Users\\alexx\\dev\\clausula', mappen)).not.toContain('Dropbox');
  });

  it('geeft null als er geen geheugenmap is', () => {
    expect(kiesProjectmap('D:\\elders', mappen)).toBeNull();
  });
});

describe('beoordeelBackup', () => {
  const nu = new Date('2026-11-20T08:00:00Z');

  it('zwijgt bij een geslaagde backup van vannacht', () => {
    expect(beoordeelBackup({ tijd: '2026-11-20T02:00:00Z', ok: true }, nu)).toBeNull();
  });

  it('meldt dat er nog nooit een backup was', () => {
    expect(beoordeelBackup(undefined, nu)).toMatch(/nog nooit/);
  });

  it('meldt een mislukte backup, met de laatste geslaagde', () => {
    const r = beoordeelBackup(
      { tijd: '2026-11-20T02:00:00Z', ok: false, fout: 'Dropbox-map ontbreekt', laatsteGeslaagd: '2026-11-18T02:00:00Z' },
      nu,
    );
    expect(r).toMatch(/MISLUKT/);
    expect(r).toMatch(/Dropbox-map ontbreekt/);
    expect(r).toMatch(/Laatste geslaagde/);
  });

  it('meldt een geslaagde backup die ouder is dan 60 uur', () => {
    const oud = new Date(nu.getTime() - 61 * 3_600_000).toISOString();
    expect(beoordeelBackup({ tijd: oud, ok: true }, nu)).toMatch(/dagen oud/);
  });

  it('laat één overgeslagen nacht door', () => {
    expect(beoordeelBackup({ tijd: '2026-11-19T02:00:00Z', ok: true }, nu)).toBeNull();
  });

  it('noemt een onleesbaar verslag onleesbaar in plaats van goed', () => {
    expect(beoordeelBackup({ ok: true }, nu)).toMatch(/onleesbaar/);
    expect(beoordeelBackup({ tijd: 'gisteren', ok: true }, nu)).toMatch(/onleesbaar/);
    expect(beoordeelBackup('tekst', nu)).toMatch(/onleesbaar/);
  });
});
