// "Connect with intervals.icu": auth header choice and the code exchange request (no secret, PKCE verifier sent).
import assert from 'node:assert/strict';
import { authHeader, exchangeCode, revokeToken, OAUTH_PREFIX } from '../supabase/functions/_shared/intervals.js';

assert.equal(authHeader('abc123'), 'Basic ' + btoa('API_KEY:abc123'));
assert.equal(authHeader(OAUTH_PREFIX + 'tok'), 'Bearer tok');

const calls = [];
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), init });
  if (String(url).endsWith('/oauth/token')) return new Response(JSON.stringify({ token_type: 'Bearer', access_token: 't1', scope: 'ACTIVITY:WRITE', athlete: { id: 'i1', name: 'A' } }));
  return new Response('', { status: 200 });
};
const t = await exchangeCode({ clientId: '1967', code: 'c0de', verifier: 'v'.repeat(64) });
assert.equal(t.access_token, 't1');
const form = calls[0].init.body;
assert.equal(form.get('client_id'), '1967');
assert.equal(form.get('code_verifier'), 'v'.repeat(64));
assert.equal(form.get('client_secret'), null);

await revokeToken('plainkey');                     // API keys are not revoked
assert.equal(calls.length, 1);
await revokeToken(OAUTH_PREFIX + 't1');
assert.equal(calls[1].init.method, 'DELETE');
assert.equal(calls[1].init.headers.Authorization, 'Bearer t1');

globalThis.fetch = async () => new Response('{"error":"bad"}', { status: 400 });
await assert.rejects(() => exchangeCode({ clientId: '1967', code: 'x', verifier: 'v'.repeat(64) }), /did not finish/);
console.log('icu-oauth tests passed');
