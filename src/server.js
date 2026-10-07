// The web side: the sign-in page, the home screen, its API, the Google connect flow and phone alerts.
// Sign-in is the password you put in the CITY_PASSWORD variable; it gives this browser a 30-day signed cookie.
const http = require('node:http'), crypto = require('node:crypto'), fs = require('node:fs'), path = require('node:path');
const { MODELS } = require('./ai');
const { EVERY } = require('./city');
const guide = require('./guide');

const PUBLIC = path.join(__dirname, '..', 'public');
const OPEN = { '/sw.js': ['sw.js', 'text/javascript'], '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'], '/icon.svg': ['icon.svg', 'image/svg+xml'], '/icon-512.png': ['icon-512.png', 'image/png'], '/apple-touch-icon.png': ['apple-touch-icon.png', 'image/png'] };
const json = (res, code, obj, h) => { res.writeHead(code, Object.assign({ 'content-type': 'application/json', 'cache-control': 'no-store' }, h || {})); res.end(JSON.stringify(obj)); };
const body = req => new Promise((ok, bad) => { const ch = []; let n = 0; req.on('data', c => { n += c.length; if (n > 2e6) { bad(new Error('too large')); req.destroy(); } else ch.push(c); }); req.on('end', () => { try { ok(JSON.parse(Buffer.concat(ch).toString() || '{}') || {}); } catch (e) { ok({}); } }); req.on('error', bad); });
const hash = s => crypto.createHash('sha256').update(String(s)).digest();
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function createServer({ city, password = () => process.env.CITY_PASSWORD, publicUrl = () => process.env.PUBLIC_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN : ''), log = console }) {
  const store = city.store;
  let secret = store.get('cookieSecret'); if (!secret) secret = store.set('cookieSecret', crypto.randomBytes(32).toString('hex'));
  const sign = v => crypto.createHmac('sha256', secret).update(v).digest('hex').slice(0, 40);
  const cookie = () => { const exp = String(Date.now() + 30 * 864e5); return 'sid=' + encodeURIComponent(exp + '.' + sign(exp)) + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + 30 * 86400 + (/^https:/.test(publicUrl()) ? '; Secure' : ''); };
  const signedIn = req => { const m = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie || ''); if (!m) return false; const [exp, mac] = decodeURIComponent(m[1]).split('.'); return !!mac && mac === sign(exp) && Number(exp) > Date.now(); };
  const origin = req => publicUrl() || ((req.headers['x-forwarded-proto'] || 'http').split(',')[0] + '://' + req.headers.host);
  const states = new Map(); let fails = [];

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x'), p = url.pathname;
    city.redirect = origin(req) + '/connect/google/callback';
    if (p === '/healthz') return json(res, 200, { ok: true });
    if (OPEN[p]) { const [f, type] = OPEN[p]; res.writeHead(200, { 'content-type': type, 'cache-control': p === '/sw.js' ? 'no-cache' : 'public, max-age=86400' }); return res.end(fs.readFileSync(path.join(PUBLIC, f))); }
    // ---- sign-in ----
    if (!(password() || '').trim()) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); return res.end(setupPage()); }
    if (p === '/login' && req.method === 'POST') {
      fails = fails.filter(t => t > Date.now() - 10 * 60e3);
      if (fails.length >= 10) return json(res, 429, { error: 'Too many tries. Wait 10 minutes.' });
      const b = await body(req);
      if (!crypto.timingSafeEqual(hash(b.password || ''), hash(password().trim()))) { fails.push(Date.now()); return json(res, 401, { error: 'That password is not right. It is the CITY_PASSWORD you set in Railway.' }); }
      return json(res, 200, { ok: true }, { 'set-cookie': cookie() });
    }
    if (!signedIn(req)) {
      if (p.startsWith('/api/')) return json(res, 401, { error: 'Sign in again.' });
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); return res.end(loginPage());
    }
    if (p === '/logout') { res.writeHead(302, { location: '/', 'set-cookie': 'sid=; Path=/; Max-Age=0' }); return res.end(); }
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
      else try { const who = await city.google.exchange(url.searchParams.get('code'), city.redirect); city.clearProblem('leads'); city.clearProblem('mailroom'); msg = 'Gmail is connected' + (who ? ' (' + who + ')' : '') + '. Your agents start within a few minutes.'; }
      catch (e) { city.problem('guide', e); msg = e.message + ' Open the Guide for the fix.'; }
      res.writeHead(302, { location: '/?said=' + encodeURIComponent(msg) + '#settings' }); return res.end();
    }
    // ---- the home screen's API ----
    try {
      if (p === '/api/state') return json(res, 200, state(city, city.redirect));
      if (p === '/api/decide' && req.method === 'POST') { const b = await body(req); return json(res, 200, await city.decide(String(b.id || ''), String(b.decision || ''))); }
      if (p === '/api/feedback' && req.method === 'POST') { const b = await body(req); const c = await city.feedback(String(b.id || ''), b.note); return json(res, 200, { ok: true, card: c }); }
      if (p === '/api/settings' && req.method === 'POST') { city.saveSettings(await body(req)); return json(res, 200, { ok: true }); }
      if (p === '/api/agent' && req.method === 'POST') { const b = await body(req); city.setAgent(String(b.id || ''), b); return json(res, 200, { ok: true }); }
      if (p === '/api/custom' && req.method === 'POST') { const c = city.saveCustom(await body(req)); city.update(c.id, 'New agent "' + c.name + '" is set up. It runs ' + EVERY[c.every] + '.'); return json(res, 200, { ok: true, agent: c }); }
      if (p === '/api/custom' && req.method === 'DELETE') { const b = await body(req); city.removeCustom(String(b.id || '')); return json(res, 200, { ok: true }); }
      if (p === '/api/run' && req.method === 'POST') { const b = await body(req); return json(res, 200, { ok: true, said: await city.runAgent(String(b.agent || '')) }); }
      if (p === '/api/ask' && req.method === 'POST') { const b = await body(req); return json(res, 200, await guide.ask(city, b.question, { redirect: city.redirect })); }
      if (p === '/api/google/disconnect' && req.method === 'POST') { city.google.disconnect(); return json(res, 200, { ok: true }); }
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
// Everything the home screen shows, in one answer. Never a key, a password or the Google pass.
function state(city, redirect) {
  const s = city.settings();
  return { settings: s, firstRun: !s.business, agents: city.agents(), cards: city.waiting(), updates: city.updates().slice(0, 150), checks: guide.checks(city, { redirect }),
    google: { configured: city.google.configured(), connected: city.google.connected(), email: city.google.email() }, redirect,
    spend: { today: Math.round(city.ai.spentToday() * 100) / 100, cap: city.ai.cap() }, store: city.store.kind(), alerts: s.alerts,
    models: Object.fromEntries(Object.entries(MODELS).map(([k, m]) => [k, m.label])), every: EVERY };
}
const shell = (title, inner, script) => '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title) + '</title>' +
  '<link rel="manifest" href="/manifest.webmanifest"><link rel="icon" href="/icon.svg"><style>:root{--bg:#f6f3ec;--ink:#1a1813;--dim:rgba(26,24,19,.66);--accent:#8a5a2b;--card:#fffdf8;--line:rgba(26,24,19,.14)}' +
  '@media(prefers-color-scheme:dark){:root{--bg:#14120f;--ink:#efe9dd;--dim:rgba(239,233,221,.68);--accent:#d2a36c;--card:#1c1915;--line:rgba(239,233,221,.14)}}' +
  'body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:17px/1.5 system-ui,-apple-system,sans-serif;padding:24px 16px;box-sizing:border-box}' +
  'main{max-width:460px;width:100%}h1{font:400 2.2rem/1.1 Georgia,serif;margin:0 0 10px}h1 em{color:var(--accent)}p,li{color:var(--dim)}ol{padding-left:22px}li{margin:6px 0}code{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:1px 6px;color:var(--ink)}' +
  'input{width:100%;box-sizing:border-box;font:inherit;padding:14px;border:1px solid var(--line);border-radius:12px;background:var(--card);color:var(--ink);margin-top:12px}' +
  'button{width:100%;margin-top:12px;padding:15px;border:0;border-radius:12px;background:var(--ink);color:var(--bg);font:600 16px system-ui;cursor:pointer}#m{min-height:1.5em}</style></head><body><main>' + inner + '</main>' + (script ? '<script>' + script + '</script>' : '') + '</body></html>';
function loginPage() {
  return shell('Sign in', '<h1>Your <em>City</em></h1><p>Enter your city password. It is the CITY_PASSWORD you set in Railway.</p><form id=f><input id=pw type=password autocomplete=current-password placeholder="Password" autofocus><button>Open my city</button></form><p id=m></p>',
    'document.getElementById("f").onsubmit=async e=>{e.preventDefault();const r=await fetch("/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({password:document.getElementById("pw").value})});if(r.ok)return location.reload();document.getElementById("m").textContent=(await r.json().catch(()=>({}))).error||"That did not work.";};');
}
// Before CITY_PASSWORD exists nothing else opens; this page says how to set it, and which other variables are already there (yes or no only).
function setupPage() {
  const has = k => !!(process.env[k] || '').trim(), row = (k, why) => '<li><code>' + k + '</code> ' + (has(k) ? '✓ set' : '✗ not set yet') + ' (' + why + ')</li>';
  return shell('Almost there', '<h1>Almost <em>there</em></h1><p>Your city is running. One step before you can open it: give it a password.</p><ol>' +
    '<li>In Railway, open your project and click your app (not the database).</li><li>Click the Variables tab, then New Variable.</li><li>Name: <code>CITY_PASSWORD</code>. Value: a password only you know.</li><li>Railway restarts the city. Reload this page in a minute.</li></ol>' +
    '<p>Where the rest stands:</p><ul>' + row('ANTHROPIC_API_KEY', 'the AI key, needed') + row('DATABASE_URL', 'saves your city, needed on Railway') + row('GOOGLE_CLIENT_ID', 'for Gmail, later') + row('GOOGLE_CLIENT_SECRET', 'for Gmail, later') + '</ul><p>Once you are in, the Guide walks you through the rest.</p>');
}
module.exports = { createServer, state };
