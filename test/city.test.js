const test = require('node:test'), assert = require('node:assert');
const { Store } = require('../src/store');
const { AI, CityError } = require('../src/ai');
const { Google } = require('../src/google');
const { City, PICKS } = require('../src/city');
const pick = (kind, x) => Object.assign({}, PICKS.find(p => p.kind === kind), { judge: false }, x || {});
const guide = require('../src/guide');
const { fakeAnthropic, fakeGoogle, draftText } = require('./fakes');

const LEAD = { id: 'm1', from: 'Website <notifications@mysite.com>', subject: 'New enquiry from Dana Ruiz', text: 'Name: Dana Ruiz\nEmail: dana@example.com\nPhone: 512 555 0100\nMessage: We want a kitchen remodel this spring.' };
const ASK = { id: 'm2', from: 'Pat Lee <pat@example.com>', subject: 'Lunch Thursday?', text: 'Are you free for lunch Thursday?', threadId: 't2' };
const NEWS = { id: 'm3', from: 'Shop <news@shop.com>', subject: 'Big sale', text: 'Everything is on sale this week.' };
// The fake AI: sorts by what the email says, writes short drafts, three posts, and rewrites on feedback.
const answer = b => {
  const fmt = b.output_config && b.output_config.format, prompt = b.messages[0].content;
  if (fmt && fmt.schema.properties.kind) {
    if (/kitchen remodel/.test(prompt)) return { text: { kind: 'lead', summary: 'Kitchen remodel enquiry', lead: { name: 'Dana Ruiz', email: 'dana@example.com', phone: '512 555 0100', wants: 'A kitchen remodel this spring' } } };
    if (/lunch/i.test(prompt)) return { text: { kind: 'needs_reply', summary: 'Lunch invite', lead: { name: '', email: '', phone: '', wants: '' } } };
    return { text: { kind: 'newsletter', summary: 'A sale', lead: { name: '', email: '', phone: '', wants: '' } } };
  }
  if (fmt && fmt.schema.properties.posts) return { text: { posts: [1, 2, 3].map(i => ({ platform: 'Instagram', text: 'Post ' + i + ' #kitchens', photo: 'A finished kitchen' })) } };
  if (/WHAT THE OWNER WANTS CHANGED/.test(prompt)) return { text: 'Hi Dana,\n\nShorter version.\n\nSam' };
  if (/THE CUSTOMER/.test(prompt)) return { text: 'Hi Dana,\n\nThanks for reaching out about your kitchen. When would you like to start?\n\nSam' };
  return { text: 'Hi Pat,\n\nThursday works.\n\nSam' };
};
const open = [];
test.after(() => open.forEach(f => f()));   // a failed test never leaves a fake server running
async function setup({ messages = [LEAD, ASK, NEWS], ai = answer } = {}) {
  const A = await fakeAnthropic(ai), G = await fakeGoogle({ messages: JSON.parse(JSON.stringify(messages)) });
  open.push(A.close, G.close);
  const store = await Store.open({ memory: true }), pushed = [];
  const city = new City({ store, ai: new AI({ store, env: {}, apiKey: () => 'test-key', baseURL: A.url }), log: { error() {} },
    google: new Google({ store, clientId: () => 'cid', clientSecret: () => 'sec', api: G.url, tokenUrl: G.url + '/token', userinfoUrl: G.url + '/userinfo' }),
    push: { notify: async m => { pushed.push(m); return 1; } } });
  city.saveSettings({ business: 'Sam\'s Kitchens', owner: 'Sam', about: 'Kitchen remodels in Austin.', signature: 'Sam\nSam\'s Kitchens\n512 555 0199' });
  store.set('google', { refresh: 'rt', email: 'owner@example.com' });
  store.set('departments', []);   // a new city: the owner builds each department
  const L = city.saveDepartment(pick('leads')), M = city.saveDepartment(pick('mailroom'));
  return { A, G, store, city, pushed, L, M, close: () => { A.close(); G.close(); } };
}

