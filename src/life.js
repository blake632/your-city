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
const STEP_MS = 15 * 6e4, NEWS = 60, MAX_KIDS = 12, KIDS_EACH = 2, DAY = 864e5, MAX_PETS = 8, YEAR = 30 * DAY;   // a town year is 30 days, so birthdays come round
// City Hall, the Research desk and the School have people too (their dept is these keys, not a department id).
const CIVIC = { hall: [['City Hall', 'Chief of Staff'], ['City Hall', 'Town clerk']], research: [['Research Desk', 'Researcher']], school: [['The School', 'Dean'], ['The School', 'Teacher']] };
const PET_NAMES = { dog: ['Biscuit', 'Scout', 'Maple', 'Rocket', 'Daisy', 'Bear', 'Pepper', 'Moose'], cat: ['Mochi', 'Olive', 'Tiger', 'Luna', 'Ziggy', 'Pumpkin', 'Socks', 'Nori'] };
// What people say, by where they are (short and true: never a claim about the owner's real work or numbers).
const SAY = { cafe: ['Coffee first.', 'The usual, please.', 'This muffin is huge.', 'Good morning!'], park: ['Nice evening.', 'Look at the ducks.', 'Love this park.', 'Race you to the fountain!'],
  lake: ['What a sunset.', 'The water is calm today.'], gym: ['One more set.', 'Leg day.'], school: ['Time for class.', 'Recess!'], streets: ['Mail’s here!', 'Beautiful day.'],
  work: { leads: ['Watching for new customers.', 'Writing replies in your voice.'], mailroom: ['Sorting the mail.', 'Keeping the inbox tidy.'], social: ['Planning this week’s posts.', 'Writing a caption.'], own: ['On it.', 'Back to work.'],
    hall: ['Checking the city’s setup.', 'Planning the day.'], research: ['Reading about new tools.'], school: ['Grading practice work.'] },
  win: ['We did it!', 'Cheers to the team!', 'Best day ever.', 'Look at those fireworks!', 'First round is on me!', 'What a week.'],
  bonfire: ['Pass the marshmallows.', 'Look at the stars.', 'Who brought the guitar?', 'This fire is perfect.', 'Best part of the week.', 'More wood!'],
  soccer: ['Go, go, go!', 'Nice kick!', 'Pass it!', 'Goal!', 'Great save!'], birthday: ['Happy birthday!', 'Make a wish!', 'Save me a slice.', 'Speech, speech!'],
  halloween: ['Trick or treat!', 'Cool costume!', 'Boo!', 'Got any candy?'], lights: ['The lights look amazing.', 'So cozy.', 'Look at that tree!'], fireworks: ['Wow, look at that!', 'Ooh, a red one!'] };
