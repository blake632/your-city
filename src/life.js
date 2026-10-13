// Town life: the city's people live days of their own. Each department has its crew, the town has its regulars (the barista, the
// park ranger, the teacher), and everyone has a home. By the clock they go to work, eat lunch at the café or in the park, walk the
// lake after work and go home at night. People who keep running into each other become friends; two single adults who get close
// start dating, marry and move in together, and a married couple may have a baby. Kids go to school, grow up, and join a parent's
// department as a junior. It runs on code alone: no AI, no cost, nothing sent anywhere. One step at most every 15 minutes; a few
// lines of town news a step, in plain words. Wholesome on purpose: only adults date, never family.
const crypto = require('node:crypto');

const FIRST = ['Ava', 'Leo', 'Maya', 'Noah', 'Zoe', 'Eli', 'Ivy', 'Omar', 'Lena', 'Kai', 'Ruby', 'Theo', 'Nina', 'Sami', 'Jade', 'Owen', 'Iris', 'Milo', 'Tess', 'Ravi', 'Ana', 'Luis', 'Mei', 'Jon', 'Cora', 'Ezra', 'Lila', 'Finn', 'Nora', 'Arlo'];
const LAST = ['Hart', 'Reyes', 'Cole', 'Park', 'Diaz', 'Shah', 'Lowe', 'Nash', 'Wren', 'Moss', 'Vale', 'Okoro', 'Bauer', 'Lin', 'Ford', 'Quinn', 'Ortiz', 'Kato', 'Bell', 'Adler'];
const BABY = ['Pip', 'Bea', 'Juno', 'Rex', 'Lulu', 'Ollie', 'Wren', 'Remy', 'Tilly', 'Bo', 'Nell', 'Gus', 'Poppy', 'Max', 'Hazel', 'Ziggy'];
const SKIN = ['#f1c7a5', '#e3b08a', '#d49b73', '#c68a62', '#9c6644', '#7a4b30', '#f3d3bb', '#b97d58', '#6f4a33', '#efcfa6'];
const HAIR = ['#2a1b14', '#141212', '#6e2d19', '#d8b26a', '#3a2618', '#7a5a3a', '#a0441f', '#161214', '#4f2f1d'];
const HS = ['short', 'bob', 'long', 'buzz', 'bun', 'pony', 'curly', 'beanie', 'cap', 'short', 'long'];
const TOPS = ['#ece3d2', '#1f2a44', '#7a2436', '#3d5a80', '#f1eee8', '#2c2f36', '#18181d', '#b08a5a', '#2b3a67', '#23493a', '#5b6b7a', '#e8dcc4'];
const PANTS = ['#26262c', '#1a1d24', '#2a2f3a', '#1c2433', '#3a3328', '#24262b'];
// The town's regulars: they make the streets feel lived in, and they are who the crews meet at lunch.
const TOWN = [['Barista', 'cafe'], ['Park ranger', 'park'], ['Teacher', 'school'], ['Mail carrier', 'streets'], ['Gym coach', 'gym'], ['Lifeguard', 'lake']];
// Where people go. The 3D city draws each place; homes are numbered.
const PLACES = { work: 'At work', cafe: 'At the café', park: 'In the park', gym: 'At the gym', lake: 'By the lake', school: 'At school', home: 'At home', streets: 'Out on the streets', hall: 'At City Hall' };
const STEP_MS = 15 * 6e4, NEWS = 60, MAX_KIDS = 12, KIDS_EACH = 2, DAY = 864e5;
const hash = s => crypto.createHash('sha1').update(String(s)).digest().readUInt32BE(0);
const pick = (a, h) => a[h % a.length];
function look(seed) {
  const h = hash(seed), q = (n, a) => a[(h >>> n) % a.length];
  return { skin: q(0, SKIN), hair: q(4, HAIR), hs: q(8, HS), top: q(12, TOPS), pants: q(16, PANTS), glasses: (h >>> 20) % 4 === 0 ? 1 : 0, beard: (h >>> 22) % 5 === 0 ? 1 : 0 };
}
const pairKey = (a, b) => a < b ? a + '|' + b : b + '|' + a;

