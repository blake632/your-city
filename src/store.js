// Where the city keeps everything: settings, cards, updates, the AI spend meter, the Google connection.
// With DATABASE_URL (a Postgres database, e.g. Railway's) it lasts through restarts and redeploys. Without one it writes a file
// (data/city.json) - fine on your own computer, but on Railway that file is wiped on every deploy, and the Guide says so.
// Reads come from memory; writes update memory at once and are saved in the background, in order.
const fs = require('node:fs'), path = require('node:path');

class Store {
  constructor({ pool = null, file = null } = {}) { this.pool = pool; this.file = file; this.kv = new Map(); this.cols = new Map(); this.q = Promise.resolve(); this.failed = null; this.timer = null; }
  static async open({ url = process.env.DATABASE_URL, file = path.join(process.cwd(), 'data', 'city.json'), memory = false } = {}) {
    if (memory) return new Store();
    if (url) {
      const { Pool } = require('pg');
      const pool = new Pool({ connectionString: url, ssl: /sslmode=disable|localhost|127\.0\.0\.1|railway\.internal/.test(url) ? false : { rejectUnauthorized: false } });
      await pool.query('create table if not exists city_kv (k text primary key, v jsonb)');
      await pool.query('create table if not exists city_docs (col text, id text, v jsonb, ts bigint, primary key (col, id))');
      const s = new Store({ pool });
      (await pool.query('select k, v from city_kv')).rows.forEach(r => s.kv.set(r.k, r.v));
      (await pool.query('select col, id, v from city_docs order by ts')).rows.forEach(r => s.col(r.col).set(r.id, r.v));
      return s;
    }
    const s = new Store({ file });
    try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); Object.entries(j.kv || {}).forEach(([k, v]) => s.kv.set(k, v)); Object.entries(j.docs || {}).forEach(([c, d]) => Object.entries(d).forEach(([id, v]) => s.col(c).set(id, v))); } catch (e) {}
    return s;
  }
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
      const tmp = this.file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify({ kv: Object.fromEntries(this.kv), docs })); fs.renameSync(tmp, this.file); this.failed = null;
    } catch (e) { this.failed = e; console.error('saving data/city.json failed: ' + e.message); }
  }
  async flush() { if (this.timer) { clearTimeout(this.timer); this.timer = null; this.saveFile(); } return this.q; }
  get(k, dflt = null) { return this.kv.has(k) ? this.kv.get(k) : dflt; }
  set(k, v) { this.kv.set(k, v); this.write('insert into city_kv values ($1, $2) on conflict (k) do update set v = excluded.v', [k, JSON.stringify(v)]); return v; }
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
