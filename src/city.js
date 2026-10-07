// The city: your settings, your agents, the cards waiting for you, what each agent did, and the clock that runs them.
// Rules that never bend: nothing is sent, posted or deleted without your click. Agents write drafts and cards; you approve.
const crypto = require('node:crypto');
const { CityError, MODELS, DEFAULT_MODEL } = require('./ai');
const guide = require('./guide');
const { addressOf, nameOf } = require('./google');

const EVERY = { 10: 'every 10 minutes', 60: 'every hour', 1440: 'every day', 10080: 'every week' };
// The built-in agents. Turn each on or off and give it a model in Settings; add your own there too.
const BUILT_IN = {
  leads: { name: 'Leads', about: 'Spots new customers in your email and writes your first reply, fast.', needs: ['ai', 'google'], every: 10, effort: 'medium' },
  mailroom: { name: 'Mail room', about: 'Sorts your new email into labels and writes a reply for each one that needs you.', needs: ['ai', 'google'], every: 10, effort: 'low' },
  social: { name: 'Social posts', about: 'Writes 3 posts for the week from what you tell it about your business. It never posts anything.', needs: ['ai'], every: 10080, effort: 'medium' },
  guide: { name: 'Guide', about: 'Checks your setup and tells you exactly how to fix anything that is not working.', needs: [], every: 1, always: true, effort: 'low' },
};
const DEFAULT_SETTINGS = {
  business: '', owner: '', about: '', voice: 'Short, friendly and clear. No hype, no exclamation points.', signature: '',
  leadReply: 'Thank them for reaching out. Ask the one question that matters most for their request (for example: when they want to start, or where the job is). Offer a quick call and give the phone number from the signature. Under 80 words.',
  dailyCap: 3, alerts: 'leads',
};
const LABELS = { lead: 'City/Lead', needs_reply: 'City/Needs reply', fyi: 'City/FYI', receipt: 'City/Receipts', newsletter: 'City/Newsletters', spam: 'City/Junk?' };
const SORT_SCHEMA = { type: 'object', additionalProperties: false, required: ['kind', 'summary', 'lead'], properties: {
  kind: { type: 'string', enum: Object.keys(LABELS) }, summary: { type: 'string' },
  lead: { type: 'object', additionalProperties: false, required: ['name', 'email', 'phone', 'wants'], properties: { name: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' }, wants: { type: 'string' } } } } };
const POSTS_SCHEMA = { type: 'object', additionalProperties: false, required: ['posts'], properties: { posts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['platform', 'text', 'photo'],
  properties: { platform: { type: 'string' }, text: { type: 'string' }, photo: { type: 'string' } } } } } };
const ROBOT = /no-?reply|notifications?@|mailer-daemon|postmaster|donotreply|bounce/i;
const id = () => Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
const ago = ms => { const m = Math.round(ms / 6e4); return m < 60 ? m + ' min ago' : m < 2880 ? Math.round(m / 60) + ' hours ago' : Math.round(m / 1440) + ' days ago'; };

class City {
  constructor({ store, ai, google, push = null, now = () => Date.now(), log = console }) {
    Object.assign(this, { store, ai, google, push, now, log });
    this.running = new Set(); this.deciding = new Set(); this.timer = null;
  }
  // ---- settings and agents ----
  settings() { return Object.assign({}, DEFAULT_SETTINGS, this.store.get('settings', {})); }
  saveSettings(s) {
    const keep = {}; Object.keys(DEFAULT_SETTINGS).forEach(k => { if (s[k] !== undefined) keep[k] = k === 'dailyCap' ? Math.max(0.5, Math.min(100, Number(s[k]) || DEFAULT_SETTINGS.dailyCap)) : String(s[k]).slice(0, 6000); });
    return this.store.set('settings', Object.assign(this.store.get('settings', {}), keep));
  }
  agentConf(a) {
    const c = (this.store.get('agents', {}) || {})[a] || {}, b = BUILT_IN[a] || this.custom(a) || {};
    return { on: b.always ? true : c.on !== undefined ? !!c.on : (b.on !== undefined ? b.on : true), model: MODELS[c.model] ? c.model : (b.model && MODELS[b.model] ? b.model : DEFAULT_MODEL), every: Number(c.every) || b.every || 1440 };
  }
  agentOn(a) { return this.agentConf(a).on; }
  setAgent(a, { on, model, every }) {
    if (!BUILT_IN[a] && !this.custom(a)) throw new Error('No such agent.');
    if (this.custom(a)) return this.saveCustom(Object.assign({}, this.custom(a), on !== undefined ? { on: !!on } : {}, model ? { model } : {}, every ? { every: Number(every) } : {}));
    const all = this.store.get('agents', {}), c = all[a] || {};
    if (on !== undefined && !BUILT_IN[a].always) c.on = !!on;
    if (model && MODELS[model]) c.model = model;
    if (every && EVERY[every]) c.every = Number(every);
    all[a] = c; this.store.set('agents', all); return c;
  }
  customs() { return this.store.get('custom', []); }
  custom(a) { return this.customs().find(c => c.id === a) || null; }
  saveCustom(c) {
    const clean = { id: c.id && /^c-[\w-]+$/.test(c.id) ? c.id : 'c-' + id(), name: String(c.name || 'My agent').slice(0, 60), instructions: String(c.instructions || '').slice(0, 6000),
      every: EVERY[c.every] ? Number(c.every) : 1440, model: MODELS[c.model] ? c.model : DEFAULT_MODEL, review: c.review !== false, on: c.on !== false };
    if (!clean.instructions.trim()) throw new Error('Tell the agent what to do.');
    const list = this.customs().filter(x => x.id !== clean.id); list.push(clean); this.store.set('custom', list.slice(-20)); return clean;
  }
  removeCustom(a) { this.store.set('custom', this.customs().filter(c => c.id !== a)); }
  agents() {
    const list = Object.entries(BUILT_IN).map(([k, b]) => ({ id: k, name: b.name, about: b.about, needs: b.needs, builtIn: true, always: !!b.always }))
      .concat(this.customs().map(c => ({ id: c.id, name: c.name, about: c.instructions.slice(0, 140), needs: ['ai'], builtIn: false, instructions: c.instructions, review: c.review })));
    const cards = this.waiting(), runs = this.store.get('runs', {});
    return list.map(a => Object.assign(a, this.agentConf(a.id), { need: cards.filter(c => c.agent === a.id).length, last: runs[a.id] || null, blockedBy: this.blockedBy(a.id) }));
  }
  // What an agent is waiting for before it can work: 'AI key' or 'Gmail'.
  blockedBy(a) {
    const needs = (BUILT_IN[a] || { needs: ['ai'] }).needs;
    if (needs.length && !this.settings().business.trim()) return 'your business details';   // nothing generic gets written before it knows the business
    if (needs.includes('ai') && !this.ai.ready()) return 'your AI key';
    if (needs.includes('google') && !this.google.connected()) return 'Gmail';
    return '';
  }
  // ---- cards: things that need you ----
  addCard(c) { const card = Object.assign({ id: id(), ts: this.now(), status: 'waiting' }, c); this.store.put('cards', card.id, card); this.alert(card); return card; }
  waiting() { return this.store.list('cards').filter(c => c.status === 'waiting').reverse().sort((a, b) => b.ts - a.ts); }   // newest first, ties by when they were made
  update(agent, text, extra) { const u = Object.assign({ id: id(), agent, ts: this.now(), text: String(text).slice(0, 400) }, extra || {}); this.store.put('updates', u.id, u); this.store.trim('updates', 400); return u; }
  updates() { return this.store.list('updates').reverse().sort((a, b) => b.ts - a.ts); }
  alert(card) {
    if (!this.push || card.status !== 'waiting') return;
    const want = this.settings().alerts;
    if (want === 'off' || (want === 'leads' && card.kind !== 'lead') || card.kind === 'fix') return;
    Promise.resolve().then(() => this.push.notify({ title: card.kind === 'lead' ? 'New lead: reply is ready' : 'Your city needs you', body: card.title, url: '/#' + card.agent + '/card/' + card.id, tag: card.id }))
      .catch(e => this.log.error('alert failed: ' + e.message));
  }
  // Approve / Decline / Got it. A reply is sent only here, only on Approve, and never twice.
  async decide(cardId, decision) {
    const c = this.store.doc('cards', cardId);
    if (!c) throw new Error('That card is gone.');
    if (c.status !== 'waiting' || this.deciding.has(cardId)) throw new Error('You already decided this one.');
    if (!['approve', 'decline', 'got_it'].includes(decision)) throw new Error('Unknown choice.');
    this.deciding.add(cardId);
    try {
      let status = decision === 'decline' ? 'declined' : 'done', said = '';
      if (decision === 'approve' && c.email && c.email.draftId) {
        await this.google.sendDraft(c.email.draftId);
        status = 'sent'; said = 'Sent your reply to ' + (c.email.to || 'them') + '.';
        if (c.kind === 'lead' && c.lead && c.lead.email) { const fu = this.store.get('leadsSent', {}); fu[c.lead.email] = this.now(); this.store.set('leadsSent', fu); }
      } else if (decision === 'approve' && c.kind === 'post') { status = 'approved'; said = 'Saved: ' + c.title + '. Copy it from Updates whenever you post.'; }
      else if (decision === 'decline' && c.email) said = 'Not sent. The draft stays in your Gmail drafts if you want it later.';
      Object.assign(c, { status, decidedAt: this.now() }); this.store.put('cards', c.id, c);
      if (said || decision !== 'got_it') this.update(c.agent, said || ((decision === 'decline' ? 'You declined: ' : 'You approved: ') + c.title), c.kind === 'post' && status === 'approved' ? { text2: c.body } : {});
      return { ok: true, status, said };
    } catch (e) { this.problem(c.agent, e); throw e; }
    finally { this.deciding.delete(cardId); }
  }
  // Needs feedback: your note goes back to the agent, which rewrites the draft (in Gmail too) and keeps the card waiting.
  async feedback(cardId, note) {
    const c = this.store.doc('cards', cardId);
    if (!c || c.status !== 'waiting') throw new Error('That card is gone.');
    note = String(note || '').trim().slice(0, 2000); if (!note) throw new Error('Write what to change.');
    const s = this.settings(), current = c.email ? c.email.body : c.body;
    const text = await this.ai.ask({ model: this.agentConf(c.agent).model, effort: 'medium', maxTokens: 8000,
      system: this.voice(s) + ' Rewrite the draft the way the owner asks. Keep everything they did not ask to change. Return only the new text.',
      prompt: 'THE DRAFT:\n' + current + '\n\nWHAT THE OWNER WANTS CHANGED:\n' + note });
    if (c.email && c.email.draftId) { await this.google.updateDraft(c.email.draftId, Object.assign({}, c.email, { body: text })); c.email.body = text; }
    else c.body = text;
    c.notes = (c.notes || []).concat([{ ts: this.now(), note }]); this.store.put('cards', c.id, c);
    this.update(c.agent, 'Rewrote "' + c.title + '" from your note.');
    return c;
  }
  voice(s) {
    const who = s.owner || 'the owner', biz = s.business || 'the business';
    return 'You write for ' + who + ' at ' + biz + '. About the business: ' + (s.about || '(not filled in yet)') + ' Voice: ' + (s.voice || '') +
      ' Use only facts from these notes and from the message itself; never invent prices, dates, availability or promises. If a fact is missing, ask for it or say ' + who + ' will confirm. Plain text, no markdown.' +
      (s.signature ? ' End with this signature exactly:\n' + s.signature : '');
  }
  // ---- the agents' work ----
  // Leads and Mail room share one look at the inbox: the AI sorts each new email, labels it, and the right agent drafts.
  async inbox() {
    const s = this.settings(), me = this.google.email().toLowerCase(), seen = this.store.get('seen', []);
    const ids = (await this.google.search('in:inbox newer_than:2d -label:city-seen', 10)).map(m => m.id).filter(x => !seen.includes(x));
    let drafted = 0, sorted = 0;
    for (const mid of ids) {
      if (drafted >= 4) break;   // a few drafts a run keeps the cost steady; the rest wait for the next run
      const m = await this.google.message(mid); if (!m) continue;
      seen.push(mid); this.store.set('seen', seen.slice(-500));
      const from = addressOf(m.from);
      if (from && from === me) { await this.google.label(mid, ['City/Seen']); continue; }
      const sort = await this.ai.ask({ model: this.agentConf('mailroom').model, effort: 'low', maxTokens: 4000, schema: SORT_SCHEMA,
        system: 'You sort email for ' + (s.business || 'a small business') + '. About it: ' + (s.about || 'not described yet') + '. Fill the JSON exactly.',
        prompt: 'From: ' + m.from + '\nTo: ' + m.to + '\nSubject: ' + m.subject + '\nDate: ' + m.date + '\n\n' + m.text.slice(0, 6000) +
          '\n\nKinds:\n- lead: someone who may become a customer asking about the services, prices or availability, including a website form or marketplace notification about such a person.\n- needs_reply: a real person who expects an answer (not a new customer).\n- fyi: worth knowing, no answer needed.\n- receipt: bills, receipts, orders, shipping.\n- newsletter: newsletters, marketing, automatic notices.\n- spam: scams, cold sales pitches, junk.\nsummary: one short line on what it is.\nlead: for a lead, the customer\'s own name, email, phone and what they want as the email states them; empty strings when not stated or not a lead.' });
      let kind = sort.kind;
      if (kind === 'lead' && !this.agentOn('leads')) kind = 'needs_reply';
      if (kind === 'needs_reply' && (ROBOT.test(m.from) || !this.agentOn('mailroom'))) kind = 'fyi';
      await this.google.label(mid, ['City/Seen', LABELS[kind] || LABELS.fyi]);
      sorted++;
      if (kind === 'lead') { if (await this.leadReply(m, sort)) drafted++; }
      else if (kind === 'needs_reply') { await this.mailReply(m, sort); drafted++; }
      else this.update('mailroom', 'Sorted "' + (m.subject || '(no subject)').slice(0, 80) + '" as ' + LABELS[kind].replace('City/', '') + '.');
    }
    return sorted ? 'Looked at ' + sorted + ' new email' + (sorted > 1 ? 's' : '') + (drafted ? ', drafted ' + drafted + ' repl' + (drafted > 1 ? 'ies' : 'y') : '') : 'No new email.';
  }
  async leadReply(m, sort) {
    const s = this.settings(), L = sort.lead || {}, sender = addressOf(m.replyTo || m.from), robotFrom = ROBOT.test(m.from);
    const email = (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(L.email || '') ? L.email : robotFrom && !m.replyTo ? '' : sender).toLowerCase();
    const lead = { name: L.name || nameOf(m.from), email, phone: L.phone || '', wants: L.wants || sort.summary, source: m.subject, came: ago(this.now() - (Date.parse(m.date) || this.now())) };
    const gmail = 'https://mail.google.com/mail/u/0/#all/' + m.threadId;
    if (!email) { this.addCard({ agent: 'leads', kind: 'lead', title: 'New lead, no email address: ' + (lead.name || m.subject), lead, gmail, body: 'The city could not find their email address. Open it in Gmail and reply by hand, or call them.', actions: ['got_it'] }); return false; }
    const sent = this.store.get('leadsSent', {}), dup = this.store.get('leadsDrafted', {});
    if (sent[email] || (dup[email] && this.now() - dup[email] < 30 * 864e5)) { this.update('leads', 'Skipped a repeat from ' + email + ': a reply was already drafted or sent.'); return false; }
    const body = await this.ai.ask({ model: this.agentConf('leads').model, effort: 'medium', maxTokens: 8000,
      system: this.voice(s) + ' You write the first reply to a new customer. Follow the owner\'s reply guide exactly.',
      prompt: 'REPLY GUIDE:\n' + s.leadReply + '\n\nTHE CUSTOMER\nName: ' + (lead.name || '(unknown)') + '\nEmail: ' + email + (lead.phone ? '\nPhone: ' + lead.phone : '') + '\nWhat they want: ' + lead.wants + '\nCame in: ' + lead.came +
        '\n\nTHEIR MESSAGE:\n' + m.text.slice(0, 4000) + '\n\nWrite only the email body, from the greeting to the signature.' });
    const direct = email === sender && !robotFrom;   // they wrote to you themselves: reply on their thread; a form notice (even with their Reply-To): a new email to them
    const msg = direct ? { to: email, subject: /^re:/i.test(m.subject) ? m.subject : 'Re: ' + m.subject, body, threadId: m.threadId, inReplyTo: m.messageId, references: m.references }
      : { to: email, subject: s.business || m.subject || 'Thanks for reaching out', body };
    const d = await this.google.createDraft(msg);
    dup[email] = this.now(); this.store.set('leadsDrafted', dup);
    this.addCard({ agent: 'leads', kind: 'lead', title: 'Reply to ' + (lead.name || email) + ', ready to send', lead, gmail, email: Object.assign({}, msg, d), actions: ['approve', 'decline'] });
    return true;
  }
  async mailReply(m, sort) {
    const s = this.settings(), to = addressOf(m.replyTo || m.from);
    const body = await this.ai.ask({ model: this.agentConf('mailroom').model, effort: 'medium', maxTokens: 8000, system: this.voice(s) + ' You write the owner\'s reply to this email. Answer what they asked, briefly.',
      prompt: 'From: ' + m.from + '\nSubject: ' + m.subject + '\n\n' + m.text.slice(0, 6000) + '\n\nWrite only the reply body, from the greeting to the signature.' });
    const msg = { to, subject: /^re:/i.test(m.subject) ? m.subject : 'Re: ' + m.subject, body, threadId: m.threadId, inReplyTo: m.messageId, references: m.references };
    const d = await this.google.createDraft(msg);
    this.addCard({ agent: 'mailroom', kind: 'email', title: 'Reply to ' + (nameOf(m.from) || to) + ': ' + (m.subject || '(no subject)').slice(0, 80), summary: sort.summary,
      came: { from: m.from, subject: m.subject, text: m.text.slice(0, 3000) }, gmail: 'https://mail.google.com/mail/u/0/#all/' + m.threadId, email: Object.assign({}, msg, d), actions: ['approve', 'decline'] });
  }
  async social() {
    const s = this.settings();
    const r = await this.ai.ask({ model: this.agentConf('social').model, effort: 'medium', maxTokens: 12000, schema: POSTS_SCHEMA,
      system: this.voice(Object.assign({}, s, { signature: '' })) + ' You write social media posts.',
      prompt: 'Write 3 different posts for this week (' + new Date(this.now()).toDateString() + '). Mix Instagram and Facebook. Each: the platform, the post text with a few fitting hashtags, and the kind of real photo the owner should use. Never describe a photo as if it already exists.' });
    (r.posts || []).slice(0, 5).reverse().forEach(p => this.addCard({ agent: 'social', kind: 'post', title: (p.platform || 'Post') + ': ' + String(p.text).split('\n')[0].slice(0, 70), body: p.text, photo: p.photo, actions: ['approve', 'decline'] }));
    return 'Wrote ' + (r.posts || []).length + ' posts for you to look over.';
  }
  async runCustom(c) {
    const s = this.settings();
    const text = await this.ai.ask({ model: c.model, effort: 'medium', maxTokens: 12000, system: this.voice(Object.assign({}, s, { signature: '' })) + ' You are the owner\'s agent "' + c.name + '". Be short and useful.',
      prompt: 'Today is ' + new Date(this.now()).toDateString() + '.\n\nYOUR JOB:\n' + c.instructions });
    const first = (String(text || '').split('\n').find(l => l.trim()) || 'Nothing to report.').replace(/^[#*\s]+/, '');
    if (c.review) this.addCard({ agent: c.id, kind: 'note', title: c.name + ': ' + first.slice(0, 90), body: text, actions: ['approve', 'decline'] });
    else this.update(c.id, first.slice(0, 200), { text2: text });
    return c.review ? 'Made a card for you.' : 'Done.';
  }
  // ---- running ----
  jobs() {
    const out = [];
    if ((this.agentOn('leads') || this.agentOn('mailroom')) && !this.blockedBy('leads')) out.push({ key: 'inbox', agent: this.agentOn('leads') ? 'leads' : 'mailroom', every: Math.min(this.agentOn('leads') ? this.agentConf('leads').every : 1e9, this.agentOn('mailroom') ? this.agentConf('mailroom').every : 1e9), run: () => this.inbox() });
    if (this.agentOn('social') && !this.blockedBy('social')) out.push({ key: 'social', agent: 'social', every: this.agentConf('social').every, run: () => this.social() });
    this.customs().filter(c => c.on && !this.blockedBy(c.id)).forEach(c => out.push({ key: c.id, agent: c.id, every: c.every, run: () => this.runCustom(c) }));
    return out;
  }
  async runAgent(agent) {
    const job = agent === 'mailroom' || agent === 'leads' ? this.jobs().find(j => j.key === 'inbox') : this.jobs().find(j => j.key === agent);
    const why = this.blockedBy(agent);
    if (!job) throw new CityError(why === 'Gmail' ? (this.google.configured() ? 'google_not_connected' : 'google_no_client') : why === 'your AI key' ? 'no_ai_key' : why ? 'no_business' : 'agent_off', why ? 'That agent is waiting for ' + why + '.' : 'That agent is turned off.');
    return this.runJob(job);
  }
  async runJob(job) {
    if (this.running.has(job.key)) return 'Already running.';
    this.running.add(job.key);
    const runs = this.store.get('runs', {});
    try {
      const said = await job.run();
      runs[job.agent] = { at: this.now(), ok: true, said }; this.store.set('runs', runs); this.clearProblem(job.agent);
      return said;
    } catch (e) { runs[job.agent] = { at: this.now(), ok: false, said: e.message }; this.store.set('runs', runs); this.problem(job.agent, e); throw e; }
    finally { this.running.delete(job.key); const t = this.store.get('ticks', {}); t[job.key] = this.now(); this.store.set('ticks', t); }
  }
  // Anything that goes wrong reaches the Guide: one "How to fix it" card per kind of problem, closed again once it works.
  problem(agent, e) {
    const code = e instanceof CityError ? e.code : 'unknown', errs = this.store.get('errors', {});
    errs[agent] = { code, message: String(e.message || e).slice(0, 300), detail: String((e && e.detail) || '').slice(0, 500), at: this.now() };
    this.store.set('errors', errs);
    if (!(e instanceof CityError)) this.log.error('[' + agent + '] ' + (e && e.stack || e));
    if (this.waiting().some(c => c.kind === 'fix' && c.code === code)) return;
    const fix = guide.fixFor(code, { redirect: this.redirect || '(your city address)/connect/google/callback', cap: this.ai.cap(), detail: errs[agent].detail, message: errs[agent].message });
    this.addCard({ agent: 'guide', kind: 'fix', code, title: fix.title, steps: fix.steps, about: (BUILT_IN[agent] || this.custom(agent) || { name: agent }).name + ': ' + errs[agent].message, actions: ['got_it'] });
  }
  clearProblem(agent) {
    const errs = this.store.get('errors', {}); if (!errs[agent]) return;
    const code = errs[agent].code; delete errs[agent]; this.store.set('errors', errs);
    if (Object.values(errs).some(e => e.code === code)) return;
    this.waiting().filter(c => c.kind === 'fix' && c.code === code).forEach(c => { Object.assign(c, { status: 'done', decidedAt: this.now() }); this.store.put('cards', c.id, c); });
    this.update('guide', 'Fixed: ' + guide.fixFor(code, { redirect: '', cap: this.ai.cap() }).title + '. Working again.');
  }
  // Every minute: run what is due. Agents wait (no error) while their setup is missing or the day's budget is used.
  async tick() {
    const ticks = this.store.get('ticks', {}), due = this.jobs().filter(j => !this.running.has(j.key) && this.now() - (ticks[j.key] || 0) >= j.every * 6e4 - 5e3);
    if (!due.length) return [];
    if (!this.ai.ready()) return [];
    if (this.ai.spentToday() >= this.ai.cap()) { if (!this.waiting().some(c => c.kind === 'fix' && c.code === 'budget')) this.problem('guide', new CityError('budget', 'Today\'s AI budget is used up.')); return []; }
    return Promise.all(due.map(j => this.runJob(j).catch(() => null)));
  }
  start(everyMs = 60e3) { const go = () => this.tick().catch(e => this.log.error('tick: ' + e.message)); setTimeout(go, 5000); this.timer = setInterval(go, everyMs); }
  stop() { clearInterval(this.timer); }
}
module.exports = { City, BUILT_IN, EVERY, DEFAULT_SETTINGS, LABELS, SORT_SCHEMA };
