// Phone alerts (src/push.js): the message is encrypted for the browser (RFC 8291) and signed (RFC 8292); gone devices are dropped;
// only real push services are kept.
const test = require('node:test'), assert = require('node:assert'), crypto = require('node:crypto');
const { Push, encrypt, cleanSub } = require('../src/push');
const { Store } = require('../src/store');

const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
// The browser's side, written from the RFC: read the header, derive the same keys, decrypt, strip the padding delimiter.
function decrypt(body, ua, auth) {
  const salt = body.subarray(0, 16), idlen = body[20], asPub = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
  const ikm = hmac(hmac(auth, ua.computeSecret(asPub)), Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPub, Buffer.from([1])]));
  const prk = hmac(salt, ikm), cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16), nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  assert.strictEqual(plain[plain.length - 1], 2, 'the last-record delimiter'); return plain.subarray(0, -1).toString();
}
const browser = host => { const ua = crypto.createECDH('prime256v1'); ua.generateKeys(); const auth = crypto.randomBytes(16);
  return { ua, auth, sub: { endpoint: 'https://' + host + '/push/' + crypto.randomBytes(4).toString('hex'), keys: { p256dh: ua.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } } }; };

test('an alert is encrypted for the browser, signed, and gone devices are dropped', async () => {
  const b = browser('web.push.apple.com');
  assert.strictEqual(decrypt(encrypt(b.sub, 'hello lead'), b.ua, b.auth), 'hello lead', 'the browser can read it');
  const store = await Store.open({ memory: true }), sent = [];
  const push = new Push(store, { log: { error() {} }, fetchImpl: async (url, o) => { sent.push({ url, o }); return { status: /gone/.test(url) ? 410 : 201 }; } });
  assert.strictEqual(await push.notify({ title: 'x' }), 0, 'no devices: nothing sent');
  const g = browser('fcm.googleapis.com'); g.sub.endpoint = 'https://fcm.googleapis.com/gone/1';
  assert(push.add(b.sub, 'iPhone') && push.add(g.sub, 'Mac'));
  assert(!push.add({ endpoint: 'https://evil.example/x', keys: b.sub.keys }) && !push.add({ endpoint: 'http://web.push.apple.com/x', keys: b.sub.keys }) && !push.add({ endpoint: b.sub.endpoint, keys: { p256dh: 'x', auth: 'y' } }), 'only real push services, with real keys');
  assert.strictEqual(cleanSub({ endpoint: 'https://abc.notify.windows.com/w/?token=1', keys: b.sub.keys }).endpoint, 'https://abc.notify.windows.com/w/?token=1');
  const n = await push.notify({ title: 'A lead email is ready to send', body: 'Reply drafted to new lead Camilo', url: '/#sales/card/a1', tag: 'a1' });
  assert.strictEqual(n, 1, 'the live device took it');
  const toApple = sent.find(x => x.url === b.sub.endpoint).o;
  assert.deepStrictEqual([toApple.method, toApple.headers['Content-Encoding'], toApple.headers.TTL, toApple.headers.Urgency], ['POST', 'aes128gcm', '86400', 'high']);
  assert.deepStrictEqual(JSON.parse(decrypt(toApple.body, b.ua, b.auth)), { title: 'A lead email is ready to send', body: 'Reply drafted to new lead Camilo', url: '/#sales/card/a1', tag: 'a1' });
  const [, t, k] = /^vapid t=([^,]+), k=(\S+)$/.exec(toApple.headers.Authorization), [h64, c64, s64] = t.split('.');
  assert.strictEqual(k, push.key()); const claims = JSON.parse(Buffer.from(c64, 'base64url'));
  assert.deepStrictEqual([claims.aud, claims.sub], ['https://web.push.apple.com', 'mailto:city-owner@example.com']);
  const raw = Buffer.from(k, 'base64url'), pub = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33).toString('base64url') }, format: 'jwk' });
  assert(crypto.verify('sha256', Buffer.from(h64 + '.' + c64), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(s64, 'base64url')), 'signed with the engine key');
  assert.deepStrictEqual(push.subs().map(s => s.label), ['iPhone'], 'the gone device is dropped');
  assert.strictEqual(push.key(), new Push(store).key(), 'one key, kept');
  await push.notify({ title: 'x', url: 'https://evil.example/' }); assert.strictEqual(JSON.parse(decrypt(sent.pop().o.body, b.ua, b.auth)).url, '/', 'an alert only opens the city');
  assert(push.remove(b.sub.endpoint) && push.subs().length === 0);
});
