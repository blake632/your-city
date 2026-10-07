// The web side: the sign-in page, the home screen, its API, the Google connect flow and phone alerts.
// Sign-in: the password you choose the first time you open your city (or the CITY_PASSWORD variable, if you set one). It gives this
// browser a 30-day signed cookie. The password is kept only as a salted scrypt hash.
const http = require('node:http'), crypto = require('node:crypto'), fs = require('node:fs'), path = require('node:path');
const { MODELS, PROVIDERS } = require('./ai');
const { EVERY, PICKS } = require('./city');
const guide = require('./guide');

const PUBLIC = path.join(__dirname, '..', 'public');
const OPEN = { '/vendor/three.min.js': ['vendor/three.min.js', 'text/javascript'], '/sw.js': ['sw.js', 'text/javascript'], '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'], '/icon.svg': ['icon.svg', 'image/svg+xml'], '/icon-512.png': ['icon-512.png', 'image/png'], '/apple-touch-icon.png': ['apple-touch-icon.png', 'image/png'] };
const json = (res, code, obj, h) => { res.writeHead(code, Object.assign({ 'content-type': 'application/json', 'cache-control': 'no-store' }, h || {})); res.end(JSON.stringify(obj)); };
const body = req => new Promise((ok, bad) => { const ch = []; let n = 0; req.on('data', c => { n += c.length; if (n > 2e6) { bad(new Error('too large')); req.destroy(); } else ch.push(c); }); req.on('end', () => { try { ok(JSON.parse(Buffer.concat(ch).toString() || '{}') || {}); } catch (e) { ok({}); } }); req.on('error', bad); });
const hash = s => crypto.createHash('sha256').update(String(s)).digest();
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const scrypt = (pw, salt) => crypto.scryptSync(String(pw), salt, 32).toString('hex');

