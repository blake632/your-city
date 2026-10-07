// The Research desk: it looks on GitHub for open-source agent playbooks, prompts and tools that could help your departments,
// three departments a turn, and sends the best to the School. No key needed. It never installs anything: the School tests each
// one, and only a playbook that passes its class, or a plan you approve, ever comes near real work.
// Your AI writes the searches; Jev scores what GitHub finds (one pass per department); 0.6 or more goes to the School, at most 2 a
// department and 4 a day. GitHub asking it to wait, or not answering, is never an error: it looks again next time.
// State: store key 'research' = { next (whose turn), seen (repos already looked at), day, n (sent to the School that day) }.
const { typeOf, keyOf, ghGet } = require('./school');

const PER_DAY = 4, PER_RUN = 3, PER_DEPT = 2, BAR = 0.6, MAX_SEEN = 500;
const QUERIES = { type: 'object', additionalProperties: false, required: ['queries'], properties: { queries: { type: 'array', items: { type: 'string' } } } };

class Research {
  constructor({ city, school, fetchImpl = (...a) => fetch(...a), github = 'https://api.github.com' }) {
    Object.assign(this, { city, school, fetch: fetchImpl, github: String(github).replace(/\/+$/, '') });
  }
  state() { const r = this.city.store.get('research', {}) || {}; return { next: Number(r.next) || 0, seen: Array.isArray(r.seen) ? r.seen.slice() : [], day: r.day || '', n: Number(r.n) || 0 }; }
  // One turn. Returns a short line. Never throws.
  async run() {
    const city = this.city, depts = city.departments().filter(d => d.on);
    if (!depts.length) return 'Research waits for your first department.';
    if (!city.ai.ready()) return 'Research waits for your AI.';
    const r = this.state(), day = new Date(city.now()).toISOString().slice(0, 10), found = [];
    if (r.day !== day) Object.assign(r, { day, n: 0 });
    if (r.n >= PER_DAY) return 'The school already got ' + PER_DAY + ' new tools today. Research looks again next time.';
    try {
      for (let i = 0; i < Math.min(PER_RUN, depts.length) && r.n < PER_DAY; i++) {
        found.push(...await this.look(depts[r.next % depts.length], r));
        r.next = (r.next + 1) % depts.length;   // a department whose turn was cut short keeps its turn
      }
    } catch (e) {
      return e.code === 'github_busy' ? 'GitHub asked the city to wait. Research looks again next time.'
        : e.code === 'github_offline' ? 'The city could not reach GitHub. Research looks again next time.'
        : e.code === 'budget' ? 'Research waits: today\'s AI budget is used up.' : 'Research stopped for now: ' + String(e.message || e).slice(0, 160);
    } finally { city.store.set('research', r); }
    return found.length ? 'Research found ' + found.length + ' new tool' + (found.length > 1 ? 's' : '') + ' for the school.' : 'Research looked; nothing good this time.';
  }
  // One department: two searches, one Jev pass over what is new, the best one or two to the School.
  async look(D, r) {
    const city = this.city, s = city.settings(), biz = (s.business || 'A small business') + '. ' + String(s.about || '').slice(0, 400);
    const q = await city.ai.ask({ model: city.ai.modelFor(''), effort: 'low', maxTokens: 2000, schema: QUERIES,
      system: 'You search GitHub for open-source tools that could help a small business\'s AI team. Plain search words only.',
      prompt: 'THE BUSINESS: ' + biz + '\nTHE DEPARTMENT: ' + D.name + '\nWHAT IT DOES: ' + D.does.slice(0, 600) +
        '\n\nWrite 2 short GitHub search queries (2 to 4 words each, no quotes, no filters like stars:) that would find open-source AI agent playbooks, prompts or tools that help this department do this job.' });
    const queries = (q.queries || []).map(x => String(x).replace(/[^\w\s.+-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)).filter(Boolean).slice(0, 2);
    const known = new Set(r.seen.concat(this.school.known())), cands = new Map(), took = [];
    for (const query of queries) (await this.search(query)).forEach(it => {
      const k = it && it.html_url ? keyOf(it.html_url) : '';
      if (k && !it.archived && typeOf(it.html_url) === 'repo' && !known.has(k) && !cands.has(k)) cands.set(k, it);
    });
    const list = [...cands.values()].slice(0, 8);
    if (list.length) {
      const about = it => String(it.description || 'no description').replace(/\s+/g, ' ').slice(0, 200), qs = {};
      list.forEach((it, i) => { qs['c' + i] = { type: 'noul', instructions: 'Would ' + it.full_name + ' (' + about(it) + ') help the ' + D.name + ' department of this small business do this job: ' + D.does.slice(0, 300) + '?' }; });
      const a = await city.jev.ask('THE BUSINESS: ' + biz + '\nTHE DEPARTMENT: ' + D.name + '. What it does: ' + D.does.slice(0, 600) +
        '\n\nOPEN-SOURCE TOOLS FOUND ON GITHUB:\n' + list.map(it => '- ' + it.full_name + ' (' + (Number(it.stargazers_count) || 0) + ' stars): ' + about(it)).join('\n'), qs);
      const scored = list.map((it, i) => ({ it, p: a['c' + i] ? a['c' + i].noul : null })).sort((x, y) => (y.p || 0) - (x.p || 0));
      for (const x of scored) {
        const k = keyOf(x.it.html_url);
        if (x.p !== null && x.p >= BAR && took.length < PER_DEPT && r.n < PER_DAY) {
          try { this.school.enroll(x.it.html_url, { by: 'research', note: 'found for ' + D.name }); took.push(x.it.full_name); r.n++; } catch (e) {}
          r.seen.push(k);
        } else if (x.p !== null && x.p < BAR) r.seen.push(k);   // a good one held back by today's limit is not marked, so it comes back
      }
      r.seen = r.seen.slice(-MAX_SEEN);
    }
    city.update('research', took.length ? 'Found ' + took.join(' and ') + ' for ' + D.name + '. Sent to the school.' : 'Looked for new tools for ' + D.name + '; nothing good this time.');
    return took;
  }
  // GitHub's repository search, no key: kept up in the last year, 50 stars or more, most stars first, 5 results.
  async search(query) {
    const since = new Date(this.city.now() - 365 * 864e5).toISOString().slice(0, 10);
    const j = await ghGet(this.fetch, this.github + '/search/repositories?q=' + encodeURIComponent(query).replace(/%20/g, '+') + '+stars:>50+pushed:>' + since + '&sort=stars&per_page=5');
    return j && Array.isArray(j.items) ? j.items : [];
  }
}
module.exports = { Research, PER_DAY };
