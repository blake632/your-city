// Jev, the fast judge: the real Jev when there is a key, the owner's own AI otherwise, and each check the original city runs.
const test = require('node:test'), assert = require('node:assert'), http = require('node:http');
const { Store } = require('../src/store');
const { AI } = require('../src/ai');
const { Google } = require('../src/google');
const { City, PICKS } = require('../src/city');
const { Jev } = require('../src/jev');
const guide = require('../src/guide');
const { fakeAnthropic, fakeGoogle, listen, draftText } = require('./fakes');

const open = [];
test.after(() => open.forEach(f => f()));
// A stand-in for the Jev endpoint, shaped the way the original city calls it: { model, state, questions } -> { answers }.
async function fakeJev(answer, { key = 'gw-good' } = {}) {
  const calls = [];
  const srv = http.createServer((req, res) => { let raw = ''; req.on('data', d => raw += d); req.on('end', () => {
    const b = JSON.parse(raw || '{}'); calls.push({ auth: req.headers.authorization, body: b });
    const send = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.headers.authorization !== 'Bearer ' + key) return send(401, { error: 'Invalid API key' });
    const answers = {}; Object.keys(b.questions).forEach(k => { const a = answer(k, b.questions[k], b.state); if (a) answers[k] = a; });
    send(200, { model: 'typesafe-ai/jev', answers });
  }); });
  const url = await listen(srv); let shut = false;
  const close = () => { if (!shut) { shut = true; srv.close(); srv.closeAllConnections(); } }; open.push(close);
  return { url, calls, close };
}
async function setup({ ai, jevAnswer, jevKey, messages = [] }) {
  const A = await fakeAnthropic(ai), G = await fakeGoogle({ messages }); open.push(A.close, G.close);
  const J = jevAnswer ? await fakeJev(jevAnswer) : null;
  const store = await Store.open({ memory: true }), aiObj = new AI({ store, env: {}, apiKey: () => 'k', baseURL: A.url });
  const jev = new Jev({ ai: aiObj, store, env: {}, url: J ? J.url : 'http://127.0.0.1:9' });
  const city = new City({ store, ai: aiObj, jev, log: { error() {} }, google: new Google({ store, clientId: () => 'c', clientSecret: () => 's', api: G.url, tokenUrl: G.url + '/token', userinfoUrl: G.url + '/userinfo' }) });
  city.saveSettings({ business: 'Sam\'s Kitchens', about: 'Kitchen remodels in Austin.' });
  store.set('google', { refresh: 'rt', email: 'owner@example.com' }); store.set('departments', []);
  if (jevKey) jev.save({ key: jevKey });
  return { A, G, J, store, city, jev };
}
const schemaOf = b => b.output_config && b.output_config.format ? b.output_config.format.schema.properties : {};

test('with a key, the real Jev answers: one request with the model, the text and the questions; it is metered; a wrong key falls back to your AI and the Guide shows the fix', async () => {
  const t = await setup({ ai: () => ({ text: { ok: { noul: 0.2 } } }), jevAnswer: (k, q) => q.type === 'noul' ? { noul: 0.9 } : { choice: Object.keys(q.criteria)[0], confidence: 0.8 }, jevKey: 'gw-good' });
  assert.strictEqual(t.jev.mode(), 'jev');
  const a = await t.jev.ask('Some text', { ok: { type: 'noul', instructions: 'Is it fine?' }, pick: { type: 'choice', instructions: 'Which?', criteria: { x: 'X', y: 'Y' } } });
  assert.deepStrictEqual(a, { ok: { noul: 0.9 }, pick: { choice: 'x', confidence: 0.8 } });
  const c = t.J.calls[0];
  assert.deepStrictEqual([c.auth, c.body.model, c.body.state, Object.keys(c.body.questions)], ['Bearer gw-good', 'typesafe-ai/jev', 'Some text', ['ok', 'pick']]);
  assert(t.city.ai.spentToday() > 0 && t.city.ai.spentToday() < 0.0001, 'metered at Jev\'s tiny price');
  t.jev.save({ key: 'gw-wrong' });
  const b = await t.jev.ask('Some text', { ok: { type: 'noul', instructions: 'Is it fine?' } });
  assert.deepStrictEqual(b, { ok: { noul: 0.2 } }, 'your own AI answered instead');
  assert.strictEqual(t.jev.problem().code, 'jev_key_wrong');
  const check = guide.checks(t.city, { redirect: 'x' }).find(x => x.id === 'jev');
  assert.deepStrictEqual([check.ok, check.fix.title], [false, 'Jev did not accept your key']);
  t.jev.save({ key: 'gw-good' }); await t.jev.ask('x', { ok: { type: 'noul', instructions: 'ok?' } });
  assert.strictEqual(t.jev.problem(), null, 'working again: the problem clears');
});

