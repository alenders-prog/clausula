/**
 * src/dashboard/scherm.js — het dashboard tekenen
 *
 * Geeft HTML-strings terug, zoals de rest van de rendercode in dit project. Zo is elk
 * blok te toetsen zonder browser: erin gaat het object uit bouwStatistieken(), eruit
 * komt precies wat er op het scherm verschijnt.
 *
 * Wat hier NIET in zit: trends over de tijd en de AI-aanbevelingen uit de mockup. De
 * eerste vraagt weekindeling over de aanmaakdatums, de tweede een Claude-aanroep. Ze
 * staan los van de rest en kunnen er later bij zonder dat hier iets verandert.
 */
import { MFN_TOTAAL } from './statistieken.js';
import { maakGrad } from '../chips/hml-counts.js';

const escH = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Nederlandse duizendtallen: 1.413 in plaats van 1,413. */
export const getal = (n) => Number(n || 0).toLocaleString('nl-NL');
/** Eén decimaal met een komma: 11,4. */
export const komma = (n) => Number(n || 0).toFixed(1).replace('.', ',');

const LABELS = {
  juridisch: 'Juridisch', volledigheid: 'Volledigheid', balans: 'Balans',
  conflicten: 'Conflicten', grammatica: 'Grammatica',
  convenant: 'Convenant', ouderschapsplan: 'Ouderschapsplan', onbekend: 'Overig',
};
export const label = (k) => LABELS[k] || k;

/**
 * Ringsegmenten voor een donut.
 *
 * Rekent met omtrek en verschuiving in plaats van met booghoeken: een `<circle>` met
 * stroke-dasharray is exact, terwijl een handgeschreven `path` met booghoeken bij
 * segmenten van bijna 100% op afrondingsfouten stukloopt.
 */
export function ringSegmenten(delen, straal = 54) {
  const omtrek = 2 * Math.PI * straal;
  const som = delen.reduce((a, d) => a + (d.waarde || 0), 0);
  let verschoven = 0;
  return delen.map(d => {
    const deel = som > 0 ? (d.waarde || 0) / som : 0;
    const lengte = deel * omtrek;
    const seg = {
      ...d,
      dasharray: `${lengte.toFixed(1)} ${(omtrek - lengte).toFixed(1)}`,
      dashoffset: (-verschoven * omtrek).toFixed(1),
      pct: Math.round(deel * 100),
    };
    verschoven += deel;
    return seg;
  });
}

function donutSvg(delen, midden, onder, straal = 54) {
  const segs = ringSegmenten(delen, straal);
  const dik  = straal >= 54 ? 17 : 14;
  return `<svg class="db-donut" viewBox="0 0 150 150" role="img"
      aria-label="${escH(delen.map(d => `${d.naam}: ${d.waarde}`).join(', '))}">
    <g transform="rotate(-90 75 75)" fill="none" stroke-width="${dik}">
      ${segs.map(s => `<circle cx="75" cy="75" r="${straal}" stroke="${s.kleur}"
        stroke-dasharray="${s.dasharray}" stroke-dashoffset="${s.dashoffset}"/>`).join('')}
    </g>
    <text x="75" y="73" text-anchor="middle" font-size="24" font-weight="800" fill="var(--ink)">${escH(midden)}</text>
    <text x="75" y="90" text-anchor="middle" font-size="10.5" fill="var(--ink-soft)">${escH(onder)}</text>
  </svg>`;
}

// ── De altijd zichtbare kaartenrij ──────────────────────────────────────────
const ICONEN = {
  map:      '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  vink:     '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
  document: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
  attentie: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  vakje:    '<path d="M20 6 9 17l-5-5"/><path d="M22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10"/>',
  stijging: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
};

function kaart({ icoon, kleur, tint, lbl, waarde, eenheid = '' }) {
  return `<article class="db-kpi" style="--spoor:${kleur};--tint:${tint}">
    <div class="db-kpi-icoon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icoon}</svg></div>
    <div>
      <div class="db-kpi-lbl">${escH(lbl)}</div>
      <div class="db-kpi-waarde">${escH(waarde)}${eenheid ? `<span class="db-eenh">${escH(eenheid)}</span>` : ''}</div>
    </div>
  </article>`;
}

