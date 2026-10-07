// The video's sample city: Sam's Kitchens run through the real app, with Jev answering as Jev, an open question, the Research desk's finds
// and the School at work. The AI, Gmail and GitHub are stand-ins (a made-up business), so nothing real is shown.
const S = require('path').join(__dirname, '..') + '/';
const { Store } = require(S + 'src/store'), { AI } = require(S + 'src/ai'), { Google } = require(S + 'src/google'), { City, PICKS } = require(S + 'src/city'), { createServer } = require(S + 'src/server');
const { School } = require(S + 'src/school'), { Research } = require(S + 'src/research'), { MOODS } = require(S + 'src/judge');
const { fakeAnthropic, fakeGoogle, listen } = require(S + 'test/fakes');

const PEOPLE = [['Maria', '52, owns a 1990s home in Round Rock, wants a kitchen that feels open'], ['Derek', '38, first-time buyer, tight budget, reads every line'], ['Priya', '45, busy surgeon, wants it done without managing it'],
  ['Tom', '67, retired, burned by a contractor before, skeptical'], ['Alicia', '31, saves ideas on Instagram, loves before-and-afters'], ['Greg', '58, comparing three remodelers side by side'],
  ['Hannah', '41, two kids, needs the kitchen usable during the work'], ['Luis', '49, investor flipping homes, wants speed and price']];
const REACT = { first: [[3, 'Nice, but I am not sure what I would get.'], [2, 'No time or address, so I would scroll past.'], [3, 'Sounds fine. Who runs it?'], [2, 'Every remodeler says this.'], [4, 'I want to see the photos!'], [2, 'Nothing here sets them apart.'], [3, 'How long would we be without a kitchen?'], [2, 'Too vague for me.']],
  better: [[5, 'A real kitchen near me, and I can walk through it. Yes.'], [4, 'Saturday works, and it is free. I would go.'], [4, 'One visit to see their work. Easy.'], [3, 'Seeing it in person helps. I am still careful.'], [5, 'Before and after in real life? Sign me up.'], [4, 'A good way to compare them to the others.'], [4, 'I can ask how they kept the family cooking.'], [3, 'Maybe, if it is on my way.']] };
const WEAK = /Come see a kitchen we just finished|Let us know if you have questions/;
const LEAD = { first: [[1, 'I hate this. It says nothing.'], [2, 'Generic. Feels automated.'], [2, 'Who is this from?'], [1, 'Delete.'], [3, 'Polite, I guess.'], [2, 'No reason to answer.'], [2, 'Feels like a form letter.'], [2, 'Nothing about my kitchen.']],
  better: [[5, 'I\'d reply to this email.'], [4, 'Warm, and it asks one clear question.'], [5, 'They read what I wrote. Calling them.'], [4, 'Short and real. I\'d answer.'], [5, 'Yes. Spring works for me.'], [4, 'Better than the other two builders.'], [4, 'I like that I can just call.'], [4, 'Clear. I\'d reply.']] };
