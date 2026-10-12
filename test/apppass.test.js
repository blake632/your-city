// Gmail the easy way: an address and an app password, checked with Gmail before it is kept. Then the city's usual Gmail calls go over
// IMAP and SMTP: search, read, label, draft, rewrite the draft, and send exactly the draft in Gmail, only on Approve.
const test = require('node:test'), assert = require('node:assert');
const { Store } = require('../src/store');
const { Google } = require('../src/google');
const { hex } = require('../src/apppass');

// A tiny Gmail: All Mail and Drafts (found by what they are for, as their names differ by country), labels, an IMAP login and SMTP.
function fakeGmail() {
  const g = { boxes: { '[Gmail]/All Mail': { use: '\\All', msgs: [] }, '[Gmail]/Drafts': { use: '\\Drafts', msgs: [] }, INBOX: { msgs: [] } }, labels: new Set(), sent: [], uid: 100, pass: 'abcdefghijklmnop' };
  g.imap = o => { let open = null; return {
    connect: async () => { if (o.auth.pass !== g.pass) { const e = new Error('Invalid credentials (Failure)'); e.authenticationFailed = true; throw e; } },
    logout: async () => {},
    list: async () => Object.entries(g.boxes).map(([path, b]) => ({ path, specialUse: b.use })),
    mailboxOpen: async path => { open = g.boxes[path]; },
    mailboxCreate: async path => { if (g.labels.has(path)) throw new Error('ALREADYEXISTS'); g.labels.add(path); },
    search: async q => open.msgs.filter(m => q.gmraw ? m.inbox && !m.labels.has('City/Seen') : q.emailId ? m.emailId === q.emailId : q.header ? m.mid === q.header['message-id'] : false).map(m => m.uid),
    fetch: async function* (uids) { for (const u of uids) { const m = open.msgs.find(x => x.uid === u); yield { uid: u, emailId: m.emailId, threadId: m.threadId }; } },
    fetchOne: async uid => { const m = open.msgs.find(x => x.uid === uid); return { uid, source: Buffer.from(m.source), emailId: m.emailId, threadId: m.threadId, labels: m.labels }; },
    messageFlagsAdd: async (uid, names, opts) => { assert(opts.useLabels && opts.uid, 'Gmail labels, by uid'); names.forEach(n => open.msgs.find(x => x.uid === uid).labels.add(n)); return true; },
    append: async (path, content, flags) => { g.boxes[path].msgs.push({ uid: ++g.uid, mid: /Message-ID: (<[^>]+>)/.exec(content)[1], source: content, flags, labels: new Set() }); return { uid: g.uid }; },
    messageDelete: async uid => { open.msgs.splice(open.msgs.findIndex(x => x.uid === uid), 1); return true; },
  }; };
  g.smtp = o => ({ verify: async () => { if (o.auth.pass !== g.pass) { const e = new Error('535-5.7.8 Username and Password not accepted'); e.responseCode = 535; throw e; } return true; }, sendMail: async m => { g.sent.push(m); return {}; } });
  return g;
}
const DANA = ['From: Dana Ruiz <dana@example.com>', 'To: sam@gmail.com', 'Subject: Kitchen remodel', 'Date: Tue, 06 Oct 2026 21:04:00 +0000', 'Message-ID: <m1@mail.example.com>', 'Content-Type: text/plain; charset=UTF-8', '', 'We want a kitchen remodel this spring.'].join('\r\n');