test('the AI layer: the chosen model and effort, safety fallbacks, the spend meter, the daily cap and plain-English errors', async () => {
  const t = await setup();
  const r = await t.city.ai.ask({ system: 's', prompt: 'hello', model: 'claude-opus-5-5', effort: 'medium' });
  const c = t.A.calls[0];
  assert.strictEqual(r, 'Hi Pat,\n\nThursday works.\n\nSam');
  assert.deepStrictEqual([c.body.model, c.body.output_config.effort, c.body.fallbacks, c.headers['anthropic-beta']], ['claude-opus-5-5', 'medium', 'default', 'server-side-fallback-2026-07-01']);
  assert.strictEqual(c.headers['x-api-key'], 'test-key');
  await t.city.ai.ask({ system: 's', prompt: 'hello', model: 'claude-haiku-4-5' });
  assert.deepStrictEqual([t.A.calls[1].body.model, t.A.calls[1].body.output_config, t.A.calls[1].body.fallbacks], ['claude-haiku-4-5', undefined, undefined], 'Haiku: no effort, no fallbacks');
  assert(Math.abs(t.city.ai.spentToday() - ((1000 * 4 + 200 * 20) + (1000 * 1 + 200 * 5)) / 1e6) < 1e-9, 'metered: ' + t.city.ai.spentToday());
  t.city.saveSettings({ dailyCap: 0.5 }); t.store.set('spend', { day: new Date().toISOString().slice(0, 10), usd: 0.5 });
  await assert.rejects(t.city.ai.ask({ system: 's', prompt: 'x' }), e => e.code === 'budget');
  t.close();
  for (const [res, code] of [[{ status: 401, type: 'authentication_error', error: 'invalid x-api-key' }, 'ai_key_wrong'], [{ status: 400, error: 'Your credit balance is too low to access the Anthropic API.' }, 'ai_credit'], [{ refusal: true }, 'refusal'], [{ status: 404, type: 'not_found_error', error: 'model' }, 'ai_model']]) {
    const u = await setup({ ai: () => res });
    await assert.rejects(u.city.ai.ask({ system: 's', prompt: 'x' }), e => e instanceof CityError && e.code === code, code);
    u.close();
  }
  const store = await Store.open({ memory: true });
  await assert.rejects(new AI({ store, env: {}, apiKey: () => '' }).ask({ system: 's', prompt: 'x' }), e => e.code === 'no_ai_key');
});

