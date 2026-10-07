// Your Gmail, through Google's own sign-in. Your city runs on Railway; Google only gives it permission to read and draft your email.
// You make a Google "OAuth client" once (SETUP.md, step 3; the Guide walks you through it), paste its ID and secret in Settings
// (or set the GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET variables), then press Connect Google in the app.
// Google gives the city a long-lived pass (a refresh token), kept in your city's database and never shown.
// One permission only: Gmail read, label and draft (gmail.modify). A draft is sent only when you press Approve.
const { CityError } = require('./ai');
const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/gmail.modify'];

class Google {
  constructor({ store, clientId = () => (store.get('googleClient') || {}).id || process.env.GOOGLE_CLIENT_ID || '', clientSecret = () => (store.get('googleClient') || {}).secret || process.env.GOOGLE_CLIENT_SECRET || '', api = 'https://gmail.googleapis.com',
    tokenUrl = 'https://oauth2.googleapis.com/token', authBase = 'https://accounts.google.com/o/oauth2/v2/auth', userinfoUrl = 'https://openidconnect.googleapis.com/v1/userinfo', now = () => Date.now() } = {}) {
    Object.assign(this, { store, clientId, clientSecret, api, tokenUrl, authBase, userinfoUrl, now });
    this.access = null; this.labels = null;
  }
  configured() { return !!((this.clientId() || '').trim() && (this.clientSecret() || '').trim()); }
  // The Client ID and secret pasted in Settings. A blank secret keeps the saved one.
  saveClient({ id, secret }) {
    const c = this.store.get('googleClient') || {}, next = { id: String(id != null ? id : c.id || '').trim(), secret: String(secret || '').trim() || c.secret || '' };
    if (next.id && !/\.apps\.googleusercontent\.com$/.test(next.id)) throw new CityError('google_client', 'That does not look like a Google Client ID. It ends in .apps.googleusercontent.com.');
    this.store.set('googleClient', next); this.access = null; return { id: next.id, secretSet: !!next.secret };
  }
  connected() { return !!(this.store.get('google') || {}).refresh; }
  email() { return (this.store.get('google') || {}).email || ''; }
  authUrl(redirect, state) {
    return this.authBase + '?' + new URLSearchParams({ client_id: this.clientId().trim(), redirect_uri: redirect, response_type: 'code', scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state });
  }
  async form(url, params) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params), signal: AbortSignal.timeout(30000) })
      .catch(e => { throw new CityError('google_offline', 'The city could not reach Google.', e.message); });
    return { status: r.status, j: await r.json().catch(() => ({})) };
  }
  // The code Google sends back after you press Allow -> the long-lived pass.
  async exchange(code, redirect) {
    const { status, j } = await this.form(this.tokenUrl, { code, client_id: this.clientId().trim(), client_secret: this.clientSecret().trim(), redirect_uri: redirect, grant_type: 'authorization_code' });
    if (j.error === 'invalid_client' || j.error === 'unauthorized_client') throw new CityError('google_client', 'Google did not accept your OAuth client ID or secret.', j.error_description || j.error);
    if (j.error === 'redirect_uri_mismatch') throw new CityError('google_redirect', 'Google does not know this app\'s address yet.', redirect);
    if (!j.access_token) throw new CityError('google_error', 'Google did not finish the sign-in (' + status + ').', j.error_description || j.error || '');
    if (!j.refresh_token) throw new CityError('google_no_refresh', 'Google gave no long-lived pass.', 'Remove the app at myaccount.google.com/permissions, then press Connect Google again.');
    let email = '';
    try { const u = await fetch(this.userinfoUrl, { headers: { Authorization: 'Bearer ' + j.access_token }, signal: AbortSignal.timeout(20000) }); email = (await u.json()).email || ''; } catch (e) {}
    this.store.set('google', { refresh: j.refresh_token, email, at: this.now() });
    this.access = { token: j.access_token, until: this.now() + (Number(j.expires_in) || 3600) * 1000 - 120000 };
    this.labels = null;
    return email;
  }
  disconnect() { this.store.del('google'); this.access = null; this.labels = null; }
  async token() {
    if (this.access && this.access.until > this.now()) return this.access.token;
    const g = this.store.get('google') || {};
    if (!g.refresh) throw new CityError('google_not_connected', 'Gmail is not connected yet.');
    if (!this.configured()) throw new CityError('google_no_client', 'The Google client ID or secret variable is missing.');
    const { status, j } = await this.form(this.tokenUrl, { client_id: this.clientId().trim(), client_secret: this.clientSecret().trim(), refresh_token: g.refresh, grant_type: 'refresh_token' });
    if (j.error === 'invalid_grant') throw new CityError('google_expired', 'Google ended the city\'s Gmail connection.', j.error_description || '');
    if (j.error === 'invalid_client' || j.error === 'unauthorized_client') throw new CityError('google_client', 'Google did not accept your OAuth client ID or secret.', j.error_description || j.error);
    if (!j.access_token) throw new CityError('google_error', 'Google would not renew the connection (' + status + ').', j.error_description || j.error || '');
    this.access = { token: j.access_token, until: this.now() + (Number(j.expires_in) || 3600) * 1000 - 120000 };
    return this.access.token;
  }
  async call(method, path, body) {
    for (let attempt = 0; ; attempt++) {
      const token = await this.token();
      const r = await fetch(this.api + path, { method, headers: Object.assign({ Authorization: 'Bearer ' + token }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000) })
        .catch(e => { throw new CityError('google_offline', 'The city could not reach Gmail.', e.message); });
      if (r.status === 401 && attempt === 0) { this.access = null; continue; }
      if ((r.status === 429 || r.status >= 500) && attempt < 3) { await new Promise(res => setTimeout(res, 500 * 2 ** attempt)); continue; }
      const text = await r.text();
      if (r.ok) return text ? JSON.parse(text) : {};
      if (r.status === 404) return null;
      if (r.status === 403 && /accessNotConfigured|has not been used in project|is disabled/i.test(text)) {
        const link = (/https:\/\/console\.(developers|cloud)\.google\.com\/\S+?(?=["\s\\])/.exec(text) || [])[0] || 'https://console.cloud.google.com/apis/library/gmail.googleapis.com';
        throw new CityError('gmail_api_off', 'The Gmail API is turned off in your Google Cloud project.', link);
      }
      if (r.status === 403 && /insufficient/i.test(text)) throw new CityError('google_scope', 'Gmail did not give the city enough permission.', text.slice(0, 200));
      if (r.status === 429) throw new CityError('google_busy', 'Gmail asked the city to slow down.', text.slice(0, 200));
      throw new CityError('google_error', 'Gmail answered ' + r.status + '.', text.slice(0, 300));
    }
  }
  // ---- Gmail ----
  async search(q, max = 10) { const r = await this.call('GET', '/gmail/v1/users/me/messages?' + new URLSearchParams({ q, maxResults: String(max) })); return (r && r.messages) || []; }
  async message(id) { const m = await this.call('GET', '/gmail/v1/users/me/messages/' + encodeURIComponent(id) + '?format=full'); return m ? readMessage(m) : null; }
  async labelId(name) {
    if (!this.labels) { const r = await this.call('GET', '/gmail/v1/users/me/labels'); this.labels = new Map(((r && r.labels) || []).map(l => [l.name, l.id])); }
    if (!this.labels.has(name)) {
      if (name.includes('/')) await this.labelId(name.slice(0, name.lastIndexOf('/')));   // City before City/Lead, so Gmail shows them nested
      const l = await this.call('POST', '/gmail/v1/users/me/labels', { name, labelListVisibility: 'labelShow', messageListVisibility: 'show' }); this.labels.set(name, l.id);
    }
    return this.labels.get(name);
  }
  async label(id, names) { const ids = []; for (const n of names) ids.push(await this.labelId(n)); return this.call('POST', '/gmail/v1/users/me/messages/' + encodeURIComponent(id) + '/modify', { addLabelIds: ids }); }
  async createDraft(m) { const d = await this.call('POST', '/gmail/v1/users/me/drafts', { message: draftMessage(m) }); return { draftId: d.id, threadId: (d.message && d.message.threadId) || m.threadId || '' }; }
  async updateDraft(draftId, m) { await this.call('PUT', '/gmail/v1/users/me/drafts/' + encodeURIComponent(draftId), { id: draftId, message: draftMessage(m) }); }
  async sendDraft(draftId) {
    const r = await this.call('POST', '/gmail/v1/users/me/drafts/send', { id: draftId });
    if (!r) throw new CityError('draft_gone', 'That draft is no longer in Gmail (it was sent or deleted there).');
    return r;
  }
}
// A Gmail message as the agents read it: who, what, the plain text (the HTML version stripped when there is no plain one).
function readMessage(m) {
  const h = {}; ((m.payload && m.payload.headers) || []).forEach(x => { h[x.name.toLowerCase()] = x.value; });
  let plain = '', html = '';
  (function walk(p) {
    if (!p) return;
    if (p.body && p.body.data) { const t = Buffer.from(p.body.data, 'base64url').toString('utf8'); if (/^text\/plain/i.test(p.mimeType || '')) plain += t; else if (/^text\/html/i.test(p.mimeType || '')) html += t; }
    (p.parts || []).forEach(walk);
  })(m.payload);
  const text = (plain || html.replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"'))
    .replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { id: m.id, threadId: m.threadId, labels: m.labelIds || [], snippet: m.snippet || '', from: h.from || '', to: h.to || '', replyTo: h['reply-to'] || '', subject: h.subject || '', date: h.date || '',
    messageId: h['message-id'] || '', references: h.references || '', text: text.slice(0, 12000) };
}
// A plain text email as Gmail's raw format. A reply carries the thread and the headers that keep it in the conversation.
function draftMessage({ to, cc, subject, body, threadId, inReplyTo, references }) {
  const enc = s => /^[\x20-\x7e]*$/.test(s) ? s : '=?UTF-8?B?' + Buffer.from(s, 'utf8').toString('base64') + '?=';
  const head = ['To: ' + to, cc ? 'Cc: ' + cc : '', 'Subject: ' + enc(subject || ''), inReplyTo ? 'In-Reply-To: ' + inReplyTo : '', inReplyTo ? 'References: ' + ((references ? references + ' ' : '') + inReplyTo) : '',
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64'].filter(Boolean).join('\r\n');
  const raw = head + '\r\n\r\n' + Buffer.from(body || '', 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n');
  const out = { raw: Buffer.from(raw, 'utf8').toString('base64url') };
  if (threadId) out.threadId = threadId;
  return out;
}
const addressOf = s => ((/<([^>]+)>/.exec(s || '') || [])[1] || String(s || '').trim()).toLowerCase();
const nameOf = s => String(s || '').replace(/<[^>]*>/, '').replace(/"/g, '').trim();
module.exports = { Google, SCOPES, readMessage, draftMessage, addressOf, nameOf };