test('the easy way: a wrong or badly copied app password is never kept; a good one connects Gmail', async () => {
  const g = fakeGmail(), store = await Store.open({ memory: true });
  const google = new Google({ store, clientId: () => '', clientSecret: () => '', appPassword: { imap: g.imap, smtp: g.smtp } });
  assert.deepStrictEqual([google.configured(), google.connected(), google.mode()], [false, false, '']);
  await assert.rejects(google.connectPassword('sam@gmail.com', 'abc'), e => e.code === 'gmail_pw_wrong' && /16 letters/.test(e.message));
  await assert.rejects(google.connectPassword('sam@gmail.com', 'zzzz zzzz zzzz zzzz'), e => e.code === 'gmail_pw_wrong' && /did not accept/.test(e.message));
  assert.strictEqual(google.connected(), false, 'nothing kept');
  assert.strictEqual(await google.connectPassword(' Sam@Gmail.com ', 'abcd efgh ijkl mnop'), 'sam@gmail.com', 'spaces from Google\'s display are fine');
  assert.deepStrictEqual([google.configured(), google.connected(), google.mode(), google.email()], [true, true, 'password', 'sam@gmail.com']);
  google.disconnect();
  assert.deepStrictEqual([google.connected(), store.get('gmailPassword')], [false, null]);
});

test('over IMAP and SMTP: search, read, label, draft, rewrite, and send exactly the draft in Gmail', async () => {
  const g = fakeGmail(), store = await Store.open({ memory: true });
  const google = new Google({ store, clientId: () => '', clientSecret: () => '', appPassword: { imap: g.imap, smtp: g.smtp } });
  await google.connectPassword('sam@gmail.com', g.pass);
  g.boxes['[Gmail]/All Mail'].msgs.push({ uid: 7, emailId: '1234567890123456789', threadId: '1234567890123456000', inbox: true, labels: new Set(), source: DANA });
  const found = await google.search('in:inbox newer_than:2d -label:city-seen', 10);
  assert.deepStrictEqual(found, [{ id: hex('1234567890123456789'), threadId: hex('1234567890123456000') }], 'Gmail\'s own hex ids, so links and the seen list work');
  const m = await google.message(found[0].id);
  assert.deepStrictEqual([m.from, m.subject, m.messageId, m.threadId, m.text], ['"Dana Ruiz" <dana@example.com>', 'Kitchen remodel', '<m1@mail.example.com>', found[0].threadId, 'We want a kitchen remodel this spring.']);
  await google.label(found[0].id, ['City/Seen', 'City/Lead']);
  assert.deepStrictEqual([[...g.labels], [...g.boxes['[Gmail]/All Mail'].msgs[0].labels]], [['City/Seen', 'City/Lead'], ['City/Seen', 'City/Lead']]);
  assert.deepStrictEqual(await google.search('in:inbox newer_than:2d -label:city-seen', 10), [], 'labeled Seen: not read twice');
  const d = await google.createDraft({ to: 'dana@example.com', subject: 'Re: Kitchen remodel', body: 'Hi Dana, when would you like to start?', threadId: m.threadId, inReplyTo: m.messageId, references: '' });
  const drafts = g.boxes['[Gmail]/Drafts'].msgs;
  assert(/^pw:<city-[0-9a-f]+@your-city>$/.test(d.draftId) && d.threadId === m.threadId, d.draftId);
  assert(drafts.length === 1 && drafts[0].flags.includes('\\Draft') && /^From: sam@gmail\.com\r\n/.test(drafts[0].source) && /In-Reply-To: <m1@mail\.example\.com>/.test(drafts[0].source), 'a real Gmail draft, in Dana\'s thread');
  const u = await google.updateDraft(d.draftId, { to: 'dana@example.com', subject: 'Re: Kitchen remodel', body: 'Hi Dana! Shorter.', inReplyTo: m.messageId });
  assert(u.draftId !== d.draftId && drafts.length === 1 && drafts[0].mid === u.draftId.slice(3), 'the rewrite replaces the old draft and gets a new id');
  await assert.rejects(google.sendDraft(d.draftId), e => e.code === 'draft_gone', 'an old draft is never sent');
  await google.sendDraft(u.draftId);
  assert.strictEqual(g.sent.length, 1);
  assert.deepStrictEqual(g.sent[0].envelope, { from: 'sam@gmail.com', to: ['dana@example.com'] });
  assert(/SGkgRGFuYSEgU2hvcnRlci4=/.test(g.sent[0].raw.toString()), 'the exact draft text that was in Gmail');
  assert.strictEqual(drafts.length, 0, 'the sent draft leaves Drafts');
});