export function kpiStripHtml(stats) {
  const k = stats?.kpi || {};
  const traject = (k.scoreEerste === null || k.scoreEerste === undefined)
    ? { waarde: '—', eenheid: 'nog geen tweede versie' }
    : { waarde: `${k.scoreEerste}`, eenheid: ` → ${k.scoreLaatste}%` };

  return `<div class="db-kpi-rij">
    ${kaart({ icoon: ICONEN.map,      kleur: 'var(--blue)',   tint: '#EBF3FC', lbl: 'Actieve dossiers',   waarde: getal(k.actief) })}
    ${kaart({ icoon: ICONEN.vink,     kleur: 'var(--ok)',     tint: 'var(--ok-light)', lbl: 'Afgeronde dossiers', waarde: getal(k.afgerond) })}
    ${kaart({ icoon: ICONEN.document, kleur: 'var(--accent)', tint: 'var(--accent-faint)', lbl: 'Analyses uitgevoerd', waarde: getal(k.analyses) })}
    ${kaart({ icoon: ICONEN.attentie, kleur: 'var(--warn)',   tint: 'var(--warn-light)', lbl: 'Verbeterpunten gesignaleerd', waarde: getal(k.gesignaleerd) })}
    ${kaart({ icoon: ICONEN.vakje,    kleur: 'var(--ok)',     tint: 'var(--ok-light)', lbl: 'Punten afgevinkt', waarde: getal(k.afgevinkt), eenheid: ` / ${getal(k.gesignaleerd)}` })}
    ${kaart({ icoon: ICONEN.stijging, kleur: 'var(--ok)',     tint: 'var(--ok-light)', lbl: 'Documentscore', ...traject })}
  </div>`;
}

// ── Categorie en ernst ──────────────────────────────────────────────────────
/** Zelfde pijl als tussen de ringen op een dossierkaart. */
const CMP_PIJL = `<svg class="v2-cmp-arrow" width="36" height="23" viewBox="0 0 36 23" fill="none" aria-hidden="true"><path d="M0 7.5H24V1.5L36 11.5L24 21.5V15.5H0V7.5Z" fill="#D0CAC0"/></svg>`;

/** Zelfde ringkleuren als op een dossierkaart — via dezelfde maakGrad(). */
function ringGrad(t) {
  if (!t || t.hoog + t.midden + t.laag === 0) return 'conic-gradient(from -90deg,var(--line) 0deg 360deg)';
  return `conic-gradient(from -90deg,${maakGrad([
    { kleur: 'var(--status-risico)',   n: t.hoog },
    { kleur: 'var(--status-aandacht)', n: t.midden },
    { kleur: 'var(--status-ok)',       n: t.laag },
  ])})`;
}

/** Legendaregel met deltapijltje, gelijk aan legItem() op de dossierkaart. */
function legItem(cls, count, naam, delta) {
  let d = '';
  if (delta < 0)      d = `<span class="v2-delta-pos">−${-delta} ↓</span>`;
  else if (delta > 0) d = `<span class="v2-delta-neg">+${delta} ↑</span>`;
  return `<div class="v2-legend-item"><span class="v2-leg-group"><span class="v2-ld ${cls}"></span>`
       + `<span class="v2-leg-lbl">${getal(count)} ${escH(naam)}</span></span>${d}</div>`;
}

const ERNSTDELEN = (t) => [
  { naam: 'Hoog',   waarde: t.hoog,   kleur: 'var(--terra)' },
  { naam: 'Midden', waarde: t.midden, kleur: 'var(--warn)' },
  { naam: 'Laag',   waarde: t.laag,   kleur: 'var(--ok)' },
];

