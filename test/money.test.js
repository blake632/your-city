// The money report: the leads you answered, the ones you marked won (and what they were worth, if you typed it), in the weekly line.
const test = require('node:test'), assert = require('node:assert');
const { Store } = require('../src/store');
const { AI } = require('../src/ai');
const { Google } = require('../src/google');
const { City } = require('../src/city');

test('Won the job: only a lead you answered; the week counts jobs and dollars; nothing is guessed', async () => {
  const store = await Store.open({ memory: true }), city = new City({ store, ai: new AI({ store, env: {} }), google: new Google({ store }), log: { error() {} } });
  const sent = store.put('cards', 'a', { id: 'a', kind: 'lead', status: 'sent', decidedAt: city.now(), ts: city.now(), lead: { name: 'Dana Ruiz', wants: 'A kitchen', at: city.now() - 6 * 6e4 } });
  store.put('cards', 'b', { id: 'b', kind: 'lead', status: 'waiting', ts: city.now(), lead: { name: 'Lee' } });
  store.put('cards', 't', { id: 't', kind: 'lead', status: 'sent', test: true, decidedAt: city.now(), ts: city.now(), lead: { name: 'Test' } });
  assert.deepStrictEqual(city.recentLeads().map(l => l.name), ['Dana Ruiz'], 'answered, real leads only');
  assert.throws(() => city.markWon('b', 100), /Only a lead you answered/);
  assert.strictEqual(city.markWon('a', '$18,500').amount, 18500);
  const r = city.results(7);
  assert.deepStrictEqual([r.won, r.wonValue, r.leads, r.replyMin], [1, 18500, 1, 6]);
  assert.match(City.said(r), /^My AI office won 1 job, answered 1 lead \(typical reply in 6 min\)/);
  assert(!/18,?500/.test(City.said(r)), 'the shared line never shows your dollars');
  assert.match(city.updates()[0].text, /^Won the job: Dana Ruiz \(\$18,500\)\.$/);
  assert.strictEqual(city.markWon('a', ''), city.store.doc('cards', 'a').won); assert.strictEqual(city.store.doc('cards', 'a').won.amount, null, 'blank worth is fine');
  city.markWon('a', null); assert.strictEqual(city.results(7).won, 0, 'undo');
  void sent;
});
