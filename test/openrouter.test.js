// Connect with OpenRouter: the owner signs in there, the city trades the one-time code (with its PKCE verifier) for a key,
// lists the models and picks a main model by itself. A bad code connects nothing.
const test = require('node:test'), assert = require('node:assert'), http = require('node:http'), crypto = require('node:crypto');
const { Store } = require('../src/store');
const { AI } = require('../src/ai');
const { listen } = require('./fakes');

test('Connect with OpenRouter: the code becomes a saved key and a main model; nothing to copy', async () => {
  const seen = [];
  const srv = http.createServer((req, res) => { let raw = ''; req.on('data', d => raw += d); req.on('end', () => {
    seen.push({ path: req.url, body: raw ? JSON.parse(raw) : null, auth: req.headers.authorization });
    const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.url === '/api/v1/auth/keys') { const b = JSON.parse(raw); const ok = b.code === 'good' && b.code_challenge_method === 'S256' && crypto.createHash('sha256').update(b.code_verifier).digest('base64url') === challenge; return send(ok ? 200 : 403, ok ? { key: 'sk-or-v1-test' } : { error: 'bad code' }); }
    if (req.url === '/api/v1/models') return send(200, { data: [{ id: 'google/gemini-3-flash', created: 3 }, { id: 'anthropic/claude-sonnet-5.5', created: 2 }, { id: 'openai/gpt-5', created: 1 }] });
    send(404, {}); }); });
  const url = await listen(srv), store = await Store.open({ memory: true });
  const ai = new AI({ store, env: {}, bases: { openrouter: url + '/api/v1' } });
  const link = ai.openRouterLink('https://my-city.up.railway.app/connect/openrouter/done/abc');
  const u = new URL(link.url), challenge = u.searchParams.get('code_challenge');
  assert.deepStrictEqual([u.origin + u.pathname, u.searchParams.get('callback_url'), u.searchParams.get('code_challenge_method')], ['https://openrouter.ai/auth', 'https://my-city.up.railway.app/connect/openrouter/done/abc', 'S256']);
  await assert.rejects(ai.openRouterKey('stale', link.verifier), /did not hand over a key/);
  assert.strictEqual(ai.conf().key, '', 'a bad code connects nothing');
  assert.strictEqual(await ai.openRouterKey('good', link.verifier), 'anthropic/claude-sonnet-5.5', 'Claude Sonnet is picked as the main model');
  const c = ai.conf();
  assert.deepStrictEqual([c.provider, c.key, c.model, ai.needs()], ['openrouter', 'sk-or-v1-test', 'anthropic/claude-sonnet-5.5', '']);
  assert.strictEqual(seen.find(x => x.path === '/api/v1/models').auth, 'Bearer sk-or-v1-test', 'the new key lists the models');
  srv.close(); srv.closeAllConnections();
});
