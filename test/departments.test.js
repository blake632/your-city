// Departments the owner names and describes, the Panel and the Crowd that judge their work, and older cities keeping what they used.
const test = require('node:test'), assert = require('node:assert');
const { Store } = require('../src/store');
const { AI } = require('../src/ai');
const { Google } = require('../src/google');
const { City, PICKS } = require('../src/city');
const { MOODS } = require('../src/judge');
const { fakeAnthropic } = require('./fakes');

const open = [];
test.after(() => open.forEach(f => f()));
const NAMES = ['Ana', 'Ben', 'Cy', 'Di', 'Ed', 'Flo', 'Gus', 'Hal'];
// The fake AI plays the judges: the first draft scores low, the rewrite scores high; 70 of the 96 crowd seats say yes.
function judges({ firstLow = true, failPeople = false } = {}) {
  return b => {
    const f = b.output_config && b.output_config.format, props = f ? f.schema.properties : {}, prompt = b.messages[0].content;
    if (props.question && props.people) return failPeople ? { status: 500, error: 'down' } : { text: { question: 'Would you book a visit?', people: NAMES.map(n => ({ name: n, who: n + ', a homeowner nearby' })) } };
    if (props.reactions) { const low = firstLow && !/BETTER/.test(prompt); return { text: { reactions: NAMES.map((n, i) => ({ name: n, said: low ? 'Too vague.' : 'Clear and warm.', score: low ? 2 : (i < 6 ? 5 : 3) })) } }; }
    if (props.typical) { let k = 0; return { text: { typical: true, people: NAMES.map(n => ({ name: n, yes: MOODS.map(() => (k++ % 96) < 70) })) } }; }
    if (/WHAT TO CHANGE/.test(prompt)) return { text: 'BETTER: Come see a finished kitchen this Saturday.' };
    return { text: 'Come see us sometime.' };
  };
}
async function city(ai) {
  const A = await fakeAnthropic(ai); open.push(A.close);
  const store = await Store.open({ memory: true });
  const c = new City({ store, ai: new AI({ store, env: {}, apiKey: () => 'k', baseURL: A.url }), google: new Google({ store, clientId: () => '', clientSecret: () => '' }), log: { error() {} } });
  c.saveSettings({ business: 'Sam\'s Kitchens', about: 'Kitchen remodels in Austin.' });
  return { A, store, city: c };
}

test('the owner names a department and says what it does; the Panel judges the work, a weak draft is rewritten once, and the Crowd of 96 votes', async () => {
  const { A, city: c } = await city(judges());
  assert.deepStrictEqual(c.departments(), [], 'a new city has no departments');
  const d = c.saveDepartment({ name: 'Open house', does: 'Write a short invite to this week\'s open house.', judge: true, audience: 'Homeowners nearby', every: 10080 });
  assert.deepStrictEqual([d.kind, d.name, d.review, d.judge, d.panel], ['own', 'Open house', true, true, null]);
  assert.strictEqual(await c.runAgent(d.id), 'Made a card for you.');
  const card = c.waiting()[0], J = card.judged;
  assert.strictEqual(card.body, 'BETTER: Come see a finished kitchen this Saturday.', 'the rewrite won, so it is what you see');
  assert.deepStrictEqual([J.question, J.panel.avg, J.panel.n, J.panel.top, J.panel.pass, J.simulated], ['Would you book a visit?', 4.5, 8, 6, true, true]);
  assert.deepStrictEqual(J.trail, ['Rewritten after the panel: 2 to 4.5 out of 5.']);
  assert.deepStrictEqual([J.crowd.n, J.crowd.yes, J.crowd.typical, J.moods], [96, 70, true, 12], '8 people x 12 moods');
  // the panel's people are made once and kept on the department
  const kept = c.department(d.id).panel;
  assert.deepStrictEqual([kept.question, kept.people.length, kept.people[0].name], ['Would you book a visit?', 8, 'Ana']);
  const n = A.calls.length; await c.runAgent(d.id);
  assert.strictEqual(A.calls.filter((x, i) => i >= n && x.body.output_config && x.body.output_config.format && x.body.output_config.format.schema.properties.question).length, 0, 'no new people on the next run');
  // changing what it does or who it is for makes a fresh panel; changing the name does not
  c.saveDepartment({ id: d.id, name: 'Open houses' }); assert(c.department(d.id).panel);
  c.saveDepartment({ id: d.id, audience: 'First-time buyers' }); assert.strictEqual(c.department(d.id).panel, null);
  // judging off: no judge calls at all
  const quiet = c.saveDepartment({ name: 'Notes', does: 'One tip a day.', judge: false });
  const m = A.calls.length; await c.runAgent(quiet.id);
  const judgeCalls = A.calls.slice(m).filter(x => { const f = x.body.output_config && x.body.output_config.format; return f && (f.schema.properties.reactions || f.schema.properties.typical || f.schema.properties.people); });
  assert.strictEqual(judgeCalls.length, 0, 'no Panel or Crowd'); assert.strictEqual(c.waiting()[0].judged, null);
});

