// Stand-ins for Anthropic and Google, so the tests run offline and never touch real email or spend money.
const http = require('node:http');
const listen = srv => new Promise(r => srv.listen(0, '127.0.0.1', () => r('http://127.0.0.1:' + srv.address().port)));
const read = req => new Promise(r => { let b = ''; req.on('data', d => b += d); req.on('end', () => r(b)); });

// answer(request body) -> { text } | { status, error } | { refusal: true }
async function fakeAnthropic(answer) {
  const calls = [];
  const srv = http.createServer(async (req, res) => {
    const raw = await read(req), b = JSON.parse(raw || '{}'); calls.push({ url: req.url, headers: req.headers, body: b });
    const a = answer(b, calls.length) || { text: 'ok' };
    if (a.status) { res.writeHead(a.status, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ type: 'error', error: { type: a.type || 'invalid_request_error', message: a.error || 'error' } })); }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: 'msg_' + calls.length, type: 'message', role: 'assistant', model: b.model, stop_reason: a.refusal ? 'refusal' : 'end_turn', stop_details: a.refusal ? { type: 'refusal', category: null, explanation: 'declined' } : null,
      content: a.refusal ? [] : [{ type: 'text', text: typeof a.text === 'string' ? a.text : JSON.stringify(a.text) }], usage: { input_tokens: 1000, output_tokens: 200 } }));
  });
  let shut = false; return { url: await listen(srv), calls, close: () => { if (!shut) { shut = true; srv.close(); srv.closeAllConnections(); } } };
}