/**
 * Twee ringen met een pijl ertussen — eerste versie naast laatste versie, net als op
 * een dossierkaart. Eén ring toont hoe het ervoor staat; twee tonen of het ergens
 * heen gaat, en dat laatste is wat een dashboard hoort te doen.
 *
 * Zijn er geen dossiers met een tweede versie, dan valt hij terug op één ring met de
 * huidige stand. Twee identieke ringen met een pijl ertussen zouden beweging
 * suggereren die niet gemeten is.
 */
function ernstRingen(stats, e) {
  const vn = stats?.ernstVoorNa;
  // Geen enkel punt beoordeeld? Dan zijn beide ringen gelijk en zegt de pijl niets.
  // Eén ring dus — maar wél dezelfde ring als op de dossierkaart. Stond hier eerst een
  // andere opmaak, en dat viel meteen op: bij Ouderschapsplan was nog niets afgevinkt,
  // dus daar zag de sectie er anders uit dan bij Alle en Convenant.
  if (!vn || !vn.beoordeeld || !vn.voor.totaal) {
    return `<div class="db-enkelring">
      <div class="v2-ring v2-ring-curr" style="background:${ringGrad(e)}">
        <div class="v2-ring-inner">${e.totaal > 0 ? getal(e.totaal)
          : '<span style="font-size:.9rem;color:var(--status-ok)">✓</span>'}</div>
      </div>
      <div class="db-enkelring-txt">${getal(e.totaal)} gevonden${
        e.openHoog ? ` · <b style="color:var(--status-risico)">${getal(e.openHoog)} hoog open</b>` : ''}</div>
    </div>`;
  }

  const verschil = vn.voor.totaal - vn.na.totaal;
  const pct = vn.voor.totaal ? Math.round(verschil / vn.voor.totaal * 100) : 0;

  // Exact de opmaak van de dossierkaart: dezelfde klassen, dezelfde ringen, dezelfde
  // legenda met deltapijltjes, dezelfde voortgangsbalk. Eigen varianten bouwen zou
  // twee dingen opleveren die hetzelfde bedoelen en er net anders uitzien.
  const kleur = pct > 0 ? 'var(--status-ok)' : pct < 0 ? 'var(--status-risico)' : 'var(--ink-soft)';
  const pctTx = pct > 0 ? `+ ${pct}%` : pct < 0 ? `${pct}%` : '±0%';

  return `<div class="v2-cmp-grid">
    <div class="v2-ring v2-ring-prev" style="background:${ringGrad(vn.voor)}">
      <div class="v2-ring-inner">${getal(vn.voor.totaal)}</div>
    </div>
    ${CMP_PIJL}
    <div class="v2-ring v2-ring-curr" style="background:${vn.na.totaal === 0
        ? 'conic-gradient(from -90deg,#B8D4C0 0deg 360deg)' : ringGrad(vn.na)}">
      <div class="v2-ring-inner">${vn.na.totaal > 0 ? getal(vn.na.totaal)
        : '<span style="font-size:.9rem;color:var(--status-ok)">✓</span>'}</div>
    </div>
    <div class="v2-cmp-stats">
      <span class="v2-stat-pct" style="color:${kleur}">${pctTx}</span>
      <div class="v2-prog-bar"><div class="v2-prog-fill" style="width:${Math.max(0, Math.min(100, pct))}%;background:${kleur}"></div></div>
      <span class="v2-stat-txt">• ${getal(vn.beoordeeld)} van ${getal(vn.voor.totaal)} beoordeeld</span>
    </div>
  </div>`;
}

