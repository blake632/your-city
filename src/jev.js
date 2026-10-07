// Jev: the fast judge. It answers many small questions about one piece of text in one pass, the way the original city uses it:
// a "noul" question gets a probability from 0 to 1 that the answer is yes; a "choice" question gets one of its options and a confidence.
// With a Vercel AI Gateway key (Settings, Jev), the real Jev model answers (typesafe-ai/jev: fast, about $0.04 per million words in).
// Without one, the owner's own AI answers the same questions, so every city has every Jev check. A Jev problem never stops the work:
// it falls back to the owner's AI, and the Guide shows the fix.
const { CityError } = require('./ai');
const JEV_URL = 'https://ai-gateway.vercel.sh/typesafe/v1/systemone', JEV_PRICE = 0.042;   // US dollars per million input tokens

class Jev {
  constructor({ ai, store, env = process.env, url = JEV_URL, fetchImpl = (...a) => fetch(...a) }) {
    Object.assign(this, { ai, store, env, url, fetch: fetchImpl });
  }
  key() { return String((this.store.get('jev', {}) || {}).key || this.env.AI_GATEWAY_API_KEY || '').trim(); }
  keyFrom() { return (this.store.get('jev', {}) || {}).key ? 'settings' : this.env.AI_GATEWAY_API_KEY ? 'variable' : ''; }
  mode() { return this.key() ? 'jev' : 'ai'; }
  problem() { return (this.store.get('jev', {}) || {}).problem || null; }
  save({ key, off }) {   // a blank key keeps the saved one; off removes it
    const j = Object.assign({}, this.store.get('jev', {}) || {});
    if (off) delete j.key; else if (key && String(key).trim()) j.key = String(key).trim();
    delete j.problem; return this.store.set('jev', j);
  }
  note(problem) { const j = Object.assign({}, this.store.get('jev', {}) || {}); if (problem) j.problem = problem; else delete j.problem; this.store.set('jev', j); }
  // questions: { key: { type: 'noul', instructions } | { type: 'choice', instructions, criteria: { option: 'what it means' } } }
  // returns { key: { noul } | { choice, confidence } }; a question it could not answer is left out.
  async ask(state, questions, { model } = {}) {
    state = String(state || '').slice(0, 16000);
    if (this.key()) {
      try { const a = await this.real(state, questions); if (this.problem()) this.note(null); return a; }
      catch (e) { if (e.code === 'budget') throw e; this.note({ code: e.code || 'jev_down', message: String(e.message).slice(0, 200), at: Date.now() }); }
    }
    return this.byAI(state, questions, model);
  }
  async real(state, questions) {
    if (this.ai.spentToday() >= this.ai.cap()) throw new CityError('budget', 'Today\'s AI budget is used up.');
    let res;
    try { res = await this.fetch(this.url, { method: 'POST', headers: { Authorization: 'Bearer ' + this.key(), 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'typesafe-ai/jev', state, questions }), signal: AbortSignal.timeout(30000) }); }
    catch (e) { throw new CityError('jev_down', 'The city could not reach Jev.'); }
    const text = await res.text(); let j = {}; try { j = JSON.parse(text); } catch (e) {}
    if (res.status === 401 || res.status === 403) throw new CityError('jev_key_wrong', 'Jev did not accept the key.');
    if (res.status === 402 || /credit|balance|quota/i.test(text) && !res.ok) throw new CityError('jev_credit', 'Your Vercel AI Gateway is out of credit.');
    if (!res.ok) throw new CityError('jev_down', 'Jev answered ' + res.status + '.');
    this.ai.addSpend(Math.ceil(JSON.stringify({ state, questions }).length / 4) * JEV_PRICE / 1e6);
    return clean(j.answers || {}, questions);
  }
  // The owner's AI plays Jev: same questions, same kind of answers.
  async byAI(state, questions, model) {
    const props = {}, req = Object.keys(questions);
    req.forEach(k => { const q = questions[k];
      props[k] = q.type === 'choice' ? { type: 'object', additionalProperties: false, required: ['choice', 'confidence'], properties: { choice: { type: 'string', enum: Object.keys(q.criteria || {}) }, confidence: { type: 'number' } } }
        : { type: 'object', additionalProperties: false, required: ['noul'], properties: { noul: { type: 'number' } } }; });
    const list = req.map(k => { const q = questions[k]; return '- ' + k + ' (' + (q.type === 'choice' ? 'choose one: ' + Object.entries(q.criteria || {}).map(([o, d]) => o + ' = ' + d).join('; ') : 'yes/no: give the probability of yes, 0 to 1') + '): ' + q.instructions; }).join('\n');
    const a = await this.ai.ask({ model, effort: 'low', maxTokens: 4000, schema: { type: 'object', additionalProperties: false, required: req, properties: props },
      system: 'You are Jev, a fast and careful judge. Answer every question about the text below, each on its own. For yes/no questions give the probability that the answer is yes, from 0 to 1. For choice questions pick one option and say how sure you are, from 0 to 1. Be calibrated: 0.5 means you cannot tell.',
      prompt: 'THE TEXT:\n' + state + '\n\nTHE QUESTIONS:\n' + list });
    return clean(a || {}, questions);
  }
}
function clean(a, questions) {
  const out = {};
  Object.keys(questions).forEach(k => { const x = a[k], q = questions[k]; if (!x) return;
    if (q.type === 'choice') { if (x.choice && (!q.criteria || q.criteria[x.choice])) out[k] = { choice: x.choice, confidence: num(x.confidence) }; }
    else if (typeof x.noul === 'number' || typeof x.noul === 'string') out[k] = { noul: num(x.noul) }; });
  return out;
}
const num = v => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0; };
module.exports = { Jev, JEV_URL, JEV_PRICE };
