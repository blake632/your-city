// Runs inside the 3D city page (video mode). The camera, the taps into each building, the judges, new buildings going up, the captions:
// all a function of time t. window.__vstep(t, dt, draw) plays the events t has passed, places the camera, draws the overlay, moves the world on.
// The story: a new email comes in, the Mail Room sorts it, Leads writes the reply, the judges score it; then a tour of the other departments,
// a new department you tap to build, one you ask for in words (via the Research desk and the School), the prizes, and the end card.
(() => {
  const C = window.__city, V3 = window.THREE.Vector3, byName = n => C.DEPTS.find(d => d.name === n);
  const K = { L: byName('Leads').k, O: byName('Open House').k, I: byName('Instagram').k, M: byName('Mail Room').k };
  const ease = x => x <= 0 ? 0 : x >= 1 ? 1 : x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2, lin = (a, b, x) => a + (b - a) * x, cl = x => Math.max(0, Math.min(1, x));
  const angLerp = (a, b, x) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * x; };
  const mix = (A, B, x) => ({ az: angLerp(A.az, B.az, x), el: lin(A.el, B.el, x), dist: Math.exp(lin(Math.log(A.dist), Math.log(B.dist), x)), pitch: lin(A.pitch, B.pitch, x), px: lin(A.px, B.px, x), py: lin(A.py, B.py, x), pz: lin(A.pz, B.pz, x) });
  const spot = (x, z, h, az, el, dist, tilt) => ({ az, el, dist, pitch: el + (tilt != null ? tilt : .14), px: x, py: h, pz: z });
  const bx = c => -72 + 36 * c, bz = r => -36 + 36 * r;
  const CITY = C.cityState(), HIGH = Object.assign({}, CITY, { az: .62, el: 1.18, dist: CITY.dist * 1.75, pitch: 1.0 }), FIN = Object.assign({}, CITY, { az: .42, el: .98, dist: CITY.dist * 1.22, pitch: CITY.pitch + .08 });
  const S = { J1: spot(bx(0), bz(0), 2, .3, .62, 82, .1), J2: spot(bx(0), bz(0), 2, .45, .58, 70, .1),   // the judges, from far enough that they read as a crowd
    B1: spot(bx(0), bz(2), 6, .35, .42, 76), B2: spot(bx(0), bz(2), 9, .58, .36, 66),
    X1: spot(bx(4), bz(2), 6, -.3, .42, 76), X2: spot(bx(4), bz(2), 9, -.52, .36, 66),
    P1: spot(-49, -77, 3, .25, .3, 72, .08), P2: spot(-49, -77, 3, .45, .27, 60, .08),
    A1: Object.assign({}, CITY, { az: .36, el: .7, dist: CITY.dist * .9 }) };

  // Two cuts: the full tour (default) and a 30-second teaser (window.__vcut = 'short'). Each fills in the same timeline pieces.
  const SHORT = window.__vcut === 'short';
  const VISITS = [], EVENTS = [], TAPS = [], MOVES = [], CAPS = [], DIPS = [], W = {};   // W: when each special overlay shows
  const center = sel => () => { const r = (typeof sel === 'string' ? document.querySelector(sel) : sel()).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  // A visit: tap the building, go inside (the app's own 1.9s fly-in), how it works step by step, then tap Back (the app's 1.6s fly-out)
  // or, with o.cut, cut straight to the next shot (the dip to dark hides the jump).
  const visit = (k, t0, hold, sub, steps, o) => { o = o || {}; const tin = t0 + .45, ts = tin + 1.95, tx = ts + hold;
    TAPS.push([t0, () => C.projectXY(new V3(C.DK[k].bx, C.DK[k].b.h * .45, C.DK[k].bz - 1.5))]);
    EVENTS.push([tin, () => { C.enter(k); document.getElementById('inSub').textContent = sub; }]);
    if (o.cut) { EVENTS.push([tx, () => C.exit(true)]); DIPS.push(tx); } else { TAPS.push([tx - .3, center('#back')]); EVENTS.push([tx, () => C.exit()]); }
    VISITS.push({ a: ts - (o.lead || 0), b: tx, gap: o.gap || .9, kicker: o.kicker || 'How it works', steps }); return o.cut ? tx : tx + 1.65; };
  const cap = (a, b, h, p, s) => CAPS.push([a, b, h, p, s]);
  const QUOTES = [{ yes: false, text: 'I hate this. It says nothing.' }, { yes: false, text: 'Generic. Feels automated.' }, { yes: true, text: 'I\'d reply to this email.' }, { yes: true, text: 'Warm, and it asks one clear question.' }];
  const BOOK = { name: 'Bookkeeping', does: 'File every invoice and receipt each week, and tell me what is due.' }, CRYPTO = { name: 'Crypto Desk', does: 'Paper-trade a small test portfolio and report weekly. Paper only.' }, STORE = { name: 'Store Desk', does: 'Find products worth testing, write the listings, and walk me through setting up Shopify step by step.' };
  let ROWS = [];
  if (window.__vcut === 'endcard') {
    // The ad's last 4.5 seconds: the lit city pulling back, light trails between the departments, and the offer.
    window.__vdur = 4.5;
    MOVES.push([0, 4.5, Object.assign({}, S.A1, { az: .3 }), FIN]);
    W.end = 0; W.lit = {};
    W.endHtml = '<h1>Your <em>City</em></h1><h2>First 5 businesses<br>get set up free.</h2><p style="margin:16px 0 0;font:600 14px Inter,sans-serif;color:rgba(240,236,228,.85)">We set it up with you on a call.</p><div class="pill">Tap Sign Up below</div><small>Then $500 per setup. Sample business shown. AI judges are simulated.</small>';
    let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, KS = C.DEPTS.map(d => d.k);
    W.arcs = []; for (let t = -1.5; t < 4.5; t += .1) { const a = KS[Math.floor(rnd() * KS.length)], b = KS[Math.floor(rnd() * KS.length)]; if (a !== b) W.arcs.push({ t, a, b, dur: 1.5 + rnd() * .6 }); }
  } else if (!SHORT) {
    // The story: a new email comes in, the Mail Room sorts it, Leads writes the reply, the judges score it; then a tour of the other departments,
    // a new department you tap to build, one you ask for in words (via the Research desk and the School), the prizes, and the end card.
    let t = visit(K.M, 4.4, 4.4, 'Reads your Gmail and sorts every email.', ['A new email: “We want a kitchen remodel this spring.”', 'The Mail Room reads it: a new customer.', 'So it goes to Leads. Spam never gets a reply.']);
    t = visit(K.L, t + .2, 4.4, 'Answers every new customer, in your voice.', ['Dana wants a new kitchen this spring.', 'Leads writes her a reply.', 'Before you see it, 104 AI judges score it.']);
    const tJ = t;   // the judges
    t = visit(K.I, tJ + 14.2, 4, 'Writes your posts for the week.', ['Writes three posts for this week.', 'The judges score every one.', 'Nothing posts until you approve it.']);
    t = visit(K.O, t + .2, 4.2, 'Writes the invite for this weekend’s open house.', ['Writes the invite.', 'Missing a fact? It asks you: “Should the invite mention parking?”', 'Your answer is kept for next time.']);
    const tB = t;   // the Mail Room asks for Bookkeeping; you tap Build it
    const tA = tB + 9.4;   // you ask for a Crypto Desk
    t = visit('research', tA + 5.6, 4, 'Finds the best tools on GitHub.', ['Scans GitHub for the best tools for the job.', 'Checks each one is real, safe and kept up.', 'Sends the best one to the School.']);
    t = visit('school', t + .2, 4, 'New tools try out here before they join.', ['New tools do practice jobs here.', 'Only the ones that pass graduate.', 'Then they go to work in your city.']);
    const tX = t, tP = tX + 5.6, tE = tP + 4.8;
    window.__vdur = tE + 10;
    MOVES.push([0, 4, HIGH, CITY],
      [tJ, tJ + 1.6, CITY, S.J1], [tJ + 1.6, tJ + 12.6, S.J1, S.J2], [tJ + 12.6, tJ + 14, S.J2, CITY],
      [tB + 3.4, tB + 4.8, CITY, S.B1], [tB + 4.8, tB + 9.2, S.B1, S.B2], [tB + 9.2, tB + 10.6, S.B2, CITY],
      [tX, tX + 1.4, CITY, S.X1], [tX + 1.4, tX + 5.6, S.X1, S.X2], [tP, tP + 1.4, S.X2, S.P1], [tP + 1.4, tP + 4.8, S.P1, S.P2],
      [tE, tE + 2.6, S.P2, S.A1], [tE + 2.6, window.__vdur, S.A1, FIN]);
    EVENTS.push([tJ + .2, () => C.judgeCrowd(ROWS, QUOTES, [0, 0])], [tJ + 13.6, () => C.clearCrowd()], [tB + 3.8, () => C.addDept(BOOK)], [tX + .4, () => C.addDept(CRYPTO)]);
    W.quotes = t => t < tJ + 1.8 ? 0 : t < tJ + 2.6 ? 1 : t < tJ + 6.4 ? 2 : t < tJ + 7.2 ? 3 : 4;
    W.grade = [tJ + 9.6, tJ + 12.8]; W.prop = [tB + .2, tB + 3.4, tB + 2.6];
    W.ask = [tA + .4, tA + 5.2]; W.type = [tA + 1, 1.9]; W.send = tA + 3.2; W.reply = tA + 3.5; W.chips = [tE + .2, tE + 3]; W.end = tE + 6.2;
    // Few captions, each up long enough to read. None while inside a building: the app's own header names it there.
    cap(.4, 4.2, 'Meet <em>your city.</em>', 'Every building is a department of AI agents. Tap one to look inside.');
    cap(tJ + .2, tJ + 5.8, '<em>104 AI judges</em> read it first.', '8 score it. 96 more vote.');
    cap(tJ + 6, tJ + 9.2, 'Weak draft? <em>Rewritten.</em>', 'The first try scored 1.9 out of 5.');
    cap(tJ + 9.4, tJ + 12.8, 'Only the best <em>reaches you.</em>', '', 'Judges are simulated by AI, not real people.');
    cap(tB + 3.8, tB + 9, 'Tap Build it. <em>It goes up.</em>', 'A new department, working by tonight.');
    cap(tA, tA + 5, 'Want something new? <em>Just ask.</em>', '');
    cap(tX + .6, tX + 5.4, 'Your <em>Crypto Desk</em> is going up.', 'Paper trading only: it never trades real money.');
    cap(tP + 1, tP + 4.6, 'The best departments <em>win prizes.</em>', 'Yachts and sports cars for the top grades. The #1 teaches the rest.');
    cap(tE + .2, tE + 3, 'Runs on <em>Claude, ChatGPT, Gemini</em> or any model.', '');
    cap(tE + 3.2, tE + 6, 'Every department.<br><em>One city.</em>', 'You approve everything.');
  } else {
    // The teaser, for someone who has never used AI. Hook: "I just connected my Gmail" -> "Scanning your email..." -> Tron light trails race along
    // the streets into every department -> the inbox sorts itself -> Leads writes the reply (feedback rewrites it) -> each department's work is
    // tested on its own simulated audience -> autopilot when it works your way -> it builds a department it needs (Bookkeeping) -> Research
    // finds the best way to do it, the School tests it -> the economy -> the #1 teaches the rest -> switch the AI brain -> the end card.
    window.__vdur = 74.2;
    const RISE = Object.assign({}, CITY, { az: CITY.az - 1.1, el: 1.3, dist: CITY.dist * 2.1, pitch: 1.08 });
    const A2 = Object.assign({}, S.A1, { az: .1 }), A3 = Object.assign({}, S.A1, { az: .58 });
    const ST1 = spot(-7, 37.5, 4, -.6, .5, 56, .05), ST2 = spot(-7, 37.5, 4, -.4, .46, 48, .05);   // the week's #1 on stage, from the back of the crowd
    const R1 = spot(36, -37.5, 9, -.25, .42, 72), R2 = spot(36, -37.5, 9, -.05, .38, 62), SC1 = spot(72, -37.5, 8, -.3, .42, 72), SC2 = spot(72, -37.5, 8, -.5, .38, 64);
    MOVES.push([0, 7, RISE, CITY], [17.55, 19, CITY, S.J1], [19, 32.2, S.J1, S.J2], [32.2, 33.6, S.J2, S.A1], [33.6, 38.5, S.A1, A2],
      [38.5, 39.9, A2, S.B1], [39.9, 42.3, S.B1, S.B2], [42.3, 43.7, S.B2, R1], [43.7, 48.3, R1, R2], [48.3, 49.5, R2, SC1], [49.5, 52.5, SC1, SC2],
      [52.5, 53.9, SC2, S.P1], [53.9, 58.5, S.P1, S.P2], [58.5, 59.9, S.P2, ST1], [59.9, 63.7, ST1, ST2], [63.7, 65.3, ST2, S.A1], [65.3, 67.9, S.A1, A3], [67.9, 74.2, A3, FIN]);
    visit(K.L, 9.7, 3.8, 'Answers every new customer, in your voice.', ['Dana wants a new kitchen this spring.', 'Leads writes her a warm reply.', 'Not quite right? Write feedback. It rewrites it.', 'You tap Send.'], { lead: .6, gap: .7 });
    const OHQ = [{ yes: false, text: 'No time or address. I’d scroll past.' }, { yes: false, text: 'Every remodeler says this.' }, { yes: true, text: 'Saturday, and it’s free? I’d go.' }, { yes: true, text: 'A real kitchen near me? Yes.' }];
    const POSTQ = [{ yes: false, text: 'Every remodeler posts this.' }, { yes: false, text: 'Too vague. Where is it?' }, { yes: true, text: 'Same walls, new kitchen? I’d stop.' }, { yes: true, text: 'Love a before and after. Saving it.' }];
    EVENTS.push([17.7, () => C.judgeCrowd(ROWS, POSTQ, [0, 0])], [22.7, () => C.judgeCrowd(ROWS, OHQ, [0, 0])], [27.3, () => C.judgeCrowd(ROWS, QUOTES, [0, 0])], [36.5, () => C.clearCrowd()], [39.3, () => C.addDept(BOOK)]);
    W.quotes = t => { if (t >= 32.2) return 0; const u = t - (t < 22.7 ? 18.2 : t < 27.3 ? 22.8 : 27.4); return u < 1.2 ? 0 : u < 1.7 ? 1 : u < 2.6 ? 2 : u < 3.1 ? 3 : 4; };   // each test: two boos, the rewrite, two cheers
    W.connect = { win: [-1, 2.7], tap: 1.1, on: 1.3 }; W.scan = [2.7, 4, K.M]; W.count = [4.5, 6.2]; W.tron = { t: 4, at: K.M, speed: 150, until: 69 };
    W.trials = [{ win: [18.2, 22.6], flip: 20.2, done: 21.8, head: 'Instagram post', aud: '96 simulated Instagram users', ph: '📷 The finished kitchen, morning light', q: 'Would you stop scrolling?', yes1: 23, yes2: 74,
        one: 'New kitchen done. Check it out!', two: 'Same walls. Whole new kitchen. This 1970s galley in Crestview now opens to the dining room. ✨' },
      { win: [22.8, 27.2], flip: 24.8, done: 26.4, head: 'Open House invite', aud: '96 simulated Austin homeowners', ph: '4410 Shoal Creek Blvd · this Saturday', q: 'Would you come see it?', yes1: 27, yes2: 71,
        one: 'Come see a kitchen we just finished. Open house this weekend.', two: 'This Saturday, 10 to 2: walk through a finished kitchen remodel in Crestview. Free, no sign-up.' },
      { win: [27.4, 31.9], flip: 29.4, done: 31, head: 'Email to a new customer', aud: '96 simulated customers', ph: 'To: Dana Ruiz · asked about a kitchen remodel', q: 'Would you reply to this?', yes1: 18, yes2: 74,
        one: 'Thanks for your interest. Let us know if you have questions.', two: 'Hi Dana, opening the wall to the dining room is one of our favorite projects. When would you like the work to start?' }];
    W.auto = { win: [33.8, 36.4], tap: 35.6, on: 35.75 }; W.prop = [36.6, 39.3, 38.6]; W.end = 71.1;
    W.lit = {};   // filled in by the light trails: each department lights up when its trail arrives
    // agents passing work: ambient light trails all the time, plus the ones that carry a message
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, KS = C.DEPTS.map(d => d.k);
    W.arcs = []; W.msgs = [];
    for (let t = 1.6, i = 0; t < 3.2; t += .12, i++) W.arcs.push({ t, a: 'web' + (i % 5), b: K.M, dur: 1.3 });   // the inbox pours in
    for (let t = 5, i = 0; t < 9; t += .1, i++) W.arcs.push({ t, a: K.M, b: KS[Math.floor(rnd() * KS.length)], dur: 1.4 });   // then the sorting keeps flowing
    for (let t = 7; t < 69.7; t += .13) { const a = KS[Math.floor(rnd() * KS.length)], b = KS[Math.floor(rnd() * KS.length)]; if (a !== b) W.arcs.push({ t, a, b, dur: 1.5 + rnd() * .6 }); }
    for (let t = 43.1, i = 0; t < 48.1; t += .14, i++) W.arcs.push(i % 2 ? { t, a: 'web' + (i % 5), b: 'research', dur: 1.4 } : { t, a: 'research', b: 'web' + (i % 5), dur: 1.4 });   // Research <-> the internet
    for (let t = 49.1; t < 52.1; t += .18) W.arcs.push({ t, a: 'school', b: KS[Math.floor(rnd() * KS.length)], dur: 1.5 });
    const msg = (t, a, b, text, head, life) => { W.arcs.push({ t, a, b, dur: 1.6, big: true }); W.msgs.push({ t, a, b, text, head, life }); };
    msg(5, K.M, K.L, 'New customer: Dana wants a new kitchen.', 0, 2); msg(5.5, K.M, 'hall', 'A customer asked about parking. Reply drafted.', 'Mail Room', 2);
    msg(6, K.M, 'hall', 'Receipt from the tile supplier. Filed.', 'Mail Room', 2); msg(6.5, K.M, 'hall', 'Newsletter. Skipped.', 'Mail Room', 2); msg(7, K.M, 'hall', 'Spam. It never gets a reply.', 'Mail Room', 2);
    msg(33.8, K.I, 'hall', '3 posts ready for your OK.', 0, 2.1); msg(35, 'd3', 'hall', 'A review request for the Hendersons is ready.', 0, 2.1);
    msg(43.7, 'research', 'web1', 'Searching GitHub for the best bookkeeping tools…', 'Research desk'); msg(45.2, 'web3', 'research', 'Found one: 1,840 stars. Checking it’s safe…', 'Research desk');
    msg(46.7, 'research', 'school', 'It’s safe. Sending it to class.'); msg(49.7, 'school', 'hall', 'Passed its practice jobs. Joining Bookkeeping.', 'The School');
    W.model = { win: [64.3, 68.1], seq: [[0, 'Claude', '#e07a4f'], [65.1, 'ChatGPT', '#10a37f'], [65.9, 'Gemini', '#4f8df5'], [66.7, 'Kimi', '#8b6cff'], [67.5, 'Claude', '#e07a4f']] };
    cap(-1, 2.6, 'Small business owner? <em>Your inbox is about to run itself.</em>', 'I connected my Gmail. Watch.');   // the hook: on screen from the first frame
    cap(2.7, 4.1, 'Scanning <em>your email…</em>', '');
    cap(4.4, 7.4, '<span class="n">1,000</span> AI helpers <em>get to work.</em>', 'It reads your inbox and sorts every email.');
    cap(7.6, 9.6, 'Your day, <em>already sorted.</em>', 'Replies drafted. Receipts filed. Junk gone.');
    cap(17.8, 22.6, 'Before you see anything, <em>an audience tests it.</em>', 'Weak drafts get rewritten.', 'Simulated by AI, not real people.');
    cap(22.8, 27.2, 'Every department’s work <em>gets judged.</em>', 'By the people it’s meant for.');
    cap(27.4, 31.9, 'Even the emails <em>to your customers.</em>', 'Only the best ever reaches you.');
    cap(34, 38, 'Teach it with feedback. <em>Then let it run.</em>', 'When it works the way you do, one tap turns on autopilot.');
    cap(39.3, 42.2, 'It sees what’s missing. <em>Then builds it.</em>', 'A new department, working by tonight.');
    cap(42.5, 48.1, 'Then it searches the internet <em>for the best way to do it.</em>', 'And checks every tool is real and safe.');
    cap(48.5, 52.4, 'New skills get tested. <em>Only the best graduate.</em>', 'Every week, your whole city gets smarter.');
    cap(52.9, 55.7, 'It’s a real economy. <em>Agents compete.</em>', 'The best grades win sports cars and yachts.');
    cap(55.9, 58.5, 'Bad grades? <em>They lose the house.</em>', '', 'Kidding. They’re robots.');
    cap(58.8, 63.5, 'The #1 agent <em>teaches the rest.</em>', 'Every week, the best one shares its secret. Every department learns it.');
    cap(64.1, 68, 'Runs on <em>any AI</em> you choose.', 'Claude, ChatGPT, Gemini, or any model on OpenRouter.');
    cap(68.3, 70.9, 'Your city <em>never sleeps.</em>', '1,000 helpers. One goal: your life, easier.');
  }
  if (W.send) TAPS.push([W.send, center('.ask .field i')]);
  if (W.prop) TAPS.push([W.prop[2], center('.prop .vbtn i')]);
  const camAt = t => { let hold = MOVES[0][2]; for (const [a, b, A, B] of MOVES) { if (t >= a && t < b) return mix(A, B, ease((t - a) / (b - a))); if (t >= b) hold = B; } return hold; };   // between moves: hold the last shot
  const css = `
  @font-face{font-family:IS;src:url(/__v/fonts/is-regular.woff2) format('woff2');font-style:normal}
  @font-face{font-family:IS;src:url(/__v/fonts/is-italic.woff2) format('woff2');font-style:italic}
  #hud,#hint,#marks,#qbubs{display:none!important}
  #inside{top:84px!important;background:linear-gradient(180deg,rgba(5,7,13,0),rgba(5,7,13,.92) 18%,rgba(5,7,13,.92) 70%,rgba(5,7,13,0))!important}#inSub{color:rgba(240,236,228,.9)!important}
  #vo{position:absolute;inset:0;z-index:20;pointer-events:none;font-family:Inter,system-ui,sans-serif}
  .vcap{position:absolute;left:0;right:0;top:92px;padding:22px 40px 34px 22px;background:linear-gradient(rgba(4,6,12,0),rgba(4,6,12,.72) 22%,rgba(4,6,12,.72) 72%,rgba(4,6,12,0));opacity:0}   /* below the apps' top bar */
  .vcap h1{margin:0;font:400 35px/1.06 IS,Georgia,serif;color:#fbf7ef;letter-spacing:-.2px;text-shadow:0 2px 18px rgba(0,0,0,.6)}.vcap h1 em{color:#f0cf86}
  .vcap p{margin:11px 0 0;font:600 14.5px/1.35 Inter,sans-serif;color:rgba(240,236,228,.88)}.vcap small{display:block;margin-top:8px;font:500 10.5px/1.3 Inter,sans-serif;color:rgba(240,236,228,.62)}
  .card{position:absolute;left:16px;right:64px;bottom:258px;padding:16px 16px 8px;border-radius:20px;background:rgba(10,12,22,.94);border:1px solid rgba(240,207,134,.4);box-shadow:0 16px 40px rgba(0,0,0,.6);opacity:0}
  .card>b{display:block;font:700 10.5px Inter,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#f0cf86;margin-bottom:10px}
  .step{display:flex;gap:11px;align-items:flex-start;margin-bottom:10px;opacity:0}.step i{flex:none;width:22px;height:22px;border-radius:50%;background:#f0cf86;color:#0b0d14;font:700 12px/22px Inter,sans-serif;font-style:normal;text-align:center}
  .step span{font:600 15px/1.35 Inter,sans-serif;color:#fbf7ef}
  .grade{position:absolute;left:50%;bottom:296px;margin-left:-125px;width:250px;padding:14px 0 16px;border-radius:22px;background:rgba(9,12,21,.94);border:1px solid #f0cf86;text-align:center;color:#fbf7ef;box-shadow:0 0 50px -8px #f0cf86;opacity:0}
  .grade small{display:block;font:700 10px Inter,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#f0cf86}.grade b{display:block;margin:6px 0 4px;font:400 58px/1 IS,Georgia,serif;color:#fbf7ef}.grade span{font:600 13.5px Inter,sans-serif;color:rgba(240,236,228,.88)}
  .prop .txt{font:500 15px/1.4 Inter,sans-serif;color:#fbf7ef;margin-bottom:14px}
  .vbtn{display:flex;gap:10px;margin-bottom:8px}.vbtn i{flex:1;padding:13px 0;border-radius:14px;text-align:center;font:700 15px Inter,sans-serif;font-style:normal;background:#fbf7ef;color:#1a1813}.vbtn i:first-child{background:#f0cf86;color:#0b0d14}
  .ask{position:absolute;left:16px;right:64px;bottom:258px;opacity:0}
  .ask .reply{margin:0 30px 12px 0;padding:11px 15px 12px;border-radius:18px 18px 18px 5px;background:rgba(251,247,239,.97);color:#1a1813;font:500 14.5px/1.35 Inter,sans-serif;opacity:0}
  .ask .reply b{display:block;font:700 9.5px/1.2 Inter,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#7a6330;margin-bottom:4px}
  .ask .field{display:flex;align-items:center;gap:10px;padding:8px 8px 8px 18px;border-radius:999px;background:rgba(10,12,22,.94);border:1px solid rgba(240,207,134,.5)}
  .ask .field span{flex:1;font:500 16px Inter,sans-serif;color:#fbf7ef;white-space:nowrap;overflow:hidden}.ask .field span.ph{color:rgba(240,236,228,.45)}
  .ask .field i{flex:none;width:38px;height:38px;border-radius:50%;background:#f0cf86;color:#0b0d14;font:700 19px/38px Inter,sans-serif;font-style:normal;text-align:center}
  .tap{position:absolute;left:0;top:0;width:50px;height:50px;margin:-25px 0 0 -25px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 20px #fff;opacity:0}
  .vchips{position:absolute;left:16px;right:64px;bottom:296px;padding:18px 16px 10px;border-radius:20px;background:rgba(10,12,22,.92);border:1px solid rgba(240,207,134,.35);opacity:0}
  .vchips b{display:block;font:700 10.5px Inter,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#f0cf86;margin-bottom:12px}
  .vchips span{display:inline-block;margin:0 8px 9px 0;padding:8px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.22);color:#fbf7ef;font:600 15px Inter,sans-serif;opacity:0}
  .vend{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 26px;background:radial-gradient(420px 380px at 50% 46%,rgba(4,6,12,.55),rgba(4,6,12,.9));opacity:0}
  .vend h1{margin:0;font:400 54px/1 IS,Georgia,serif;color:#fbf7ef}.vend h1 em{color:#f0cf86}
  .vend h2{margin:22px 0 0;font:italic 400 33px/1.1 IS,Georgia,serif;color:#f0cf86}
  .vend .pill{margin-top:30px;padding:13px 22px;border-radius:999px;background:#f0cf86;color:#0b0d14;font:700 14px Inter,sans-serif;white-space:nowrap}
  .vend small{position:absolute;bottom:264px;left:24px;right:64px;font:500 10.5px Inter,sans-serif;color:rgba(240,236,228,.6)}
  .dip{position:absolute;inset:0;background:#05070d;opacity:0}
  .gm .row{display:flex;align-items:center;gap:10px;margin-bottom:8px}.gm .addr{flex:1;font:500 13.5px Inter,sans-serif;color:rgba(240,236,228,.8)}
  .gm .go{padding:11px 14px;border-radius:12px;background:#fbf7ef;color:#1a1813;font:700 14px Inter,sans-serif;font-style:normal;white-space:nowrap}.gm .go.on{background:#3ed69b;color:#06210f}
  .scan{position:absolute;left:0;top:0;border-radius:50%;border:2px solid rgba(191,227,255,.95);box-shadow:0 0 34px rgba(191,227,255,.85),inset 0 0 34px rgba(191,227,255,.5);z-index:-1;opacity:0}
  .post .aud{font:600 11.5px Inter,sans-serif;color:#9fd3ff;margin:-4px 0 9px}
  .post .ph{height:52px;border-radius:12px;background:linear-gradient(135deg,#3a3326,#1d2230);display:flex;align-items:center;justify-content:center;font:600 12.5px Inter,sans-serif;color:rgba(240,236,228,.7);margin-bottom:10px}
  .post .tx{font:500 14px/1.4 Inter,sans-serif;color:#fbf7ef;margin-bottom:10px;min-height:39px}
  .post .tally{display:flex;justify-content:space-between;align-items:center;font:600 12.5px Inter,sans-serif;color:rgba(240,236,228,.75);margin-bottom:10px}.post .ct{font:800 14px Inter,sans-serif}
  .post .ok{position:absolute;right:12px;top:11px;padding:5px 10px;border-radius:999px;background:#f0cf86;color:#0b0d14;font:800 10.5px Inter,sans-serif;font-style:normal;opacity:0}
  .arcs{position:absolute;inset:0;width:100%;height:100%;z-index:-1;overflow:visible;filter:drop-shadow(0 0 4px rgba(255,255,255,.6))}.arcs path{fill:none;stroke-linecap:round}
  .flash{position:absolute;inset:0;background:radial-gradient(circle at 50% 55%,#fff,rgba(255,240,200,.6) 40%,rgba(255,255,255,0) 75%);mix-blend-mode:screen;opacity:0}
  .plan .row{display:flex;gap:12px;align-items:baseline;margin-bottom:9px;opacity:0}.plan .row i{flex:none;width:44px;font:800 13px Inter,sans-serif;font-style:normal;color:#f0cf86}.plan .row span{font:600 14.5px/1.3 Inter,sans-serif;color:#fbf7ef}
  .auto .bar{height:8px;border-radius:4px;background:rgba(255,255,255,.12);margin-bottom:12px;overflow:hidden}.auto .bar i{display:block;height:100%;background:#f0cf86}
  .auto .row{display:flex;align-items:center;gap:10px;margin-bottom:8px}.auto .n{flex:1;font:700 14px Inter,sans-serif;color:#fbf7ef}
  .auto .go{padding:11px 14px;border-radius:12px;background:rgba(255,255,255,.14);color:rgba(240,236,228,.6);font:700 14px Inter,sans-serif;font-style:normal}.auto .go.ready{background:#f0cf86;color:#0b0d14}.auto .go.on{background:#3ed69b;color:#06210f}
  .ask .field span.long{white-space:normal;font-size:15px;line-height:1.3}
  .wash{position:absolute;inset:0;z-index:-1;mix-blend-mode:screen;opacity:0}
  .msg{position:absolute;left:0;top:0;max-width:220px;padding:9px 12px 10px;border-radius:14px;background:rgba(9,12,21,.92);border:1px solid rgba(255,255,255,.1);border-top:2px solid var(--c);color:#f6f3ec;font:500 13px/1.35 Inter,sans-serif;box-shadow:0 10px 26px rgba(0,0,0,.5),0 0 18px -6px var(--c);opacity:0}
  .msg b{display:block;font:700 9px/1.2 Inter,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--c);margin-bottom:4px}
  .say{position:absolute;left:0;top:0;max-width:190px;padding:10px 14px 11px;border-radius:18px;background:rgba(251,247,239,.97);color:#1a1813;font:600 15px/1.3 Inter,sans-serif;box-shadow:0 12px 30px rgba(0,0,0,.55);opacity:0}
  .model .chips{display:flex;gap:8px;margin-bottom:10px}.model .chips i{flex:1;padding:10px 0;border-radius:12px;border:1px solid rgba(255,255,255,.22);text-align:center;font:700 13.5px Inter,sans-serif;font-style:normal;color:#fbf7ef}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const vo = document.createElement('div'); vo.id = 'vo'; document.body.appendChild(vo);
  const el = (cls, html) => { const e = document.createElement('div'); e.className = cls; e.innerHTML = html; vo.appendChild(e); return e; };
  // On screen: captions, the how-it-works cards, the grade, the Build it card, the ask box, taps, the AI chips, the end card, the dips.
  const caps = CAPS.map(([a, b, h, p, s]) => ({ a, b, e: el('vcap', '<h1>' + h + '</h1>' + (p ? '<p>' + p + '</p>' : '') + (s ? '<small>' + s + '</small>' : '')) }));
  VISITS.forEach(v => { v.e = el('card', '<b>' + v.kicker + '</b>' + v.steps.map((s, i) => '<div class="step"><i>' + (i + 1) + '</i><span>' + s + '</span></div>').join('')); v.rows = v.e.querySelectorAll('.step'); });
  const grade = el('grade', '<small>The grade</small><b>4.4 / 5</b><span>74 of 96 said yes</span>');
  const prop = el('card prop', '<b>Mail Room</b><div class="txt">14 invoices came in this month and nobody files them. Build a Bookkeeping desk?</div><div class="vbtn"><i>Build it</i><i>Not now</i></div>');
  const ASK = W.askText || 'Build me a crypto trading desk';
  const ask = el('ask', '<div class="reply">' + (W.replyHtml || '<b>Your city</b>Hold tight! The Research desk is scanning GitHub for the best builds.') + '</div><div class="field"><span></span><i>↑</i></div>'), askTxt = ask.querySelector('.field span');
  // light trails between buildings (agents passing work), the messages some of them carry, the small talk, the AI brain switcher
  const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'arcs'); svg.setAttribute('viewBox', '0 0 405 720'); vo.appendChild(svg);
  const WEB = [-160, -80, 0, 80, 160].map(x => new V3(36 + x, 70, -240));   // "the internet": points in the sky beyond the water
  const end3 = k => k.startsWith('web') ? WEB[+k.slice(3)] : new V3(C.DK[k].bx, C.DK[k].b.h + 2, C.DK[k].bz - 1.5);
  (W.arcs || []).forEach(a => { const P0 = end3(a.a), P2 = end3(a.b), P1 = P0.clone().add(P2).multiplyScalar(.5); P1.y += 12 + P0.distanceTo(P2) * .35; a.P = [P0, P1, P2]; a.col = a.a.startsWith('web') ? '#bfe3ff' : C.DK[a.a].col; });
  const bez = (P, u) => { const v = 1 - u, A = v * v, B = 2 * v * u, D = u * u; return new V3(A * P[0].x + B * P[1].x + D * P[2].x, A * P[0].y + B * P[1].y + D * P[2].y, A * P[0].z + B * P[1].z + D * P[2].z); };
  const pool = [], strand = i => { if (!pool[i]) { const g = document.createElementNS(NS, 'g'), p = document.createElementNS(NS, 'path'), c = document.createElementNS(NS, 'circle'); c.setAttribute('r', '2.6'); g.append(p, c); svg.appendChild(g); pool[i] = { g, p, c }; } return pool[i]; };
  const nameOf = k => k.startsWith('web') ? 'GitHub' : C.DK[k].name;
  const msgs = (W.msgs || []).map(m => { const e = el('msg', '<b>' + (m.head || nameOf(m.a) + ' → ' + nameOf(m.b)) + '</b>' + m.text); e.style.setProperty('--c', m.a.startsWith('web') ? '#bfe3ff' : C.DK[m.a].col); return Object.assign({ e, at: m.a.startsWith('web') ? m.b : m.a }, m); });
  const talk = (W.talk || []).map(([a, b, who, text]) => ({ a, b, who, e: el('say', text) }));
  const model = W.model && el('card model', '<b>The main brain</b><div class="chips">' + [...new Set(W.model.seq.map(x => x[1]))].map(n => '<i>' + n + '</i>').join('') + '</div>'), wash = W.model && el('wash', '');
  if (W.model) W.model.seq.forEach(([t0, n]) => { if (t0) TAPS.push([t0 - .15, () => { const r = [...model.querySelectorAll('.chips i')].find(x => x.textContent === n).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }]); });
  const gm = W.connect && el('card gm', '<b>Gmail</b><div class="row"><span class="addr">sam@samskitchens.com</span><i class="go">Connect Google</i></div>');
  if (gm) TAPS.push([W.connect.tap, center('.gm .go')]);
  const rings = W.scan ? [0, .35].map(d => ({ d, e: el('scan', '') })) : [];
  const trials = (W.trials || []).map(P => Object.assign({ e: el('card post', '<b>' + P.head + ' · <span class="dn"></span></b><div class="aud">Judged by ' + P.aud + '</div><div class="ph">' + P.ph + '</div><div class="tx"></div><div class="tally"><span>' + P.q + '</span><span class="ct"></span></div><i class="ok">4.4 / 5 · Ready for your OK</i>') }, P));
  // Tron light trails: straight neon lines racing along the streets from the Mail Room, turning at right angles, into every department and off to the
  // horizon. Streets run halfway between the blocks; the trails stay lit like light-cycle walls, then fade.
  const tron = W.tron && (() => { const T = W.tron, M = C.DK[T.at], Y = .5, S0 = [M.bx, M.bz + 18], bikes = [], g = document.createElementNS(NS, 'g'); svg.appendChild(g);
    const add = (pts, col, w, t0) => { let L = 0; const seg = pts.slice(1).map((p, i) => { const l = Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]); L += l; return l; });
      const e = document.createElementNS(NS, 'polyline'), h = document.createElementNS(NS, 'circle'); e.setAttribute('fill', 'none'); e.setAttribute('stroke', col); e.setAttribute('stroke-width', w); e.setAttribute('stroke-linejoin', 'miter'); h.setAttribute('r', '3'); h.setAttribute('fill', '#fff'); g.append(e, h);
      const b = { pts, seg, L, e, h, t0: t0 == null ? T.t : t0 }; bikes.push(b); return b; };
    // the burst: ten trails into every department, leaving from the four corners of the Mail Room's block along different streets; nothing anywhere else
    const CORNERS = [[M.bx + 18, M.bz + 18], [M.bx - 18, M.bz + 18], [M.bx + 18, M.bz - 18], [M.bx - 18, M.bz - 18]], XO = [18, -18, 54, -54, 18, -18, 54, -54, 18, -18], ZO = [18, 18, 18, 18, -18, -18, -18, -18, 18, -18];
    C.DEPTS.forEach(d => { if (d.k === T.at) { W.lit[d.k] = T.t; return; } let first = 1e9;
      for (let i = 0; i < 10; i++) { const [sx, sz] = CORNERS[i % 4], X = d.bx + XO[i], Z = d.bz + ZO[i], b = add([[sx, sz], [X, sz], [X, Z], [d.bx, Z]], d.col, i < 4 ? 2.4 : 1.8, T.t + i * .05); first = Math.min(first, b.t0 + b.L / T.speed); }
      W.lit[d.k] = first; });
    // then the departments keep talking: a straight trail from one to another along the streets, all video long
    let sd = 5; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647, DS = C.DEPTS;
    for (let t = 8; t < W.tron.until; t += .45) { const a = DS[Math.floor(r() * DS.length)], b = DS[Math.floor(r() * DS.length)]; if (a === b) continue;
      const X = a.bx + (r() < .5 ? 18 : -18); add([[a.bx, a.bz + 18], [X, a.bz + 18], [X, b.bz + 18], [b.bx, b.bz + 18]], a.col, 1.8, t); }
    return { bikes, Y }; })();
  if (W.tron) W.boom = { t: W.tron.t, at: W.tron.at, n: 0 };   // just the flash
  const boom = W.boom && (() => { let sd = 11; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647, cols = C.DEPTS.map(d => d.col).concat(['#ffffff', '#f0cf86', '#bfe3ff']);
    const g = document.createElementNS(NS, 'g'); svg.appendChild(g); const flash = el('flash', '');
    return { flash, sparks: [...Array(W.boom.n)].map(() => { const e = document.createElementNS(NS, 'line'); e.setAttribute('stroke-linecap', 'round'); g.appendChild(e);
      return { e, a: r() * Math.PI * 2, v: 260 + r() * 520, life: 1 + r() * .9, w: 1.4 + r() * 2.2, c: cols[Math.floor(r() * cols.length)] }; }) }; })();
  const plan = W.plan && el('card plan', '<b>' + W.plan.head + '</b>' + W.plan.rows.map(([h, x]) => '<div class="row"><i>' + h + '</i><span>' + x + '</span></div>').join(''));
  const auto = W.auto && el('card auto', '<b>Leads</b><div class="bar"><i></i></div><div class="row"><span class="n"></span><i class="go">Turn on autopilot</i></div>');
  if (auto) TAPS.push([W.auto.tap, center('.auto .go')]);
  const taps = TAPS.map(([a, at]) => ({ a, at, e: el('tap', '') }));
  const chips = el('vchips', '<b>Your AI, your pick</b>' + ['Claude', 'ChatGPT', 'Gemini', 'OpenRouter', 'Groq', 'Mistral', 'Ollama'].map(x => '<span>' + x + '</span>').join(''));
  const end = el('vend', W.endHtml || '<h1>Your <em>City</em></h1><h2>All you\'ll ever need.</h2><p style="margin:16px 0 0;font:600 14px Inter,sans-serif;color:rgba(240,236,228,.85)">Over 1,000 agents. One goal: make your life easier.</p><div class="pill">Message me to get started</div><small>Sample business shown. 1,000+ agents: 10 departments, each judged by 104 simulated AI judges.</small>');
  const dip = el('dip', '');
  const fade = (t, a, b, i, o) => Math.min(cl((t - a) / (i || .45)), cl((b - t) / (o || .4)));
  const rise = (e, t, a, px) => { e.style.transform = 'translateY(' + ((1 - ease(cl((t - a) / .5))) * px) + 'px)'; };
  const show = (e, w, t, px) => { if (!w) { e.style.opacity = 0; return false; } e.style.opacity = fade(t, w[0], w[1]); rise(e, t, w[0], px); return true; };
  function overlay(t) {
    caps.forEach(c => { c.e.style.opacity = fade(t, c.a, c.b); rise(c.e, t, c.a, 12); const n = c.e.querySelector('.n'); if (n && W.count) n.textContent = Math.round(1000 * ease(cl((t - W.count[0]) / (W.count[1] - W.count[0])))).toLocaleString('en-US'); });
    VISITS.forEach(v => { v.e.style.opacity = fade(t, v.a, v.b - .1, .4, .3); rise(v.e, t, v.a, 24); v.rows.forEach((r, i) => { const a = v.a + .3 + i * v.gap; r.style.opacity = cl((t - a) / .4); r.style.transform = 'translateX(' + ((1 - ease(cl((t - a) / .45))) * 14) + 'px)'; }); });
    C.crowdQuotes(W.quotes ? W.quotes(t) : 0);
    if (show(grade, W.grade, t, 0)) grade.style.transform = 'scale(' + (0.8 + 0.2 * ease(cl((t - W.grade[0]) / .45))) + ')';
    if (show(prop, W.prop, t, 30)) { const bu = (t - W.prop[2]) / .7; prop.querySelector('.vbtn i').style.transform = bu > 0 && bu < .35 ? 'scale(.94)' : 'none'; }
    if (show(ask, W.ask, t, 30)) {
      const n = Math.round(cl((t - W.type[0]) / W.type[1]) * ASK.length); askTxt.textContent = n ? ASK.slice(0, n) + (t < W.send && Math.floor(t * 2.5) % 2 ? '|' : '') : 'Ask your city for anything…'; askTxt.className = n ? (ASK.length > 36 ? 'long' : '') : 'ph';
      if (t > W.send + .1) askTxt.textContent = ''; const rp = ask.querySelector('.reply'), r0 = W.reply || 1e9; rp.style.opacity = cl((t - r0) / .4); rp.style.transform = 'translateY(' + ((1 - ease(cl((t - r0) / .45))) * 10) + 'px)'; }
    taps.forEach(p => { const u = (t - p.a) / .7; if (u <= 0 || u >= 1) { p.e.style.opacity = 0; return; } const q = p.at(); p.e.style.opacity = 1 - u; p.e.style.transform = 'translate3d(' + q.x.toFixed(1) + 'px,' + q.y.toFixed(1) + 'px,0) scale(' + (.5 + u * 1.4) + ')'; });
    if (show(chips, W.chips, t, 40)) chips.querySelectorAll('span').forEach((s, i) => { s.style.opacity = cl((t - W.chips[0] - .3 - i * .16) / .25); });
    const te = W.end, ef = cl((t - te) / .6); end.style.opacity = ef; end.querySelector('h1').style.transform = 'scale(' + lin(.94, 1, ease(cl((t - te) / 1))) + ')';
    end.querySelector('h2').style.opacity = cl((t - te - .6) / .5); end.querySelector('.pill').style.opacity = cl((t - te - 1.2) / .4);
    const city = C.mode === 'city' && !C.trans; let n = 0;
    (W.arcs || []).forEach(a => { const u = (t - a.t) / a.dur; if (!city || u <= 0 || u > 1.3) return; const head = Math.min(u, 1), tail = Math.max(0, head - (a.big ? .45 : .3)), f = u > 1 ? 1 - (u - 1) / .3 : 1;
      let d = ''; for (let i = 0; i <= 12; i++) { const q = C.projectXY(bez(a.P, tail + (head - tail) * i / 12)); if (q.z > 1) return; d += (i ? 'L' : 'M') + q.x.toFixed(1) + ' ' + q.y.toFixed(1); }
      const s = strand(n++), hq = C.projectXY(bez(a.P, head)); s.g.style.display = ''; s.g.style.opacity = f; s.p.setAttribute('d', d); s.p.setAttribute('stroke', a.col); s.p.setAttribute('stroke-width', a.big ? 2.8 : 1.9);
      s.c.setAttribute('cx', hq.x.toFixed(1)); s.c.setAttribute('cy', hq.y.toFixed(1)); s.c.setAttribute('fill', a.big ? '#fff' : a.col); s.c.style.display = u < 1 ? '' : 'none'; });
    pool.forEach((s, i) => { if (i >= n) s.g.style.display = 'none'; });
    const placed = [];
    msgs.forEach(m => { const f = city ? fade(t, m.t, m.t + (m.life || 2.3), .3, .3) : 0; m.e.style.opacity = f; if (f <= 0) return; const q = C.projectXY(end3(m.at)), w = m.e.offsetWidth, h = m.e.offsetHeight;
      const x = Math.max(10, Math.min(345 - w, q.x - w / 2)); let y = Math.max(250, Math.min(540 - h, q.y - h - 14)); for (const r of placed) if (x < r.x + r.w && r.x < x + w && y < r.y + r.h && r.y < y + h) y = r.y + r.h + 8; placed.push({ x, y, w, h });
      m.e.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + (y + (1 - ease(cl((t - m.t) / .4))) * 8).toFixed(1) + 'px,0)'; });
    talk.forEach((s, i) => { const f = fade(t, s.a, s.b, .3, .3); s.e.style.opacity = f; if (f <= 0) return; const q = C.projectXY(C.headPos(C.cityChars[s.who], new V3())), w = s.e.offsetWidth, h = s.e.offsetHeight;
      const r = i % 2, x = Math.max(10, Math.min(345 - w, r ? q.x - 24 : q.x - w + 24)); let y = Math.max(250, q.y - h - 16 - (r ? 0 : 34));   // the first bubble up and left, the reply right
      for (const r of placed) if (x < r.x + r.w && r.x < x + w && y < r.y + r.h && r.y < y + h) y = r.y + r.h + 8; placed.push({ x, y, w, h });
      s.e.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) scale(' + (.88 + .12 * ease(cl((t - s.a) / .35))) + ')'; });
    if (model) { const mf = fade(t, W.model.win[0], W.model.win[1]), cur = W.model.seq.filter(x => t >= x[0]).pop(); model.style.opacity = mf; rise(model, t, W.model.win[0], 30);
      model.querySelectorAll('.chips i').forEach(i => { const on = i.textContent === cur[1]; i.style.background = on ? cur[2] : 'transparent'; i.style.borderColor = on ? cur[2] : 'rgba(255,255,255,.22)'; i.style.transform = on ? 'scale(1.06)' : 'none'; });
      wash.style.opacity = mf * .6; wash.style.background = 'radial-gradient(120% 90% at 50% 45%,' + cur[2] + ',transparent 70%)'; }
    if (gm) { show(gm, W.connect.win, t, 0); const on = t >= W.connect.on, go = gm.querySelector('.go'); go.textContent = on ? '✓ Connected' : 'Connect Google'; go.className = 'go' + (on ? ' on' : ''); }
    rings.forEach(r => { const u = (t - W.scan[0] - r.d) / (W.scan[1] - W.scan[0]); if (u <= 0 || u >= 1) { r.e.style.opacity = 0; return; } const q = C.projectXY(end3(W.scan[2])), R = 20 + 680 * ease(u);
      r.e.style.opacity = (1 - u) * .9; r.e.style.width = r.e.style.height = (2 * R).toFixed(0) + 'px'; r.e.style.transform = 'translate3d(' + (q.x - R).toFixed(1) + 'px,' + (q.y - R).toFixed(1) + 'px,0)'; });
    trials.forEach(P => { const post = P.e; if (!show(post, P.win, t, 30)) return; const two = t >= P.flip, n = two ? Math.round(lin(P.yes1, P.yes2, ease(cl((t - P.flip - .3) / 1.5)))) : Math.round(P.yes1 * ease(cl((t - P.win[0] - .3) / 1.5)));
      post.querySelector('.dn').textContent = two ? 'Draft 2' : 'Draft 1'; post.querySelector('.tx').textContent = two ? P.two : P.one;
      const ct = post.querySelector('.ct'); ct.textContent = n + ' of 96 said yes'; ct.style.color = two && n > 60 ? '#3ed69b' : '#ff7a85';
      post.querySelector('.ok').style.opacity = cl((t - P.done) / .4); post.style.boxShadow = '0 16px 40px rgba(0,0,0,.6),0 0 ' + (40 * cl(1 - Math.abs(t - P.flip) / .5)).toFixed(0) + 'px #f0cf86'; });
    if (tron) { tron.bikes.forEach(b => { const tb = t - b.t0, d = tb * W.tron.speed, f = tb <= 0 ? 0 : d < b.L ? 1 : cl(1 - (d - b.L) / W.tron.speed / .9); if (f <= 0 || !city) { b.e.style.display = b.h.style.display = 'none'; return; }
      const pts = [b.pts[0]]; let left = Math.min(d, b.L); for (let i = 0; i < b.seg.length && left > 0; i++) { const p0 = b.pts[i], p1 = b.pts[i + 1], u = Math.min(1, left / b.seg[i]); pts.push([p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u]); left -= b.seg[i]; }
      const q = pts.map(p => C.projectXY(new V3(p[0], tron.Y, p[1]))); if (q.some(v => v.z > 1)) { b.e.style.display = b.h.style.display = 'none'; return; }
      b.e.style.display = ''; b.e.style.opacity = f; b.e.setAttribute('points', q.map(v => v.x.toFixed(1) + ',' + v.y.toFixed(1)).join(' ')); const hd = q[q.length - 1];
      b.h.style.display = d < b.L ? '' : 'none'; b.h.setAttribute('cx', hd.x.toFixed(1)); b.h.setAttribute('cy', hd.y.toFixed(1)); }); }
    if (boom) { const tb = t - W.boom.t, o = C.projectXY(end3(W.boom.at)); boom.flash.style.opacity = tb >= 0 ? cl(1 - tb / .45) * .55 : 0;
      boom.sparks.forEach(p => { const u = tb / p.life; if (tb <= 0 || u >= 1) { p.e.style.display = 'none'; return; } const at = s => { const d = p.v * s * (1 - .38 * s); return [o.x + Math.cos(p.a) * d, o.y + Math.sin(p.a) * d + 150 * s * s]; };
        const [x1, y1] = at(Math.max(0, tb - .09)), [x2, y2] = at(tb); p.e.style.display = ''; p.e.setAttribute('x1', x1.toFixed(1)); p.e.setAttribute('y1', y1.toFixed(1)); p.e.setAttribute('x2', x2.toFixed(1)); p.e.setAttribute('y2', y2.toFixed(1));
        p.e.setAttribute('stroke', p.c); p.e.setAttribute('stroke-width', p.w.toFixed(1)); p.e.style.opacity = (1 - u) * (1 - u); }); }
    if (plan && show(plan, W.plan.win, t, 30)) plan.querySelectorAll('.row').forEach((r, i) => { const a = W.plan.win[0] + .3 + i * .45; r.style.opacity = cl((t - a) / .3); r.style.transform = 'translateX(' + ((1 - ease(cl((t - a) / .4))) * 14) + 'px)'; });
    if (auto && show(auto, W.auto.win, t, 30)) { const f = lin(.62, 1, ease(cl((t - W.auto.win[0] - .2) / 1.3))), on = t >= W.auto.on, go = auto.querySelector('.go');   // learning how you work, then ready
      auto.querySelector('.n').textContent = f < 1 ? 'Learning how you work…' : 'Ready when you are'; auto.querySelector('.bar i').style.width = (f * 100).toFixed(1) + '%'; go.textContent = on ? '✓ Autopilot on' : 'Turn on autopilot'; go.className = 'go' + (on ? ' on' : f >= 1 ? ' ready' : ''); }
    dip.style.opacity = DIPS.reduce((m, c) => Math.max(m, t <= c ? cl(1 - (c - t) / .22) : cl(1 - (t - c) / .3)), 0);   // a quick dip to dark around each cut
  }
  // The page's CSS fades and pulses run on the wall clock, but a frame takes far longer to draw than 1/30 s, so they jumped from frame to frame.
  // Pause every one and play it on the video's clock instead.
  const born = new WeakMap();
  function clock(t) { document.getAnimations().forEach(a => { if (!born.has(a)) { born.set(a, t); a.pause(); } a.currentTime = (t - born.get(a)) * 1000; }); }
  let lastT = -1;
  window.__vstep = async (t, dt, draw) => {
    EVENTS.forEach(([et, fn]) => { if (lastT < et && t >= et) fn(); }); lastT = t;
    if (W.lit) C.DEPTS.forEach(d => { d.live = t >= (W.lit[d.k] != null ? W.lit[d.k] : 0); });   // the beams come on
    if (W.model) { const on = t >= W.model.win[0] && t < W.model.win[1], cur = W.model.seq.filter(x => t >= x[0]).pop();   // switching the brain recolours every beam, glow and ring
      C.DEPTS.forEach(d => { if (!d.beam) return; if (d.col0 == null) d.col0 = d.beam.material.color.getHex(); const c = on ? cur[2] : d.col0; [d.beam, d.glow, d.ring].forEach(m => m.material.color.set(c)); }); }
    if (C.mode === 'inside' && !C.trans) { C.goal.az += dt * .02; C.cam.az = C.goal.az; }   // a slow drift while inside
    else if (!C.trans) { const s = camAt(t); Object.assign(C.goal, s); Object.assign(C.cam, s); }
    if (draw) overlay(t);
    C.step(dt, !draw); clock(t);
  };
  window.__vready = fetch('/api/state', { credentials: 'same-origin' }).then(r => r.json()).then(S0 => {
    const lead = S0.cards.find(c => c.kind === 'lead' && c.judged && c.judged.crowd); ROWS = lead ? lead.judged.crowd.rows : [];
  }).then(() => document.fonts.ready);
})();