// Real holidays by date (month 1-12, day), as the town celebrates them.
function holidayOf(d) {
  const m = d.getMonth() + 1, day = d.getDate(), dow = d.getDay(), thanks = m === 11 && dow === 4 && day >= 22 && day <= 28;
  return m === 10 && day === 31 ? 'halloween' : thanks ? 'thanksgiving' : m === 12 && day === 25 ? 'christmas' : m === 12 ? 'lights' : m === 1 && day === 1 ? 'newyear' : m === 7 && day === 4 ? 'fireworks' : m === 2 && day === 14 ? 'valentines' : '';
}
const HOLIDAY_NEWS = { halloween: 'Happy Halloween! The kids went trick-or-treating.', thanksgiving: 'Happy Thanksgiving! Families sat down to a feast.', christmas: 'Merry Christmas! Presents under every tree.',
  lights: 'Holiday lights went up all over town.', newyear: 'Happy New Year! Fireworks over the lake.', fireworks: 'Fireworks over the lake tonight.', valentines: 'Happy Valentine’s Day! The café is full of couples.' };
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
  deptName(id) { return CIVIC[id] ? CIVIC[id][0][0] : (this.city.department(id) || {}).name || 'town'; }
  hour(t) { return Number(new Intl.DateTimeFormat('en-US', { timeZone: this.tz, hour: 'numeric', hourCycle: 'h23' }).format(new Date(t))) % 24; }
  // The crews follow the departments: each department has 2 or 3 people; a department that closes leaves its people in town as residents.
  sync(s) {
    const used = new Set(s.people.map(p => p.name)), name = seed => { let h = hash(seed), n = ''; for (let i = 0; i < 60 && (!n || used.has(n)); i++) { n = pick(FIRST, h) + ' ' + pick(LAST, h >>> 7); h = hash(h + ':' + i); } used.add(n); return n; };
    const add = (p, seed) => { const x = Object.assign({ id: 'p' + (s.next++), name: name(seed), kind: 'adult', home: s.next % 14, born: this.city.now() - YEAR - (hash(seed) % 30) * DAY, look: look(seed) }, p); s.people.push(x); return x; };
    const depts = this.city.departments();
    depts.forEach((d, i) => {
      const crew = s.people.filter(p => p.dept === d.id && p.kind === 'adult'), want = d.kind === 'social' ? 3 : 2;
      for (let n = crew.length; n < want; n++) add({ dept: d.id, role: n === 0 ? d.name + ' lead' : n === 1 ? 'Head of ' + d.name : d.name + ' helper' }, d.id + ':' + n + ':' + i);
    });
    Object.keys(CIVIC).forEach(k => CIVIC[k].forEach(([, role], n) => { if (s.people.filter(p => p.dept === k && p.kind === 'adult').length <= n) add({ dept: k, role }, k + ':' + n); }));
    s.people.forEach(p => { if (p.dept && !CIVIC[p.dept] && !depts.some(d => d.id === p.dept)) { p.dept = ''; p.role = 'Resident'; } });
    TOWN.forEach(([role, place], i) => { if (!s.people.some(p => p.town === place)) add({ dept: '', role, town: place }, 'town:' + place + ':' + i); });
    return s;
  }
  // Where someone is at an hour, from their own rhythm (the same person keeps the same habits). Couples go home together.
  where(p, t, s) {
    const hr = this.hour(t), day = Math.floor(t / DAY), h = hash(p.id + ':' + day), partner = p.partner && s ? s.people.find(x => x.id === p.partner) : null;
    const ev = s && (s.events || []).slice().reverse().find(e => e.from <= t && e.until > t && e.who.includes(p.id));   // the newest event wins
    if (ev && !(p.kind === 'kid' && hr >= 21)) return ev.place;
    if (hr < 7 || hr >= 22) return 'home';
    if (p.pet && hr === 18) return 'park';   // the evening walk
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
      if (age >= 21) { const par = (k.parents || []).map(P).find(x => x && x.dept); k.kind = 'adult'; k.dept = par ? par.dept : ''; k.role = par ? 'Junior, ' + this.deptName(par.dept) : 'Resident';
        say(first(k) + ' grew up and ' + (par ? 'joined ' + this.deptName(par.dept) + ' as a junior.' : 'moved into town.'), 'grew', [k.id], 'work'); }
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
    // pets: now and then someone adopts a dog or a cat (at most 8 in town); dogs come on the evening walk
    const pets = s.people.filter(p => p.pet).length, lonely = s.people.filter(p => p.kind === 'adult' && !p.pet);
    if (pets < MAX_PETS && lonely.length && this.rand() < 0.01) {
      const p = lonely[Math.floor(this.rand() * lonely.length)], kind = this.rand() < 0.6 ? 'dog' : 'cat', used = new Set(s.people.filter(x => x.pet).map(x => x.pet.name));
      const nm = PET_NAMES[kind].find(n => !used.has(n)) || PET_NAMES[kind][0]; p.pet = { kind, name: nm };
      say(first(p) + ' adopted a ' + kind + ' named ' + nm + '.', 'pet', [p.id], 'home');
    }
    // birthdays: once a town year; cake at the café that evening with their partner and closest friends
    s.people.forEach(p => {
      const age = Math.floor((now - p.born) / YEAR); if (!p.bday) p.bday = age; if (age <= p.bday) return; p.bday = age;
      const pals = Object.keys(s.rel).filter(k => k.split('|').includes(p.id)).sort((a, b) => s.rel[b] - s.rel[a]).slice(0, 3).map(k => k.split('|').find(x => x !== p.id));
      this.event(s, 'birthday', 'cafe', [p.id, p.partner].concat(pals).filter(Boolean), now, 18, 21, 'birthday:' + p.id + ':' + age);
      say('Happy birthday, ' + first(p) + '! Cake at the café tonight.', 'birthday', [p.id], 'cafe');
    });
    // weekends: a bonfire on the beach on Saturday evening; kids' soccer in the park on Sunday morning
    const local = new Date(new Intl.DateTimeFormat('en-US', { timeZone: this.tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now))), dow = local.getDay(), ymd = local.toDateString();
    if (dow === 6 && this.hour(now) >= 12) { const who = s.people.filter(p => this.rand() < 0.6).map(p => p.id).slice(0, 16); if (this.event(s, 'bonfire', 'lake', who, now, 18, 22, 'bonfire:' + ymd)) say('Saturday bonfire on the beach. Half the town came.', 'bonfire', who.slice(0, 3), 'lake'); }
    if (dow === 0 && this.hour(now) < 9) { const kids = s.people.filter(p => p.kind === 'kid'); if (kids.length >= 2) { const who = kids.concat(kids.flatMap(k => (k.parents || []).map(P).filter(Boolean))).map(p => p.id);
      if (this.event(s, 'soccer', 'park', [...new Set(who)], now, 9, 11, 'soccer:' + ymd)) say('Kids’ soccer in the park this morning.', 'soccer', kids.slice(0, 3).map(k => k.id), 'park'); } }
    // holidays: one line on the day, and the town dresses for it (the 3D city reads holiday)
    const hol = holidayOf(local); if (hol && s.holiday !== hol + ymd) { s.holiday = hol + ymd; say(HOLIDAY_NEWS[hol], 'holiday', [], hol === 'halloween' ? 'streets' : 'park'); }
    s.events = (s.events || []).filter(e => e.until > now - DAY);
    this.save(s);
    return made;
  }
  // A town event between two local hours today (or right now until the end hour). Once per key. true when it was added.
  event(s, kind, place, who, now, fromHr, toHr, key) {
    s.events = s.events || []; if (s.events.some(e => e.key === key)) return false;
    const hr = this.hour(now), from = now + Math.max(0, fromHr - hr) * 36e5 - (now % 36e5), until = from + Math.max(1, toHr - Math.max(fromHr, hr)) * 36e5;
    s.events.push({ id: 'e' + (s.next++), key, kind, place, who: who.filter(Boolean), from, until }); return true;
  }
  // The owner's own wins reach the town (Won the job): a party in the park tonight, with fireworks, for the department and its friends.
  celebrate(deptId, text) {
    const now = this.city.now(), s = this.sync(this.state()), crew = s.people.filter(p => p.dept === deptId && p.kind === 'adult');
    const pals = crew.flatMap(c => Object.keys(s.rel).filter(k => k.split('|').includes(c.id) && s.rel[k] >= 10).map(k => k.split('|').find(x => x !== c.id)));
    const who = [...new Set(crew.map(p => p.id).concat(pals, s.people.filter(p => CIVIC.hall && p.dept === 'hall').map(p => p.id)))];
    const hr = this.hour(now);
    this.event(s, 'win', 'park', who, now, Math.max(hr, 18), 23, 'win:' + now);
    s.news.push({ ts: now, text, kind: 'win', who: crew.map(p => p.id), place: 'park' });
    this.save(s);
  }
  // What the 3D city draws: everyone, where they are now and why, who they live with, and the latest town news.
  view() {
    const now = this.city.now(), s = this.sync(this.state());
    const live = (s.events || []).filter(e => e.from <= now && e.until > now), hol = holidayOf(new Date(new Intl.DateTimeFormat('en-US', { timeZone: this.tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now))));
    const deptName = id => this.deptName(id), kindOf = id => CIVIC[id] ? id : ((this.city.department(id) || {}).kind || 'own');
    const line = (p, w, ev) => { const h = hash(p.id + ':' + Math.floor(now / 36e5)); const list = ev ? SAY[ev.kind] : hol && SAY[hol] && w !== 'work' ? SAY[hol] : w === 'work' ? SAY.work[kindOf(p.dept)] : SAY[w]; if (!list || h % 3) return '';
      return ev ? list[(ev.who.indexOf(p.id) + Math.floor(now / 36e5)) % list.length] : pick(list, h >>> 3); };   // at an event, neighbours never say the same line
    return { hour: this.hour(now), holiday: hol, places: PLACES,
      events: live.map(e => ({ id: e.id, kind: e.kind, place: e.place, who: e.who, until: e.until })),
      people: s.people.map(p => { const w = this.where(p, now, s), ev = live.find(e => e.who.includes(p.id) && e.place === w);
        return { id: p.id, name: p.name, kind: p.kind, role: p.role, dept: p.dept || '', home: p.home, partner: p.partner || '', parents: p.parents || [], look: p.look, pet: p.pet || null, place: w, event: ev ? ev.id : '', say: line(p, w, ev),
          doing: ev ? { win: 'Celebrating a win', bonfire: 'At the beach bonfire', soccer: 'At kids’ soccer', birthday: 'At a birthday party' }[ev.kind] || PLACES[w] : w === 'work' && p.dept ? 'At work in ' + deptName(p.dept) : PLACES[w] }; }),
      news: s.news.slice(-15).reverse().map(n => ({ ts: n.ts, text: n.text, kind: n.kind, who: n.who, place: n.place })) };
  }
}
module.exports = { Life, PLACES };
