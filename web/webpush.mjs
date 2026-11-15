// Web Push for the Worker (RFC 8030 delivery, RFC 8291 aes128gcm encryption, RFC 8292 VAPID), built on
// WebCrypto only. Self-contained and prefixed so the Worker bundle can concatenate it. Needs the secrets
// VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT (a mailto: or https: contact the push service
// can use). Generate keys with `node scripts/generate-vapid.mjs`.

export const wpB64 = {
  encode: bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''),
  decode: text => Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(text.length / 4) * 4, '=')), char => char.charCodeAt(0)),
};
const wpConcat = (...parts) => { const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let offset = 0; for (const part of parts) { out.set(part, offset); offset += part.length; } return out; };
const wpText = text => new TextEncoder().encode(text);

async function wpHkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

/** Encrypts a payload for one subscription: salt, record size, sender key id, then AES-128-GCM. */
export async function wpEncrypt(payload, p256dh, auth) {
  const receiverPublic = wpB64.decode(p256dh), authSecret = wpB64.decode(auth);
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const senderPublic = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const receiverKey = await crypto.subtle.importKey('raw', receiverPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: receiverKey }, pair.privateKey, 256));
  const ikm = await wpHkdf(authSecret, shared, wpConcat(wpText('WebPush: info\0'), receiverPublic, senderPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await wpHkdf(salt, ikm, wpText('Content-Encoding: aes128gcm\0'), 16), nonce = await wpHkdf(salt, ikm, wpText('Content-Encoding: nonce\0'), 12);
  const plain = wpConcat(wpText(payload), new Uint8Array([2])); // 0x02 marks the last record
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']), plain));
  return wpConcat(salt, new Uint8Array([0, 0, 0x10, 0]), new Uint8Array([senderPublic.length]), senderPublic, cipher);
}

/** The VAPID Authorization header value: a signed ES256 token naming the push service and a contact. */
export async function wpVapidHeader(endpoint, publicKey, privateKey, subject, now = Date.now()) {
  const publicBytes = wpB64.decode(publicKey);
  const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: wpB64.encode(publicBytes.slice(1, 33)), y: wpB64.encode(publicBytes.slice(33, 65)), d: privateKey }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = wpB64.encode(wpText(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = wpB64.encode(wpText(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })));
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, wpText(`${head}.${body}`)));
  return `vapid t=${head}.${body}.${wpB64.encode(signature)}, k=${publicKey}`;
}

export const wpConfigured = env => Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);

/** Sends one push. Returns 'sent', 'gone' (the subscription is dead and should be deleted) or 'failed'. */
export async function wpSend(env, subscription, message, fetcher = fetch) {
  if (!wpConfigured(env)) return 'failed';
  try {
    const response = await fetcher(subscription.endpoint, { method: 'POST', signal: AbortSignal.timeout(10000), headers: { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '3600', Urgency: 'high', Authorization: await wpVapidHeader(subscription.endpoint, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY, env.VAPID_SUBJECT) }, body: await wpEncrypt(JSON.stringify(message), subscription.p256dh, subscription.auth) });
    return response.status === 404 || response.status === 410 ? 'gone' : response.ok ? 'sent' : 'failed';
  } catch { return 'failed'; }
}
