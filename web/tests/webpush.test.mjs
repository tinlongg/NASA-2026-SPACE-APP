import test from 'node:test';
import assert from 'node:assert/strict';
import { wpB64, wpEncrypt, wpVapidHeader, wpSend, wpConfigured } from '../webpush.mjs';

// A "browser": the receiving side of a push subscription.
async function subscriber() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const publicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)), auth = crypto.getRandomValues(new Uint8Array(16));
  return { pair, publicRaw, auth, p256dh: wpB64.encode(publicRaw), authText: wpB64.encode(auth) };
}
const hkdf = async (salt, ikm, info, length) => new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), length * 8));
const concat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
async function decrypt(body, sub) { // RFC 8291, receiver side
  const salt = body.slice(0, 16), idlen = body[20], senderPublic = body.slice(21, 21 + idlen), cipher = body.slice(21 + idlen);
  const senderKey = await crypto.subtle.importKey('raw', senderPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: senderKey }, sub.pair.privateKey, 256));
  const ikm = await hkdf(sub.auth, shared, concat(new TextEncoder().encode('WebPush: info\0'), sub.publicRaw, senderPublic), 32);
  const cek = await hkdf(salt, ikm, new TextEncoder().encode('Content-Encoding: aes128gcm\0'), 16), nonce = await hkdf(salt, ikm, new TextEncoder().encode('Content-Encoding: nonce\0'), 12);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), cipher));
  assert.equal(plain.at(-1), 2); return new TextDecoder().decode(plain.slice(0, -1));
}
async function vapidKeys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']), jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const publicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return { pair, publicKey: wpB64.encode(publicRaw), privateKey: jwk.d };
}

test('a push payload decrypts on the receiving side', async () => {
  const sub = await subscriber(), message = JSON.stringify({ title: 'Alert', body: 'Galley: Person 2 asked for help' });
  const body = await wpEncrypt(message, sub.p256dh, sub.authText);
  assert.equal(await decrypt(body, sub), message);
  assert.notEqual(Buffer.from(body).includes(Buffer.from('Galley')), true, 'the text is not readable in transit');
  assert.notDeepEqual(body.slice(0, 16), (await wpEncrypt(message, sub.p256dh, sub.authText)).slice(0, 16), 'a fresh salt every time');
});

test('the VAPID token names the push service and verifies with the public key', async () => {
  const keys = await vapidKeys(), header = await wpVapidHeader('https://push.example/send/abc', keys.publicKey, keys.privateKey, 'mailto:ops@example.com', 1_000_000);
  const [, token, key] = header.match(/^vapid t=([^,]+), k=(.+)$/) ?? [];
  assert.ok(token && key === keys.publicKey);
  const [head, claims, signature] = token.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(head, 'base64url')), { typ: 'JWT', alg: 'ES256' });
  assert.deepEqual(JSON.parse(Buffer.from(claims, 'base64url')), { aud: 'https://push.example', exp: 1000 + 12 * 3600, sub: 'mailto:ops@example.com' });
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, keys.pair.publicKey, wpB64.decode(signature), new TextEncoder().encode(`${head}.${claims}`)));
});

test('wpSend posts the request and reports sent, gone and failed', async () => {
  const keys = await vapidKeys(), env = { VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey, VAPID_SUBJECT: 'mailto:ops@example.com' }, sub = await subscriber();
  const subscription = { endpoint: 'https://push.example/send/xyz', p256dh: sub.p256dh, auth: sub.authText };
  let seen; const reply = status => async (url, init) => { seen = { url, init }; return new Response('', { status }); };
  assert.equal(await wpSend(env, subscription, { title: 'Hi', body: 'There' }, reply(201)), 'sent');
  assert.equal(seen.url, subscription.endpoint); assert.equal(seen.init.headers['Content-Encoding'], 'aes128gcm'); assert.match(seen.init.headers.Authorization, /^vapid t=/);
  assert.equal(JSON.parse(await decrypt(seen.init.body, sub)).title, 'Hi');
  assert.equal(await wpSend(env, subscription, {}, reply(410)), 'gone');
  assert.equal(await wpSend(env, subscription, {}, reply(500)), 'failed');
  assert.equal(await wpSend(env, subscription, {}, async () => { throw Error('offline'); }), 'failed');
  assert.equal(wpConfigured({}), false); assert.equal(await wpSend({}, subscription, {}, reply(201)), 'failed');
});
