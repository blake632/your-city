// Any AI as the driver (Claude, ChatGPT, Gemini, OpenRouter, any OpenAI-style service), and a city that needs no Railway variables:
// the first visit chooses the password, and the AI key and the Google client are pasted in Settings.
const test = require('node:test'), assert = require('node:assert');
const { Store } = require('../src/store');
const { AI } = require('../src/ai');
const { Google } = require('../src/google');
const { City, PICKS } = require('../src/city');
const { createServer } = require('../src/server');
const { fakeOpenAI, fakeGoogle, listen } = require('./fakes');

const open = [];
test.after(() => open.forEach(f => f()));
const SORT = b => { const f = b.output_config && b.output_config.format, p = b.messages[0].content;
  if (f && f.schema.properties.kind) return /kitchen/.test(p) ? { text: { kind: 'lead', summary: 'Kitchen', lead: { name: 'Dana Ruiz', email: 'dana@example.com', phone: '', wants: 'A kitchen' } } } : { text: { kind: 'newsletter', summary: 'Sale', lead: { name: '', email: '', phone: '', wants: '' } } };
  return { text: 'Hi Dana,\n\nThanks for reaching out.\n\nSam' }; };

test('ChatGPT-style services: the key, the model, the token limit, a JSON answer, the meter, and the model list', async () => {
  const O = await fakeOpenAI(SORT, { models: ['gpt-test', 'text-embedding-3-small', 'whisper-1', 'gpt-mini'] }); open.push(O.close);
  const store = await Store.open({ memory: true }), ai = new AI({ store, env: {}, bases: { openai: O.url } });
  assert.strictEqual(ai.needs(), 'your AI key');
  ai.save({ provider: 'openai', key: 'sk-test' });
  assert.strictEqual(ai.needs(), 'your AI model', 'a key alone is not enough: which model?');
  assert.deepStrictEqual(await ai.models(), ['gpt-test', 'gpt-mini'], 'chat models only, newest first');
  ai.save({ provider: 'openai', model: 'gpt-test' });
  assert.strictEqual(ai.needs(), '');
  assert.strictEqual(await ai.ask({ system: 's', prompt: 'Write it' }), 'Hi Dana,\n\nThanks for reaching out.\n\nSam');
  const c = O.calls.find(x => x.url.endsWith('/chat/completions'));
  assert.deepStrictEqual([c.headers.authorization, c.body.model, c.body.max_completion_tokens, c.body.max_tokens, c.body.messages[0]], ['Bearer sk-test', 'gpt-test', 8000, undefined, { role: 'system', content: 's' }]);
  const sorted = await ai.ask({ system: 's', prompt: 'kitchen', schema: { type: 'object', additionalProperties: false, required: ['kind'], properties: { kind: { type: 'string' }, summary: { type: 'string' }, lead: { type: 'object' } } } });
  assert.strictEqual(sorted.kind, 'lead');
  assert.strictEqual(O.calls.filter(x => x.body.response_format).pop().body.response_format.json_schema.strict, true);
  assert(Math.abs(ai.spentToday() - 2 * (1000 * 3 + 200 * 15) / 1e6) < 1e-9, 'an unknown price is estimated: ' + ai.spentToday());
  assert.strictEqual(ai.modelFor(''), 'gpt-test'); assert.strictEqual(ai.modelFor('gpt-mini'), 'gpt-mini');
});

test('a service without JSON schemas gets the schema in the prompt; a fenced JSON answer still reads; errors become Guide steps', async () => {
  const O = await fakeOpenAI(b => ({ text: { kind: 'fyi' }, fence: true }), { reject: (b) => b.response_format ? { status: 400, error: 'response_format json_schema is not supported by this model' } : null }); open.push(O.close);
  const store = await Store.open({ memory: true }), ai = new AI({ store, env: {}, bases: { gemini: O.url } });
  ai.save({ provider: 'gemini', key: 'g-key', model: 'gemini-test' });
  const r = await ai.ask({ system: 's', prompt: 'x', schema: { type: 'object', additionalProperties: false, required: ['kind'], properties: { kind: { type: 'string' } } } });
  assert.deepStrictEqual(r, { kind: 'fyi' });
  const last = O.calls.pop();
  assert(/Reply with only one JSON object/.test(last.body.messages[1].content) && last.body.max_tokens === 8000 && !last.body.response_format, 'second try: schema in the prompt, max_tokens for non-OpenAI services');
  for (const [status, error, code] of [[401, 'Invalid API key', 'ai_key_wrong'], [429, 'You exceeded your current quota: insufficient_quota', 'ai_credit'], [402, 'Payment required', 'ai_credit'], [404, 'The model `x` does not exist', 'ai_model'], [429, 'Rate limit reached', 'ai_busy'], [503, 'overloaded', 'ai_down']]) {
    const E = await fakeOpenAI(() => ({ status, error })); open.push(E.close);
    const s2 = await Store.open({ memory: true }), a2 = new AI({ store: s2, env: {}, bases: { openrouter: E.url } }); a2.save({ provider: 'openrouter', key: 'k', model: 'm' });
    await assert.rejects(a2.ask({ system: 's', prompt: 'x' }), e => e.code === code, status + ' ' + error + ' -> ' + code);
  }
  const R = await fakeOpenAI(() => ({ refusal: true })); open.push(R.close);
  const s3 = await Store.open({ memory: true }), a3 = new AI({ store: s3, env: {}, bases: { openai: R.url } }); a3.save({ provider: 'openai', key: 'k', model: 'm' });
  await assert.rejects(a3.ask({ system: 's', prompt: 'x' }), e => e.code === 'refusal');
});