class Life {
  constructor(city, { tz = 'America/Chicago', rand = Math.random } = {}) { this.city = city; this.tz = tz; this.rand = rand; }
  state() { const s = this.city.store.get('life', null); return s && Array.isArray(s.people) ? s : { people: [], rel: {}, news: [], next: 1, last: 0 }; }
  save(s) { s.news = s.news.slice(-NEWS); this.city.store.set('life', s); return s; }
  hour(t) { return Number(new Intl.DateTimeFormat('en-US', { timeZone: this.tz, hour: 'numeric', hourCycle: 'h23' }).format(new Date(t))) % 24; }
  // The crews follow the departments: each department has 2 or 3 people; a department that closes leaves its people in town as residents.
  sync(s) {
    const used = new Set(s.people.map(p => p.name)), name = seed => { let h = hash(seed), n = ''; for (let i = 0; i < 60 && (!n || used.has(n)); i++) { n = pick(FIRST, h) + ' ' + pick(LAST, h >>> 7); h = hash(h + ':' + i); } used.add(n); return n; };
    const add = (p, seed) => { const x = Object.assign({ id: 'p' + (s.next++), name: name(seed), kind: 'adult', home: s.next % 14, born: this.city.now() - 30 * DAY, look: look(seed) }, p); s.people.push(x); return x; };
    const depts = this.city.departments();
    depts.forEach((d, i) => {
      const crew = s.people.filter(p => p.dept === d.id && p.kind === 'adult'), want = d.kind === 'social' ? 3 : 2;
      for (let n = crew.length; n < want; n++) add({ dept: d.id, role: n === 0 ? d.name + ' lead' : n === 1 ? 'Head of ' + d.name : d.name + ' helper' }, d.id + ':' + n + ':' + i);
    });
    s.people.forEach(p => { if (p.dept && !depts.some(d => d.id === p.dept)) { p.dept = ''; p.role = 'Resident'; } });
    TOWN.forEach(([role, place], i) => { if (!s.people.some(p => p.town === place)) add({ dept: '', role, town: place }, 'town:' + place + ':' + i); });
    return s;
  }
  // Where someone is at an hour, from their own rhythm (the same person keeps the same habits). Couples go home together.
  where(p, t, s) {
    const hr = this.hour(t), day = Math.floor(t / DAY), h = hash(p.id + ':' + day), partner = p.partner && s ? s.people.find(x => x.id === p.partner) : null;
    if (hr < 7 || hr >= 22) return 'home';
    if (p.kind === 'kid') return hr < 8 ? 'home' : hr < 15 ? 'school' : hr < 18 ? pick(['park', 'park', 'lake', 'home'], h) : 'home';
    if (p.town) return hr >= 8 && hr < 18 ? p.town : hr < 20 ? pick(['park', 'cafe', 'home'], h) : 'home';
    if (hr < 8) return pick(['home', 'cafe', 'gym'], h);
    if (hr === 12) return pick(['cafe', 'park', 'work', 'cafe'], h);
    if (hr < 17) return 'work';
    if (hr < 20) { if (partner && partner.kind === 'adult') return pick(['park', 'lake', 'cafe'], hash(pairKey(p.id, partner.id) + day)); return pick(['park', 'gym', 'lake', 'cafe', 'home'], h); }
    return 'home';
  }
  related(s, a, b) {
    if (a.id === b.id) return true;
    const fam = p => [p.id].concat(p.parents || []);
    return (a.parents || []).includes(b.id) || (b.parents || []).includes(a.id) || (a.parents || []).some(x => (b.parents || []).includes(x)) || fam(a).some(x => fam(b).includes(x) && x !== a.id);
  }
  // One step of town life. Returns the news it made.
  step(force) {
    const now = this.city.now(), s = this.sync(this.state());
    if (!force && now - (s.last || 0) < STEP_MS) { this.save(s); return []; }
    s.last = now;
    const made = [], say = (text, kind, who, place) => { const n = { ts: now, text, kind, who, place }; s.news.push(n); made.push(n); };
    const P = id => s.people.find(p => p.id === id), first = p => p.name.split(' ')[0];
    // grow up: a kid starts school at 3 town days, joins a parent's department at 21
    s.people.filter(p => p.kind === 'kid').forEach(k => {
      const age = (now - k.born) / DAY;
      if (age >= 3 && !k.school) { k.school = now; say(first(k) + ' started school.', 'school', [k.id], 'school'); }
      if (age >= 21) { const par = (k.parents || []).map(P).find(x => x && x.dept); k.kind = 'adult'; k.dept = par ? par.dept : ''; k.role = par ? 'Junior, ' + (this.city.department(par.dept) || {}).name : 'Resident';
        say(first(k) + ' grew up and ' + (par ? 'joined ' + (this.city.department(par.dept) || {}).name + ' as a junior.' : 'moved into town.'), 'grew', [k.id], 'work'); }
    });
    // who is where right now; people out in the same place meet
    const groups = {};
    s.people.forEach(p => { const w = this.where(p, now, s); p.place = w; if (w !== 'home') (groups[w] = groups[w] || []).push(p); });
    Object.keys(groups).forEach(place => {
      const g = groups[place].filter(p => p.kind === 'adult'); if (g.length < 2) return;
      for (let n = 0; n < Math.min(3, g.length - 1); n++) {
        const a = g[Math.floor(this.rand() * g.length)], b = g[Math.floor(this.rand() * g.length)]; if (!a || !b || a.id === b.id) continue;
        const k = pairKey(a.id, b.id), before = s.rel[k] || 0, after = before + (place === 'work' ? 0.5 : 1); s.rel[k] = after;
        if (before < 10 && after >= 10) say(first(a) + ' and ' + first(b) + ' became friends ' + (place === 'work' ? 'at work.' : PLACES[place].toLowerCase() + '.'), 'friends', [a.id, b.id], place);
        else if (place !== 'work' && made.length < 2 && this.rand() < 0.25) say(first(a) + ' and ' + first(b) + ' ' + ({ cafe: 'grabbed a coffee.', park: 'went for a walk in the park.', gym: 'worked out together.', lake: 'watched the sunset by the lake.', streets: 'stopped to chat on the street.', school: 'talked at the school gate.' }[place] || 'hung out.'), 'hang', [a.id, b.id], place);
        // love: two single adults, not family, who have grown close
        if (!a.partner && !b.partner && after >= 30 && !this.related(s, a, b) && !(s.dating || {})[k] && this.rand() < 0.1) {
          (s.dating = s.dating || {})[k] = now; say(first(a) + ' and ' + first(b) + ' are dating.', 'dating', [a.id, b.id], place);
        }
      }
    });
    // weddings: dating a week or more and still close; they move in together
    Object.keys(s.dating || {}).forEach(k => {
      const [x, y] = k.split('|').map(P); if (!x || !y || x.partner || y.partner) { delete s.dating[k]; return; }
      if (now - s.dating[k] >= 7 * DAY && (s.rel[k] || 0) >= 60 && this.rand() < 0.06) {
        x.partner = y.id; y.partner = x.id; y.home = x.home; delete s.dating[k];
        say('Wedding in the park! ' + first(x) + ' and ' + first(y) + ' got married.', 'wedding', [x.id, y.id], 'park');
      }
    });
    // babies: a married couple, now and then, at most 2 each and 12 in town
    const kids = s.people.filter(p => p.kind === 'kid').length;
    s.people.filter(p => p.partner && p.id < p.partner).forEach(a => {
      const b = P(a.partner); if (!b || kids >= MAX_KIDS) return;
      const theirs = s.people.filter(p => (p.parents || []).includes(a.id) && (p.parents || []).includes(b.id));
      const lastBorn = Math.max(0, ...theirs.map(k => k.born));
      if (theirs.length >= KIDS_EACH || now - lastBorn < 10 * DAY || this.rand() > 0.03) return;
      const used = new Set(s.people.map(p => p.name.split(' ')[0])), fn = BABY.find(n => !used.has(n)) || pick(BABY, hash(now));
      const kid = { id: 'p' + (s.next++), name: fn + ' ' + a.name.split(' ')[1], kind: 'kid', dept: '', role: 'Kid', home: a.home, parents: [a.id, b.id], born: now, look: look('kid:' + now + ':' + a.id) };
      s.people.push(kid); say('A baby! ' + first(a) + ' and ' + first(b) + ' welcomed ' + fn + '.', 'baby', [a.id, b.id, kid.id], 'home');
    });
    this.save(s);
    return made;
  }
  // What the 3D city draws: everyone, where they are now and why, who they live with, and the latest town news.
  view() {
    const now = this.city.now(), s = this.sync(this.state());
    return { hour: this.hour(now), places: PLACES,
      people: s.people.map(p => { const w = this.where(p, now, s); return { id: p.id, name: p.name, kind: p.kind, role: p.role, dept: p.dept || '', home: p.home, partner: p.partner || '', parents: p.parents || [], look: p.look, place: w, doing: w === 'work' && p.dept ? 'At work in ' + ((this.city.department(p.dept) || {}).name || 'town') : PLACES[w] }; }),
      news: s.news.slice(-15).reverse().map(n => ({ ts: n.ts, text: n.text, kind: n.kind, who: n.who, place: n.place })) };
  }
}
module.exports = { Life, PLACES };
