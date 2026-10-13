// One step to start: the website (no AI needed) fills in the business, the city builds its departments for the plan and moves its
// people in; each department then asks for the one thing it needs, once, as its lead, and the ask closes when the need is met.
const test = require('node:test'), assert = require('node:assert'), http = require('node:http');
const { Store } = require('../src/store');
const { AI } = require('../src/ai');
const { Google } = require('../src/google');
const { City } = require('../src/city');
const { listen } = require('./fakes');

const open = [];
test.after(() => open.forEach(f => f()));

test('type a website: the city builds itself, and each department asks for what it needs', async () => {
  const site = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html><head><title>Sam&#39;s Kitchens | Austin Remodels</title><meta name="description" content="Kitchen remodels in Austin since 2004."></head><body><h1>Sam&#39;s Kitchens</h1><p>Call 512 555 0199.</p></body></html>'); });
  const url = await listen(site); open.push(() => site.close());
  const store = await Store.open({ memory: true }), city = new City({ store, ai: new AI({ store, env: {} }), google: new Google({ store }), log: { error() {} } });
  city.publicSite = async () => true;   // the test site runs on this computer
  process.env.CITY_PLAN = 'starter'; process.env.LEADS_ADDRESS = 'c0123456789-abcdef0123@burnoff.app';
  try {
    await assert.rejects(city.quickStart({}), /Type your website, or your business name/);
    const r = await city.quickStart({ url });
    assert.deepStrictEqual([r.business, r.departments], ['Sam\'s Kitchens', ['Leads', 'Mail room']], 'Starter: Leads and Mail room, no AI needed to read the site');
    assert.strictEqual(city.settings().about, 'Kitchen remodels in Austin since 2004.'); assert.match(city.settings().signature, /512 555 0199/);
    const people = store.get('life').people; assert(people.length >= 4 + 6, 'crews and regulars moved in');
    assert(store.get('life').news.some(n => n.text === 'Sam\'s Kitchens opened. Everyone moved in.'));
    const asks = city.waiting().filter(c => c.kind === 'connect');
    assert.strictEqual(asks.length, 1, 'one of them asks for the AI, not every department');
    const lead = people.find(p => p.dept === city.byKind('leads').id).name.split(' ')[0];
    assert(asks.every(c => /I need a brain to think with/.test(c.title) && c.go === 'ai'), 'no AI yet: that is the first thing they ask for');
    assert(/^I'm \w+ from (Leads|Mail room)\./.test(asks[0].title)); void lead;
    city.connectAsks(); assert.strictEqual(city.waiting().filter(c => c.kind === 'connect').length, 1, 'asked once');
    // the AI is connected: those asks close, and Leads asks for the next thing, the forwarded leads
    city.ai.needs = () => '';
    city.connectAsks();
    const now = city.waiting().filter(c => c.kind === 'connect');
    assert(now.length === 2 && now.some(c => c.go === 'gmail' && /Forward your lead emails to c0123456789-abcdef0123@burnoff\.app/.test(c.body)) && now.some(c => /Let me sort your inbox/.test(c.title)), JSON.stringify(now.map(c => c.title)));
    const r2 = await city.quickStart({ business: 'Sam\'s Kitchens' }); assert.deepStrictEqual(r2.departments, ['Leads', 'Mail room'], 'running it again builds nothing twice');
  } finally { delete process.env.CITY_PLAN; delete process.env.LEADS_ADDRESS; }
});
