/**
 * api/_crypto.js — AES-256-GCM helpers voor naamkoppeling-encryptie
 *
 * Werkt in zowel Vercel Edge Runtime als Node.js 18+ serverless functies.
 * Sleutel: NAAM_ENCRYPTION_KEY env var — exact 64 hex-tekens (= 32 bytes).
 *
 * Genereer een sleutel met:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

function b64Encode(uint8arr) {
  let s = '';
  for (const b of uint8arr) s += String.fromCharCode(b);
  return btoa(s);
}

function b64Decode(b64) {
  const s = atob(b64);
  const arr = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) arr[i] = s.charCodeAt(i);
  return arr;
}

async function importeerSleutel(gebruik) {
  const hex = process.env.NAAM_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      'NAAM_ENCRYPTION_KEY ontbreekt of ongeldig — verwacht 64 hex-tekens (32 bytes). ' +
      'Genereer met: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  const raw = Uint8Array.from(hex.match(/.{1,2}/g), h => parseInt(h, 16));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, [gebruik]);
}

/**
 * Versleutel een array van [placeholder, echteNaam] paren.
 * Geeft een base64-string terug: 12-byte IV + AES-GCM ciphertext.
 */
export async function versleutelNamen(entries) {
  const key = await importeerSleutel('encrypt');
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const pt  = new TextEncoder().encode(JSON.stringify(entries));
  const ct  = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, pt);
  const buf = new Uint8Array(iv.byteLength + ct.byteLength);
  buf.set(iv, 0);
  buf.set(new Uint8Array(ct), iv.byteLength);
  return b64Encode(buf);
}

/**
 * Ontsleutel een base64-blob naar een array van [placeholder, echteNaam] paren.
 */
export async function ontsleutelNamen(blob) {
  const key = await importeerSleutel('decrypt');
  const buf = b64Decode(blob);
  const iv  = buf.slice(0, 12);
  const ct  = buf.slice(12);
  const pt  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return JSON.parse(new TextDecoder().decode(pt));
}
