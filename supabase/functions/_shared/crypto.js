// Encrypts intervals.icu API keys before they are stored (AES-256-GCM).
// BETA_ENCRYPTION_KEY is a long random password set only in the Supabase function secrets
// (it is hashed with SHA-256 to make the 256-bit key). Changing it makes saved keys unreadable: people reconnect.
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function aesKey(secret) {
  if (!secret || secret.length < 24) throw new Error('BETA_ENCRYPTION_KEY must be at least 24 characters');
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encrypt(plain, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret), new TextEncoder().encode(plain)));
  return 'v1:' + b64(iv) + ':' + b64(ct);
}

export async function decrypt(cipher, secret) {
  const [v, iv, ct] = String(cipher).split(':');
  if (v !== 'v1') throw new Error('Unknown key format');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await aesKey(secret), unb64(ct));
  return new TextDecoder().decode(pt);
}
