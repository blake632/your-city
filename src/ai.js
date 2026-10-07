// Every AI call the city makes goes through here. The owner picks the AI service (the "driver") in Settings, pastes its key there
// (or sets it as a variable), and picks a main model; each agent can use another model. Claude goes through Anthropic's official
// library; ChatGPT (OpenAI), Gemini (Google AI Studio), OpenRouter and any OpenAI-style service go through their standard
// chat/completions API. The day's spending cap, and errors turned into steps the Guide can explain, work the same for all of them.
// Keys are never printed, never sent to the page, and only ever sent to the AI service they belong to.
const AnthropicModule = require('@anthropic-ai/sdk');
const Anthropic = AnthropicModule.default || AnthropicModule;

// The Claude models, with prices in dollars per million tokens (in, out) for the spend meter.
const MODELS = {
  'claude-opus-5-5': { label: 'Claude Opus 5.5 (best writing)', in: 4, out: 20, effort: true, fallbacks: true },
  'claude-sonnet-5-5': { label: 'Claude Sonnet 5.5 (fast, half the price)', in: 2, out: 10, effort: true, fallbacks: true },
  'claude-haiku-4-5': { label: 'Claude Haiku 4.5 (cheapest)', in: 1, out: 5, effort: false, fallbacks: false },
};
const DEFAULT_MODEL = 'claude-opus-5-5';
// The AI services you can drive the city with. env: the variable a key may also come from. Where to get a key and add credit is
// what the Guide tells you. Prices for models outside Claude are not known here, so the meter uses a careful estimate.
const PROVIDERS = {
  anthropic: { name: 'Claude (Anthropic)', env: 'ANTHROPIC_API_KEY', keyAt: 'console.anthropic.com, then API Keys, then Create Key', billingAt: 'console.anthropic.com, then Billing' },
  openai: { name: 'ChatGPT models (OpenAI)', env: 'OPENAI_API_KEY', base: 'https://api.openai.com/v1', keyAt: 'platform.openai.com, then API keys, then Create new secret key', billingAt: 'platform.openai.com, then Settings, then Billing' },
  gemini: { name: 'Gemini (Google AI Studio)', env: 'GEMINI_API_KEY', base: 'https://generativelanguage.googleapis.com/v1beta/openai', keyAt: 'aistudio.google.com, then Get API key, then Create API key', billingAt: 'aistudio.google.com, then Billing' },
  openrouter: { name: 'Any model through OpenRouter', env: 'OPENROUTER_API_KEY', base: 'https://openrouter.ai/api/v1', keyAt: 'openrouter.ai, then Keys, then Create Key', billingAt: 'openrouter.ai, then Credits' },
  custom: { name: 'Another service that works like OpenAI (Groq, Together, Mistral, Ollama...)', env: 'AI_API_KEY', base: '', keyAt: 'your AI service\'s website, under API keys', billingAt: 'your AI service\'s billing page' },
};
const ESTIMATE = { in: 3, out: 15 };   // dollars per million tokens for models whose price the city does not know
const DEFAULT_CAP = 3;   // dollars a day, changeable in Settings