export function categorieHtml(stats) {
  const rijen = (stats?.perCategorie || []).filter(r => r.totaal > 0);
  const e = stats?.ernst || { hoog: 0, midden: 0, laag: 0, totaal: 0, openHoog: 0 };

  if (!e.totaal) return `<p class="db-leeg">Nog geen bevindingen voor deze keuze.</p>`;

  const totAfgevinkt = rijen.reduce((a, r) => a + r.afgevinkt, 0);
  const totAlle      = rijen.reduce((a, r) => a + r.totaal, 0);

  return `<div class="db-duo">
    <div>
      <div class="db-legenda">
        <span><i style="background:var(--terra)"></i>Hoog</span>
        <span><i style="background:var(--warn)"></i>Midden</span>
        <span><i style="background:var(--ok)"></i>Laag</span>
      </div>
      <table class="db-tabel">
        <thead><tr><th>Categorie</th><th>Verdeling</th><th class="r">Totaal</th><th class="r">Afgevinkt</th></tr></thead>
        <tbody>${rijen.map(r => `<tr>
          <td class="db-cat">${escH(label(r.naam))}</td>
          <td><div class="db-staaf">
            ${r.hoog   ? `<span style="flex:${r.hoog};background:var(--terra)">${r.hoog}</span>` : ''}
            ${r.midden ? `<span style="flex:${r.midden};background:var(--warn)">${r.midden}</span>` : ''}
            ${r.laag   ? `<span style="flex:${r.laag};background:var(--ok)">${r.laag}</span>` : ''}
          </div></td>
          <td class="r db-tot">${getal(r.totaal)}</td>
          <td class="r db-mono">${r.afgevinktPct}%</td>
        </tr>`).join('')}</tbody>
        <tfoot><tr>
          <td class="db-cat">Totaal</td>
          <td class="db-mono">
            <span style="color:var(--terra)">${getal(e.hoog)}</span> ·
            <span style="color:var(--warn)">${getal(e.midden)}</span> ·
            <span style="color:var(--ok)">${getal(e.laag)}</span>
          </td>
          <td class="r db-tot">${getal(e.totaal)}</td>
          <td class="r db-mono">${totAlle ? Math.round(totAfgevinkt / totAlle * 100) : 0}%</td>
        </tr></tfoot>
      </table>
    </div>
    <!-- Geen kop en geen legenda: de kleuren staan al links boven de tabel, en de
         ringen spreken zonder bijschrift. -->
    <div class="db-cirkel">${ernstRingen(stats, e)}</div>
  </div>`;
}

// ── Verloop tussen versies ──────────────────────────────────────────────────
export function verloopHtml(stats) {
  const v = stats?.verloop;
  if (!v || !v.dossiers) {
    return `<p class="db-leeg">Nog geen dossier met een tweede analyse in deze periode.
      Het verloop vergelijkt de eerste versie met de laatste.</p>`;
  }
  const schaal = Math.max(v.v1, v.v2) || 1;
  const bl = (n) => (n / schaal * 100).toFixed(2);

  return `<div class="db-verloop">
    <div class="db-vrij">
      <div class="db-vlbl">Versie 1<span>${v.dossiers} dossier${v.dossiers === 1 ? '' : 's'}</span></div>
      <div class="db-vbalk">
        ${v.blijft    ? `<span style="width:${bl(v.blijft)}%;background:var(--ink-faint)" title="Blijft staan">${v.blijft}</span>` : ''}
        ${v.genegeerd ? `<span style="width:${bl(v.genegeerd)}%;background:var(--brass)" title="Genegeerd">${v.genegeerd}</span>` : ''}
        ${v.opgelost  ? `<span style="width:${bl(v.opgelost)}%;background:var(--ok)" title="Opgelost">${v.opgelost}</span>` : ''}
      </div>
      <div class="db-vtot">${getal(v.v1)}</div>
    </div>
    <div class="db-vrij">
      <div class="db-vlbl">Versie ${'laatste'}<span>na herziening</span></div>
      <div class="db-vbalk">
        ${v.blijft ? `<span style="width:${bl(v.blijft)}%;background:var(--ink-faint)" title="Blijft staan">${v.blijft}</span>` : ''}
        ${v.nieuw  ? `<span style="width:${bl(v.nieuw)}%;background:var(--terra)" title="Nieuw">${v.nieuw}</span>` : ''}
      </div>
      <div class="db-vtot">${getal(v.v2)}</div>
    </div>
  </div>
  <div class="db-vlegenda">
    ${[['var(--ok)', 'Opgelost', v.opgelost, 'Stond in versie 1, staat er niet meer.'],
       ['var(--brass)', 'Genegeerd', v.genegeerd, 'Weggeklikt zonder aanpassing — de screening zat ernaast of het punt gold niet.'],
       ['var(--ink-faint)', 'Blijft staan', v.blijft, 'Nog niet opgepakt.'],
       ['var(--terra)', 'Nieuw', v.nieuw, 'Alleen in de laatste versie. Ontstaan bij het herschrijven.']]
      .map(([kl, naam, aantal, uitleg]) => `<div class="db-vkaart">
        <i style="background:${kl}"></i>
        <div><b>${escH(naam)} · ${getal(aantal)}</b><span>${escH(uitleg)}</span></div>
      </div>`).join('')}
  </div>`;
}

