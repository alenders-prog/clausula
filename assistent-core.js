// assistent-core.js
// Gedeelde logica voor de desktop (index.html) en mobiele (assistent-mobiel.html) assistent.
// Geladen via <script src="/assistent-core.js"></script> in beide pagina's.
// Blootgesteld als window.AssistCore.

/* global supabase, SUPABASE_URL, SUPABASE_KEY */
(function () {
  'use strict';

  // ── escH ─────────────────────────────────────────────────────────────────────
  function escH(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── renderMarkdown ────────────────────────────────────────────────────────────
  // Superset van desktop _assistMd + mobiele renderMarkdown:
  //   - Pipe-tabellen (desktop)
  //   - Code-spans `...` (desktop)
  //   - Horizontal rules --- (mobiel)
  //   - Genummerde lijsten (mobiel)
  //   - Optie/Variant/Stap op eigen regel (desktop)
  function renderMarkdown(tekst) {
    if (!tekst) return '';
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Zorg dat genummerde labels (Optie N, Variant N, Stap N) op een eigen regel staan
    tekst = tekst.replace(/([^\n])(\*\*(?:Optie|Variant|Stap)\s+\d)/g, '$1\n$2');

    // Stap 1: pipe-tabellen extracteren vóór HTML-escaping
    const tbls = [];
    let t = tekst.replace(/(?:^|\n)((?:\|[^\n]+\|\n?)+)/gm, (_, blok) => {
      const regels = blok.trim().split('\n').map(l => l.trim()).filter(Boolean);
      if (regels.length < 2) return _;
      const sepIdx = regels.findIndex(l => /^\|[-: |]+\|$/.test(l));
      if (sepIdx < 0) return _;
      const parseRij = (rij, tag) =>
        '<tr>' + rij.split('|').slice(1, -1).map(c => `<${tag}>${esc(c.trim())}</${tag}>`).join('') + '</tr>';
      const html = `<div class="assist-tbl-wrap"><table class="assist-tbl"><thead>${
        regels.slice(0, sepIdx).map(r => parseRij(r, 'th')).join('')
      }</thead><tbody>${
        regels.slice(sepIdx + 1).map(r => parseRij(r, 'td')).join('')
      }</tbody></table></div>`;
      tbls.push(html);
      return `\nTBLPH${tbls.length - 1}END\n`;
    });

    // Stap 2: rest verwerken
    t = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/^#{1,3}\s+(.+)$/gm, '<h3>$1</h3>')
      .replace(/^---+$/gm, '<hr>')
      .replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>')
      .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')
      .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
      .split('\n\n').map(p => {
        p = p.trim();
        if (!p) return '';
        if (p.startsWith('<')) return p;
        return `<p>${p.replace(/\n/g, ' ')}</p>`;
      }).join('')
      .replace(/<\/ul>\s*<ul>/g, '');

    // Stap 3: tabellen terugplaatsen
    tbls.forEach((html, i) => { t = t.replace(`TBLPH${i}END`, html); });
    return t;
  }

  // ── Labels ────────────────────────────────────────────────────────────────────
  // Superset van beide pagina's. Desktop heeft meer acties; mobiel toont subset.
  const VERVOLGACTIE_LABELS = {
    toepassen_op_casus:  'Toepassen op casus',
    opties_voor_klanten: '💡 Opties uitwerken',
    clausule_opstellen:  '📝 Clausule opstellen',
    klanttekst:          '✉️ Samenvatting voor klant',
    andere_stijl:        'Andere stijl',
    toets_aan_dossier:   'Toets aan dossier',
  };

  const ONBEKENDEN_LABELS = {
    relatievorm:             'relatievorm',
    huwelijksdatum:          'huwelijksdatum',
    huwelijkse_voorwaarden:  'huwelijkse voorwaarden',
    hv_stelsel:              'hv-stelsel',
    peildatum_vermogen:      'peildatum vermogen',
    kinderen_minderjarig:    'minderjarige kinderen',
    co_ouderschap:           'co-ouderschap',
    eigen_woning:            'eigen woning',
    woning_bestemming:       'bestemming woning',
    ondernemer:              'ondernemerschap',
    pensioen:                'pensioen',
    pensioen_verevening:     'pensioenverevening',
    lijfrente:               'lijfrente',
    uitsluitingsclausule:    'uitsluitingsclausule',
    partneralimentatie:      'partneralimentatie',
    internationaal_element:  'internationaal element',
    overig:                  'overig',
  };

  // ── Session-prefix ────────────────────────────────────────────────────────────
  const SESSION_PFX = 'assist_chat_';

  // Maand-jaar (mm-jjjj) uit een datum in dd-mm-jjjj. Fijn genoeg voor huwelijks-
  // en alimentatieduur, zonder de exacte dag prijs te geven. Valt terug op het kale
  // jaartal, en geeft null bij onherkenbare invoer zodat er nooit een half geparste
  // datum doorlekt. Spiegelt maandJaarUitDatum() in api/_feiten.js.
  function _maandJaarUitDatum(datum) {
    const s = String(datum || '').trim();
    if (!s) return null;
    const j = s.match(/(?:^|[-/ ])(\d{4})$/) || s.match(/^(\d{4})$/);
    const jaar = j ? parseInt(j[1], 10) : null;
    if (!jaar || jaar <= 1900 || jaar >= 2100) return null;
    const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/]\d{4}$/);
    const maand = m ? parseInt(m[2], 10) : null;
    if (!maand || maand < 1 || maand > 12) return String(jaar);
    return `${String(maand).padStart(2, '0')}-${jaar}`;
  }

  // ── bouwDossierContext ────────────────────────────────────────────────────────
  // Bouwt de dossiercontext-string uit classificatie + rapport.
  // opts.anonPipeline(tekst) → optioneel: past AVG-pseudonimisering toe (alleen desktop).
  function bouwDossierContext(classificatie, rapport, opts = {}) {
    if (!classificatie && !rapport) return 'Dossier: [DOSSIER]';
    const anon = opts.anonPipeline || (s => s);

    const pA = classificatie?.partij_a_naam || '';
    const pB = classificatie?.partij_b_naam || '';
    const pseudoA = pA ? anon(pA) || 'Partij A' : 'Partij A';
    const pseudoB = pB ? anon(pB) || 'Partij B' : 'Partij B';
    const rnA = (classificatie?.partij_a_roepnaam || '').trim().split(/\s+/)[0];
    const rnB = (classificatie?.partij_b_roepnaam || '').trim().split(/\s+/)[0];
    const pseudoRnA = rnA ? anon(rnA) || pseudoA.split(' ')[0] : pseudoA.split(' ')[0];
    const pseudoRnB = rnB ? anon(rnB) || pseudoB.split(' ')[0] : pseudoB.split(' ')[0];

    // AVG-dataminimalisatie richting Anthropic: stuur de juridisch relevante korrel,
    // niet de identificerende precisie. Leeftijd is wat de redenering nodig heeft
    // (AOW, alimentatieduur); de volledige geboortedatum voegt daar niets aan toe.
    const gbdA = classificatie?.partij_a_geboortedatum || '';
    const gbdB = classificatie?.partij_b_geboortedatum || '';
    const gbjA = gbdA ? parseInt(gbdA.split('-')[2], 10) : (classificatie?.partij_a_geboortejaar || null);
    const gbjB = gbdB ? parseInt(gbdB.split('-')[2], 10) : (classificatie?.partij_b_geboortejaar || null);
    const huidigJr = new Date().getFullYear();
    const lftA = gbjA && gbjA > 1900 ? huidigJr - gbjA : null;
    const lftB = gbjB && gbjB > 1900 ? huidigJr - gbjB : null;
    const partijAStr = `${pseudoA} (informeel: ${pseudoRnA}${lftA !== null ? `, ${lftA} jr` : ''})`;
    const partijBStr = `${pseudoB} (informeel: ${pseudoRnB}${lftB !== null ? `, ${lftB} jr` : ''})`;

    let ctx = `Dossier (namen gepseudonimiseerd): Partij A = ${partijAStr}, Partij B = ${partijBStr}`;

    const kenmerken = Array.isArray(classificatie?.situatie_kenmerken) ? classificatie.situatie_kenmerken : [];
    if (kenmerken.length) ctx += ` | Kenmerken: ${kenmerken.join(', ')}`;

    // Maand-jaar: dekt de 1-1-2018-grens (beperkte gemeenschap) én de huwelijks- en
    // alimentatieduur, zonder de exacte dag prijs te geven.
    const hwMndJaar = _maandJaarUitDatum(classificatie?.huwelijksdatum);
    if (hwMndJaar) ctx += ` | Verbintenis (maand-jaar): ${hwMndJaar}`;

    // Uitzondering op de minimalisatie: nationaliteit gaat exact mee. De waarde zelf
    // bepaalt het toepasselijk recht (Rome III, Brussel IIb) — "niet-NL" volstaat niet.
    const natA = classificatie?.nationaliteit_a || '';
    const natB = classificatie?.nationaliteit_b || '';
    if (natA || natB) ctx += ` | Nationaliteiten: A=${natA || 'onbekend'}, B=${natB || 'onbekend'}`;

    const kNamen  = Array.isArray(classificatie?.kinderen_namen)        ? classificatie.kinderen_namen        : [];
    const kDatums = Array.isArray(classificatie?.kinderen_geboortedatums) ? classificatie.kinderen_geboortedatums : [];
    if (kNamen.length) {
      const huidigJaar = new Date().getFullYear();
      const kInfoParts = kNamen.map((naam, i) => {
        const gbd  = kDatums[i] || '';
        const jaar = gbd ? parseInt(gbd.split('-')[2], 10) : null;
        const lft  = jaar && jaar > 1900 ? huidigJaar - jaar : null;
        return `${anon(naam)}${lft !== null ? ` (${lft} jr)` : ''}`;
      });
      ctx += ` | Kinderen: ${kInfoParts.join(', ')}`;
    }

    const samRaw = rapport?.samenvatting || classificatie?.samenvatting || '';
    if (samRaw) {
      const samAnon = anon(samRaw);
      ctx += ` | Samenvatting: ${samAnon}`;
    }

    if (Array.isArray(rapport?.documenten) && rapport.documenten.length > 1) {
      rapport.documenten.forEach(doc => {
        const dSam = doc.samenvatting || '';
        if (!dSam) return;
        ctx += ` | ${doc.doc_type || 'Document'}: ${anon(dSam)}`;
      });
    }

    const openIssues = (Array.isArray(rapport?.issues) ? rapport.issues : [])
      .filter(i => !i.negeer && !i.afgehandeld)
      .map(i => {
        const tekst = i.signalering || i.bevinding || '';
        return `${(i.ernst || '').toUpperCase()}: ${anon(tekst)}`;
      })
      .join('; ');
    if (openIssues) ctx += ` | Open issues: ${openIssues}`;

    return ctx;
  }

  // ── laadScreeningData ─────────────────────────────────────────────────────────
  // Haalt de meest recente screening op voor een dossier_id.
  // db: de Supabase client (db op desktop, db op mobiel).
  // Geeft { classificatie, rapport, bestandsnaam } of null.
  async function laadScreeningData(db, dossierId) {
    if (!db || !dossierId) return null;
    const { data: rows, error } = await db
      .from('screeningen')
      // namen_map meenemen: zonder die blob kan de client de pseudoniemen niet
      // terugvertalen en toont hij "Thomas Bergman" in plaats van de echte naam.
      .select('classificatie, rapport, bestandsnaam, namen_map')
      .eq('dossier_id', dossierId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    return rows?.[0] ?? null;
  }

  // ── verstuurNaarAPI ───────────────────────────────────────────────────────────
  // Centrale fetch naar /api/ai-assistent.
  // params: { token, vraag, conversatie, dossierId?, dossierContext?, resolvedFields?, stijl?, rawModus? }
  // Geeft het geparseerde JSON-antwoord terug, of gooit een Error.
  async function verstuurNaarAPI(params) {
    const {
      token,
      vraag,
      conversatie    = [],
      dossierId      = null,
      dossierContext = null,
      resolvedFields = {},
      stijl          = 'juridisch_volledig',
      rawModus       = false,
    } = params;

    const body = { vraag, conversatie };
    if (dossierId)      body.dossierId      = dossierId;
    if (dossierContext) body.dossierContext = dossierContext;
    if (Object.keys(resolvedFields).length) body.resolvedFields = resolvedFields;
    body.stijl = stijl;
    if (rawModus) body.rawModus = true;

    const resp = await fetch('/api/ai-assistent', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
    return data;
  }

  // ── Session management ────────────────────────────────────────────────────────
  // slaOpInStorage: slaat een sessie op in localStorage.
  // sessieId: string (wordt aangemaakt als null)
  // sessieData: { conversatie, dossierId?, dossierNaam?, dossierContext?, userAnswers? }
  // prefix: optioneel — standaard SESSION_PFX
  // Geeft het (nieuwe) sessieId terug.
  function slaOpInStorage(sessieId, sessieData, prefix) {
    const pfx = prefix || SESSION_PFX;
    if (!sessieData?.conversatie?.length) return sessieId;
    const id = sessieId || `${pfx}algemeen_${Date.now()}`;
    const eersteVraag = sessieData.conversatie.find(b => b.role === 'user')?.content || 'Gesprek';
    const sessie = {
      id,
      titel:          eersteVraag.slice(0, 60),
      timestamp:      Date.now(),
      conversatie:    sessieData.conversatie,
      userAnswers:    sessieData.userAnswers    || {},
      dossierId:      sessieData.dossierId      || null,
      dossierNaam:    sessieData.dossierNaam    || '',
      dossierContext: sessieData.dossierContext || '',
    };
    try {
      localStorage.setItem(id, JSON.stringify(sessie));
    } catch (e) {
      console.warn('[AssistCore] localStorage opslaan mislukt:', e.message);
    }
    return id;
  }

  // laadSessies: geeft alle opgeslagen sessies gesorteerd op timestamp (nieuwste eerst).
  // prefix: optioneel — standaard SESSION_PFX
  function laadSessies(prefix) {
    const pfx = prefix || SESSION_PFX;
    const sessies = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(pfx)) continue;
      try {
        const s = JSON.parse(localStorage.getItem(k));
        if (s?.conversatie?.length) sessies.push(s);
      } catch (_) {}
    }
    return sessies.sort((a, b) => b.timestamp - a.timestamp);
  }

  // verwijderSessie: verwijdert één sessie uit localStorage.
  // Geeft true als de verwijderde sessie de actieve was.
  function verwijderSessie(sessieId, actieveSessieId) {
    localStorage.removeItem(sessieId);
    return sessieId === actieveSessieId;
  }

  // opruimenAlgemeen: behoudt maximaal `max` algemene sessies (LIFO).
  function opruimenAlgemeen(prefix, max) {
    const pfx = prefix || SESSION_PFX;
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(`${pfx}algemeen_`)) keys.push(k);
    }
    keys.sort().reverse().slice(max || 10).forEach(k => localStorage.removeItem(k));
  }

  // ── Export ────────────────────────────────────────────────────────────────────
  window.AssistCore = {
    escH,
    renderMarkdown,
    VERVOLGACTIE_LABELS,
    ONBEKENDEN_LABELS,
    SESSION_PFX,
    bouwDossierContext,
    laadScreeningData,
    verstuurNaarAPI,
    slaOpInStorage,
    laadSessies,
    verwijderSessie,
    opruimenAlgemeen,
  };
})();
