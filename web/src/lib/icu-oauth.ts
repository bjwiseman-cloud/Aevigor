// "Connect with intervals.icu" (OAuth with PKCE). intervals.icu lists Aevigor as a public client, so no secret is needed:
// the app makes a random verifier, sends its SHA-256 challenge to the consent page, and gives the verifier to the server
// with the one-time code that comes back to /beta/icu.html.
export const ICU_CLIENT_ID = '1967';
export const ICU_SCOPES = 'ACTIVITY:WRITE,WELLNESS:WRITE,CALENDAR:WRITE,SETTINGS:WRITE';
const STORE = 'aevigor-icu-oauth';

export function redirectUri() {
  return window.location.origin + '/beta/icu.html';
}

function randomString(bytes: number) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return b64url(a);
}

function b64url(a: Uint8Array) {
  let s = '';
  a.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function startIcuConnect(timeZone: string) {
  const verifier = randomString(48);            // 64 characters
  const state = randomString(16);
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  try { localStorage.setItem(STORE, JSON.stringify({ verifier, state, timeZone, at: Date.now() })); } catch { /* private mode */ }
  const q = new URLSearchParams({
    client_id: ICU_CLIENT_ID, redirect_uri: redirectUri(), scope: ICU_SCOPES, state,
    code_challenge: challenge, code_challenge_method: 'S256'
  });
  window.location.assign('https://intervals.icu/oauth/authorize?' + q.toString());
}

// Returns the saved verifier when the state matches the one we sent (and is under 15 minutes old), then forgets it.
export function takeIcuPending(state: string): { verifier: string; timeZone: string } | null {
  let saved: { verifier?: string; state?: string; timeZone?: string; at?: number } | null = null;
  try { saved = JSON.parse(localStorage.getItem(STORE) ?? 'null'); localStorage.removeItem(STORE); } catch { saved = null; }
  if (!saved?.verifier || !saved.state || saved.state !== state) return null;
  if (!saved.at || Date.now() - saved.at > 15 * 60 * 1000) return null;
  return { verifier: saved.verifier, timeZone: saved.timeZone ?? '' };
}
