// The sample town for the public website: public/demo-data.json, which the 3D city loads with ?demo=1 when no city is behind it.
// It is made by town life itself (src/life.js) on a fake clock: no AI, no server, the same output every time.
// Run it again after changing town life:   node scripts/demo-data.js
const fs = require('node:fs'), path = require('node:path');
const { Life } = require('../src/life');

const BUSINESS = "Sam's Kitchens", SEED = 32, DAYS = 32;
const DEPTS = [
  { id: 'leads', kind: 'leads', name: 'Leads', does: 'Answers every new customer in your voice. You read it and tap Send.', need: 2, live: true, lines: ['Wrote a reply to a new kitchen lead.', 'Two replies are ready for you.'] },
  { id: 'mail', kind: 'mailroom', name: 'Mail room', does: 'Sorts the inbox and drafts a reply for each email that needs you.', need: 1, live: false, lines: ['Sorted 14 new emails.', 'One draft is waiting for you.'] },
  { id: 'social', kind: 'social', name: 'Social', does: 'Writes the week of posts and tests them on a practice audience first.', need: 0, live: true, judge: true, ask: 'Which photo should lead this week?', lines: ['Planned five posts for the week.', 'Wrote a caption for the before and after.'] }];

function make() {
  let seed = SEED; const rand = () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const mem = {}; let now = Date.parse('2026-10-10T22:45:00Z') - DAYS * 864e5;   // ends on a Saturday evening: the beach bonfire is on
  const city = { store: { get: (k, d) => k in mem ? mem[k] : d, set: (k, v) => { mem[k] = v; } }, departments: () => DEPTS, department: id => DEPTS.find(d => d.id === id), now: () => now };
  const life = new Life(city, { tz: 'America/Chicago', rand });
  for (let i = 0; i < DAYS * 96; i++) { now += 15 * 6e4; life.step(); }
  // one day of the town, hour by hour: where everyone is, what they say, the events on
  const day0 = now - (life.hour(now) * 36e5) - (now % 36e5), start = 19, frames = [];
  for (let h = 0; h < 24; h++) { now = day0 + h * 36e5 + 15 * 6e4; const v = life.view(), at = {};
    v.people.forEach(p => { at[p.id] = [p.place, p.event, p.say, p.doing]; });
    frames.push({ hour: v.hour, events: v.events.map(e => ({ id: e.id, kind: e.kind, place: e.place, who: e.who })), at }); }
  now = day0 + start * 36e5 + 15 * 6e4;
  const view = life.view(), s = mem.life, P = id => s.people.find(p => p.id === id), first = p => p.name.split(' ')[0];
  // the little moments the sample plays, one every 20 to 30 seconds, from the town's own people
  // each moment gets its own people, with first names nobody else in the moments has (two Irises would confuse)
  const adults = s.people.filter(p => p.kind === 'adult'), used = new Set(), free = p => p && !used.has(first(p)), take = (...ps) => { ps.forEach(p => used.add(first(p))); return ps; }, rel = s.rel || {};
  const couple = adults.find(p => p.partner && free(p) && free(P(p.partner)) && first(p) !== first(P(p.partner))), wed = couple ? take(couple, P(couple.partner)) : null;
  const single = adults.filter(p => !p.partner && free(p)), a0 = single[0], a1 = single.find(p => p !== a0 && free(p) && first(p) !== first(a0) && !life.related(s, p, a0)), pair = a0 && a1 ? take(a0, a1) : null;
  const fk = Object.keys(rel).sort((a, b) => rel[b] - rel[a]).map(k => k.split('|').map(P)).find(([a, b]) => a && b && a.kind === 'adult' && b.kind === 'adult' && a.partner !== b.id && free(a) && free(b) && first(a) !== first(b)), friends = fk ? take(...fk) : null;
  const crew = adults.filter(p => p.dept === 'leads');
  const moments = [
    friends && { kind: 'friends', text: first(friends[0]) + ' and ' + first(friends[1]) + ' became friends at the café.', who: friends.map(p => p.id), place: 'cafe' },
    { kind: 'win', text: 'Leads won a new kitchen job! Party in the park tonight.', who: crew.map(p => p.id).concat(adults.filter(p => !crew.includes(p)).slice(0, 8).map(p => p.id)), place: 'park' },
    pair && { kind: 'dating', text: first(pair[0]) + ' and ' + first(pair[1]) + ' are dating.', who: pair.map(p => p.id), place: 'cafe' },
    wed && { kind: 'wedding', text: 'Wedding in the park! ' + first(wed[0]) + ' and ' + first(wed[1]) + ' got married.', who: wed.map(p => p.id), place: 'park' },
    { kind: 'bonfire', text: 'Bonfire on the beach. Half the town came.', who: s.people.filter((p, i) => i % 2 === 0).slice(0, 14).map(p => p.id), place: 'lake' }].filter(Boolean);
  const dept = d => ({ id: d.id, name: d.name, kind: d.kind, does: d.does, what: d.does, need: d.need, live: d.live, on: true, judge: !!d.judge, ask: d.ask || '', built: 0, lines: d.lines });
  return { business: BUSINESS, sample: true, departments: DEPTS.map(dept),
    hall: { need: 0, lines: ['All set up. Nothing to fix.'], mayor: null }, research: { need: 0, live: false, lines: ['Found two tools worth a look.'] }, school: { need: 0, live: false, lines: [] },
    ranks: [], tip: null, proposal: null, panel: null, led: 'Before and after: a kitchen remodel',
    life: view, demo: { start, frames, moments } };
}
module.exports = { make };
if (require.main === module) {
  const out = path.join(__dirname, '..', 'public', 'demo-data.json'), d = make();
  fs.writeFileSync(out, JSON.stringify(d));
  const ppl = d.life.people;
  console.log('Wrote ' + path.relative(process.cwd(), out) + ': ' + ppl.length + ' people (' + ppl.filter(p => p.kind === 'kid').length + ' kids, ' + ppl.filter(p => p.partner).length / 2 + ' couples, ' + ppl.filter(p => p.pet).length + ' pets), ' + d.demo.moments.length + ' moments.');
}