test('which AI: Settings win over variables; a variable alone picks its service; each service keeps its own key and model; your own service needs its address', async () => {
  const store = await Store.open({ memory: true });
  assert.deepStrictEqual([new AI({ store, env: { OPENAI_API_KEY: 'sk-var' } }).conf().provider, new AI({ store, env: { OPENAI_API_KEY: 'sk-var' } }).conf().keyFrom], ['openai', 'variable']);
  assert.strictEqual(new AI({ store, env: { GEMINI_API_KEY: 'g' } }).conf().provider, 'gemini');
  const ai = new AI({ store, env: { OPENAI_API_KEY: 'sk-var' } });
  ai.save({ provider: 'anthropic', key: 'sk-ant-saved' });
  assert.deepStrictEqual([ai.conf().provider, ai.conf().key, ai.conf().keyFrom, ai.conf().model], ['anthropic', 'sk-ant-saved', 'settings', 'claude-opus-5-5'], 'Claude starts on Opus 5.5');
  ai.save({ provider: 'anthropic', key: '' });
  assert.strictEqual(ai.conf().key, 'sk-ant-saved', 'a blank key keeps the saved one');
  ai.save({ provider: 'openrouter', key: 'or-key', model: 'some/model' }); ai.save({ provider: 'custom', key: 'c-key' });
  assert.deepStrictEqual([ai.conf().model, ai.needs()], ['', 'your AI service address'], 'a new service starts with no model');
  ai.save({ provider: 'openrouter' });
  assert.deepStrictEqual([ai.conf().key, ai.conf().model], ['or-key', 'some/model'], 'switching back keeps that service\'s key and model');
  ai.save({ provider: 'openai' });
  assert.deepStrictEqual([ai.conf().key, ai.conf().keyFrom, ai.needs()], ['sk-var', 'variable', 'your AI model'], 'a service with no saved key uses its variable');
  ai.save({ provider: 'custom' });
  ai.save({ provider: 'custom', baseUrl: 'https://api.example.ai/v1/', model: 'models/fast-1' });
  assert.deepStrictEqual([ai.conf().base, ai.conf().model, ai.needs()], ['https://api.example.ai/v1', 'fast-1', ''], 'the address is tidied; a "models/" prefix is dropped');
});

test('the whole inbox runs on a ChatGPT-style service just the same', async () => {
  const O = await fakeOpenAI(SORT), G = await fakeGoogle({ messages: [{ id: 'm1', from: 'Website <notifications@site.com>', subject: 'New enquiry', text: 'kitchen please, dana@example.com' }] }); open.push(O.close, G.close);
  const store = await Store.open({ memory: true }), ai = new AI({ store, env: {}, bases: { openai: O.url } });
  ai.save({ provider: 'openai', key: 'sk', model: 'gpt-test' });
  const city = new City({ store, ai, log: { error() {} }, google: new Google({ store, clientId: () => 'cid.apps.googleusercontent.com', clientSecret: () => 's', api: G.url, tokenUrl: G.url + '/token', userinfoUrl: G.url + '/userinfo' }) });
  city.saveSettings({ business: 'Sam\'s Kitchens' }); store.set('google', { refresh: 'rt', email: 'owner@example.com' });
  store.set('departments', []);
  const L = city.saveDepartment(Object.assign({}, PICKS.find(p => p.kind === 'leads'), { judge: false }));
  city.setAgent(L.id, { model: 'gpt-mini' });
  assert.strictEqual(await city.runAgent(L.id), 'Looked at 1 new email, drafted 1 reply');
  const lead = city.waiting()[0];
  assert.deepStrictEqual([lead.kind, lead.email.to, lead.email.body], ['lead', 'dana@example.com', 'Hi Dana,\n\nThanks for reaching out.\n\nSam']);
  assert.deepStrictEqual(O.calls.filter(c => c.url.endsWith('/chat/completions')).map(c => c.body.model), ['gpt-test', 'gpt-test', 'gpt-mini'], 'sorting and Jev\'s lead check on the main model, the lead reply on the Leads department\'s own model');
  assert.strictEqual(city.agents().find(a => a.id === L.id).ownModel, 'gpt-mini');
  city.setAgent(L.id, { model: 'main' }); assert.strictEqual(city.agents().find(a => a.id === L.id).ownModel, '');
});