test('without a key, your own AI plays Jev: the same questions, the same answers', async () => {
  const t = await setup({ ai: b => { const p = schemaOf(b); return { text: { fine: { noul: 0.7 }, size: { choice: p.size.properties.choice.enum[1], confidence: 0.9 } } }; } });
  assert.strictEqual(t.jev.mode(), 'ai');
  const a = await t.jev.ask('Text', { fine: { type: 'noul', instructions: 'Fine?' }, size: { type: 'choice', instructions: 'Size?', criteria: { small: 'S', big: 'B' } } });
  assert.deepStrictEqual(a, { fine: { noul: 0.7 }, size: { choice: 'big', confidence: 0.9 } });
  assert(/You are Jev/.test(t.A.calls[0].body.system));
});

test('Jev sorts each lead first (a sure vendor gets a card, never a draft), audits the quiet lane, picks how hard to think, and checks the work is finished', async () => {
  const VENDOR = { id: 'v1', from: 'Ace SEO <sales@aceseo.com>', subject: 'Grow your rankings', text: 'We can get you to page one. Reply for pricing, sales@aceseo.com' };
  const FRIEND = { id: 'f1', from: 'Pat Lee <pat@example.com>', subject: 'Big news', text: 'Can you call me back about the cabinets?', threadId: 'tf' };
  const t = await setup({ messages: [VENDOR, FRIEND], jevKey: 'gw-good',
    jevAnswer: (k, q, state) => k === 'kind' ? { choice: 'vendor', confidence: 0.92 } : k === 'real' ? { noul: /cabinets/.test(state) ? 0.85 : 0.1 } : k === 'effort' ? { choice: 'high', confidence: 0.8 }
      : k === 'done' ? { noul: /WORK:\nTry 2/.test(state) ? 0.95 : 0.2 } : k === 'verdict' ? { choice: 'ship', confidence: 0.7 } : null,
    ai: b => { const p = schemaOf(b), prompt = b.messages[0].content;
      if (p.kind) return { text: /aceseo/.test(prompt) ? { kind: 'lead', summary: 'SEO', lead: { name: 'Ace SEO', email: 'sales@aceseo.com', phone: '', wants: 'Sell SEO' } } : { kind: 'newsletter', summary: 'News', lead: { name: '', email: '', phone: '', wants: '' } } };
      return { text: /checker found your last try unfinished/.test(prompt) ? 'Try 2' : /Pat/.test(prompt) ? 'Hi Pat,\n\nI will call you this afternoon.\n\nSam' : 'Try 1' }; } });
  const L = t.city.saveDepartment(Object.assign({}, PICKS.find(p => p.kind === 'leads'), { judge: false })), M = t.city.saveDepartment(Object.assign({}, PICKS.find(p => p.kind === 'mailroom')));
  await t.city.runAgent(L.id);
  const vendor = t.city.waiting().find(c => c.agent === L.id);
  assert.deepStrictEqual([vendor.title, vendor.actions, vendor.jev.kind, !!vendor.email], ['Not a customer: Ace SEO, someone selling to you', ['got_it'], 'vendor', false]);
  assert.strictEqual(Object.keys(t.G.drafts).filter(id => /aceseo/.test(t.G.drafts[id].raw)).length, 0, 'no draft for a vendor');
  assert(!/sales@aceseo\.com/.test(t.J.calls.find(c => c.body.questions.kind).body.state), 'the email address never goes to Jev');
  const pulled = t.city.waiting().find(c => c.agent === M.id);
  assert.deepStrictEqual([pulled.email.to, pulled.jev.pulled], ['pat@example.com', true], 'the sorter called it a newsletter; Jev pulled it back');
  assert(/I will call you/.test(draftText(t.G.drafts[pulled.email.draftId].raw).body));
  // your own department: Jev picks the effort, finds the first try unfinished, and the second try is kept
  const D = t.city.saveDepartment({ name: 'Ideas', does: 'Plan a referral program for past customers.', judge: false });
  await t.city.runAgent(D.id);
  const card = t.city.waiting().find(c => c.agent === D.id);
  assert.deepStrictEqual([card.body, card.jev.effort, card.jev.done, card.jev.verdict, card.jev.redone, card.jev.mode], ['Try 2', 'high', 0.95, 'ship', true, 'jev']);
  const writes = t.A.calls.filter(c => !c.body.output_config || !c.body.output_config.format);
  assert(writes.slice(-2).every(c => c.body.output_config.effort === 'high'), 'the department thought as hard as Jev said');
});

