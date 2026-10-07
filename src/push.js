// Alerts on your phone. Standard web
// push: the browser gives a subscription (a push service address plus two keys), the city signs each send with its own VAPID key
// (RFC 8292) and encrypts the message for that browser (RFC 8291, aes128gcm). node:crypto only, no package. iPhone: the city must be
// added to the Home Screen first (Safari's rule for web push). What buzzes is your choice in Settings (city.js alert).
const crypto = require('node:crypto');

// The push services a subscription may point at (Apple, Google, Mozilla, Microsoft): never an address of the caller's choosing.
const PUSH_HOSTS = /^(web\.push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[\w-]+\.notify\.windows\.com)$/;
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

// The city's VAPID key pair, made once and kept in the store. pub: the raw public key (65 bytes, base64url) the browser subscribes with.
function vapidKeys(store) {
  const k0 = store.get('vapid'); if (k0 && k0.pub && k0.jwk) return k0;
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }), jwk = privateKey.export({ format: 'jwk' });
  const k = { pub: Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]).toString('base64url'), jwk };
  store.set('vapid', k);
  return k;
}
// The Authorization header for one push service (RFC 8292): a 12-hour ES256 token for its origin.
function vapidAuth(endpoint, keys, subject, now = Date.now()) {
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = b64({ typ: 'JWT', alg: 'ES256' }) + '.' + b64({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject });
  const sig = crypto.sign('sha256', Buffer.from(unsigned), { key: crypto.createPrivateKey({ key: keys.jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' });
  return 'vapid t=' + unsigned + '.' + sig.toString('base64url') + ', k=' + keys.pub;
}
// RFC 8291: the message encrypted for one browser, as a single aes128gcm record. salt and asKey are for tests only.
function encrypt(sub, payload, { salt = crypto.randomBytes(16), asKey } = {}) {
  const ua = Buffer.from(sub.keys.p256dh, 'base64url'), auth = Buffer.from(sub.keys.auth, 'base64url');
  const ecdh = crypto.createECDH('prime256v1');
  if (asKey) ecdh.setPrivateKey(asKey); else ecdh.generateKeys();
  const asPub = ecdh.getPublicKey(), secret = ecdh.computeSecret(ua);
  const ikm = hmac(hmac(auth, secret), Buffer.concat([Buffer.from('WebPush: info\0'), ua, asPub, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([c.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const head = Buffer.alloc(21); salt.copy(head, 0); head.writeUInt32BE(4096, 16); head[20] = asPub.length;
  return Buffer.concat([head, asPub, body]);
}
// A subscription as the browser's toJSON() gives it, checked: an https push service address and two keys of the right size. null if not.
function cleanSub(s) {
  try {
    const u = new URL(String(s && s.endpoint || '')), k = (s && s.keys) || {};
    if (u.protocol !== 'https:' || !PUSH_HOSTS.test(u.hostname)) return null;
    if (Buffer.from(String(k.p256dh || ''), 'base64url').length !== 65 || Buffer.from(String(k.auth || ''), 'base64url').length !== 16) return null;
    return { endpoint: u.href, keys: { p256dh: String(k.p256dh), auth: String(k.auth) } };
  } catch (e) { return null; }
}

class Push {
  constructor(store, { fetchImpl = fetch, subject = 'mailto:city-owner@example.com', log = console } = {}) { this.store = store; this.fetch = fetchImpl; this.subject = subject; this.log = log; }
  key() { return vapidKeys(this.store).pub; }
  subs() { return this.store.get('pushSubs', []); }
  save(list) { this.store.set('pushSubs', list.slice(-10)); }   // at most 10 devices
  add(sub, label) {
    const s = cleanSub(sub); if (!s) return false;
    this.save(this.subs().filter(x => x.endpoint !== s.endpoint).concat([Object.assign(s, { label: String(label || 'device').slice(0, 40), at: Date.now() })]));
    return true;
  }
  remove(endpoint) { const list = this.subs(), left = list.filter(x => x.endpoint !== endpoint); this.save(left); return left.length < list.length; }
  // Sends {title, body, url, tag} to every device. A device the push service says is gone (404, 410) is dropped. Returns how many took it.
  async notify(msg) {
    const list = this.subs(); if (!list.length) return 0;
    const keys = vapidKeys(this.store), payload = JSON.stringify({ title: String(msg.title || 'Your City').slice(0, 80), body: String(msg.body || '').slice(0, 240), url: /^\/[\w#\/?=&.-]*$/.test(msg.url || '') ? msg.url : '/', tag: String(msg.tag || 'city').slice(0, 64) });
    let ok = 0; const gone = [];
    await Promise.all(list.map(async s => {
      try {
        const r = await this.fetch(s.endpoint, { method: 'POST', body: encrypt(s, payload), signal: AbortSignal.timeout(15000),
          headers: { TTL: '86400', Urgency: 'high', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', Authorization: vapidAuth(s.endpoint, keys, this.subject) } });
        if (r.status === 404 || r.status === 410) gone.push(s.endpoint); else if (r.status >= 200 && r.status < 300) ok++; else this.log.error('push: ' + r.status + ' from ' + new URL(s.endpoint).hostname);
      } catch (e) { this.log.error('push: ' + e.message); }
    }));
    if (gone.length) this.save(this.subs().filter(x => !gone.includes(x.endpoint)));
    return ok;
  }
}
module.exports = { Push, encrypt, vapidAuth, vapidKeys, cleanSub };
