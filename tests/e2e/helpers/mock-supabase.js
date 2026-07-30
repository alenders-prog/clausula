/**
 * tests/e2e/helpers/mock-supabase.js
 *
 * Hulpfuncties voor Playwright-smoketests: injecteert een nep-sessie in
 * localStorage en onderschept Supabase-netwerkaanroepen én CDN-scripts
 * met fixture-data / minimale stubs.
 *
 * Gebruik:
 *   import { mockSupabaseSession, mockSupabaseRest } from '../helpers/mock-supabase.js';
 *   test.beforeEach(async ({ page }) => {
 *     await mockSupabaseSession(page);
 *     await mockSupabaseRest(page);
 *   });
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fix = (name) => JSON.parse(readFileSync(join(__dirname, `../fixtures/${name}`), 'utf8'));

const SESSION        = fix('session.json');
const PROFIEL        = fix('gebruikersprofiel.json');
const ORGANISATIES   = fix('organisaties.json');
const DOSSIERS       = fix('dossiers.json');
const SUPABASE_HOST  = 'zanxprrymagsuwxddiln.supabase.co';

// ── Supabase UMD stub ─────────────────────────────────────────────────────────
// Minimalistische implementatie die echte fetch()-aanroepen doet naar de
// Supabase-URL, zodat Playwright die kan onderscheppen via page.route().
const SUPABASE_STUB = `
(function(){
'use strict';
function createClient(baseUrl,key){
  var hdr={'apikey':key,'Content-Type':'application/json'};
  function sess(){
    try{return JSON.parse(localStorage.getItem('sb-'+baseUrl.replace('https://','').split('.')[0]+'-auth-token'));}
    catch(e){return null;}
  }
  function qb(table){
    var sel='*',fil={},single=false;
    var b={
      select:function(c){sel=c||'*';return b;},
      eq:function(col,val){fil[col]='eq.'+val;return b;},
      order:function(){return b;},
      limit:function(){return b;},
      overlaps:function(col,val){fil[col]='ov.{'+val+'}';return b;},
      single:function(){single=true;return b;},
      then:function(res,rej){
        var s=sess(),tok=(s&&s.access_token)||key;
        var p=new URLSearchParams({select:sel});
        for(var k in fil) p.set(k,fil[k]);
        var h=Object.assign({},hdr,{'Authorization':'Bearer '+tok});
        if(single) h['Accept']='application/vnd.pgrst.object+json';
        return fetch(baseUrl+'/rest/v1/'+table+'?'+p,{headers:h})
          .then(function(r){return r.json();})
          .then(function(d){return {data:d,error:null};})
          .catch(function(e){return {data:null,error:e};})
          .then(res,rej);
      },
      catch:function(r){return b.then(undefined,r);}
    };
    return b;
  }
  return {
    from:qb,
    auth:{
      getSession:function(){
        var s=sess();
        return Promise.resolve({data:{session:s},error:null});
      },
      onAuthStateChange:function(cb){
        var s=sess();
        if(s) setTimeout(function(){cb('SIGNED_IN',s);},0);
        return {data:{subscription:{unsubscribe:function(){}}}};
      },
      signOut:function(){return Promise.resolve({error:null});}
    }
  };
}
window.supabase={createClient:createClient};
})();
`;

// Minimale pdf.js stub: alleen de properties die het opstartscript nodig heeft
const PDFJS_STUB = `
window.pdfjsLib={
  GlobalWorkerOptions:{workerSrc:''},
  getDocument:function(){
    return {promise:Promise.resolve({
      numPages:0,
      getPage:function(){
        return Promise.resolve({
          getViewport:function(){return {width:0,height:0,scale:1};},
          render:function(){return {promise:Promise.resolve()};},
          getTextContent:function(){return Promise.resolve({items:[]});}
        });
      }
    })};
  }
};
`;

/**
 * Injecteert een mock Supabase-sessie in localStorage vóór het laden van de pagina.
 */
export async function mockSupabaseSession(page) {
  await page.addInitScript(([host, session]) => {
    const key = `sb-${host.split('.')[0]}-auth-token`;
    localStorage.setItem(key, JSON.stringify(session));
  }, [SUPABASE_HOST, SESSION]);
}

/**
 * Intercepteert CDN-scripts met minimale stubs zodat de pagina niet op het
 * netwerk hoeft te wachten. Roep dit vóór page.goto() aan.
 */
export async function mockCdnScripts(page) {
  await page.route(/cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com/, route => {
    const url = route.request().url();
    let body = '';
    if (url.includes('supabase.js')) body = SUPABASE_STUB;
    else if (url.includes('pdf.min.js')) body = PDFJS_STUB;
    else if (url.includes('vfs_fonts')) body = 'if(window.pdfMake)window.pdfMake.vfs={};';
    else if (url.includes('pdfmake')) body = 'window.pdfMake={createPdf:function(){return {download:function(){},getBlob:function(cb){cb(new Blob());}};},vfs:{}};';
    route.fulfill({ contentType: 'application/javascript; charset=utf-8', body });
  });
}

/**
 * Onderschept CDN-scripts, Supabase REST/auth en Storage met fixture-data.
 * Moet worden ingesteld vóór page.goto().
 */
export async function mockSupabaseRest(page) {
  // CDN-scripts eerst intercepteren zodat de pagina niet op het netwerk wacht
  await mockCdnScripts(page);

  // ── Auth ─────────────────────────────────────────────────────────────────────
  await page.route(`**/${SUPABASE_HOST}/auth/v1/**`, route => {
    const url = route.request().url();
    if (url.includes('/user') || url.includes('/token') || url.includes('/session')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SESSION.user ? SESSION : { user: SESSION.user }),
      });
    } else {
      route.continue();
    }
  });

  // ── REST-tabellen ─────────────────────────────────────────────────────────────
  // .single() stuurt Accept: application/vnd.pgrst.object+json en verwacht een
  // object terug, geen array.
  await page.route(`**/${SUPABASE_HOST}/rest/v1/**`, async route => {
    const url = route.request().url();
    const accept = route.request().headers()['accept'] || '';
    const isSingle = accept.includes('vnd.pgrst.object');
    let data = [];

    if (url.includes('gebruikersprofiel'))       data = PROFIEL;
    else if (url.includes('organisaties'))        data = ORGANISATIES;
    else if (url.includes('dossiers'))            data = DOSSIERS;
    else if (url.includes('screeningen'))         data = [];
    else if (url.includes('legal_chunks'))        data = [];
    else if (url.includes('situatie_kenmerken'))  data = [];
    else if (url.includes('document_templates'))  data = [];
    else if (url.includes('rpc/'))               data = {};

    const body = isSingle
      ? (Array.isArray(data) ? (data[0] ?? null) : data)
      : data;

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  // ── Storage ──────────────────────────────────────────────────────────────────
  await page.route(`**/${SUPABASE_HOST}/storage/**`, route => {
    route.fulfill({ status: 404, body: 'not found in test' });
  });
}

/**
 * Onderschept /api/naam-decrypt — geeft lege namen-map terug.
 */
export async function mockNaamDecrypt(page) {
  await page.route('**/api/naam-decrypt', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ entries: [] }),
    });
  });
}
