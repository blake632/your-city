// Your accounts: press Connect LinkedIn or Connect Facebook, say yes there, and an approved post goes live on it. Nothing posts without your Approve.
// Each needs an app whose ID and secret are Railway variables (LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET, FACEBOOK_APP_ID / FACEBOOK_APP_SECRET);
// whoever looks after the city sets those once. The tokens are kept in the city's database and never shown on the page.
const FB = 'https://graph.facebook.com/v21.0';
const NETS = {
  linkedin: { name: 'LinkedIn', id: 'LINKEDIN_CLIENT_ID', secret: 'LINKEDIN_CLIENT_SECRET', auth: 'https://www.linkedin.com/oauth/v2/authorization', scope: 'openid profile w_member_social' },
  facebook: { name: 'Facebook', id: 'FACEBOOK_APP_ID', secret: 'FACEBOOK_APP_SECRET', auth: 'https://www.facebook.com/v21.0/dialog/oauth', scope: 'pages_show_list,pages_manage_posts,pages_read_engagement' },
};
// LinkedIn's post text is "little text": these characters must be escaped or the post is cut short.
const littleText = s => String(s).replace(/[\\|{}@[\]()<>#*_~]/g, c => '\\' + c);

class Social {
  constructor({ store, env = process.env, fetchImpl = (...a) => fetch(...a), now = () => Date.now() }) { Object.assign(this, { store, env, fetch: fetchImpl, now }); }
  nets() { return Object.keys(NETS); }
  name(n) { return NETS[n].name; }
  configured(n) { return !!(NETS[n] && this.env[NETS[n].id] && this.env[NETS[n].secret]); }
  account(n) { const a = (this.store.get('social', {}) || {})[n]; return a && (!a.until || a.until > this.now()) ? a : null; }
  // What Settings shows: per network, whether it can connect, who is connected and until when. Never a token.
  state() { return Object.fromEntries(this.nets().map(n => { const a = this.account(n); return [n, { name: NETS[n].name, configured: this.configured(n), connected: !!a, who: a ? a.who : '', until: a ? a.until || 0 : 0 }]; })); }
  authUrl(n, redirect, state) {
    const N = NETS[n], q = new URLSearchParams({ response_type: 'code', client_id: this.env[N.id], redirect_uri: redirect, state, scope: N.scope });
    return N.auth + '?' + q;
  }
  async call(url, opts = {}) {
    const r = await this.fetch(url, opts), t = await r.text(); let j = {}; try { j = JSON.parse(t || '{}'); } catch (e) {}
    if (!r.ok) throw new Error((j.error && (j.error.message || j.error_description) || j.message || j.error_description || ('error ' + r.status)).toString().slice(0, 200));
    return j;
  }
  // The code the network sent back becomes a saved account.
  async finish(n, code, redirect) {
    const N = NETS[n], id = this.env[N.id], secret = this.env[N.secret];
    let acct;
    if (n === 'linkedin') {
      const t = await this.call('https://www.linkedin.com/oauth/v2/accessToken', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirect, client_id: id, client_secret: secret }) });
      const me = await this.call('https://api.linkedin.com/v2/userinfo', { headers: { authorization: 'Bearer ' + t.access_token } });
      acct = { token: t.access_token, urn: 'urn:li:person:' + me.sub, who: me.name || 'your LinkedIn', until: this.now() + (Number(t.expires_in) || 60 * 86400) * 1000 };
    } else {
      const t = await this.call(FB + '/oauth/access_token?' + new URLSearchParams({ client_id: id, client_secret: secret, redirect_uri: redirect, code }));
      const long = await this.call(FB + '/oauth/access_token?' + new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: id, client_secret: secret, fb_exchange_token: t.access_token }));
      const pages = (await this.call(FB + '/me/accounts?' + new URLSearchParams({ fields: 'id,name,access_token', access_token: long.access_token }))).data || [];
      if (!pages.length) throw new Error('Facebook did not share a Page. Press Connect Facebook again and tick your Page.');
      acct = { token: pages[0].access_token, page: pages[0].id, who: pages[0].name, until: 0 };   // a Page token from a long-lived sign-in does not run out
    }
    this.store.set('social', Object.assign({}, this.store.get('social', {}), { [n]: acct }));
    return acct.who;
  }
  disconnect(n) { const s = Object.assign({}, this.store.get('social', {})); delete s[n]; this.store.set('social', s); }
  // Which connected networks a post is for: the ones its platform or department names, else every connected one.
  targets(text) {
    const on = this.nets().filter(n => this.account(n)), named = on.filter(n => new RegExp(NETS[n].name, 'i').test(text || ''));
    return named.length ? named : on;
  }
  async publish(n, text) {
    const a = this.account(n); if (!a) throw new Error(NETS[n].name + ' is not connected. Open Settings and press Connect ' + NETS[n].name + '.');
    if (n === 'linkedin') {
      const d = new Date(this.now() - 60 * 86400e3), version = d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0');   // a version LinkedIn still serves
      await this.call('https://api.linkedin.com/rest/posts', { method: 'POST', headers: { authorization: 'Bearer ' + a.token, 'content-type': 'application/json', 'linkedin-version': version, 'x-restli-protocol-version': '2.0.0' },
        body: JSON.stringify({ author: a.urn, commentary: littleText(text), visibility: 'PUBLIC', distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false }) });
    } else {
      await this.call(FB + '/' + a.page + '/feed', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ message: text, access_token: a.token }) });
    }
    return NETS[n].name;
  }
}
module.exports = { Social, littleText };