function createServer({ city, password = () => process.env.CITY_PASSWORD, publicUrl = () => process.env.PUBLIC_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN : ''), log = console }) {
  const store = city.store;
  let secret = store.get('cookieSecret'); if (!secret) secret = store.set('cookieSecret', crypto.randomBytes(32).toString('hex'));
  // A sign-in is tied to the current password: changing it (here or with CITY_PASSWORD) signs out every other browser.
  const mark = () => envPw() ? 'v' + hash(envPw()).toString('hex') : 'o' + ((owner() || {}).hash || '');
  const sign = v => crypto.createHmac('sha256', secret).update(v + '|' + mark()).digest('hex').slice(0, 40);
  const cookie = () => { const exp = String(Date.now() + 30 * 864e5); return 'sid=' + encodeURIComponent(exp + '.' + sign(exp)) + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + 30 * 86400 + (/^https:/.test(publicUrl()) ? '; Secure' : ''); };
  const signedIn = req => { const m = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie || ''); if (!m) return false; const [exp, mac] = decodeURIComponent(m[1]).split('.'); return !!mac && mac === sign(exp) && Number(exp) > Date.now(); };
  const origin = req => publicUrl() || ((req.headers['x-forwarded-proto'] || 'http').split(',')[0] + '://' + req.headers.host);
  const states = new Map(); let fails = [];
  // The owner's password: the CITY_PASSWORD variable if set, else the one chosen on first visit (stored as a salted hash).
  const envPw = () => (password() || '').trim(), owner = () => store.get('owner');
  const hasPassword = () => !!envPw() || !!(owner() && owner().hash);
  const checkPassword = pw => { if (envPw()) return crypto.timingSafeEqual(hash(pw || ''), hash(envPw())); const o = owner(); return !!o && crypto.timingSafeEqual(Buffer.from(scrypt(pw || '', o.salt), 'hex'), Buffer.from(o.hash, 'hex')); };
  const setPassword = pw => { const salt = crypto.randomBytes(16).toString('hex'); store.set('owner', { salt, hash: scrypt(pw, salt), at: Date.now() }); };

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x'), p = url.pathname;
    city.redirect = origin(req) + '/connect/google/callback';
    if (p === '/healthz') return json(res, 200, { ok: true });
    if (OPEN[p]) { const [f, type] = OPEN[p]; res.writeHead(200, { 'content-type': type, 'cache-control': p === '/sw.js' ? 'no-cache' : p.startsWith('/vendor/') ? 'public, max-age=31536000, immutable' : 'public, max-age=86400' }); return res.end(fs.readFileSync(path.join(PUBLIC, f))); }
    // ---- sign-in ----
    // First visit: nothing opens until the owner chooses a password. Only the first person to do it becomes the owner.
    if (!hasPassword()) {
      if (p === '/setup' && req.method === 'POST') {
        const b = await body(req), pw = String(b.password || '');
        if (pw.length < 8) return json(res, 400, { error: 'Use at least 8 characters.' });
        if (hasPassword()) return json(res, 409, { error: 'This city already has a password.' });
        setPassword(pw); return json(res, 200, { ok: true }, { 'set-cookie': cookie() });
      }
      if (p.startsWith('/api/')) return json(res, 401, { error: 'Choose a password first.' });
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); return res.end(firstRunPage());
    }
    if (p === '/setup') return json(res, 409, { error: 'This city already has a password. Sign in instead.' });
    if (p === '/login' && req.method === 'POST') {
      fails = fails.filter(t => t > Date.now() - 10 * 60e3);
      if (fails.length >= 10) return json(res, 429, { error: 'Too many tries. Wait 10 minutes.' });
      const b = await body(req);
      if (!checkPassword(b.password)) { fails.push(Date.now()); return json(res, 401, { error: envPw() ? 'That password is not right. It is the CITY_PASSWORD variable in Railway.' : 'That password is not right.' }); }
      return json(res, 200, { ok: true }, { 'set-cookie': cookie() });
    }
    if (!signedIn(req)) {
      if (p.startsWith('/api/')) return json(res, 401, { error: 'Sign in again.' });
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); return res.end(loginPage());
    }
    if (p === '/logout') { res.writeHead(302, { location: '/', 'set-cookie': 'sid=; Path=/; Max-Age=0' }); return res.end(); }
    // The 3D city: the page with the owner's departments in it (the home screen shows it in a frame; it also opens on its own).
    if (p === '/city3d') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(fs.readFileSync(path.join(PUBLIC, 'city3d.html'), 'utf8').replace('<!--CITY_DATA-->', () => '<script>window.CITY_DATA=' + JSON.stringify(cityData(city)).replace(/</g, '\\u003c') + '</script>')); }
    if (p === '/' || p === '/index.html') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); return res.end(fs.readFileSync(path.join(PUBLIC, 'index.html'))); }
    // ---- Google: press Connect, Google asks you, Google sends you back here ----
    if (p === '/connect/google') {
      if (!city.google.configured()) { res.writeHead(302, { location: '/#guide' }); return res.end(); }
      const st = crypto.randomBytes(16).toString('hex'); states.set(st, Date.now() + 10 * 60e3);
      res.writeHead(302, { location: city.google.authUrl(city.redirect, st) }); return res.end();
    }
    if (p === '/connect/google/callback') {
      const st = url.searchParams.get('state'), until = states.get(st); states.delete(st);
      let msg;
      if (url.searchParams.get('error')) msg = 'Google said: ' + url.searchParams.get('error') + '. Nothing was connected.';
      else if (!until || until < Date.now()) msg = 'That sign-in took too long. Press Connect Google again.';
      else try { const who = await city.google.exchange(url.searchParams.get('code'), city.redirect); city.departments().forEach(d => city.clearProblem(d.id)); msg = 'Gmail is connected' + (who ? ' (' + who + ')' : '') + '. Your departments start within a few minutes.'; }
      catch (e) { city.problem('guide', e); msg = e.message + ' Open the Guide for the fix.'; }
      res.writeHead(302, { location: '/?said=' + encodeURIComponent(msg) + '#settings' }); return res.end();
    }
    // ---- OpenRouter: press Connect, sign in there, and the city gets its own AI key. Nothing to copy. ----
    // The state rides in the path (OpenRouter adds ?code= to the callback); the owner must be signed in, and PKCE ties the code to this city.
    if (p === '/connect/openrouter') {
      const st = crypto.randomBytes(16).toString('hex'), link = city.ai.openRouterLink(origin(req) + '/connect/openrouter/done/' + st);
      states.set('or:' + st, { until: Date.now() + 10 * 60e3, verifier: link.verifier });
      res.writeHead(302, { location: link.url }); return res.end();
    }
    if (p.startsWith('/connect/openrouter/done/')) {
      const key = 'or:' + p.split('/').pop(), s = states.get(key); states.delete(key);
      let msg;
      if (!s || s.until < Date.now()) msg = 'That sign-in took too long. Press Connect with OpenRouter again.';
      else if (!url.searchParams.get('code')) msg = 'OpenRouter did not connect. Nothing changed.';
      else try { const model = await city.ai.openRouterKey(url.searchParams.get('code'), s.verifier); city.departments().forEach(d => city.clearProblem(d.id)); msg = 'Your AI is connected through OpenRouter' + (model ? ', using ' + model : '') + '. Add a little credit at openrouter.ai, then Credits.'; }
      catch (e) { city.problem('guide', e); msg = e.message; }
      res.writeHead(302, { location: '/?said=' + encodeURIComponent(msg) + '#settings' }); return res.end();
    }
    // ---- the home screen's API ----
    try {
      if (p === '/api/city3d') return json(res, 200, cityData(city));
      if (p === '/api/state') return json(res, 200, Object.assign(state(city, city.redirect), { passwordFrom: envPw() ? 'variable' : 'app' }));
      if (p === '/api/decide' && req.method === 'POST') { const b = await body(req); return json(res, 200, await city.decide(String(b.id || ''), String(b.decision || ''))); }
      if (p === '/api/answer' && req.method === 'POST') { const b = await body(req); return json(res, 200, await city.answer(String(b.id || ''), b.answer)); }
      if (p === '/api/feedback' && req.method === 'POST') { const b = await body(req); const c = await city.feedback(String(b.id || ''), b.note); return json(res, 200, { ok: true, card: c }); }
      if (p === '/api/settings' && req.method === 'POST') { city.saveSettings(await body(req)); return json(res, 200, { ok: true }); }
      if (p === '/api/agent' && req.method === 'POST') { const b = await body(req); city.setAgent(String(b.id || ''), b); return json(res, 200, { ok: true }); }
      // Build a department, or change one (the owner names it and says what it does); remove one.
      if (p === '/api/department' && req.method === 'POST') {
        const b = await body(req), fresh = !b.id;
        const d = city.saveDepartment({ id: b.id || undefined, kind: b.kind, name: b.name, does: b.does, every: b.every, model: b.model, review: b.review, judge: b.judge, audience: b.audience, on: b.on });
        if (fresh) city.update(d.id, 'The ' + d.name + ' department is open. It works ' + EVERY[d.every] + '.');
        return json(res, 200, { ok: true, department: d });
      }
      if (p === '/api/autopilot' && req.method === 'POST') { const b = await body(req); city.setAutopilot(String(b.id || ''), !!b.on); return json(res, 200, { ok: true }); }
      if (p === '/api/department' && req.method === 'DELETE') { const b = await body(req); city.removeDepartment(String(b.id || '')); return json(res, 200, { ok: true }); }
      // The School: enroll a tool by its GitHub link; the Research desk: look for new tools now.
      if (p === '/api/school' && req.method === 'POST') { if (!city.school) throw new Error('The School is not open in this city.'); const b = await body(req); return json(res, 200, { ok: true, student: city.school.enroll(b.ref, { note: b.note }) }); }
      if (p === '/api/research' && req.method === 'POST') { if (!city.research) throw new Error('The Research desk is not open in this city.'); return json(res, 200, { ok: true, said: await city.research.run() }); }
      if (p === '/api/askcity' && req.method === 'POST') { const b = await body(req); return json(res, 200, await city.askCity(b.text)); }
      if (p === '/api/run' && req.method === 'POST') { const b = await body(req); return json(res, 200, { ok: true, said: await city.runAgent(String(b.agent || '')) }); }
      if (p === '/api/ask' && req.method === 'POST') { const b = await body(req); return json(res, 200, await guide.ask(city, b.question, { redirect: city.redirect })); }
      if (p === '/api/google/disconnect' && req.method === 'POST') { city.google.disconnect(); return json(res, 200, { ok: true }); }
      // The easy way: Gmail address + app password, checked with Gmail itself before it is kept. The password never comes back to the page.
      if (p === '/api/gmail/password' && req.method === 'POST') { const b = await body(req); const email = await city.google.connectPassword(b.email, b.password); city.departments().forEach(d => city.clearProblem(d.id)); city.clearProblem('guide'); return json(res, 200, { ok: true, email }); }
      if (p === '/api/google/client' && req.method === 'POST') { const b = await body(req); return json(res, 200, Object.assign({ ok: true }, city.google.saveClient(b))); }
      // Your AI: save the service, key, address and main model, then check the key by listing its models (no cost).
      if (p === '/api/ai' && req.method === 'POST') {
        const b = await body(req), before = city.store.get('ai', null); city.ai.save(b);
        try {
          const models = await city.ai.models(), errs = city.store.get('errors', {});
          Object.keys(errs).forEach(a => { if (/^(ai_|no_ai)/.test(errs[a].code)) city.clearProblem(a); });   // the key works now: its old fix cards close
          return json(res, 200, { ok: true, models, needs: city.ai.needs() });
        }
        catch (e) {
          const fix = guide.fixFor(e.code || 'unknown', { ai: PROVIDERS[city.ai.conf().provider], message: e.message });
          if (e.code === 'ai_key_wrong' && b.key) city.store.set('ai', before || {});   // a key that does not work never replaces the setup that did
          return json(res, 200, { ok: false, error: e.message, fix });
        }
      }
      // Jev, the fast judge: save the Vercel AI Gateway key and test it with one tiny question (a fraction of a cent). A wrong key is not kept.
      if (p === '/api/jev' && req.method === 'POST') {
        const b = await body(req), before = city.store.get('jev', null); city.jev.save({ key: b.key, off: !!b.off });
        if (!city.jev.key()) return json(res, 200, { ok: true, mode: 'ai' });
        try { await city.jev.real('Test.', { ok: { type: 'noul', instructions: 'Is this a test?' } }); return json(res, 200, { ok: true, mode: 'jev' }); }
        catch (e) { if (b.key) city.store.set('jev', before || {}); const fix = guide.fixFor(e.code || 'jev_down', {}); return json(res, 200, { ok: false, error: e.message, fix }); }
      }
      if (p === '/api/password' && req.method === 'POST') {
        if (envPw()) return json(res, 400, { error: 'Your password is the CITY_PASSWORD variable in Railway. Change it there.' });
        const b = await body(req);
        if (!checkPassword(b.current)) return json(res, 400, { error: 'Your current password is not right.' });
        if (String(b.next || '').length < 8) return json(res, 400, { error: 'Use at least 8 characters.' });
        setPassword(String(b.next)); return json(res, 200, { ok: true }, { 'set-cookie': cookie() });
      }
      if (p === '/api/push') {
        const push = city.push; if (!push) return json(res, 404, { error: 'not found' });
        if (req.method === 'GET') return json(res, 200, { key: push.key(), devices: push.subs().length });
        const b = await body(req);
        if (req.method === 'DELETE') return json(res, 200, { ok: push.remove(String(b.endpoint || '')) });
        if (b.test) { const n = await push.notify({ title: 'Alerts are on', body: 'This is how your city will reach you. Tap to open it.', url: '/', tag: 'test' }); return json(res, 200, { ok: n > 0, sent: n }); }
        return push.add(b.sub, (/iPhone|iPad|Mac|Android|Windows/.exec(req.headers['user-agent'] || '') || ['device'])[0]) ? json(res, 200, { ok: true }) : json(res, 400, { error: 'Alerts could not be set up on this device.' });
      }
    } catch (e) { return json(res, e.code ? 502 : 400, { error: e.message, code: e.code || '' }); }
    return json(res, 404, { error: 'not found' });
  }
  return http.createServer((req, res) => handle(req, res).catch(e => { log.error('web: ' + e.message); if (!res.headersSent) json(res, 500, { error: e.message }); }));
}
// Your AI as Settings shows it: the service, whether a key is saved (never the key), the address, the main model, and the models to pick from.
function aiState(city) {
  const c = city.ai.conf(), list = city.ai.savedModels();
  return { provider: c.provider, name: c.name, services: city.ai.services(), keySet: !!c.key, keyFrom: c.keyFrom, baseUrl: c.provider === 'custom' ? c.base : '',
    model: c.model, needs: city.ai.needs(), keyAt: c.keyAt, models: Object.fromEntries(list.map(id => [id, MODELS[id] ? MODELS[id].label : id])) };
}
// What the 3D city draws: each department (name, kind, what waits on you, whether it is working now, its open question, its latest lines),
// City Hall's problems, the School and the Research desk, and the latest Panel result. No keys, no email text.
function cityData(city) {
  const now = Date.now(), ups = city.updates(), cards = city.waiting(), agents = city.agents(), live = a => !!(a && a.last && now - a.last.at < 15 * 60e3);
  const lines = id => ups.filter(u => u.agent === id).slice(0, 3).map(u => String(u.text).slice(0, 90));
  const last = id => (ups.find(u => u.agent === id) || {}).ts || 0;
  const problems = guide.checks(city, { redirect: city.redirect || '' }).filter(c => !c.ok).length + cards.filter(c => c.kind === 'fix').length;
  const judged = cards.concat(ups).filter(c => c.judged && c.judged.panel).sort((a, b) => b.ts - a.ts)[0], P = judged && judged.judged;
  const dist = P ? [1, 2, 3, 4, 5].map(n => P.panel.reactions.filter(r => r.score === n).length) : null;
  const post = cards.find(c => c.kind === 'post');
  return { business: city.settings().business || '',
    hall: { need: problems, lines: lines('guide') },
    research: { need: 0, live: now - last('research') < 15 * 60e3, lines: lines('research') },
    school: { need: cards.filter(c => c.agent === 'school').length, live: now - last('school') < 15 * 60e3, lines: lines('school') },
    departments: agents.filter(a => a.id !== 'guide').map(a => ({ id: a.id, name: a.name, kind: a.kind, does: String(a.does || '').slice(0, 160), need: a.need, live: live(a), on: a.on, judge: !!a.judge,
      ask: (cards.find(c => c.agent === a.id && c.kind === 'ask') || {}).question || ((cards.find(c => c.agent === a.id && c.kind === 'propose') || {}).proposal ? 'We need a new building: ' + cards.find(c => c.agent === a.id && c.kind === 'propose').proposal.name : ''),
      built: (city.department(a.id) || {}).built || 0, lines: lines(a.id) })),
    ranks: city.ranks().slice(0, 10), tip: city.store.get('tip', null),
    proposal: (cards.find(c => c.kind === 'propose' && !city.department(c.agent)) || {}).proposal ? { by: cards.find(c => c.kind === 'propose' && !city.department(c.agent)).agent, name: cards.find(c => c.kind === 'propose' && !city.department(c.agent)).proposal.name } : null,
    panel: P ? { title: String(judged.title || '').replace(/^[^:]{0,40}:\s*/, '').slice(0, 40), question: P.question, avg: P.panel.avg, pct: Math.round(P.panel.top / P.panel.n * 100), dist } : null,
    led: post ? String(post.title).replace(/^[^:]{0,20}:\s*/, '').slice(0, 40) : '' };
}
// Everything the home screen shows, in one answer. Never a key, a password or the Google pass.
function state(city, redirect) {
  const s = city.settings();
  return { settings: s, firstRun: !s.business || !city.departments().length, agents: city.agents(), picks: PICKS, cards: city.waiting(), updates: city.updates().slice(0, 150), checks: guide.checks(city, { redirect }),
    google: { configured: city.google.configured(), connected: city.google.connected(), email: city.google.email(), mode: city.google.mode() }, redirect,
    spend: { today: Math.round(city.ai.spentToday() * 100) / 100, cap: city.ai.cap() }, store: city.store.kind(), alerts: s.alerts,
    ai: aiState(city), googleClient: { id: (city.store.get('googleClient') || {}).id || '', secretSet: !!(city.store.get('googleClient') || {}).secret, fromVariable: !!process.env.GOOGLE_CLIENT_ID },
    models: aiState(city).models, every: EVERY, ranks: city.ranks(), tip: city.store.get('tip', null), school: city.school ? city.school.state().students.slice().reverse().map(st => ({ id: st.id, ref: st.ref, type: st.type, by: st.by, note: st.note, step: st.step, dept: st.dept, scores: st.scores, passed: st.passed, why: st.why, at: st.at })) : [], jev: { mode: city.jev.mode(), keySet: !!city.jev.key(), keyFrom: city.jev.keyFrom(), problem: city.jev.problem() } };
}
const shell = (title, inner, script) => '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title) + '</title>' +
  '<link rel="manifest" href="/manifest.webmanifest"><link rel="icon" href="/icon.svg"><style>:root{--bg:#f6f3ec;--ink:#1a1813;--dim:rgba(26,24,19,.66);--accent:#8a5a2b;--card:#fffdf8;--line:rgba(26,24,19,.14)}' +
  '@media(prefers-color-scheme:dark){:root{--bg:#14120f;--ink:#efe9dd;--dim:rgba(239,233,221,.68);--accent:#d2a36c;--card:#1c1915;--line:rgba(239,233,221,.14)}}' +
  'body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:17px/1.5 system-ui,-apple-system,sans-serif;padding:24px 16px;box-sizing:border-box}' +
  'main{max-width:460px;width:100%}h1{font:400 2.2rem/1.1 Georgia,serif;margin:0 0 10px}h1 em{color:var(--accent)}p,li{color:var(--dim)}ol{padding-left:22px}li{margin:6px 0}code{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:1px 6px;color:var(--ink)}' +
  'input{width:100%;box-sizing:border-box;font:inherit;padding:14px;border:1px solid var(--line);border-radius:12px;background:var(--card);color:var(--ink);margin-top:12px}' +
  'button{width:100%;margin-top:12px;padding:15px;border:0;border-radius:12px;background:var(--ink);color:var(--bg);font:600 16px system-ui;cursor:pointer}#m{min-height:1.5em}.muted{font-size:14px;margin-top:28px}</style></head><body><main>' + inner + '</main>' + (script ? '<script>' + script + '</script>' : '') + '</body></html>';
