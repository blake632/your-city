// Every AI call the city makes goes through here: Anthropic's official library, the model each agent was given, the day's
// spending cap, and errors turned into something the Guide can explain. The API key comes from the ANTHROPIC_API_KEY variable
// and is never stored, printed or sent anywhere but Anthropic.
const AnthropicModule = require('@anthropic-ai/sdk');
const Anthropic = AnthropicModule.default || AnthropicModule;

// The models you can give an agent. Prices are dollars per million tokens (in, out), for the spend meter.
const MODELS = {
  'claude-opus-5-5': { label: 'Claude Opus 5.5 (best writing)', in: 4, out: 20, effort: true, fallbacks: true },
  'claude-sonnet-5-5': { label: 'Claude Sonnet 5.5 (fast, half the price)', in: 2, out: 10, effort: true, fallbacks: true },
  'claude-haiku-4-5': { label: 'Claude Haiku 4.5 (cheapest)', in: 1, out: 5, effort: false, fallbacks: false },
};
const DEFAULT_MODEL = 'claude-opus-5-5';
const DEFAULT_CAP = 3;   // dollars a day, changeable in Settings

// An error the Guide knows how to explain: code is one of the keys in guide.js FIXES.
class CityError extends Error { constructor(code, message, detail) { super(message); this.name = 'CityError'; this.code = code; this.detail = detail || ''; } }

const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

class AI {
  constructor({ store, apiKey = () => process.env.ANTHROPIC_API_KEY, baseURL = process.env.ANTHROPIC_BASE_URL || undefined, now = () => Date.now() } = {}) {
    this.store = store; this.apiKey = apiKey; this.baseURL = baseURL; this.now = now;
  }
  ready() { return !!(this.apiKey() || '').trim(); }
  cap() { const c = Number(this.store.get('settings', {}).dailyCap); return c > 0 ? c : DEFAULT_CAP; }
  spentToday() { const s = this.store.get('spend', {}); return s.day === today(this.now()) ? s.usd : 0; }
  meter(model, usage) {
    const m = MODELS[model] || MODELS[DEFAULT_MODEL], u = usage || {};
    const tokensIn = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) * 1.25 + (u.cache_read_input_tokens || 0) * 0.1;
    const usd = (tokensIn * m.in + (u.output_tokens || 0) * m.out) / 1e6;
    const s = this.store.get('spend', {}), day = today(this.now());
    this.store.set('spend', { day, usd: (s.day === day ? s.usd : 0) + usd });
    return usd;
  }
  // One request. schema: a JSON schema (every object with additionalProperties: false) and the answer comes back parsed.
  async ask({ system, prompt, model, effort = 'low', maxTokens = 8000, schema = null }) {   // max_tokens includes the model's thinking
    if (!this.ready()) throw new CityError('no_ai_key', 'No AI key yet.');
    if (this.spentToday() >= this.cap()) throw new CityError('budget', 'Today\'s AI budget is used up ($' + this.cap().toFixed(2) + ').');
    const id = MODELS[model] ? model : DEFAULT_MODEL, m = MODELS[id];
    const req = { model: id, max_tokens: maxTokens, system, messages: [{ role: 'user', content: prompt }] };
    const oc = {};
    if (m.effort) oc.effort = effort;
    if (schema) oc.format = { type: 'json_schema', schema };
    if (Object.keys(oc).length) req.output_config = oc;
    // If a model declines a request for safety reasons, Anthropic re-runs it on a fitting model inside the same call.
    if (m.fallbacks) { req.betas = ['server-side-fallback-2026-07-01']; req.fallbacks = 'default'; }
    const client = new Anthropic({ apiKey: this.apiKey(), baseURL: this.baseURL, maxRetries: 2, timeout: 120000 });
    let r;
    try { r = await client.beta.messages.create(req); }
    catch (e) {
      // the safety fallback is an optional extra: if Anthropic ever refuses it, the same request goes again without it
      if (req.fallbacks && e instanceof Anthropic.BadRequestError && /fallback/i.test(String(e.message))) {
        delete req.fallbacks; delete req.betas;
        try { r = await client.beta.messages.create(req); } catch (e2) { throw explain(e2); }
      } else throw explain(e);
    }
    this.meter(r.model in MODELS ? r.model : id, r.usage);
    if (r.stop_reason === 'refusal') throw new CityError('refusal', 'The AI declined this request.', (r.stop_details && r.stop_details.explanation) || '');
    const text = (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    if (r.stop_reason === 'max_tokens' && schema) throw new CityError('cut_off', 'The answer was cut off before it finished.');
    if (!schema) return text;
    try { return JSON.parse(text); } catch (e) { throw new CityError('bad_answer', 'The AI answer was not in the expected shape.', text.slice(0, 200)); }
  }
}
// Anthropic's typed errors, most specific first, as Guide codes.
function explain(e) {
  const msg = String((e && e.message) || e);
  if (e instanceof Anthropic.AuthenticationError) return new CityError('ai_key_wrong', 'Anthropic says the AI key is not valid.', msg);
  if (e instanceof Anthropic.PermissionDeniedError) return new CityError('ai_key_wrong', 'Anthropic says this key is not allowed to do that.', msg);
  if (e instanceof Anthropic.NotFoundError) return new CityError('ai_model', 'That AI model is not available to your key.', msg);
  if (e instanceof Anthropic.RateLimitError) return new CityError('ai_busy', 'Anthropic asked the city to slow down.', msg);
  if (e instanceof Anthropic.BadRequestError) return /credit balance/i.test(msg) ? new CityError('ai_credit', 'Your Anthropic account is out of credit.', msg) : new CityError('ai_request', 'Anthropic could not use that request.', msg);
  if (e instanceof Anthropic.APIConnectionError) return new CityError('ai_offline', 'The city could not reach Anthropic.', msg);
  if (e instanceof Anthropic.APIError) return new CityError('ai_down', 'Anthropic had a problem (' + (e.status || '?') + ').', msg);
  return e;
}
module.exports = { AI, CityError, MODELS, DEFAULT_MODEL, DEFAULT_CAP, today };
