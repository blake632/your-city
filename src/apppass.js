// Gmail the easy way: your Gmail address and a Google "app password" (myaccount.google.com/apppasswords). No Google Cloud project.
// The city reads, labels and drafts over IMAP (imap.gmail.com) and sends over SMTP (smtp.gmail.com), only when you press Approve.
// Ids match Gmail's own (hex message and thread ids), so the seen list and the Open in Gmail links work the same as with Google sign-in.
// A draft is found again by its Message-ID. If you change it in Gmail, Gmail gives it a new one: then the city never sends the old
// text; it says the draft is gone, and you send it from Gmail.
const crypto = require('node:crypto');
const { CityError } = require('./ai');
const { draftMessage, toText } = require('./google');

const hex = dec => dec ? BigInt(dec).toString(16) : '';
const dec = h => BigInt('0x' + h).toString();
const IMAP = { host: 'imap.gmail.com', port: 993, secure: true }, SMTP = { host: 'smtp.gmail.com', port: 465, secure: true };

class AppPassword {
  // imap/smtp/parse: the real libraries by default; tests pass fakes.
  constructor({ store, imap = o => new (require('imapflow').ImapFlow)(o), smtp = o => require('nodemailer').createTransport(o), parse = s => require('mailparser').simpleParser(s) }) {
    Object.assign(this, { store, imap, smtp, parse });
  }
  on() { const p = this.store.get('gmailPassword') || {}; return !!(p.email && p.pass); }
  email() { return (this.store.get('gmailPassword') || {}).email || ''; }
  auth() { const p = this.store.get('gmailPassword') || {}; return { user: p.email, pass: p.pass }; }
  // Check the address and password with Gmail itself (both reading and sending), then keep them. Google shows the password in 4 groups:
  // spaces are fine.
  async connect(email, password) {
    email = String(email || '').trim().toLowerCase(); const pass = String(password || '').replace(/\s+/g, '');
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) throw new CityError('gmail_pw_wrong', 'That does not look like an email address.');
    if (!/^[a-z]{16}$/i.test(pass)) throw new CityError('gmail_pw_wrong', 'An app password is 16 letters. Copy it again from myaccount.google.com/apppasswords.');
    const auth = { user: email, pass };
    await this.session(async () => {}, auth);
    try { await this.smtp(Object.assign({ auth }, SMTP)).verify(); } catch (e) { throw explain(e); }
    this.store.set('gmailPassword', { email, pass, at: Date.now() });
    return email;
  }
  disconnect() { this.store.del('gmailPassword'); }
  async session(fn, auth) {
    const c = this.imap(Object.assign({ auth: auth || this.auth(), logger: false }, IMAP));
    try { await c.connect(); } catch (e) { throw explain(e); }
    try { return await fn(c); } catch (e) { throw e instanceof CityError ? e : explain(e); } finally { await Promise.resolve(c.logout()).catch(() => {}); }
  }
  // Gmail's folders have local names ("[Gmail]/All Mail", "[Google Mail]/Drafts"...): find them by what they are for.
  async box(c, use) {
    const list = await c.list(), hit = list.find(b => b.specialUse === use);
    if (!hit) throw new CityError('google_error', 'Gmail did not show its ' + (use === '\\Drafts' ? 'Drafts' : 'All Mail') + ' folder over IMAP.');
    await c.mailboxOpen(hit.path); return hit.path;
  }
  async uidOf(c, id) { const u = await c.search({ emailId: dec(id) }, { uid: true }); return (u || [])[0] || null; }
  // ---- the same calls the city makes with Google sign-in ----
  async search(q, max = 10) {
    return this.session(async c => {
      await this.box(c, '\\All');
      const uids = ((await c.search({ gmraw: q }, { uid: true })) || []).slice(-max), out = [];
      if (!uids.length) return out;
      for await (const m of c.fetch(uids, { uid: true, emailId: true, threadId: true }, { uid: true })) out.push({ id: hex(m.emailId), threadId: hex(m.threadId) });
      return out.reverse();   // newest first, like Gmail
    });
  }
  async message(id) {
    return this.session(async c => {
      await this.box(c, '\\All');
      const uid = await this.uidOf(c, id); if (!uid) return null;
      const m = await c.fetchOne(uid, { uid: true, source: true, emailId: true, threadId: true, labels: true }, { uid: true }), p = await this.parse(m.source);
      const refs = Array.isArray(p.references) ? p.references.join(' ') : p.references || '';
      return { id, threadId: hex(m.threadId), labels: [...(m.labels || [])], snippet: '', from: (p.from && p.from.text) || '', to: (p.to && p.to.text) || '', replyTo: (p.replyTo && p.replyTo.text) || '',
        subject: p.subject || '', date: p.date ? p.date.toUTCString() : '', messageId: p.messageId || '', references: refs, text: toText(p.text || '', typeof p.html === 'string' ? p.html : '') };
    });
  }
  async label(id, names) {
    return this.session(async c => {
      for (const n of names) { try { await c.mailboxCreate(n); } catch (e) {} }   // a Gmail label is a folder; it may already exist
      await this.box(c, '\\All');
      const uid = await this.uidOf(c, id); if (!uid) return null;
      await c.messageFlagsAdd(uid, names, { uid: true, useLabels: true }); return {};
    });
  }
  // The draft as a whole email (Gmail's API adds From and Message-ID by itself; over IMAP the city does).
  raw(m, mid) { return 'From: ' + this.email() + '\r\nDate: ' + new Date().toUTCString() + '\r\nMessage-ID: ' + mid + '\r\n' + Buffer.from(draftMessage(m).raw, 'base64url').toString('utf8'); }
  async createDraft(m) {
    const mid = '<city-' + crypto.randomBytes(9).toString('hex') + '@your-city>';
    await this.session(async c => { const path = await this.box(c, '\\Drafts'); await c.append(path, this.raw(m, mid), ['\\Draft', '\\Seen']); });
    return { draftId: 'pw:' + mid, threadId: m.threadId || '' };
  }
  async draftUid(c, draftId) { await this.box(c, '\\Drafts'); const u = await c.search({ header: { 'message-id': String(draftId).replace(/^pw:/, '') } }, { uid: true }); return (u || [])[0] || null; }
  // IMAP cannot change a message: the new text is saved as a new draft and the old one removed. The card keeps the new id.
  async updateDraft(draftId, m) {
    const old = await this.session(c => this.draftUid(c, draftId));
    if (!old) throw new CityError('draft_gone', 'That draft is no longer in Gmail (it was sent, changed or deleted there).');
    const d = await this.createDraft(m);
    await this.session(async c => { const u = await this.draftUid(c, draftId); if (u) await c.messageDelete(u, { uid: true }); });
    return d;
  }
  // Approve: send exactly the draft that is in Gmail now, then remove it from Drafts (Gmail files the sent copy by itself).
  async sendDraft(draftId) {
    return this.session(async c => {
      const uid = await this.draftUid(c, draftId);
      if (!uid) throw new CityError('draft_gone', 'That draft is no longer in Gmail (it was sent, changed or deleted there).');
      const m = await c.fetchOne(uid, { uid: true, source: true }, { uid: true }), p = await this.parse(m.source);
      const to = [p.to, p.cc].filter(Boolean).flatMap(x => x.value || []).map(a => a.address).filter(Boolean);
      if (!to.length) throw new CityError('draft_gone', 'That draft has no one to send to.');
      try { await this.smtp(Object.assign({ auth: this.auth() }, SMTP)).sendMail({ envelope: { from: this.email(), to }, raw: m.source }); } catch (e) { throw explain(e); }
      await c.messageDelete(uid, { uid: true });
      return { id: String(draftId) };
    });
  }
}
// IMAP and SMTP failures as the Guide's codes.
function explain(e) {
  if (e instanceof CityError) return e;
  const msg = String((e && (e.responseText || e.response || e.message)) || e);
  if ((e && (e.authenticationFailed || e.responseCode === 535 || e.code === 'EAUTH')) || /AUTHENTICATIONFAILED|Invalid credentials|Username and Password not accepted|535/i.test(msg)) return new CityError('gmail_pw_wrong', 'Google did not accept the app password.', msg.slice(0, 200));
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|EAI_AGAIN|timeout/i.test(msg)) return new CityError('google_offline', 'The city could not reach Gmail.', msg.slice(0, 200));
  return new CityError('google_error', 'Gmail had a problem.', msg.slice(0, 300));
}
module.exports = { AppPassword, hex, dec };