function loginPage() {
  return shell('Sign in', '<h1>Your <em>City</em></h1><p>Enter your city password.</p><form id=f><input id=pw type=password autocomplete=current-password placeholder="Password" autofocus><button>Open my city</button></form><p id=m></p>' +
    '<p class=muted>Forgot it, or never chose one? In Railway, click your app, then Variables. Add <code>CITY_PASSWORD</code> with a new password. It takes over in a minute and signs everyone else out.</p>',
    'document.getElementById("f").onsubmit=async e=>{e.preventDefault();const r=await fetch("/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({password:document.getElementById("pw").value})});if(r.ok)return location.reload();document.getElementById("m").textContent=(await r.json().catch(()=>({}))).error||"That did not work.";};');
}
// The very first visit: choose the password that opens your city.
function firstRunPage() {
  return shell('Welcome', '<h1>Your <em>City</em></h1><p>Your city is running. Choose the password that opens it. Only you should see this page: the first person to choose a password becomes the owner.</p>' +
    '<form id=f><input id=pw type=password autocomplete=new-password placeholder="Choose a password (8 or more characters)" autofocus><input id=pw2 type=password autocomplete=new-password placeholder="Type it again"><button>Open my city</button></form><p id=m></p>',
    'document.getElementById("f").onsubmit=async e=>{e.preventDefault();const a=document.getElementById("pw").value,b=document.getElementById("pw2").value,m=document.getElementById("m");if(a!==b)return m.textContent="The two passwords are not the same.";' +
    'const r=await fetch("/setup",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({password:a})});if(r.ok)return location.reload();m.textContent=(await r.json().catch(()=>({}))).error||"That did not work.";};');
}
module.exports = { createServer, state };