test('a judging problem never holds the work back; a department can be removed and its cards close', async () => {
  const { city: c } = await city(judges({ failPeople: true }));
  const d = c.saveDepartment({ name: 'Ads', does: 'Three short ads.', judge: true });
  await c.runAgent(d.id);
  const card = c.waiting()[0];
  assert.strictEqual(card.body, 'Come see us sometime.');
  assert(/^Not judged: /.test(card.judged.error), card.judged.error);
  c.removeDepartment(d.id);
  assert.deepStrictEqual([c.department(d.id), c.waiting().length], [null, 0]);
  assert.throws(() => c.saveDepartment({ id: 'nope', name: 'x', does: 'y' }), /No such department/);
  for (let i = 0; i < 10; i++) c.saveDepartment({ name: 'D' + i, does: 'Something.' });
  assert.throws(() => c.saveDepartment({ name: 'One more', does: 'Something.' }), /room for 10 departments/);
});

test('a city from before departments keeps what it was really using, with the same ids; a new one starts empty', async () => {
  const { store, city: c } = await city(judges());
  store.set('google', { refresh: 'rt', email: 'owner@example.com' });
  store.set('settings', Object.assign(store.get('settings'), { leadReply: 'Ask when they want to start.' }));
  store.set('agents', { mailroom: { on: false }, social: { every: 1440 } });
  store.set('custom', [{ id: 'c-1', name: 'Ideas', instructions: 'Three ideas.', every: 10080, model: '', review: false, on: true }]);
  store.put('updates', 'u1', { id: 'u1', agent: 'social', ts: 1, text: 'Wrote 3 posts' });
  assert.deepStrictEqual(c.departments().map(d => [d.id, d.kind, d.name, d.every]), [['leads', 'leads', 'Leads', 10], ['social', 'social', 'Social media', 1440], ['c-1', 'own', 'Ideas', 10080]]);
  assert.strictEqual(c.department('leads').does, 'Ask when they want to start.', 'the old reply guide is now what Leads does');
  assert.strictEqual(c.department('c-1').review, false);
  const fresh = await city(judges());
  assert.deepStrictEqual(fresh.city.departments(), [], 'not connected to Gmail and nothing used: nothing carried over');
  assert(PICKS.every(p => p.name && p.does && p.what), 'every ready-made department explains itself');
});

test('a department asks you when a fact is missing; your answer is kept and it works again with it', async () => {
  let asked = 0;
  const { A, city: c } = await city(b => { const p = b.messages[0].content;
    if (b.output_config && b.output_config.format) return { text: {} };
    if (/WHAT THE OWNER TOLD YOU[\s\S]*4410 Shoal Creek/.test(p)) return { text: 'Open house at 4410 Shoal Creek, Saturday 10 to 2.' };
    asked++; return { text: 'QUESTION FOR THE OWNER: What is the address of the open house?' }; });
  const d = c.saveDepartment({ name: 'Open house', does: 'Write the open house invite.', judge: false });
  assert.strictEqual(await c.runAgent(d.id), 'Asked you a question first.');
  const q = c.waiting()[0];
  assert.deepStrictEqual([q.kind, q.title, q.actions], ['ask', 'Open house asks: What is the address of the open house?', ['answer']]);
  await c.runAgent(d.id); assert.strictEqual(c.waiting().filter(x => x.kind === 'ask').length, 1, 'one open question at a time');
  await assert.rejects(c.answer(q.id, ' '), /Write your answer/);
  const r = await c.answer(q.id, '4410 Shoal Creek Blvd');
  assert.strictEqual(r.said, 'Thanks. Open house is working on it again.');
  for (let i = 0; i < 20 && !c.waiting().some(x => x.kind === 'note'); i++) await new Promise(res => setTimeout(res, 25));
  const card = c.waiting().find(x => x.kind === 'note');
  assert.strictEqual(card.body, 'Open house at 4410 Shoal Creek, Saturday 10 to 2.');
  assert.deepStrictEqual(c.department(d.id).facts.map(f => [f.q, f.a]), [['What is the address of the open house?', '4410 Shoal Creek Blvd']]);
  assert(/QUESTION FOR THE OWNER/.test(A.calls.find(x => !x.body.output_config || !x.body.output_config.format).body.messages[0].content), 'every job may ask instead of guessing');
});
