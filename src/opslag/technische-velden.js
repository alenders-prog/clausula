/**
 * src/opslag/technische-velden.js — velden die de pseudonimisering niet mag aanraken
 *
 * ── AANLEIDING (8 september 2026) ───────────────────────────────────────────
 *
 * Een Storage-pad in een opgeslagen rapport luidde:
 *
 *     1788864773258-cz8[WERKGEVER_0]159gjr.pdf
 *
 * Het echte bestand heette `1788864773258-cz8bv159gjr.pdf`. De pseudonimisering had `bv`
 * middenin een wíllekeurige bestandsnaam herkend en vervangen. Het rapport verwees daarna
 * naar een pad dat niet bestaat: de PDF was in de viewer niet meer te tonen, en het bestand
 * bleef verweesd in Storage achter — met cliëntgegevens erin en niets dat er nog naar wees
 * om het op te ruimen.
 *
 * `anonimiseerObj` loopt over élke string in het rapport, en dat is voor de inhoud precies
 * goed. Maar een Storage-pad is geen tekst maar een sleutel: één vervangen letterreeks en
 * hij wijst nergens meer heen. Dat is niet met een betere namenlijst op te lossen — een
 * willekeurige reeks van elf tekens bevat vroeg of laat iets dat op een naam lijkt.
 *
 * ── WAT HIER WÉL EN NIET IN HOORT ───────────────────────────────────────────
 *
 * Alleen velden die een verwijzing zijn en geen inhoud. `pad` dus wel, `naam` níét: dat is
 * de bestandsnaam zoals de mediator hem aanleverde ("Convenant fam. Jansen.pdf") en die
 * hoort juist wél gepseudonimiseerd te worden.
 *
 * Zet hier niets bij zonder die toets: is het een sleutel of is het tekst? Bij twijfel is
 * het tekst, want dan gaat er hooguit iets onleesbaars naar de database in plaats van een
 * cliëntnaam.
 */

/**
 * Zet de technische verwijzingen terug zoals ze vóór het pseudonimiseren waren.
 *
 * @param {object} origineel        het rapport uit het geheugen
 * @param {object} gepseudonimiseerd  hetzelfde rapport ná anonimiseerObj
 * @returns {object} het gepseudonimiseerde rapport met de paden hersteld
 */
export function herstelTechnischeVelden(origineel, gepseudonimiseerd) {
  if (!gepseudonimiseerd || typeof gepseudonimiseerd !== 'object') return gepseudonimiseerd;

  const bronBestanden = Array.isArray(origineel?._document_bestanden)
    ? origineel._document_bestanden : null;
  if (!bronBestanden) return gepseudonimiseerd;

  const doelBestanden = Array.isArray(gepseudonimiseerd._document_bestanden)
    ? gepseudonimiseerd._document_bestanden : [];

  return {
    ...gepseudonimiseerd,
    _document_bestanden: doelBestanden.map((b, i) => {
      const pad = bronBestanden[i]?.pad;
      return pad === undefined ? b : { ...b, pad };
    }),
  };
}