function ai(b) {
  const f = b.output_config && b.output_config.format, props = f ? f.schema.properties : {}, p = b.messages[0].content;
  if (props.question && props.people) return { text: { question: /DEPARTMENT: "Leads"/.test(p) ? 'Would you reply to this email?' : /Instagram/.test(p) ? 'Would you stop scrolling for this?' : 'Would you come to see this kitchen?', people: PEOPLE.map(([name, who]) => ({ name, who })) } };
  if (props.reactions) { const lead = /Dana/.test(p), r = /Let us know if you have questions/.test(p) ? LEAD.first : lead ? LEAD.better : WEAK.test(p) ? REACT.first : REACT.better; return { text: { reactions: PEOPLE.map(([name], i) => ({ name, said: r[i][1], score: r[i][0] })) } }; }
  if (props.query) return { text: { name: 'Crypto Desk', does: 'Paper-trade a small test portfolio and send me a weekly report. Paper only: no real trades, never advice.', audience: 'Me', query: 'crypto paper trading' } };
  if (props.queries) return { text: { queries: ['google review requests', 'review reply playbook'] } };
  if (props.score) return { text: { score: /PRACTICE|plan/i.test(p) ? 88 : 84, pass: true, notes: 'Clear, warm and on brand. Nothing invented.' } };
  if (props.posts) return { text: { posts: [
    { platform: 'Instagram', text: 'Same walls. Whole new kitchen. This 1970s galley in Crestview now opens to the dining room, with quartz counters and a window over the sink.\n\n#AustinRemodel #KitchenRemodel #BeforeAndAfter', photo: 'The finished kitchen from the dining room, morning light' },
    { platform: 'Facebook', text: 'Thinking about a kitchen this spring? Our March calendar is open. Tell us what you want to change and we will tell you what it takes.', photo: 'Sam measuring a counter run' },
    { platform: 'Instagram', text: 'Three things people ask us first: how long, how messy, and can we still cook. Answers in our story today.\n\n#AustinHomes #KitchenDesign', photo: 'A temporary kitchen set up in a garage' }] } };
  if (props.kind) return { text: { kind: 'lead', summary: 'Kitchen remodel enquiry', lead: { name: 'Dana Ruiz', email: 'dana@example.com', phone: '512 555 0100', wants: 'A kitchen remodel this spring, opening the wall to the dining room' } } };
  if (/WHAT TO CHANGE/.test(p) && /Dana/.test(p)) return { text: 'Hi Dana,\n\nThank you for reaching out about your kitchen. Opening the wall to the dining room is one of our favorite projects.\n\nWhen would you like the work to start?\n\nI am happy to talk it through on a quick call: 512 555 0199.\n\nSam Lee\nSam\'s Kitchens\n512 555 0199' };
  if (/THE CUSTOMER/.test(p)) return { text: 'Hi Dana,\n\nThanks for your interest. Let us know if you have questions.\n\nSam' };
  if (/WHAT TO CHANGE/.test(p)) return { text: 'This Saturday from 10 to 2, walk through a finished kitchen remodel in Crestview. See the wall we opened, the quartz, and how we kept the family cooking during the work. Free, no sign-up. 4410 Shoal Creek Blvd.' };
  if (/THE CUSTOMER_UNUSED/.test(p)) return { text: 'Hi Dana,\n\nThank you for reaching out about your kitchen. Opening the wall to the dining room is one of our favorite projects.\n\nWhen would you like the work to start?\n\nI am happy to talk it through on a quick call: 512 555 0199.\n\nSam Lee\nSam\'s Kitchens\n512 555 0199' };
  if (/You vet new tools/.test(b.system || '')) return { text: 'Real and kept up: changed last month, 1,840 stars, MIT licence.\nWhat it does: request and reply templates for customer reviews.\nGood at: short, friendly asks. Bad at: nothing local.\nNo safety or licence problems.\nVERDICT: SAFE' };
  if (/habit that made your work score best/.test(p)) return { text: 'Answer every new lead within five minutes, and ask them one clear question.' };
  if (/Google reviews/.test(p)) return { text: '3 ideas for more reviews this week:\n1. Text the Hendersons today: their kitchen was finished Friday.\n2. Put a review card in the final walk-through folder.\n3. Reply to last month\'s two reviews so new ones see you answer.' };
  if (/open house/i.test(p)) return { text: 'Come see a kitchen we just finished. Open house this weekend.' };
  return { text: 'Hi [Name],\n\nThanks for your kind words. A review helps neighbours find us: it takes a minute.\n\nSam' };
}
// Jev, answering as Jev (the real one is a fast model on the Vercel AI Gateway; here a stand-in with the same questions and answers)
function jevAnswer(state, q) {
  const out = {};
  Object.keys(q).forEach(k => {
    if (k === 'kind') out[k] = { choice: 'customer', confidence: 0.94 };
    else if (k === 'real') out[k] = { noul: 0.12 };
    else if (k === 'effort') out[k] = { choice: /campaign|plan|strategy/i.test(state) ? 'high' : 'medium', confidence: 0.8 };
    else if (k === 'done') out[k] = { noul: 0.93 };
    else if (k === 'verdict') out[k] = { choice: /review/i.test(state) ? 'ship' : 'none', confidence: 0.74 };
    else if (k === 'dept') out[k] = { choice: Object.keys(q.dept.criteria).find(id => /review/i.test(q.dept.criteria[id])) || Object.keys(q.dept.criteria)[0], confidence: 0.86 };
    else if (/^c\d+$/.test(k) && /OPEN-SOURCE TOOLS/.test(state)) out[k] = { noul: k === 'c0' && /THE DEPARTMENT: Reviews/.test(state) ? 0.84 : 0.41 };
    else if (/^c\d+$/.test(k)) { const yes = WEAK.test(state) ? 58 : /Dana/.test(state) ? 74 : 69; out[k] = { noul: ((Number(k.slice(1)) * 37) % 96) < yes ? 0.8 : 0.3 }; }
    else if (k === 'base') out[k] = { noul: 0.7 };
    else if (q[k].type === 'noul') out[k] = { noul: 0.7 };
  });
  return out;
}
const fakeJev = { mode: () => 'jev', key: () => 'stand-in', keyFrom: () => 'settings', problem: () => null, note() {}, ask: async (s, q) => jevAnswer(s, q), real: async (s, q) => jevAnswer(s, q) };
// GitHub, as the School and the Research desk see it (made-up tools for a made-up business)
const REPOS = { 'paperdesk/crypto-paper-trader': 'Paper trading desk with weekly reports. No real orders.', 'opentools/review-requests': 'Prompts and playbooks for asking happy customers for reviews', 'homepro-ai/estimate-helper': 'Agent playbook for writing remodel estimates', 'localbiz/seo-checklist': 'A checklist agent for local search' };
async function gh(url) {
  const ok = (j, text) => ({ status: 200, ok: true, text: async () => text != null ? text : JSON.stringify(j) });
  if (/\/search\/repositories/.test(url)) return ok({ items: Object.keys(REPOS).filter(k => /crypto/.test(url) === /crypto/.test(k)).slice(0, 2).map((k, i) => ({ html_url: 'https://github.com/' + k, full_name: k, description: REPOS[k], stargazers_count: [1840, 610][i], archived: false })) });
  let m = /\/repos\/([^/]+)\/([^/?]+)$/.exec(url); if (m) return ok({ stargazers_count: 1840, pushed_at: '2026-09-20T10:00:00Z', archived: false, license: { spdx_id: 'MIT' }, description: REPOS[m[1] + '/' + m[2]] || 'A tool', default_branch: 'main' });
  if (/raw/.test(url) || /README/.test(url)) return ok(null, '# Review playbook\n\nAsk within a day of finishing. Keep it short. Thank them by name.');
  return { status: 404, ok: false, text: async () => '' };
}
async function vsample({ proposals = true } = {}) {
  const A = await fakeAnthropic(ai), G = await fakeGoogle({ messages: [{ id: 'm1', from: 'Website <forms@samskitchens.com>', subject: 'New enquiry from Dana Ruiz', text: 'Name: Dana Ruiz\nEmail: dana@example.com\nPhone: 512 555 0100\nMessage: We want a kitchen remodel this spring.' }] });
  const store = await Store.open({ memory: true });
  const aiObj = new AI({ store, env: {}, apiKey: () => 'k', baseURL: A.url });
  const city = new City({ store, ai: aiObj, jev: fakeJev, log: { error() {} },
    google: new Google({ store, clientId: () => 'cid.apps.googleusercontent.com', clientSecret: () => 's', api: G.url, tokenUrl: G.url + '/token', userinfoUrl: G.url + '/userinfo' }) });
  store.set('departments', []);
  aiObj.save({ provider: 'anthropic', key: 'sk-demo-not-a-real-key' });
  city.saveSettings({ business: "Sam's Kitchens", owner: 'Sam Lee', about: 'Kitchen remodels in Austin, TX. Free in-home estimates. Most kitchens take 6 to 8 weeks.', signature: "Sam Lee\nSam's Kitchens\n512 555 0199", dailyCap: 50 });
  store.set('google', { refresh: 'rt', email: 'sam@samskitchens.com' });
  const pick = k => Object.assign({}, PICKS.find(p => p.kind === k));
  const L = city.saveDepartment(Object.assign(pick('leads'), { audience: 'Austin homeowners who just asked about a remodel' }));
  const O = city.saveDepartment({ name: 'Open House', does: 'Write the invite for this weekend\'s open house at our finished Crestview kitchen (4410 Shoal Creek Blvd, Saturday 10 to 2, free).', audience: 'Austin homeowners thinking about a kitchen remodel', judge: true, every: 10080 });
  const I = city.saveDepartment(Object.assign(pick('social'), { name: 'Instagram', audience: 'Austin homeowners who follow home design accounts' }));
  const R = city.saveDepartment(Object.assign({}, PICKS.find(p => p.name === 'Reviews'), { judge: false }));
  city.saveDepartment(Object.assign({}, PICKS.find(p => p.name === 'Newsletter'), { on: false }));
  const M = city.saveDepartment(Object.assign(pick('mailroom'), { name: 'Mail Room' }));
  for (const d of [L, O, I, R]) await city.runAgent(d.id);
  city.ask(city.department(O.id), 'Should the invite mention parking on Shoal Creek?');
  // the Research desk and the School at work
  city.school = new School({ city, fetchImpl: gh }); city.research = new Research({ city, school: city.school, fetchImpl: gh });
  city.school.enroll('https://github.com/homepro-ai/estimate-helper/blob/main/agents/review-asker.md', { by: 'owner' });
  for (let i = 0; i < 4; i++) await city.school.step();   // orientation + 3 practice jobs: graduates into Reviews
  store.set('research', { next: 3, seen: [], day: '', n: 0 }); await city.research.run();   // Reviews' turn first: it finds review-requests and sends it to the School
  await city.school.step();                                // its orientation
  // last week's graded work: the grades rank the departments; the star shares a tip
  const past = (id, avg, status, n) => { for (let i = 0; i < n; i++) store.put('cards', 'past' + id + i, { id: 'past' + id + i, agent: id, kind: 'note', status, ts: 1000 + i, judged: { panel: { avg } } }); };
  past(L.id, 4.7, 'sent', 3); past(R.id, 4.1, 'approved', 2); past(I.id, 3.9, 'approved', 2); past(I.id, 3.4, 'declined', 1); past(O.id, 3.6, 'approved', 1);
  await city.starTip();
  if (proposals) { city.propose(M.id, { name: 'Bookkeeping', does: 'File every invoice and receipt each week, and tell me what is due.', audience: 'Me' }, '14 invoices came in this month and nobody files them.'); await city.askCity('Build me a crypto trading desk'); }
  const srv = createServer({ city, password: () => 'pw', publicUrl: () => '', log: { error() {} } }), base = await listen(srv);
  return { base, city, store, ids: { L: L.id, O: O.id, I: I.id, R: R.id, M: M.id }, close: () => { srv.close(); A.close(); G.close(); } };
}
module.exports = { vsample };
if (require.main === module) vsample().then(s => {
  console.log('cards:', s.city.waiting().map(c => c.agent.slice(0, 10) + ': ' + c.title.slice(0, 60)).join('\n  '));
  console.log('school:', JSON.stringify(s.city.school.state().students.map(x => [x.ref.slice(19, 60), x.step, x.scores, x.passed])));
  console.log('updates:', s.city.updates().slice(0, 6).map(u => u.agent.slice(0, 10) + ': ' + u.text.slice(0, 80)).join('\n  '));
  s.close();
});