// An OpenAI-style service (ChatGPT, Gemini, OpenRouter, Groq...): /chat/completions and /models. answer() gets the same
// { output_config.format.schema, messages[0].content } shape as the Anthropic fake, so one answer function serves both.
async function fakeOpenAI(answer, { models = ['gpt-test', 'text-embedding-3-small'], reject = () => null, keys = null } = {}) {
  const calls = [];
  const srv = http.createServer(async (req, res) => {
    const raw = await read(req), b = raw ? JSON.parse(raw) : {}; calls.push({ url: req.url, method: req.method, headers: req.headers, body: b });
    const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (keys && !keys.includes(String(req.headers.authorization || '').replace(/^Bearer /, ''))) return send(401, { error: { message: 'Incorrect API key provided.' } });
    if (req.url.endsWith('/models')) return send(200, { object: 'list', data: models.map((id, i) => ({ id, created: 100 - i })) });
    const no = reject(b, calls.length); if (no) return send(no.status, { error: { message: no.error } });
    const schema = b.response_format && b.response_format.json_schema && b.response_format.json_schema.schema;
    const a = answer({ output_config: schema ? { format: { schema } } : undefined, messages: [{ content: b.messages[1].content }] }, calls.length) || { text: 'ok' };
    if (a.status) return send(a.status, { error: { message: a.error || 'error', type: a.type || 'error' } });
    const text = typeof a.text === 'string' ? a.text : (a.fence ? '```json\n' + JSON.stringify(a.text) + '\n```' : JSON.stringify(a.text));
    send(200, { id: 'c' + calls.length, object: 'chat.completion', model: b.model, choices: [{ index: 0, finish_reason: a.finish || 'stop', message: { role: 'assistant', content: a.refusal ? null : text, refusal: a.refusal ? 'no' : null } }], usage: { prompt_tokens: 1000, completion_tokens: 200 } });
  });
  let shut = false; return { url: await listen(srv), calls, close: () => { if (!shut) { shut = true; srv.close(); srv.closeAllConnections(); } } };
}
// A tiny Gmail: messages, labels, drafts, the token endpoint and userinfo.
async function fakeGoogle({ messages = [] } = {}) {
  const g = { messages: Object.fromEntries(messages.map(m => [m.id, m])), labels: [{ id: 'INBOX', name: 'INBOX' }], drafts: {}, sent: [], modified: [], calls: [], tokenError: null, gmailError: null, n: 0 };
  const hdr = m => [['From', m.from], ['To', m.to || 'owner@example.com'], ['Subject', m.subject], ['Date', m.date || new Date().toUTCString()], ['Message-ID', '<' + m.id + '@mail>']].concat(m.replyTo ? [['Reply-To', m.replyTo]] : []).map(([name, value]) => ({ name, value }));
  const srv = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x'), raw = await read(req), b = raw && raw[0] === '{' ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
    g.calls.push({ method: req.method, path: u.pathname, q: u.searchParams.get('q'), body: b });
    const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (u.pathname === '/token') {
      if (g.tokenError) return send(400, { error: g.tokenError });
      if (b.grant_type === 'authorization_code') return send(200, { access_token: 'at1', refresh_token: 'rt1', expires_in: 3600 });
      return send(200, { access_token: 'at2', expires_in: 3600 });
    }
    if (u.pathname === '/userinfo') return send(200, { email: 'owner@example.com' });
    if (g.gmailError) return send(g.gmailError.status, g.gmailError.body);
    let m;
    if (u.pathname === '/gmail/v1/users/me/messages' && req.method === 'GET') {
      if (!/-label:city-seen/.test(u.searchParams.get('q') || '')) return send(400, { error: 'expected the city-seen label in the search' });
      return send(200, { messages: Object.values(g.messages).filter(x => !(x.labelIds || []).includes(g.labels.find(l => l.name === 'City/Seen')?.id)).map(x => ({ id: x.id, threadId: x.threadId || x.id })) });
    }
    if ((m = /^\/gmail\/v1\/users\/me\/messages\/([^/]+)$/.exec(u.pathname))) { const x = g.messages[m[1]]; return x ? send(200, { id: x.id, threadId: x.threadId || x.id, labelIds: x.labelIds || ['INBOX'], snippet: x.text.slice(0, 50), payload: { mimeType: 'multipart/alternative', headers: hdr(x), parts: [{ mimeType: 'text/plain', body: { data: Buffer.from(x.text).toString('base64url') } }] } }) : send(404, {}); }
    if ((m = /^\/gmail\/v1\/users\/me\/messages\/([^/]+)\/modify$/.exec(u.pathname))) { const x = g.messages[m[1]]; x.labelIds = (x.labelIds || ['INBOX']).concat(b.addLabelIds); g.modified.push({ id: m[1], add: b.addLabelIds }); return send(200, {}); }
    if (u.pathname === '/gmail/v1/users/me/labels' && req.method === 'GET') return send(200, { labels: g.labels });
    if (u.pathname === '/gmail/v1/users/me/labels' && req.method === 'POST') { const l = { id: 'L' + (++g.n), name: b.name }; g.labels.push(l); return send(200, l); }
    if (u.pathname === '/gmail/v1/users/me/drafts' && req.method === 'POST') { const id = 'd' + (++g.n); g.drafts[id] = { raw: Buffer.from(b.message.raw, 'base64url').toString(), threadId: b.message.threadId || 'new' + id }; return send(200, { id, message: { id: 'm' + id, threadId: g.drafts[id].threadId } }); }
    if ((m = /^\/gmail\/v1\/users\/me\/drafts\/([^/]+)$/.exec(u.pathname)) && req.method === 'PUT') { if (!g.drafts[m[1]]) return send(404, {}); g.drafts[m[1]].raw = Buffer.from(b.message.raw, 'base64url').toString(); return send(200, { id: m[1] }); }
    if (u.pathname === '/gmail/v1/users/me/drafts/send') { if (!g.drafts[b.id]) return send(404, {}); g.sent.push(Object.assign({ id: b.id }, g.drafts[b.id])); delete g.drafts[b.id]; return send(200, { id: 'sent' + b.id }); }
    send(404, { error: 'fake has no ' + u.pathname });
  });
  g.url = await listen(srv); let shut = false; g.close = () => { if (!shut) { shut = true; srv.close(); srv.closeAllConnections(); } };
  return g;
}
// A draft's text: decode the base64 body of the raw message.
const draftText = raw => { const [h, b] = raw.split('\r\n\r\n'); return { head: h, body: Buffer.from(b.replace(/\r\n/g, ''), 'base64').toString('utf8') }; };
module.exports = { fakeAnthropic, fakeOpenAI, fakeGoogle, draftText, listen };