// ── MfN-compatibiliteit ─────────────────────────────────────────────────────
export function mfnHtml(stats, docType = 'alle') {
  const alle = stats?.mfn || [];
  if (!alle.length) return `<p class="db-leeg">Nog geen MfN-score in deze periode.</p>`;

  const gekozen = docType === 'alle' ? alle : alle.filter(m => m.doc_type === docType);
  if (!gekozen.length) return `<p class="db-leeg">Geen ${escH(label(docType))} geanalyseerd in deze periode.</p>`;

  // Bij "alle": noemers en gemiddelden optellen. Een convenant kent 15 elementen en
  // een ouderschapsplan 12; samen 27 per dossier dat beide stukken bevat. Een
  // gemiddeld áántal over twee verschillende noemers zou een getal zonder betekenis zijn.
  const totaal = gekozen.reduce((a, m) => a + m.totaal, 0);
  const delen = [
    { naam: 'Aanwezig',   waarde: gekozen.reduce((a, m) => a + m.gemAanwezig, 0),   kleur: 'var(--ok)' },
    { naam: 'Onvolledig', waarde: gekozen.reduce((a, m) => a + m.gemOnvolledig, 0), kleur: 'var(--brass)' },
    { naam: 'Ontbreekt',  waarde: gekozen.reduce((a, m) => a + m.gemOntbreekt, 0),  kleur: 'var(--terra)' },
  ];
  const segs = ringSegmenten(delen);
  const docs = gekozen.reduce((a, m) => a + m.documenten, 0);
  const extra = gekozen.reduce((a, m) => a + m.extra, 0);

  return `<div class="db-donutblok">
    ${donutSvg(delen, getal(totaal), 'elementen')}
    <div class="db-regels">
      ${segs.map(s => `<div class="db-rij"><i style="background:${s.kleur}"></i> ${escH(s.naam)}
        <span class="db-pc">${s.pct}%</span><b>${komma(s.waarde)}</b></div>`).join('')}
      <div class="db-rij db-rij-slot"><span>Documenten</span><b>${getal(docs)}</b></div>
      ${extra ? `<div class="db-rij"><span style="color:var(--ok)">Extra geregeld, buiten de norm</span><b style="color:var(--ok)">${getal(extra)}</b></div>` : ''}
    </div>
  </div>`;
}

// ── Top terugkerende punten ─────────────────────────────────────────────────
export function topIssuesHtml(stats) {
  const top = stats?.topIssues || [];
  if (!top.length) return `<p class="db-leeg">Nog geen terugkerende punten in deze periode.</p>`;
  const max = top[0].aantal || 1;

  return `<div class="db-top">${top.map((r, i) => `<div class="db-toprij">
    <span class="db-rang">${i + 1}</span>
    <span class="db-toptekst">${escH(r.onderwerp)}
      <span class="db-topmeta">${r.dossiers} dossier${r.dossiers === 1 ? '' : 's'} · ${r.afgevinktPct}% afgevinkt</span></span>
    <span class="db-ministaaf"><i style="width:${(r.aantal / max * 100).toFixed(0)}%"></i></span>
    <span class="db-topaantal">${getal(r.aantal)}</span>
  </div>`).join('')}</div>`;
}

/** De documenttypen waarvoor er in deze periode een MfN-score is. */
export function mfnTypen(stats) {
  return (stats?.mfn || []).map(m => m.doc_type).filter(t => t in MFN_TOTAAL);
}