// An error the Guide knows how to explain: code is one of the keys in guide.js FIXES.
class CityError extends Error { constructor(code, message, detail) { super(message); this.name = 'CityError'; this.code = code; this.detail = detail || ''; } }
const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
const stripModel = id => String(id || '').replace(/^models\//, '');

class AI {
  // bases: test-only addresses per service. apiKey/baseURL: an Anthropic key and address (older setup, and tests).
  constructor({ store, env = process.env, apiKey = null, baseURL = null, bases = {}, fetchImpl = (...a) => fetch(...a), now = () => Date.now() } = {}) {
    this.store = store; this.env = env; this.apiKey = apiKey; this.bases = Object.assign({}, bases, baseURL ? { anthropic: baseURL } : {}); this.fetch = fetchImpl; this.now = now;
  }
  // The owner's AI setup: Settings first, then variables. Which service, its key, its address and the main model.
  // Settings keep a key and a model for each service, so switching back and forth never loses one.
  conf() {
    const a = this.store.get('ai', {}) || {}, env = this.env;
    let provider = PROVIDERS[a.provider] ? a.provider : '';
    if (!provider) provider = Object.keys(PROVIDERS).find(p => (env[PROVIDERS[p].env] || '').trim()) || 'anthropic';
    const p = PROVIDERS[provider], s = (a.by || {})[provider] || {};
    const fromVar = (env[p.env] || (provider === 'anthropic' && this.apiKey ? this.apiKey() || '' : '') || '').trim(), saved = String(s.key || '').trim();
    const base = (provider === 'custom' ? String(a.baseUrl || env.AI_BASE_URL || '') : this.bases[provider] || p.base || '').trim().replace(/\/+$/, '');
    const model = s.model || (provider === 'anthropic' ? DEFAULT_MODEL : '');
    return { provider, name: p.name, key: saved || fromVar, keyFrom: saved ? 'settings' : fromVar ? 'variable' : '', base, model, keyAt: p.keyAt, billingAt: p.billingAt };
  }
  // What is still missing before the AI can work: '' when ready.
  needs() { const c = this.conf(); return !c.key ? 'your AI key' : c.provider === 'custom' && !c.base ? 'your AI service address' : !c.model ? 'your AI model' : ''; }
  ready() { return !this.needs(); }
  // Save what the owner chose in Settings. A blank key keeps the saved one.
  save({ provider, key, baseUrl, model }) {
    const a = this.store.get('ai', {}) || {}, p = PROVIDERS[provider] ? provider : this.conf().provider;
    const by = Object.assign({}, a.by), s = Object.assign({}, by[p]);
    if (key && String(key).trim()) s.key = String(key).trim();
    if (model !== undefined) s.model = stripModel(model).trim();
    by[p] = s;
    return this.store.set('ai', { provider: p, baseUrl: p === 'custom' && baseUrl != null ? String(baseUrl).trim() : a.baseUrl || '', by });
  }
  // Every service as Settings shows it: its name, where to get a key, whether one is saved (never the key) and its model.
  services() {
    const by = (this.store.get('ai', {}) || {}).by || {};
    return Object.fromEntries(Object.entries(PROVIDERS).map(([k, p]) => {
      const s = by[k] || {}, saved = String(s.key || '').trim(), v = (this.env[p.env] || (k === 'anthropic' && this.apiKey ? this.apiKey() || '' : '') || '').trim();
      return [k, { name: p.name, keyAt: p.keyAt, keySet: !!(saved || v), keyFrom: saved ? 'settings' : v ? 'variable' : '', model: s.model || (k === 'anthropic' ? DEFAULT_MODEL : '') }];
    }));
  }
  // The models the current service listed the last time its key was tested.
  savedModels() { const c = this.conf(), s = ((this.store.get('ai', {}) || {}).by || {})[c.provider] || {}; return c.provider === 'anthropic' ? Object.keys(MODELS) : s.models || []; }
  // The model one agent uses: its own choice, or the main model. For Claude, only known Claude models.
  modelFor(m) { const c = this.conf(); m = stripModel(m); if (c.provider === 'anthropic') return MODELS[m] ? m : (MODELS[c.model] ? c.model : DEFAULT_MODEL); return m || c.model; }
  cap() { const c = Number((this.store.get('settings', {}) || {}).dailyCap); return c > 0 ? c : DEFAULT_CAP; }
  spentToday() { const s = this.store.get('spend', {}); return s.day === today(this.now()) ? s.usd : 0; }
  addSpend(usd) { const s = this.store.get('spend', {}), day = today(this.now()); this.store.set('spend', { day, usd: (s.day === day ? s.usd : 0) + usd }); return usd; }
  meter(model, tokensIn, tokensOut) {
    const m = MODELS[model] || ESTIMATE, usd = (tokensIn * m.in + tokensOut * m.out) / 1e6;
    const s = this.store.get('spend', {}), day = today(this.now());
    this.store.set('spend', { day, usd: (s.day === day ? s.usd : 0) + usd });
    return usd;
  }
  // One request. schema: a JSON schema (every object with additionalProperties: false) and the answer comes back parsed.
  async ask({ system, prompt, model, effort = 'low', maxTokens = 8000, schema = null }) {   // max tokens includes a model's thinking
    const missing = this.needs();
    if (missing) throw new CityError(missing === 'your AI key' ? 'no_ai_key' : missing === 'your AI model' ? 'no_ai_model' : 'no_ai_address', 'The city is waiting for ' + missing + '.');
    if (this.spentToday() >= this.cap()) throw new CityError('budget', 'Today\'s AI budget is used up ($' + this.cap().toFixed(2) + ').');
    const c = this.conf(), id = this.modelFor(model);
    const text = c.provider === 'anthropic' ? await this.claude(c, { system, prompt, id, effort, maxTokens, schema }) : await this.chat(c, { system, prompt, id, maxTokens, schema });
    return schema ? parseJson(text) : text;
  }
  async claude(c, { system, prompt, id, effort, maxTokens, schema }) {
    const m = MODELS[id];
    const req = { model: id, max_tokens: maxTokens, system, messages: [{ role: 'user', content: prompt }] };
    const oc = {}; if (m.effort) oc.effort = effort; if (schema) oc.format = { type: 'json_schema', schema };
    if (Object.keys(oc).length) req.output_config = oc;
    // If a model declines a request for safety reasons, Anthropic re-runs it on a fitting model inside the same call.
    if (m.fallbacks) { req.betas = ['server-side-fallback-2026-07-01']; req.fallbacks = 'default'; }
    const client = new Anthropic({ apiKey: c.key, baseURL: c.base || undefined, maxRetries: 2, timeout: 120000 });
    let r;
    try { r = await client.beta.messages.create(req); }
    catch (e) {
      // the safety fallback is an optional extra: if Anthropic ever refuses it, the same request goes again without it
      if (req.fallbacks && e instanceof Anthropic.BadRequestError && /fallback/i.test(String(e.message))) {
        delete req.fallbacks; delete req.betas;
        try { r = await client.beta.messages.create(req); } catch (e2) { throw explainClaude(e2); }
      } else throw explainClaude(e);
    }
    const u = r.usage || {};
    this.meter(MODELS[r.model] ? r.model : id, (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) * 1.25 + (u.cache_read_input_tokens || 0) * 0.1, u.output_tokens || 0);
    if (r.stop_reason === 'refusal') throw new CityError('refusal', 'The AI declined this request.', (r.stop_details && r.stop_details.explanation) || '');
    if (r.stop_reason === 'max_tokens' && schema) throw new CityError('cut_off', 'The answer was cut off before it finished.');
    return (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
  }
  // Any OpenAI-style service: POST <base>/chat/completions. If it does not take a JSON schema, the schema goes in the prompt instead.
  async chat(c, { system, prompt, id, maxTokens, schema }) {
    const messages = [{ role: 'system', content: system }, { role: 'user', content: prompt }];
    const body = { model: id, messages }, limit = c.provider === 'openai' ? 'max_completion_tokens' : 'max_tokens';
    body[limit] = maxTokens;
    if (schema) body.response_format = { type: 'json_schema', json_schema: { name: 'answer', schema, strict: true } };
    let r = await this.post(c, '/chat/completions', body);
    if (r.status === 400 && /max_(completion_)?tokens/.test(r.text)) { delete body[limit]; body[limit === 'max_tokens' ? 'max_completion_tokens' : 'max_tokens'] = maxTokens; r = await this.post(c, '/chat/completions', body); }
    if (r.status === 400 && schema && /response_format|json_schema|schema|structured/i.test(r.text)) {
      delete body.response_format;
      messages[1] = { role: 'user', content: prompt + '\n\nReply with only one JSON object that matches this JSON schema, and nothing else:\n' + JSON.stringify(schema) };
      r = await this.post(c, '/chat/completions', body);
    }
    if (!r.ok) throw explainHttp(r);
    const ch = (r.json.choices || [])[0] || {}, msg = ch.message || {}, u = r.json.usage || {};
    this.meter(id, u.prompt_tokens || 0, u.completion_tokens || 0);
    if (ch.finish_reason === 'content_filter' || msg.refusal) throw new CityError('refusal', 'The AI declined this request.', String(msg.refusal || ''));
    if (ch.finish_reason === 'length' && schema) throw new CityError('cut_off', 'The answer was cut off before it finished.');
    const text = Array.isArray(msg.content) ? msg.content.map(p => p.text || '').join('') : String(msg.content || '');
    return text.trim();
  }
  async post(c, path, body, method = 'POST') {
    let res;
    try { res = await this.fetch(c.base + path, { method, headers: Object.assign({ Authorization: 'Bearer ' + c.key }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(120000) }); }
    catch (e) { throw new CityError('ai_offline', 'The city could not reach ' + c.name + '.', e.message); }
    const text = await res.text(); let json = {}; try { json = JSON.parse(text); } catch (e) {}
    return { ok: res.ok, status: res.status, text: text.slice(0, 600), json };
  }
  // The models this key can use (it checks the key at the same time, at no cost). Saved so Settings can list them.
  async models() {
    const c = this.conf();
    if (!c.key) throw new CityError('no_ai_key', 'The city is waiting for your AI key.');
    let list;
    if (c.provider === 'anthropic') {
      const client = new Anthropic({ apiKey: c.key, baseURL: c.base || undefined, maxRetries: 1, timeout: 30000 });
      try { await client.models.list({ limit: 1 }); } catch (e) { throw explainClaude(e); }
      list = Object.keys(MODELS);
    } else {
      if (!c.base) throw new CityError('no_ai_address', 'The city is waiting for your AI service address.');
      const r = await this.post(c, '/models', null, 'GET');
      if (!r.ok) throw explainHttp(r);
      const rows = (r.json.data || r.json.models || []).filter(m => m && (m.id || m.name));
      rows.sort((a, b) => (b.created || 0) - (a.created || 0));
      list = rows.map(m => stripModel(m.id || m.name)).filter(id => !/embed|whisper|tts|dall-e|moderation|transcri|audio|realtime|image|vision-preview|search|davinci|babbage|rerank/i.test(id)).slice(0, 300);
    }
    const a = this.store.get('ai', {}) || {}, by = Object.assign({}, a.by);
    by[c.provider] = Object.assign({}, by[c.provider], { models: list, modelsAt: this.now() });
    this.store.set('ai', Object.assign({}, a, { provider: c.provider, by }));
    return list;
  }
}
function parseJson(text) {
  const t = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(t); } catch (e) {}
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i > -1 && j > i) try { return JSON.parse(t.slice(i, j + 1)); } catch (e) {}
  throw new CityError('bad_answer', 'The AI answer was not in the expected shape.', t.slice(0, 200));
}
// Anthropic's typed errors, most specific first, as Guide codes.
function explainClaude(e) {
  const msg = String((e && e.message) || e);
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return new CityError('ai_key_wrong', 'Your AI service did not accept the key.', msg);
  if (e instanceof Anthropic.NotFoundError) return new CityError('ai_model', 'That AI model is not available to your key.', msg);
  if (e instanceof Anthropic.RateLimitError) return new CityError('ai_busy', 'Your AI service asked the city to slow down.', msg);
  if (e instanceof Anthropic.BadRequestError) return /credit balance/i.test(msg) ? new CityError('ai_credit', 'Your AI account is out of credit.', msg) : new CityError('ai_request', 'Your AI service could not use that request.', msg);
  if (e instanceof Anthropic.APIConnectionError) return new CityError('ai_offline', 'The city could not reach your AI service.', msg);
  if (e instanceof Anthropic.APIError) return new CityError('ai_down', 'Your AI service had a problem (' + (e.status || '?') + ').', msg);
  return e;
}
// Any other service, by its HTTP answer.
function explainHttp(r) {
  const t = r.text, s = r.status;
  if (s === 401 || s === 403) return new CityError('ai_key_wrong', 'Your AI service did not accept the key.', t);
  if (s === 402 || /insufficient_quota|credit|billing|balance|payment/i.test(t) && s !== 404) return new CityError('ai_credit', 'Your AI account is out of credit.', t);
  if (s === 404 || /model.*(not found|does not exist|not supported|unknown)|no such model/i.test(t)) return new CityError('ai_model', 'That AI model is not available to your key.', t);
  if (s === 429) return new CityError('ai_busy', 'Your AI service asked the city to slow down.', t);
  if (s >= 500) return new CityError('ai_down', 'Your AI service had a problem (' + s + ').', t);
  return new CityError('ai_request', 'Your AI service could not use that request (' + s + ').', t);
}
module.exports = { AI, CityError, MODELS, DEFAULT_MODEL, DEFAULT_CAP, PROVIDERS, ESTIMATE, today, parseJson };
