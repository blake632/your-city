// The first five minutes and the proof: a test lead, your week in numbers, leads from your website, and your details from your site.
const test = require('node:test'), assert = require('node:assert'), http = require('node:http');
const { Store } = require('../src/store');
const { AI } = require('../src/ai');
const { Google } = require('../src/google');
const { City, PICKS } = require('../src/city');
const { createServer } = require('../src/server');
const { fakeAnthropic, fakeGoogle, listen } = require('./fakes');

const answer = b => {
  const fmt = b.output_config && b.output_config.format, prompt = b.messages[0].content;
  if (fmt && fmt.schema.properties.message) return { text: { name: 'Jordan Reyes', wants: 'A kitchen remodel', message: 'Hi, we want to redo our kitchen this spring. Can you help?' } };
  if (fmt && fmt.schema.properties.about) return { text: { business: 'Sam\'s Kitchens', about: /Kitchens built in Austin since 2004/.test(prompt) && !/stealMe/.test(prompt) ? 'Kitchen remodels in Austin since 2004.' : 'WRONG', voice: 'Warm and plain.' } };
  if (fmt && fmt.schema.properties.kind) return { text: { kind: 'customer', confidence: 0.9 } };   // a Jev question answered by the AI: a customer
  if (/short text message/.test(prompt)) return { text: 'Hi Lee, thanks for asking about a kitchen. When would you like to start? Sam' };
  return { text: 'Hi,\n\nThanks for reaching out. When would you like to start?\n\nSam' };
};
const open = [];
test.after(() => open.forEach(f => f()));
async function setup() {
  const A = await fakeAnthropic(answer), G = await fakeGoogle();
  open.push(A.close, G.close);
  const store = await Store.open({ memory: true }), pushed = [];
  let now = Date.parse('2026-10-05T15:00:00Z');
  const city = new City({ store, ai: new AI({ store, env: {}, apiKey: () => 'test-key', baseURL: A.url }), log: { error() {} }, now: () => now,
    google: new Google({ store, clientId: () => 'cid', clientSecret: () => 'sec', api: G.url, tokenUrl: G.url + '/token', userinfoUrl: G.url + '/userinfo' }),
    push: { notify: async m => { pushed.push(m); return 1; } } });
  city.saveSettings({ business: 'Sam\'s Kitchens', owner: 'Sam', about: 'Kitchen remodels in Austin.', signature: 'Sam', booking: 'https://cal.example.com/sam' });
  store.set('departments', []);
  const L = city.saveDepartment(Object.assign({}, PICKS.find(p => p.kind === 'leads'), { judge: false }));
  return { A, G, store, city, pushed, L, tick: ms => { now += ms; } };
}

test('Try a test lead: a ready reply with no Gmail, nothing sent, and it never counts in results or autopilot', async () => {
  const t = await setup();
  const r = await t.city.testLead();
  assert.strictEqual(r.department, t.L.id);
  const c = t.city.waiting()[0];
  assert.deepStrictEqual([c.test, c.kind, c.lead.name, c.email.to, !!c.email.draftId], [true, 'lead', 'Jordan Reyes', 'jordan.reyes@example.com', false]);
  assert(/cal\.example\.com\/sam/.test(t.A.calls.find(x => /THE CUSTOMER/.test(x.body.messages[0].content)).body.system), 'the booking link is offered');
  const d = await t.city.decide(c.id, 'approve');
  assert(/nothing was sent/.test(d.said));
  assert.strictEqual(t.G.sent.length, 0);
  assert.strictEqual(t.city.results().leads, 0, 'a test is not a result');
  assert.strictEqual(t.city.readiness(t.L.id).decided, 0, 'a test does not train autopilot');
});

test('your week: leads answered, how fast, time back, and a Monday line on your phone', async () => {
  const t = await setup();
  t.store.set('google', { refresh: 'rt', email: 'owner@example.com' });
  const card = t.city.addCard({ agent: t.L.id, kind: 'lead', title: 'Reply to Dana', lead: { name: 'Dana', email: 'dana@example.com', at: t.city.now() }, email: { to: 'dana@example.com', subject: 'Hi', body: 'x', draftId: 'd1' }, actions: ['approve', 'decline'] });
  t.G.drafts.d1 = { raw: '' };
  t.tick(12 * 6e4);
  await t.city.decide(card.id, 'approve');
  const R = t.city.results();
  assert.deepStrictEqual([R.leads, R.replyMin, R.minutes], [1, 12, 10]);
  assert(/answered 1 lead \(typical reply in 12 min\)/.test(City.said(R)));
  assert.strictEqual(t.city.weekly(), 'Sent the week.');
  await new Promise(r => setImmediate(r));
  assert(/^Last week your city answered 1 lead/.test(t.city.updates()[0].text));
  assert.strictEqual(t.pushed.filter(p => p.tag === 'week').length, 1);
  assert(t.city.jobs().some(j => j.key === 'week' && j.every === 10080), 'it runs once a week by itself');
});