test('no Railway variables: the first visit chooses the password; the AI key and the Google client go in through Settings and never come back out', async () => {
  const O = await fakeOpenAI(SORT); open.push(O.close);
  const store = await Store.open({ memory: true }), ai = new AI({ store, env: {}, bases: { openai: O.url } });
  const google = new Google({ store }), city = new City({ store, ai, google, log: { error() {} } });
  let railwayPw = '';
  const srv = createServer({ city, password: () => railwayPw, publicUrl: () => '', log: { error() {} } }), base = await listen(srv); open.push(() => srv.close());
  const post = (p, b, h) => fetch(base + p, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, h || {}), body: JSON.stringify(b || {}) });
  assert(/Choose the password that opens it/.test(await (await fetch(base + '/')).text()));
  assert.strictEqual((await fetch(base + '/api/state')).status, 401);
  assert.strictEqual((await post('/setup', { password: 'short' })).status, 400);
  const made = await post('/setup', { password: 'my long password' }), H = { cookie: made.headers.get('set-cookie').split(';')[0] };
  assert.strictEqual(made.status, 200);
  assert.strictEqual((await post('/setup', { password: 'someone else' })).status, 409, 'after the first, no one else can choose it');
  assert(/Enter your city password/.test(await (await fetch(base + '/')).text()));
  assert.strictEqual((await post('/login', { password: 'my long password' })).status, 200);
  assert(!JSON.stringify(store.get('owner')).includes('my long password'), 'kept only as a salted hash');
  // Your AI: save and test lists the models; the key never comes back
  const t1 = await (await post('/api/ai', { provider: 'openai', key: 'sk-very-secret' }, H)).json();
  assert.deepStrictEqual([t1.ok, t1.models, t1.needs], [true, ['gpt-test'], 'your AI model']);
  const t2 = await (await post('/api/ai', { provider: 'openai', model: 'gpt-test' }, H)).json();
  assert.deepStrictEqual([t2.ok, t2.needs], [true, '']);
  // a wrong key comes back as the Guide's steps for that service
  const B = await fakeOpenAI(() => ({ text: 'x' }), { keys: ['or-right'] }); open.push(B.close);
  ai.bases.openrouter = B.url;
  const bad = await (await post('/api/ai', { provider: 'openrouter', key: 'or-wrong' }, H)).json();
  assert.strictEqual(bad.ok, false, JSON.stringify(bad));
  assert.strictEqual(bad.fix.title, 'Your AI key is not working');
  assert(/openrouter\.ai, then Keys/.test(bad.fix.steps.join(' ')), JSON.stringify(bad.fix));
  assert.deepStrictEqual([ai.conf().provider, ai.conf().key, ai.conf().model], ['openai', 'sk-very-secret', 'gpt-test'], 'a key that does not work leaves the working setup in place');
  // the Google client
  assert.strictEqual((await post('/api/google/client', { id: 'not-an-id', secret: 'x' }, H)).status, 502, 'a wrong-looking ID is refused');
  assert.strictEqual((await post('/api/google/client', { id: '123-abc.apps.googleusercontent.com', secret: 'gsecret' }, H)).status, 200);
  assert(google.configured());
  const st = await (await fetch(base + '/api/state', { headers: H })).json();
  assert.deepStrictEqual([st.ai.provider, st.ai.keySet, st.ai.keyFrom, st.ai.model, st.googleClient.id, st.googleClient.secretSet, st.passwordFrom], ['openai', true, 'settings', 'gpt-test', '123-abc.apps.googleusercontent.com', true, 'app']);
  assert(!/sk-very-secret|gsecret|my long password/.test(JSON.stringify(st)), 'no key, secret or password in what the page gets');
  // changing the password
  assert.strictEqual((await post('/api/password', { current: 'wrong', next: 'another long one' }, H)).status, 400);
  const other = { cookie: (await post('/login', { password: 'my long password' })).headers.get('set-cookie').split(';')[0] };
  const changed = await post('/api/password', { current: 'my long password', next: 'another long one' }, H);
  assert.strictEqual(changed.status, 200);
  assert.strictEqual((await fetch(base + '/api/state', { headers: other })).status, 401, 'a new password signs out every other browser');
  assert.strictEqual((await fetch(base + '/api/state', { headers: { cookie: changed.headers.get('set-cookie').split(';')[0] } })).status, 200, 'the one that changed it stays in');
  assert.strictEqual((await post('/login', { password: 'my long password' })).status, 401);
  const last = { cookie: (await post('/login', { password: 'another long one' })).headers.get('set-cookie').split(';')[0] };
  assert.strictEqual((await fetch(base + '/api/state', { headers: last })).status, 200);
  // the rescue: if a stranger chose the password first, CITY_PASSWORD in Railway takes over and signs them out
  railwayPw = 'set in railway';
  assert.strictEqual((await fetch(base + '/api/state', { headers: last })).status, 401);
  assert.strictEqual((await post('/login', { password: 'another long one' })).status, 401);
  const rescued = await post('/login', { password: 'set in railway' }), R = { cookie: rescued.headers.get('set-cookie').split(';')[0] };
  assert.strictEqual(rescued.status, 200);
  assert.strictEqual((await post('/api/password', { current: 'set in railway', next: 'yet another one' }, R)).status, 400, 'a Railway password is changed in Railway');
});
