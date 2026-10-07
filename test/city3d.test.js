// The 3D city: the page carries the owner's departments (never a secret), three.js is served from the app, and the live parts refresh.
const test = require('node:test'), assert = require('node:assert');
const { Store } = require('../src/store');
const { AI } = require('../src/ai');
const { Google } = require('../src/google');
const { City, PICKS } = require('../src/city');
const { createServer } = require('../src/server');
const { listen } = require('./fakes');

test('the 3D city page, its data and three.js', async () => {
  const store = await Store.open({ memory: true });
  const city = new City({ store, ai: new AI({ store, env: {}, apiKey: () => 'secret-ai-key' }), google: new Google({ store, clientId: () => '', clientSecret: () => '' }), log: { error() {} } });
  city.saveSettings({ business: 'Sam\'s Kitchens </script><b>' });
  store.set('departments', []);
  const L = city.saveDepartment(Object.assign({}, PICKS.find(p => p.kind === 'leads'))), O = city.saveDepartment({ name: 'Open House', does: 'Write the invite.' });
  city.addCard({ agent: L.id, kind: 'lead', title: 'Reply to Dana', actions: ['approve', 'decline'] });
  city.ask(city.department(O.id), 'What is the address?');
  city.update(O.id, 'Wrote the invite.');
  const srv = createServer({ city, password: () => 'pw', publicUrl: () => '', log: { error() {} } }), base = await listen(srv);
  try {
    assert.strictEqual((await fetch(base + '/city3d')).status, 200);
    assert(/Enter your city password/.test(await (await fetch(base + '/city3d')).text()), 'signed out: the sign-in page, not the city');
    const three = await fetch(base + '/vendor/three.min.js');
    assert.deepStrictEqual([three.status, /javascript/.test(three.headers.get('content-type')), /immutable/.test(three.headers.get('cache-control'))], [200, true, true]);
    const H = { cookie: (await fetch(base + '/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'pw' }) })).headers.get('set-cookie').split(';')[0] };
    const html = await (await fetch(base + '/city3d', { headers: H })).text();
    const data = JSON.parse(/window\.CITY_DATA=(.*?)<\/script>/.exec(html)[1]);
    assert.deepStrictEqual(data.departments.map(d => [d.name, d.kind, d.need, d.ask]), [['Leads', 'leads', 1, ''], ['Open House', 'own', 1, 'What is the address?']]);
    assert(data.departments[1].lines.includes('Wrote the invite.') && data.departments[1].lines.includes('Asked you: What is the address?'), 'what it did lately, for its people to say');
    assert(!/<\/script><b>/.test(html.slice(html.indexOf('CITY_DATA'), html.indexOf('CITY_DATA') + 2000)), 'the business name cannot break out of the script');
    assert(!/secret-ai-key|cookieSecret/.test(html), 'no secrets in the page');
    assert(/\/vendor\/three\.min\.js/.test(html) && !/cdnjs/.test(html), 'three.js from the app itself');
    const live = await (await fetch(base + '/api/city3d', { headers: H })).json();
    assert.deepStrictEqual([live.business, live.departments.length, typeof live.hall.need], ['Sam\'s Kitchens </script><b>', 2, 'number']);
  } finally { srv.close(); }
});