test('with a key, the Crowd is the real Jev crowd: 96 seats and a typical person in one pass', async () => {
  const people = ['Ana', 'Ben', 'Cy', 'Di', 'Ed', 'Flo', 'Gus', 'Hal'];
  const t = await setup({ jevKey: 'gw-good', jevAnswer: (k, q) => k === 'base' ? { noul: 0.6 } : /^c\d+$/.test(k) ? { noul: Number(k.slice(1)) % 3 ? 0.8 : 0.3 } : q.type === 'choice' ? { choice: 'medium', confidence: 0.9 } : { noul: 0.9 },
    ai: b => { const p = schemaOf(b);
      if (p.question && p.people) return { text: { question: 'Would you come?', people: people.map(n => ({ name: n, who: n + ' nearby' })) } };
      if (p.reactions) return { text: { reactions: people.map(n => ({ name: n, said: 'Good.', score: 4 })) } };
      return { text: 'Open house Saturday.' }; } });
  const D = t.city.saveDepartment({ name: 'Open house', does: 'Invite people to the open house.', judge: true });
  await t.city.runAgent(D.id);
  const J = t.city.waiting()[0].judged, crowdCall = t.J.calls.find(c => c.body.questions.base);
  assert.deepStrictEqual([Object.keys(crowdCall.body.questions).length, J.crowd.n, J.crowd.yes, J.crowd.typical, J.crowd.by], [97, 96, 64, true, 'jev']);
  assert(/You are this person: Ana, Ana nearby; right now: skimming fast on a phone/.test(crowdCall.body.questions.c0.instructions));
  assert(!t.A.calls.some(c => schemaOf(c.body).typical), 'your AI did not have to play the crowd');
});

test('Settings, Jev: save and test; a wrong key is not kept, a blank one keeps the saved key, off removes it, and the key never reaches the page', async () => {
  const { createServer } = require('../src/server');
  const t = await setup({ ai: () => ({ text: 'x' }), jevAnswer: () => ({ noul: 0.9 }) });
  const srv = createServer({ city: t.city, password: () => 'pw', publicUrl: () => '', log: { error() {} } }), base = await listen(srv); open.push(() => srv.close());
  const H = { cookie: (await fetch(base + '/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'pw' }) })).headers.get('set-cookie').split(';')[0] };
  const post = b => fetch(base + '/api/jev', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, H), body: JSON.stringify(b) }).then(r => r.json());
  assert.deepStrictEqual(await post({ key: 'gw-good' }), { ok: true, mode: 'jev' });
  const bad = await post({ key: 'gw-wrong' });
  assert.deepStrictEqual([bad.ok, bad.fix.title, t.jev.key()], [false, 'Jev did not accept your key', 'gw-good'], 'the working key stays');
  assert.deepStrictEqual(await post({ key: '' }), { ok: true, mode: 'jev' }, 'blank: keeps the saved key and tests it');
  const st = await (await fetch(base + '/api/state', { headers: H })).json();
  assert.deepStrictEqual(st.jev, { mode: 'jev', keySet: true, keyFrom: 'settings', problem: null });
  assert(!/gw-good/.test(JSON.stringify(st)), 'the key never goes to the page');
  assert.deepStrictEqual(await post({ off: true }), { ok: true, mode: 'ai' });
});
