// Town life: crews per department, the town's regulars, where people are by the hour, friends, dating, weddings, babies and kids who
// grow up into juniors. Code only: no AI is ever called.
const test = require('node:test'), assert = require('node:assert');
const { Store } = require('../src/store');
const { AI } = require('../src/ai');
const { Google } = require('../src/google');
const { City } = require('../src/city');
const { Life } = require('../src/life');

test('a town that lives: crews, regulars, friends, love, a wedding, a baby who grows up into a junior', async () => {
  const store = await Store.open({ memory: true }); let now = Date.parse('2026-10-13T23:00:00Z');   // 6 pm in Austin
  const city = new City({ store, ai: new AI({ store, env: {} }), google: new Google({ store }), log: { error() {} }, now: () => now });
  store.set('departments', []); city.saveDepartment({ kind: 'leads', name: 'Leads', does: 'x', every: 10 }); city.saveDepartment({ kind: 'social', name: 'Social', does: 'x', every: 10 });
  city.ai.ask = () => { throw new Error('life must never call the AI'); };
  let r = 0; const seq = [0.1, 0.9, 0.2, 0.7, 0.05, 0.6, 0.3, 0.01]; const life = new Life(city, { rand: () => seq[r++ % seq.length] }); city.life = life;
  const v0 = life.view();
  assert.strictEqual(v0.people.filter(p => p.dept && !['hall', 'research', 'school'].includes(p.dept)).length, 5, '2 for Leads, 3 for Social');
  assert(v0.people.some(p => p.role === 'Barista') && v0.people.some(p => p.role === 'Park ranger'), 'the town has its regulars');
  assert(v0.people.every(p => p.look && p.look.skin && p.name.split(' ').length === 2));
  assert.strictEqual(new Set(v0.people.map(p => p.name)).size, v0.people.length, 'no two people share a name');
  // run town life for 40 days, one step every 15 minutes in the evening
  for (let d = 0; d < 40; d++) for (let i = 0; i < 12; i++) { now += 15 * 6e4; life.step(); } 
  const s = store.get('life'), kinds = new Set(s.news.map(n => n.kind)), all = life.view().news;
  assert(kinds.has('friends') || s.news.length, 'news happens');
  const married = s.people.filter(p => p.partner);
  married.forEach(p => { const q = s.people.find(x => x.id === p.partner); assert(q && q.partner === p.id && q.home === p.home && q.kind === 'adult' && p.kind === 'adult'); assert(!life.related(s, p, q)); });
  s.people.filter(p => p.parents && p.parents.length).forEach(k => { const [a, b] = k.parents.map(id => s.people.find(x => x.id === id)); assert(a.partner === b.id, 'kids come from a married couple'); });
  assert(s.people.filter(p => p.kind === 'kid').length <= 12);
  assert(all.length <= 15 && all.every(n => typeof n.text === 'string' && n.text.length < 120));
  // where people are by the hour: night at home, kids at school in the morning
  now = Date.parse('2026-12-01T09:00:00Z');   // 3 am in Austin
  assert(life.view().people.every(p => p.place === 'home'));
  now = Date.parse('2026-12-01T16:00:00Z');   // 10 am
  const day = life.view().people; assert(day.filter(p => p.dept && p.kind === 'adult').every(p => p.place === 'work'));
  assert(day.filter(p => p.kind === 'kid').every(p => p.place === 'school'));
});

test('a closed department leaves its people in town; growing up makes a junior', async () => {
  const store = await Store.open({ memory: true }); let now = Date.parse('2026-10-13T17:00:00Z');
  const city = new City({ store, ai: new AI({ store, env: {} }), google: new Google({ store }), log: { error() {} }, now: () => now });
  store.set('departments', []); const D = city.saveDepartment({ kind: 'leads', name: 'Leads', does: 'x', every: 10 });
  const life = new Life(city, { rand: () => 0.99 }); life.step(true);
  const s = store.get('life'), mom = s.people.find(p => p.dept === D.id), dad = s.people.find(p => p.dept === D.id && p.id !== mom.id);
  mom.partner = dad.id; dad.partner = mom.id; s.people.push({ id: 'kid1', name: 'Pip Test', kind: 'kid', dept: '', role: 'Kid', home: 1, parents: [mom.id, dad.id], born: now, look: mom.look }); store.set('life', s);
  now += 22 * 864e5; life.step(true);
  const pip = store.get('life').people.find(p => p.id === 'kid1');
  assert(pip.kind === 'adult' && pip.dept === D.id && /^Junior, Leads$/.test(pip.role));
  assert(store.get('life').news.some(n => /Pip grew up and joined Leads as a junior\./.test(n.text)) && store.get('life').news.some(n => /Pip started school/.test(n.text)));
  city.removeDepartment(D.id); life.step(true);
  assert(store.get('life').people.filter(p => p.dept === D.id).length === 0 && store.get('life').people.some(p => p.role === 'Resident'), 'nobody is deleted');
});

test('more life: City Hall, Research and School have people; pets, birthdays, weekend bonfires, holidays; a won job throws a party', async () => {
  const store = await Store.open({ memory: true }); let now = Date.parse('2026-10-31T21:00:00Z');   // Halloween, a Saturday, 4 pm in Austin
  const city = new City({ store, ai: new AI({ store, env: {} }), google: new Google({ store }), log: { error() {} }, now: () => now });
  store.set('departments', []); const D = city.saveDepartment({ kind: 'leads', name: 'Leads', does: 'x', every: 10 });
  city.ai.ask = () => { throw new Error('life must never call the AI'); };
  const life = new Life(city, { rand: () => 0.005 }); city.life = life;
  life.step(true);
  const v = life.view();
  assert(['hall', 'research', 'school'].every(k => v.people.some(p => p.dept === k)), 'civic buildings have people');
  assert.strictEqual(v.holiday, 'halloween');
  const s = store.get('life');
  assert(s.news.some(n => n.text === 'Happy Halloween! The kids went trick-or-treating.'));
  assert(s.news.some(n => / adopted a (dog|cat) named /.test(n.text)) && s.people.some(p => p.pet), 'a pet');
  assert(s.events.some(e => e.kind === 'bonfire' && e.place === 'lake'), 'Saturday bonfire');
  now = Date.parse('2026-11-01T01:00:00Z');   // 8 pm Saturday
  const at = life.view(); assert(at.events.some(e => e.kind === 'bonfire') && at.people.some(p => p.place === 'lake' && p.doing === 'At the beach bonfire'));
  // a won job: a party in the park tonight, and a news line with no dollars
  store.put('cards', 'w1', { id: 'w1', agent: D.id, kind: 'lead', status: 'sent', decidedAt: now, ts: now, lead: { name: 'Dana' } });
  city.markWon('w1', 18000);
  const after = life.view();
  assert(after.news[0].text === 'Leads won a new job! Party in the park tonight.' && !/18/.test(after.news[0].text));
  assert(after.people.some(p => p.dept === D.id && p.place === 'park' && p.doing === 'Celebrating a win'));
  // birthdays come round once a town year
  now += 31 * 864e5; life.step(true);
  assert(store.get('life').news.some(n => /^Happy birthday, \w+! Cake at the café tonight\.$/.test(n.text)));
  assert(life.view().people.every(p => typeof p.say === 'string' && p.say.length < 60));
});
