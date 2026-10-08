// Your accounts: connect LinkedIn or Facebook, and an approved post goes live there; a failed post keeps the card waiting.
const test = require('node:test'), assert = require('node:assert');
const { Store } = require('../src/store');
const { AI } = require('../src/ai');
const { Google } = require('../src/google');
const { City } = require('../src/city');
const { Social, littleText } = require('../src/social');

const env = { LINKEDIN_CLIENT_ID: 'li', LINKEDIN_CLIENT_SECRET: 'lis', FACEBOOK_APP_ID: 'fb', FACEBOOK_APP_SECRET: 'fbs' };
function fakeNets(calls, { failPost = false } = {}) {
  return async (url, o = {}) => {
    calls.push([url, o]); const ok = j => ({ ok: true, status: 200, text: async () => JSON.stringify(j) });
    if (/linkedin.com\/oauth\/v2\/accessToken/.test(url)) return ok({ access_token: 'LT', expires_in: 5184000 });
    if (/v2\/userinfo/.test(url)) return ok({ sub: 'abc', name: 'Ray Ramos' });
    if (/rest\/posts/.test(url)) return failPost ? { ok: false, status: 403, text: async () => '{"message":"Not enough permissions"}' } : { ok: true, status: 201, text: async () => '' };
    if (/oauth\/access_token\?.*fb_exchange_token/.test(url)) return ok({ access_token: 'FLONG' });
    if (/oauth\/access_token/.test(url)) return ok({ access_token: 'FSHORT' });
    if (/me\/accounts/.test(url)) return ok({ data: [{ id: 'P1', name: 'Ray Page', access_token: 'PT' }] });
    if (/P1\/feed/.test(url)) return ok({ id: 'P1_9' });
    return { ok: false, status: 404, text: async () => '{}' };
  };
}
async function setup(opts) {
  const store = await Store.open({ memory: true }), calls = [];
  const social = new Social({ store, env, fetchImpl: fakeNets(calls, opts), now: () => Date.parse('2026-10-08T12:00:00Z') });
  const city = new City({ store, ai: new AI({ store, env: {} }), google: new Google({ store }), log: { error() {} } });
  city.accounts = social; store.set('departments', []);
  const D = city.saveDepartment({ kind: 'social', name: 'LinkedIn', does: 'Write posts.' });
  return { store, calls, social, city, D };
}

test('LinkedIn text escapes the characters that would cut a post short', () => {
  assert.strictEqual(littleText('Hi (team) #CRNA @you'), 'Hi \\(team\\) \\#CRNA \\@you');
});

test('connect LinkedIn and Facebook, never show a token, and post on Approve', async () => {
  const t = await setup();
  assert.match(t.social.authUrl('linkedin', 'https://c/connect/linkedin/callback', 's1'), /linkedin\.com\/oauth\/v2\/authorization\?.*client_id=li.*w_member_social/);
  assert.strictEqual(await t.social.finish('linkedin', 'code', 'https://c/cb'), 'Ray Ramos');
  assert.strictEqual(await t.social.finish('facebook', 'code', 'https://c/cb'), 'Ray Page');
  const st = JSON.stringify(t.social.state());
  assert(!/LT|PT|FLONG/.test(st) && /Ray Ramos/.test(st), 'Settings never sees a token');
  const c = t.city.addCard({ agent: t.D.id, kind: 'post', title: 'LinkedIn: Your team is watching', body: 'Own it (fast). #Leadership', actions: ['approve', 'decline'] });
  const r = await t.city.decide(c.id, 'approve');
  assert.match(r.said, /Posted on LinkedIn/);
  const post = t.calls.find(x => /rest\/posts/.test(x[0]));
  assert.strictEqual(JSON.parse(post[1].body).author, 'urn:li:person:abc');
  assert.strictEqual(JSON.parse(post[1].body).commentary, 'Own it \\(fast\\). \\#Leadership');
  assert(!t.calls.some(x => /P1\/feed/.test(x[0])), 'a LinkedIn post does not go to Facebook');
  assert.deepStrictEqual(t.store.doc('cards', c.id).posted, ['LinkedIn']);
});

test('a post that fails keeps its card waiting; nothing connected means it is only saved', async () => {
  const t = await setup({ failPost: true });
  const c1 = t.city.addCard({ agent: t.D.id, kind: 'post', title: 'LinkedIn: one', body: 'One', actions: ['approve', 'decline'] });
  assert.match((await t.city.decide(c1.id, 'approve')).said, /Saved/);
  await t.social.finish('linkedin', 'code', 'https://c/cb');
  const c2 = t.city.addCard({ agent: t.D.id, kind: 'post', title: 'LinkedIn: two', body: 'Two', actions: ['approve', 'decline'] });
  await assert.rejects(t.city.decide(c2.id, 'approve'), /Not enough permissions/);
  assert.strictEqual(t.store.doc('cards', c2.id).status, 'waiting');
});
