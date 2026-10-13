// Drafts that learn from you: what you change before you send, and your Needs feedback notes, become short rules; a rule seen twice
// asks you once; only your yes puts it in the department's writing.
const test = require('node:test'), assert = require('node:assert');
const { Store } = require('../src/store');
const { AI } = require('../src/ai');
const { Google } = require('../src/google');
const { City } = require('../src/city');
const { changed } = require('../src/learn');
const { fakeAnthropic } = require('./fakes');

const open = [];
test.after(() => open.forEach(f => f()));
async function setup(answers) {
  const asked = [], A = await fakeAnthropic(b => { const f = b.output_config && b.output_config.format; if (f && f.schema.properties.rule) { asked.push(b.messages[0].content); return { text: answers.shift() || { rule: '', same: 0 } }; } return { text: 'ok' }; });
  open.push(A.close);
  const store = await Store.open({ memory: true });
  const city = new City({ store, ai: new AI({ store, env: {}, apiKey: () => 'k', baseURL: A.url }), google: new Google({ store }), log: { error() {} } });
  city.saveSettings({ business: 'Sam\'s Kitchens', about: 'Kitchen remodels in Austin.' }); store.set('departments', []);
  const D = city.saveDepartment({ kind: 'leads', name: 'Leads', does: 'Answer new customers.', every: 10 });
  return { city, store, D, asked };
}
const DRAFT = 'Hi Dana,\n\nThank you so much for reaching out to us about your kitchen. We would absolutely love to help you with this exciting project. When are you hoping to start?\n\nSam';
const SENT = 'Hi Dana,\n\nThanks for reaching out. When do you want to start?\n\nSam';

test('how much of a draft you changed', () => {
  assert.strictEqual(changed(DRAFT, DRAFT), 0);
  assert(changed(DRAFT, DRAFT.replace('Dana', 'Dan')) < 0.08, 'a name fix is not a habit');
  assert(changed(DRAFT, SENT) > 0.4);
});

test('an edit before sending teaches; the same habit twice asks once; your yes puts it in the writing', async () => {
  const { city, store, D, asked } = await setup([{ rule: 'Keep replies to two short sentences.', same: 0 }, { rule: '', same: 1 }]);
  let n = 0; city.google.sendDraft = async () => ({ id: 'd' + (++n), text: SENT });
  const card = () => city.addCard({ agent: D.id, kind: 'lead', title: 'Reply to Dana', lead: { email: 'dana@example.com' }, email: { to: 'dana@example.com', draftId: 'd', body: DRAFT }, actions: ['approve', 'decline'] });
  await city.decide(card().id, 'approve'); await city.learning;
  assert.strictEqual(asked.length, 1); assert(/WHAT THE OWNER ACTUALLY SENT:\nHi Dana,\n\nThanks for reaching out/.test(asked[0]));
  assert.strictEqual(city.learn.rulesFor(D.id), '', 'not used until you say yes');
  await city.decide(card().id, 'approve'); await city.learning;
  const ask = city.waiting().find(c => c.kind === 'rule');
  assert(ask && /You keep changing Leads the same way\. Make it a rule\?/.test(ask.title) && ask.rule === 'Keep replies to two short sentences.', JSON.stringify(ask));
  await city.decide(ask.id, 'approve');
  assert(/HOW THE OWNER LIKES THIS WORK[\s\S]*- Keep replies to two short sentences\./.test(city.learn.rulesFor(D.id)));
  assert.deepStrictEqual(city.learn.week(), { sent: 2, asWritten: 0, changed: city.learn.week().changed });
  // sent as written: nothing to learn, no AI call
  city.google.sendDraft = async () => ({ id: 'x', text: DRAFT });
  await city.decide(card().id, 'approve'); await city.learning;
  assert.strictEqual(asked.length, 2, 'no call for an unchanged send');
  assert.strictEqual(city.readiness(D.id).decided, 3, 'a rule card never counts toward autopilot');
});

test('your Needs feedback note teaches too; your no is final', async () => {
  const { city, D } = await setup([{ rule: 'Never use exclamation points.', same: 0 }, { rule: '', same: 1 }]);
  const c1 = city.addCard({ agent: D.id, kind: 'note', title: 'Ads', body: 'Big sale!', actions: ['approve', 'decline'] });
  await city.feedback(c1.id, 'no exclamation points please'); await city.learning;
  const c2 = city.addCard({ agent: D.id, kind: 'note', title: 'Ads 2', body: 'Come by!', actions: ['approve', 'decline'] });
  await city.feedback(c2.id, 'take out the exclamation point'); await city.learning;
  const ask = city.waiting().find(c => c.kind === 'rule');
  assert(ask && ask.rule === 'Never use exclamation points.');
  const r = await city.decide(ask.id, 'decline');
  assert(/will not ask about that again/.test(r.said));
  assert.strictEqual(city.learn.rulesFor(D.id), '');
  assert.strictEqual(city.learn.all()[D.id][0].ok, -1);
});
