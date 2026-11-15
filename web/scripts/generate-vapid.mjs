// Prints a new VAPID key pair for Web Push. Put the two values in the hosting secrets (or web/.env for
// local use) as VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY, and set VAPID_SUBJECT to a contact such as
// mailto:you@example.com. Never commit the private key.
const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
const b64 = text => Buffer.from(text, 'base64url'), publicKey = Buffer.concat([Buffer.from([4]), b64(jwk.x), b64(jwk.y)]).toString('base64url');
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
console.log('VAPID_SUBJECT=mailto:you@example.com   # replace with your own contact');