test('your lead link: a web form lead gets a ready reply; a wrong link, no contact or too many are refused', async () => {
  const t = await setup();
  const srv = createServer({ city: t.city, password: () => 'pw12345678', publicUrl: () => '', log: { error() {} } }), base = await listen(srv);
  open.push(() => srv.close());
  const form = (path, f) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(f).toString(), redirect: 'manual' });
  assert.strictEqual((await form('/hook/lead/wrong', { email: 'a@b.co' })).status, 404);
  const link = '/hook/lead/' + t.city.hookSecret();
  assert.strictEqual((await form(link, { name: 'Nobody' })).status, 400, 'an email or a phone is needed');
  // no Gmail: the reply is written and waits for you to send it yourself
  const r = await form(link, { first_name: 'Lee', last_name: 'Park', phone: '512 555 0111', message: 'Kitchen quote please', redirect: 'https://samskitchens.com/thanks' });
  assert.deepStrictEqual([r.status, r.headers.get('location')], [303, 'https://samskitchens.com/thanks']);
  await t.city.webbing;
  const c = t.city.waiting()[0];
  assert.deepStrictEqual([c.lead.name, c.lead.phone, c.actions[0]], ['Lee Park', '512 555 0111', 'got_it']);
  assert(/short text message/.test(t.A.calls.at(-1).body.messages[0].content) && /Hi Lee/.test(c.body), 'a phone-only lead gets a text to send');
  // with Gmail: a Gmail draft that Send sends
  t.store.set('google', { refresh: 'rt', email: 'owner@example.com' });
  const j = await fetch(base + link, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Dana Ruiz', email: 'Dana@Example.com', message: 'Remodel?' }) });
  assert.strictEqual(j.status, 200);
  await t.city.webbing;
  const g = t.city.waiting().find(x => x.lead.email === 'dana@example.com');
  assert(g.email.draftId && g.actions.includes('approve') && t.G.sent.length === 0);
  // the same person again is skipped
  await fetch(base + link, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'dana@example.com' }) });
  await t.city.webbing;
  assert(/Skipped a repeat/.test(t.city.updates()[0].text));
  for (let i = 0; i < 30; i++) t.store.set('hookHits', (t.store.get('hookHits', [])).concat([t.city.now()]));
  assert.strictEqual((await form(link, { email: 'z@z.co' })).status, 400, 'at most 30 an hour');
  srv.close();
});

test('fill in my details from my website: the page text only, never its scripts', async () => {
  const t = await setup();
  const site = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html><script>var stealMe=1</script><h1>Sam&#39;s Kitchens</h1><p>Kitchens built in Austin since 2004. Call 512 555 0199 for a visit any weekday.</p></html>'); });
  const url = await listen(site); open.push(() => site.close());
  const f = await t.city.readSite(url);
  assert.deepStrictEqual(f, { business: 'Sam\'s Kitchens', about: 'Kitchen remodels in Austin since 2004.', voice: 'Warm and plain.' });
  await assert.rejects(t.city.readSite('http://127.0.0.1:1'), /Could not open/);
  site.close();
});

test('A wish is kept, sent to the person who looks after the city, and kept even when the send fails', async () => {
  const store = await Store.open({ memory: true }), sent = [];
  const city = new City({ store, ai: new AI({ store, env: {} }), google: new Google({ store }), log: { error() {} }, wishTo: () => 'https://ntfy.example/topic',
    post: async (u, o) => { sent.push([u, o.body, o.headers.title]); if (o.body === 'fail') throw new Error('down'); return { ok: true }; } });
  city.saveSettings({ owner: 'Ray' });
  await assert.rejects(city.wish('  '), /Say what you wish/);
  assert.match((await city.wish('Post to LinkedIn for me')).said, /sent/);
  await city.wish('fail');
  assert.deepStrictEqual(sent.map(s => s[1]), ['Post to LinkedIn for me', 'fail']);
  assert.strictEqual(sent[0][2], 'Wish from Ray');
  assert.deepStrictEqual(store.list('wishes').map(w => [w.text, w.sent]), [['Post to LinkedIn for me', true], ['fail', false]]);
});