test('the inbox: each new email is sorted and labeled; a lead and a question get drafts on cards; nothing is sent', async () => {
  const t = await setup(); t.city.saveSettings({ alerts: 'leads' });
  const said = await t.city.runAgent(t.L.id);
  assert.strictEqual(said, 'Looked at 3 new emails, drafted 2 replies');
  const cards = t.city.waiting(), lead = cards.find(c => c.kind === 'lead'), mail = cards.find(c => c.kind === 'email');
  assert.strictEqual(cards.length, 2);
  assert.deepStrictEqual([lead.agent === t.L.id, lead.lead.name, lead.lead.email, lead.lead.phone, lead.email.to, lead.email.subject], [true, 'Dana Ruiz', 'dana@example.com', '512 555 0100', 'dana@example.com', 'Sam\'s Kitchens'], 'a form notice: a new email to the customer, not to the form robot');
  assert(!lead.email.threadId || /^new/.test(lead.email.threadId), 'not on the robot\'s thread');
  assert.deepStrictEqual([mail.agent === t.M.id, mail.email.to, mail.email.subject, mail.email.threadId], [true, 'pat@example.com', 'Re: Lunch Thursday?', 't2'], 'a question: a reply on its thread');
  const d = draftText(t.G.drafts[mail.email.draftId].raw);
  assert(/In-Reply-To: <m2@mail>/.test(d.head) && d.body === 'Hi Pat,\n\nThursday works.\n\nSam', 'threaded reply draft: ' + d.head);
  assert.strictEqual(t.G.sent.length, 0, 'nothing sent without Approve');
  const labels = Object.fromEntries(t.G.labels.map(l => [l.id, l.name]));
  assert.deepStrictEqual(t.G.modified.map(x => x.add.map(i => labels[i]).join()), ['City/Seen,City/Lead', 'City/Seen,City/Needs reply', 'City/Seen,City/Newsletters']);
  assert(t.G.labels.some(l => l.name === 'City'), 'the parent label exists, so Gmail nests them');
  assert(/Sorted "Big sale" as Newsletters/.test(t.city.updates().map(u => u.text).join('\n')));
  assert.deepStrictEqual(t.pushed.map(p => [p.title, p.url]), [['New lead: reply is ready', '/#' + t.L.id + '/card/' + lead.id]], 'with alerts on New leads only, only leads buzz the phone');
  // the next run looks at nothing again
  assert.strictEqual(await t.city.runAgent(t.M.id), 'No new email.');
  // the system prompt carries the business notes and the never-invent rule
  const draftCall = t.A.calls.find(c => /THE CUSTOMER/.test(c.body.messages[0].content));
  assert(/Kitchen remodels in Austin/.test(draftCall.body.system) && /never invent prices/.test(draftCall.body.system) && /Sam's Kitchens\n512 555 0199/.test(draftCall.body.system));
  t.close();
});

test('Approve sends once, Decline never sends, Needs feedback rewrites the Gmail draft', async () => {
  const t = await setup();
  await t.city.runAgent(t.L.id);
  const lead = t.city.waiting().find(c => c.kind === 'lead'), mail = t.city.waiting().find(c => c.kind === 'email');
  const fb = await t.city.feedback(lead.id, 'Make it shorter');
  assert.strictEqual(fb.email.body, 'Hi Dana,\n\nShorter version.\n\nSam');
  assert.strictEqual(draftText(t.G.drafts[lead.email.draftId].raw).body, 'Hi Dana,\n\nShorter version.\n\nSam', 'the Gmail draft itself changed');
  const r = await t.city.decide(lead.id, 'approve');
  assert.deepStrictEqual([r.status, t.G.sent.length, t.G.sent[0].id], ['sent', 1, lead.email.draftId]);
  await assert.rejects(t.city.decide(lead.id, 'approve'), /already decided/);
  assert.strictEqual(t.G.sent.length, 1, 'never twice');
  await t.city.decide(mail.id, 'decline');
  assert.strictEqual(t.G.sent.length, 1, 'Decline sends nothing');
  assert(/stays in your Gmail drafts/.test(t.city.updates()[0].text));
  // the same customer writing again later is not drafted twice
  t.G.messages.m9 = Object.assign({}, LEAD, { id: 'm9' });
  await t.city.runAgent(t.L.id);
  assert(/Skipped a repeat from dana@example.com/.test(t.city.updates().map(u => u.text).join('\n')));
  t.close();
});

test('the Guide: a failure becomes one How to fix it card with exact steps, closed again once it works', async () => {
  const t = await setup();
  t.city.redirect = 'https://my-city.up.railway.app/connect/google/callback';
  t.G.gmailError = { status: 403, body: { error: { code: 403, message: 'Gmail API has not been used in project 123 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=123 then retry.', status: 'PERMISSION_DENIED' } } };
  await assert.rejects(t.city.runAgent(t.L.id), e => e.code === 'gmail_api_off');
  await assert.rejects(t.city.runAgent(t.L.id), e => e.code === 'gmail_api_off');
  const fixes = t.city.waiting().filter(c => c.kind === 'fix');
  assert.strictEqual(fixes.length, 1, 'one card per problem');
  assert.strictEqual(fixes[0].title, 'Turn on the Gmail API');
  assert.strictEqual(fixes[0].steps[0], 'Open this link: https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=123');
  const list = guide.checks(t.city, { redirect: t.city.redirect });
  assert.strictEqual(list.find(c => c.id === 'google').ok, false);
  t.G.gmailError = null;
  await t.city.runAgent(t.L.id);
  assert.strictEqual(t.city.waiting().filter(c => c.kind === 'fix').length, 0, 'fixed: the card closes');
  assert(/Fixed: Turn on the Gmail API/.test(t.city.updates().map(u => u.text).join('\n')));
  // Google ended the connection (Testing mode, 7 days): the steps say how to stop it for good
  t.city.google.access = null; t.G.tokenError = 'invalid_grant';
  await assert.rejects(t.city.runAgent(t.L.id), e => e.code === 'google_expired');
  assert(/Publish app/.test(t.city.waiting().find(c => c.kind === 'fix').steps.join(' ')));
  t.close();
});

test('the Guide checklist and Ask the guide work even before anything is set up', async () => {
  const store = await Store.open({ memory: true });
  const city = new City({ store, ai: new AI({ store, env: {}, apiKey: () => '' }), google: new Google({ store, clientId: () => '', clientSecret: () => '' }), log: { error() {} } });
  const redirect = 'https://my-city.up.railway.app/connect/google/callback';
  assert.deepStrictEqual(city.departments(), [], 'a new city starts with no departments: no leads, no mail room');
  assert.deepStrictEqual(guide.checks(city, { redirect }).map(c => [c.id, c.ok]), [['business', false], ['ai', false], ['db', true], ['departments', false], ['budget', true]], 'no Gmail step until a department needs it');
  const L = city.saveDepartment(pick('leads')), S = city.saveDepartment(pick('social'));
  const list = guide.checks(city, { redirect });
  assert.deepStrictEqual(list.map(c => [c.id, c.ok]), [['business', false], ['ai', false], ['db', true], ['departments', true], ['google', false], ['budget', true]]);
  const g = list.find(c => c.id === 'google');
  assert.strictEqual(g.fix.code, 'gmail_connect', 'the easy way first: an app password');
  assert(g.fix.steps.some(s => /myaccount\.google\.com\/apppasswords/.test(s)), 'where to make the app password');
  assert(guide.fixFor('google_no_client', { redirect }).steps.some(s => s === 'Under Authorized redirect URIs, click Add URI and paste exactly: ' + redirect), 'the advanced way still has the exact address to paste');
  const a = await guide.ask(city, 'How do I start?', { redirect });
  assert.strictEqual(a.by, 'checklist');
  assert(/Tell the city about your business:\n1\. Open Settings\.[\s\S]*Choose your AI and add its key:\n1\. Easiest: open Settings, then Your AI, and press Connect with OpenRouter\./.test(a.answer), a.answer);
  assert.deepStrictEqual(city.agents().find(x => x.id === L.id).blockedBy, 'your business details', 'business details come first: nothing generic gets written');
  await assert.rejects(city.runAgent(S.id), e => e.code === 'no_business');
  city.saveSettings({ business: 'Sam\'s Kitchens' });
  assert.deepStrictEqual(city.agents().find(x => x.id === L.id).blockedBy, 'your AI key');
  await assert.rejects(city.runAgent(L.id), e => e.code === 'no_ai_key');
  // with an AI key, Ask the guide answers from SETUP.md and the checklist
  const A = await fakeAnthropic(() => ({ text: '1. Open Settings.\n2. Press Connect Google.' })); open.push(A.close);
  const city2 = new City({ store, ai: new AI({ store, env: {}, apiKey: () => 'k', baseURL: A.url }), google: new Google({ store, clientId: () => 'c', clientSecret: () => 's' }), log: { error() {} } });
  const b = await guide.ask(city2, 'How do I connect Gmail?', { redirect });
  assert.deepStrictEqual([b.by, b.answer], ['ai', '1. Open Settings.\n2. Press Connect Google.']);
  assert(/SETUP GUIDE:\n# /.test(A.calls[0].body.messages[0].content) && /PROBLEM: Connect your Gmail/.test(A.calls[0].body.messages[0].content), 'it reads the setup guide and the checklist');
  assert(/Never ask for or repeat a key or password/.test(A.calls[0].body.system));
  A.close();
});

test('social posts and your own departments make cards; the clock runs what is due and stops at the budget', async () => {
  const t = await setup({ messages: [] });
  const S = t.city.saveDepartment(pick('social', { name: 'Instagram' }));
  assert.strictEqual(await t.city.runAgent(S.id), 'Wrote 3 posts for you to look over.');
  const posts = t.city.waiting().filter(c => c.kind === 'post');
  assert.deepStrictEqual(posts.map(p => p.body), ['Post 1 #kitchens', 'Post 2 #kitchens', 'Post 3 #kitchens']);
  await t.city.decide(posts[0].id, 'approve');
  assert(t.city.updates()[0].text2 === 'Post 1 #kitchens', 'an approved post is kept to copy');
  const c = t.city.saveDepartment({ name: 'Weekly ideas', does: 'Give me 3 ideas to get more reviews.', every: 10080, model: 'claude-sonnet-5-5' });
  assert(/^d-/.test(c.id) && c.kind === 'own' && t.city.agents().some(a => a.id === c.id && a.name === 'Weekly ideas' && a.model === 'claude-sonnet-5-5' && a.every === 10080));
  assert.throws(() => t.city.saveDepartment({ name: 'Empty', does: ' ' }), /Say what it should do/);
  assert.throws(() => t.city.saveDepartment(pick('leads')), /You already have a Leads department/);
  // the clock: everything is due on the first tick
  const before = t.A.calls.length;
  await t.city.tick();
  assert(t.city.waiting().some(x => x.agent === c.id && x.kind === 'note'), 'your agent made a card');
  assert(t.A.calls.length > before);
  const n = t.A.calls.length; await t.city.tick(); assert.strictEqual(t.A.calls.length, n, 'nothing is due again right away');
  t.store.set('ticks', {}); t.store.set('spend', { day: new Date().toISOString().slice(0, 10), usd: 99 });
  await t.city.tick(); assert.strictEqual(t.A.calls.length, n, 'over the budget: nothing runs');
  assert(t.city.waiting().some(x => x.kind === 'fix' && x.code === 'budget'), 'and the Guide says so');
  // turning agents on and off
  t.city.setAgent(S.id, { on: false }); assert.strictEqual(t.city.agentOn(S.id), false);
  t.city.setAgent('guide', { on: false }); assert.strictEqual(t.city.agentOn('guide'), true, 'the Guide is always on');
  t.close();
});

test('a form notice that carries the customer as Reply-To still gets a fresh email; a refused fallback option is dropped and the call goes again', async () => {
  const FORM = { id: 'm5', from: 'Site Forms <notifications@forms.example>', replyTo: 'Dana Ruiz <dana@example.com>', subject: 'New enquiry from Dana', text: 'kitchen remodel please' };
  const t = await setup({ messages: [FORM] });
  await t.city.runAgent(t.L.id);
  const lead = t.city.waiting().find(c => c.kind === 'lead');
  assert.deepStrictEqual([lead.email.to, lead.email.subject, !!lead.email.inReplyTo], ['dana@example.com', 'Sam\'s Kitchens', false], 'not "Re: New enquiry", not on the notice thread');
  t.close();
  let n = 0;
  const u = await setup({ ai: b => (++n === 1 && b.fallbacks ? { status: 400, error: 'fallbacks: not available for this account' } : { text: 'second try' }) });
  assert.strictEqual(await u.city.ai.ask({ system: 's', prompt: 'x' }), 'second try');
  assert.deepStrictEqual([u.A.calls.length, u.A.calls[1].body.fallbacks, u.A.calls[1].headers['anthropic-beta']], [2, undefined, undefined]);
  u.close();
});
