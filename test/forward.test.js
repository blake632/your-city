// Lead emails forwarded to the city's own address: no Gmail permission needed. Gmail's forwarding check becomes a card with its link;
// a real lead gets its reply written; something that is not a lead gets one line; each email once.
const test = require('node:test'), assert = require('node:assert');
const { Store } = require('../src/store');
const { AI } = require('../src/ai');
const { Google } = require('../src/google');
const { City, PICKS } = require('../src/city');
const { createServer } = require('../src/server');
const { fakeAnthropic, listen } = require('./fakes');

const open = [];
test.after(() => open.forEach(f => f()));
const answer = b => {
  const fmt = b.output_config && b.output_config.format, prompt = b.messages[0].content;
  if (fmt && fmt.schema.properties.lead) return { text: /kitchen/i.test(prompt) ? { kind: 'lead', summary: 'Wants a kitchen', lead: { name: 'Dana Ruiz', email: 'dana@example.com', phone: '', wants: 'A kitchen remodel' } } : { kind: 'receipt', summary: 'A receipt', lead: { name: '', email: '', phone: '', wants: '' } } };
  if (fmt && fmt.schema.properties.kind) return { text: { kind: 'customer', confidence: 0.9 } };
  return { text: 'Hi Dana,\n\nThanks for reaching out. When would you like to start?\n\nSam' };
};
const mail = (from, subject, body, id) => Buffer.from('From: ' + from + '\r\nTo: c0123456789@burnoff.app\r\nSubject: ' + subject + '\r\nMessage-ID: <' + id + '@example.com>\r\nDate: Mon, 13 Oct 2026 15:00:00 +0000\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n' + body + '\r\n');

test('forwarded lead emails: the Gmail check, a lead, a not-lead, and no repeats', async () => {
  const A = await fakeAnthropic(answer); open.push(A.close);
  const store = await Store.open({ memory: true }), city = new City({ store, ai: new AI({ store, env: {}, apiKey: () => 'k', baseURL: A.url }), google: new Google({ store }), log: { error() {} } });
  city.saveSettings({ business: 'Sam\'s Kitchens', about: 'Kitchen remodels in Austin.', signature: 'Sam' }); store.set('departments', []);
  const L = city.saveDepartment(Object.assign({}, PICKS.find(p => p.kind === 'leads'), { judge: false }));
  const check = await city.forwarded(mail('Gmail Team <forwarding-noreply@google.com>', '(#123) Gmail Forwarding Confirmation', 'sam@gmail.com has requested to automatically forward mail.\nConfirmation code: 987654321\n\nTo allow, click:\nhttps://mail-settings.google.com/mail/vf-abc123\n', 'g1'));
  assert.strictEqual(check, 'confirm');
  const cc = city.waiting()[0];
  assert(cc.link === 'https://mail-settings.google.com/mail/vf-abc123' && /987654321/.test(cc.body) && cc.agent === L.id, JSON.stringify(cc));
  assert.strictEqual(await city.forwarded(mail('Dana Ruiz <dana@example.com>', 'Kitchen remodel', 'Hi, can you redo our kitchen this spring?', 'd1')), 'drafted');
  const lead = city.waiting().find(c => c.kind === 'lead');
  assert(lead && lead.lead.email === 'dana@example.com' && /Thanks for reaching out/.test(lead.body) && lead.lead.at <= Date.now(), JSON.stringify(lead));
  assert.strictEqual(await city.forwarded(mail('Dana Ruiz <dana@example.com>', 'Kitchen remodel', 'Hi, can you redo our kitchen this spring?', 'd1')), 'seen', 'each email once');
  assert.strictEqual(await city.forwarded(mail('Shop <orders@shop.example>', 'Your order', 'Thanks for your order.', 'r1')), 'receipt');
  assert.match(city.updates()[0].text, /was not a new customer \(A receipt\)/);
  void L;
});

test('the mail hook takes raw email only with its secret', async () => {
  const store = await Store.open({ memory: true }), city = new City({ store, ai: new AI({ store, env: {} }), google: new Google({ store }), log: { error() {} } });
  const got = []; city.forwarded = async raw => { got.push(String(raw)); return 'ok'; };
  process.env.MAIL_HOOK_SECRET = 'hook-secret-1';
  const srv = createServer({ city, password: () => 'pw', publicUrl: () => '', log: { error() {} } }), base = await listen(srv); open.push(() => srv.close());
  try {
    assert.strictEqual((await fetch(base + '/hook/mail/wrong', { method: 'POST', body: 'x' })).status, 404);
    assert.strictEqual((await fetch(base + '/hook/mail/hook-secret-1', { method: 'POST', headers: { 'content-type': 'message/rfc822' }, body: 'From: a@b.co\r\n\r\nhi' })).status, 202);
    await city.mailing; assert.deepStrictEqual(got, ['From: a@b.co\r\n\r\nhi']);
  } finally { delete process.env.MAIL_HOOK_SECRET; }
});
