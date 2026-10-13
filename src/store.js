// Where the city keeps everything: settings, cards, updates, the AI spend meter, the Google connection.
// With DATABASE_URL (a Postgres database, e.g. Railway's) it lasts through restarts and redeploys. Without one it writes a file
// (data/city.json) - fine on your own computer, but on Railway that file is wiped on every deploy, and the Guide says so.
// Reads come from memory; writes update memory at once and are saved in the background, in order.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
// Secrets at rest: the Gmail app password, the Google pass, the AI and Jev keys, page tokens, the alert keys and the sign-in secret are
// locked (AES-256-GCM) before they reach the database or data/city.json, with a key the database never holds: the CITY_SECRET_KEY
// variable (hosted cities get one when they are built). Memory holds them plain, as before. Without the variable they are kept as before
// and the Guide asks for one. A locked value that cannot be opened (the variable changed or is gone) is left out, so Settings asks again.
const SEALED = new Set(['gmailPassword', 'google', 'googleClient', 'ai', 'jev', 'social', 'vapid', 'cookieSecret']);
const keyOf = k => k ? crypto.createHash('sha256').update(String(k)).digest() : null;
function seal(key, v) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv), data = Buffer.concat([c.update(JSON.stringify(v), 'utf8'), c.final()]);
  return { sealed: 1, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') };
}
function unseal(key, v) {
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(v.iv, 'base64')); d.setAuthTag(Buffer.from(v.tag, 'base64'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(v.data, 'base64')), d.final()]).toString('utf8'));
}
const isSealed = v => !!(v && typeof v === 'object' && v.sealed === 1 && v.iv && v.tag && v.data);

class Store {
  constructor({ pool = null, file = null, secret = null } = {}) { this.pool = pool; this.file = file; this.key = keyOf(secret); this.locked = []; this.kv = new Map(); this.cols = new Map(); this.q = Promise.resolve(); this.failed = null; this.timer = null; }
  static async open({ url = process.env.DATABASE_URL, file = path.join(process.cwd(), 'data', 'city.json'), memory = false, secret = process.env.CITY_SECRET_KEY } = {}) {
    if (memory) return new Store({ secret });
    if (url) {
      const { Pool } = require('pg');
      const pool = new Pool({ connectionString: url, ssl: /sslmode=disable|localhost|127\.0\.0\.1|railway\.internal/.test(url) ? false : { rejectUnauthorized: false } });
      await pool.query('create table if not exists city_kv (k text primary key, v jsonb)');
      await pool.query('create table if not exists city_docs (col text, id text, v jsonb, ts bigint, primary key (col, id))');
      const s = new Store({ pool, secret });
      (await pool.query('select k, v from city_kv')).rows.forEach(r => s.load(r.k, r.v));
      (await pool.query('select col, id, v from city_docs order by ts')).rows.forEach(r => s.col(r.col).set(r.id, r.v));
      s.relock(); return s;
    }
    const s = new Store({ file, secret });
    try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); Object.entries(j.kv || {}).forEach(([k, v]) => s.load(k, v)); Object.entries(j.docs || {}).forEach(([c, d]) => Object.entries(d).forEach(([id, v]) => s.col(c).set(id, v))); } catch (e) {}
    s.relock(); return s;
  }
  // One stored value into memory: a locked one is opened with the key, or left out when it cannot be.
  load(k, v) {
    if (!isSealed(v)) return this.kv.set(k, v);
    try { if (!this.key) throw new Error('no key'); this.kv.set(k, unseal(this.key, v)); } catch (e) { this.locked.push(k); console.error('A saved secret (' + k + ') could not be opened: CITY_SECRET_KEY is missing or changed.'); }
  }
  // With a key, a secret still stored plain (saved before the key was set) is locked now.
  relock() { if (this.key) for (const k of SEALED) if (this.kv.has(k)) this.set(k, this.kv.get(k)); }
  locks() { return !!this.key; }
  saved(k, v) { return this.key && SEALED.has(k) ? seal(this.key, v) : v; }
  kind() { return this.pool ? 'postgres' : this.file ? 'file' : 'memory'; }
  write(sql, args) {
    if (this.pool) { this.q = this.q.then(() => this.pool.query(sql, args)).then(() => { this.failed = null; }).catch(e => { this.failed = e; console.error('database write failed: ' + e.message); }); return; }
    if (!this.file) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.saveFile(), 200);
  }
  saveFile() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const docs = {}; for (const [c, m] of this.cols) docs[c] = Object.fromEntries(m);
      const kv = {}; for (const [k, v] of this.kv) kv[k] = this.saved(k, v);
      const tmp = this.file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify({ kv, docs })); fs.renameSync(tmp, this.file); this.failed = null;
    } catch (e) { this.failed = e; console.error('saving data/city.json failed: ' + e.message); }
  }
  async flush() { if (this.timer) { clearTimeout(this.timer); this.timer = null; this.saveFile(); } return this.q; }
  get(k, dflt = null) { return this.kv.has(k) ? this.kv.get(k) : dflt; }
  set(k, v) { this.kv.set(k, v); this.write('insert into city_kv values ($1, $2) on conflict (k) do update set v = excluded.v', [k, JSON.stringify(this.saved(k, v))]); return v; }
  del(k) { this.kv.delete(k); this.write('delete from city_kv where k = $1', [k]); }
  col(c) { if (!this.cols.has(c)) this.cols.set(c, new Map()); return this.cols.get(c); }
  doc(c, id) { return this.col(c).get(id) || null; }
  put(c, id, v) { this.col(c).delete(id); this.col(c).set(id, v); this.write('insert into city_docs values ($1, $2, $3, $4) on conflict (col, id) do update set v = excluded.v, ts = excluded.ts', [c, id, JSON.stringify(v), Date.now()]); return v; }
  drop(c, id) { this.col(c).delete(id); this.write('delete from city_docs where col = $1 and id = $2', [c, id]); }
  list(c) { return [...this.col(c).values()]; }
  // keep only the newest n of a collection (updates, the AI log)
  trim(c, n) { const ids = [...this.col(c).keys()]; ids.slice(0, Math.max(0, ids.length - n)).forEach(id => this.drop(c, id)); }
}
module.exports = { Store };
