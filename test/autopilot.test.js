// Autopilot: a department earns it (8 of its last 10 approved as written), the owner turns it on with one tap, and then it approves its
// own work through the same Approve the owner presses. Questions, fixes and weak work still wait; 20 a day at most; a new job turns it off.
const test = require('node:test'), assert = require('node:assert');
const { Store } = require('../src/store');
const { AI } = require('../src/ai');
const { Google } = require('../src/google');
const { City, AUTO } = require('../src/city');
const { fakeAnthropic, fakeGoogle } = require('./fakes');

const open = [];
test.after(() => open.forEach(f => f()));
async function setup() {
  const A = await fakeAnthropic(() => ({ text: 'ok' })), G = await fakeGoogle();
  open.push(A.close, G.close);
  const store = await Store.open({ memory: true });
  const city = new City({ store, ai: new AI({ store, env: {}, apiKey: () => 'k', baseURL: A.url }), log: { error() {} },
    google: new Google({ store, clientId: () => 'cid', clientSecret: () => 'sec', api: G.url, tokenUrl: G.url + '/token', userinfoUrl: G.url + '/userinfo' }) });
  city.saveSettings({ business: 'Sam\'s Kitchens', about: 'Kitchen remodels in Austin.' });
  store.set('google', { refresh: 'rt', email: 'owner@example.com' });
  store.set('departments', []);
  const D = city.saveDepartment({ name: 'Ads', does: 'Write 3 short ads for this week.', every: 10080 });
  return { G, store, city, D };
}
const work = (city, D, extra) => city.addCard(Object.assign({ agent: D.id, kind: 'note', title: 'Ads: this week', body: 'Three ads.', actions: ['approve', 'decline'] }, extra || {}));
async function decideMany(city, D, list) { for (const d of list) await city.decide(work(city, D, d === 'fixed' ? { notes: [{ note: 'shorter' }] } : {}).id, d === 'decline' ? 'decline' : 'approve'); }

test('autopilot is earned: 8 of the last 10 approved as written; feedback and declines do not count', async () => {
  const { city, D } = await setup();
  assert.deepStrictEqual([AUTO.of, AUTO.need, AUTO.perDay], [10, 8, 20]);
  await decideMany(city, D, ['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'fixed', 'decline']);
  assert.deepStrictEqual(city.readiness(D.id), { decided: 9, asIs: 7, of: 10, need: 8, ready: false });
  assert.throws(() => city.setAutopilot(D.id, true), /Not yet\. It needs 8 of its last 10 approved as written\. Now: 7 of 9\./);
  await decideMany(city, D, ['ok']);
  assert.strictEqual(city.readiness(D.id).ready, true, '8 of 10 as written');
  assert.strictEqual(city.agents().find(a => a.id === D.id).readiness.ready, true, 'the page sees it');
  assert.strictEqual(city.setAutopilot(D.id, true).auto, true);
  assert.match(city.updates()[0].text, /^Autopilot is on\./);
});

test('on autopilot, work approves itself and an email is really sent; questions, weak work and the 21st of the day still wait', async () => {
  const { G, city, D } = await setup();
  city.saveDepartment({ id: D.id, auto: true });
  const c = work(city, D); await city.piloting;
  assert.deepStrictEqual([city.store.doc('cards', c.id).status, city.store.doc('cards', c.id).auto], ['done', true]);
  assert.match(city.updates()[0].text, /^On autopilot: Ads: this week/);
  const msg = { to: 'dana@example.com', subject: 'Re: kitchen', body: 'Hi Dana' }, d = await city.google.createDraft(msg);
  const e = city.addCard({ agent: D.id, kind: 'email', title: 'Reply to Dana', email: Object.assign({}, msg, d), actions: ['approve', 'decline'] }); await city.piloting;
  assert.deepStrictEqual([city.store.doc('cards', e.id).status, G.sent.length], ['sent', 1], 'sent through the same Approve the owner presses');
  assert.match(city.updates()[0].text, /^On autopilot: Sent your reply to dana@example\.com\./);
  const q = city.addCard({ agent: D.id, kind: 'ask', title: 'Ads asks: which offer?', question: 'which offer?', actions: ['answer'] });
  const weak = work(city, D, { judged: { panel: { avg: 2.1, pass: false } } }); await city.piloting;
  assert.deepStrictEqual([city.store.doc('cards', q.id).status, city.store.doc('cards', weak.id).status], ['waiting', 'waiting'], 'a question and weak work wait for the owner');
  for (let i = city.store.list('cards').filter(x => x.auto).length; i < AUTO.perDay; i++) work(city, D);
  await city.piloting;
  const over = work(city, D); await city.piloting;
  assert.strictEqual(city.store.doc('cards', over.id).status, 'waiting', 'at most 20 a day');
});

test('autopilot turns off with one tap, and by itself when the department is given a new job', async () => {
  const { city, D } = await setup();
  city.saveDepartment({ id: D.id, auto: true });
  assert.strictEqual(city.saveDepartment({ id: D.id, every: 1440 }).auto, true, 'a new schedule keeps it');
  assert.strictEqual(city.saveDepartment({ id: D.id, does: 'Write 5 ads.' }).auto, false, 'a new job has to earn it again');
  city.saveDepartment({ id: D.id, auto: true });
  assert.strictEqual(city.setAutopilot(D.id, false).auto, false);
  const c = work(city, D); await city.piloting;
  assert.strictEqual(city.store.doc('cards', c.id).status, 'waiting');
});
