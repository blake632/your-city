const test = require('node:test'), assert = require('node:assert');
const { Store } = require('../src/store');
const { AI } = require('../src/ai');
const { Google } = require('../src/google');
const { City } = require('../src/city');
const { createServer } = require('../src/server');
const { fakeAnthropic, fakeGoogle, listen } = require('./fakes');

test('sign-in, the home screen\'s data (never a secret), deciding, settings and the Connect Google flow', async () => {
  const A = await fakeAnthropic(() => ({ text: 'Hi' })), G = await fakeGoogle();
  const store = await Store.open({ memory: true }); let pw = '';
  const google = new Google({ store, clientId: () => 'cid', clientSecret: () => 'sec', api: G.url, tokenUrl: G.url + '/token', userinfoUrl: G.url + '/userinfo' });
  const city = new City({ store, ai: new AI({ store, env: {}, apiKey: () => 'secret-ai-key', baseURL: A.url }), google, log: { error() {} } });
  const srv = createServer({ city, password: () => pw, publicUrl: () => '', log: { error() {} } }), base = await listen(srv);
  try {
    // no password yet: the first visit chooses one (here the CITY_PASSWORD variable is set right after, and wins)
    const first = await (await fetch(base + '/')).text();
    assert(/Choose the password that opens it/.test(first) && !/secret-ai-key/.test(first));
    pw = 'open sesame';
    const post = (p, b, h) => fetch(base + p, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, h || {}), body: JSON.stringify(b || {}), redirect: 'manual' });
    assert(/Enter your city password/.test(await (await fetch(base + '/')).text()), 'the sign-in page');
    assert.strictEqual((await fetch(base + '/api/state')).status, 401);
    assert.strictEqual((await post('/login', { password: 'nope' })).status, 401);
    const ok = await post('/login', { password: 'open sesame' }), H = { cookie: ok.headers.get('set-cookie').split(';')[0] };
    assert.strictEqual(ok.status, 200);
    assert(!/Secure/.test(ok.headers.get('set-cookie')) && /HttpOnly/.test(ok.headers.get('set-cookie')), 'http on your own computer: no Secure flag');
    // the files a phone fetches without signing in
    for (const [p, type] of [['/sw.js', 'text/javascript'], ['/manifest.webmanifest', 'application/manifest+json'], ['/icon.svg', 'image/svg+xml'], ['/icon-512.png', 'image/png'], ['/apple-touch-icon.png', 'image/png']]) {
      const r = await fetch(base + p); assert.deepStrictEqual([r.status, r.headers.get('content-type')], [200, type], p);
    }
    assert(/Departments/.test(await (await fetch(base + '/', { headers: H })).text()), 'the home screen');
    // settings and state: the state never carries a key, the Google pass or the cookie secret
    assert.strictEqual((await post('/api/settings', { business: 'Sam\'s Kitchens', dailyCap: 7, junk: 'x' }, H)).status, 200);
    store.set('google', { refresh: 'super-secret-refresh', email: 'owner@example.com' });
    const st = await (await fetch(base + '/api/state', { headers: H })).json();
    assert.deepStrictEqual([st.settings.business, st.settings.dailyCap, st.settings.junk, st.google.connected, st.google.email], ['Sam\'s Kitchens', 7, undefined, true, 'owner@example.com']);
    assert.strictEqual(st.redirect, base + '/connect/google/callback', 'the exact redirect address for Google');
    const raw = JSON.stringify(st);
    assert(!/super-secret-refresh|secret-ai-key|cookieSecret|open sesame/.test(raw), 'no secrets in what the page gets');
    // a card decided over the API, never twice
    const card = city.addCard({ agent: 'social', kind: 'post', title: 'A post', body: 'Text', actions: ['approve', 'decline'] });
    assert.strictEqual((await (await post('/api/decide', { id: card.id, decision: 'approve' }, H)).json()).status, 'approved');
    const again = await post('/api/decide', { id: card.id, decision: 'approve' }, H);
    assert.deepStrictEqual([again.status, (await again.json()).error], [400, 'You already decided this one.']);
    // your own agent over the API
    const add = await (await post('/api/custom', { name: 'Ideas', instructions: 'Three ideas a week', every: 10080 }, H)).json();
    assert(add.ok && /^c-/.test(add.agent.id));
    assert.strictEqual((await post('/api/custom', { name: 'x', instructions: '' }, H)).status, 400);
    // Connect Google: off to Google with the client id, the exact redirect and a one-time state; back with a code; connected
    store.del('google');
    const go = await fetch(base + '/connect/google', { headers: H, redirect: 'manual' }), to = new URL(go.headers.get('location'));
    assert.deepStrictEqual([go.status, to.origin, to.searchParams.get('client_id'), to.searchParams.get('redirect_uri'), to.searchParams.get('access_type')], [302, 'https://accounts.google.com', 'cid', base + '/connect/google/callback', 'offline']);
    assert(/gmail\.modify/.test(to.searchParams.get('scope')));
    const back = await fetch(base + '/connect/google/callback?code=abc&state=' + to.searchParams.get('state'), { headers: H, redirect: 'manual' });
    assert(/Gmail is connected \(owner@example.com\)/.test(decodeURIComponent(back.headers.get('location'))));
    assert.deepStrictEqual([google.connected(), google.email(), store.get('google').refresh], [true, 'owner@example.com', 'rt1']);
    const replay = await fetch(base + '/connect/google/callback?code=abc&state=' + to.searchParams.get('state'), { headers: H, redirect: 'manual' });
    assert(/took too long/.test(decodeURIComponent(replay.headers.get('location'))), 'a state works once');
    // five wrong passwords and more: slowed down
    for (let i = 0; i < 10; i++) await post('/login', { password: 'wrong' + i });
    assert.strictEqual((await post('/login', { password: 'open sesame' })).status, 429);
  } finally { srv.close(); A.close(); G.close(); }
});
