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
  const BOOK = { name: 'Bookkeeping', does: 'File every invoice and receipt each week, and tell me what is due.' }, CRYPTO = { name: 'Crypto Desk', does: 'Paper-trade a small test portfolio and report weekly. Paper only.' };
  let ROWS = [];
  if (!SHORT) {
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
    // The 1-minute teaser, for someone who has never used AI: your day piles up -> 1,000 helpers light up the city -> a customer emails at 9 pm,
    // Leads writes the reply, the judges check it -> agents make small talk -> the day's work flows in -> it builds a department it needs ->
    // Research searches the internet, the School tests what it finds -> switch the AI brain -> the end card. Light trails = agents passing work.
    window.__vdur = 62.5;
    const RISE = Object.assign({}, CITY, { az: CITY.az - 1.1, el: 1.3, dist: CITY.dist * 2.1, pitch: 1.08 });
    const A2 = Object.assign({}, S.A1, { az: .1 }), A3 = Object.assign({}, S.A1, { az: .58 });
    const TK1 = spot(2.5, 8.3, 2.2, .04, .52, 50, .1), TK2 = spot(2.5, 8.3, 2.2, .14, .48, 44, .1);   // the small talk outside City Hall, from high enough that nothing blocks it
    const R1 = spot(36, -37.5, 9, -.25, .42, 72), R2 = spot(36, -37.5, 9, -.05, .38, 62), SC1 = spot(72, -37.5, 8, -.3, .42, 72), SC2 = spot(72, -37.5, 8, -.5, .38, 64);
    MOVES.push([0, 8.4, RISE, CITY], [20.05, 21.5, CITY, S.J1], [21.5, 26, S.J1, S.J2], [26, 27.4, S.J2, TK1], [27.4, 30.5, TK1, TK2], [30.5, 32, TK2, S.A1], [32, 37.8, S.A1, A2],
      [37.8, 39.2, A2, S.B1], [39.2, 41.6, S.B1, S.B2], [41.6, 43, S.B2, R1], [43, 47.6, R1, R2], [47.6, 48.8, R2, SC1], [48.8, 52, SC1, SC2], [52, 53.6, SC2, S.A1], [53.6, 56.2, S.A1, A3], [56.2, 62.5, A3, FIN]);
    visit(K.L, 12, 4, 'Answers every new customer, in your voice.', ['Dana wants a new kitchen this spring.', 'Leads writes her a warm reply.', 'You wake up. You tap Send.'], { lead: .6 });
    EVENTS.push([20.2, () => C.judgeCrowd(ROWS, QUOTES, [0, 0])], [26.6, () => C.clearCrowd()], [38.6, () => C.addDept(BOOK)]);
    W.quotes = t => t < 21.6 ? 0 : t < 22.2 ? 1 : t < 23.4 ? 2 : t < 24 ? 3 : 4;
    W.grade = [23.6, 26]; W.prop = [35.2, 38.2, 37.5]; W.end = 59.4; W.count = [.3, 2];
    // the lights come on one building at a time, from the middle out
    W.lit = {}; C.DEPTS.slice().sort((a, b) => Math.hypot(a.bx, a.bz) - Math.hypot(b.bx, b.bz)).forEach((d, i) => { W.lit[d.k] = .4 + i * .22; });
    // agents passing work: ambient light trails all the time, plus the ones that carry a message
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, KS = C.DEPTS.map(d => d.k);
    W.arcs = []; W.msgs = [];
    for (let t = 2.2; t < 58; t += .26) { const a = KS[Math.floor(rnd() * KS.length)], b = KS[Math.floor(rnd() * KS.length)]; if (a !== b) W.arcs.push({ t, a, b, dur: 1.5 + rnd() * .6 }); }
    for (let t = 42.4, i = 0; t < 47.4; t += .14, i++) W.arcs.push(i % 2 ? { t, a: 'web' + (i % 5), b: 'research', dur: 1.4 } : { t, a: 'research', b: 'web' + (i % 5), dur: 1.4 });   // Research <-> the internet
    for (let t = 48.4; t < 51.6; t += .18) W.arcs.push({ t, a: 'school', b: KS[Math.floor(rnd() * KS.length)], dur: 1.5 });
    const msg = (t, a, b, text, head) => { W.arcs.push({ t, a, b, dur: 1.6, big: true }); W.msgs.push({ t, a, b, text, head }); };
    msg(8.7, 'web2', K.M, 'Dana Ruiz: “We want a kitchen remodel this spring.”', 'New email');
    msg(10.1, K.M, K.L, 'New customer! Sending her to you.');
    msg(31, K.I, 'hall', '3 posts ready for your OK.'); msg(33.2, 'd3', 'hall', 'A review request for the Hendersons is ready.'); msg(35.4, K.O, 'hall', 'Quick question: should the invite mention parking?');
    msg(43, 'research', 'web1', 'Searching GitHub for better review tools…', 'Research desk'); msg(44.6, 'web3', 'research', 'Found one. 1,840 stars. Checking it’s safe…', 'Research desk');
    msg(46.2, 'research', 'school', 'It’s safe. Sending it to class.'); msg(48.9, 'school', 'd3', 'New skill passed! Joining you.');
    W.talk = [[27.6, 30.4, 'hall_0', 'Hey, how are the kids?'], [28.9, 30.4, 'hall_2', 'What kids? I’m a robot.']];
    W.model = { win: [52.6, 56.4], seq: [[0, 'Claude', '#e07a4f'], [53.4, 'ChatGPT', '#10a37f'], [54.2, 'Gemini', '#4f8df5'], [55, 'Kimi', '#8b6cff'], [55.8, 'Claude', '#e07a4f']] };
    cap(.15, 3.8, '<span class="n">1,000</span> AI helpers <em>live in this city.</em>', 'And every one of them works for you.');   // the hook: a big number and the lights coming on
    cap(4, 8.4, 'Your emails. Your customers. <em>Your posts. Your bills.</em>', 'They handle the busywork, day and night.');
    cap(8.6, 11.9, 'A customer emails you <em>at 9 pm.</em>', 'Your Mail Room reads it within minutes.');
    cap(20.4, 23.2, 'But first, <em>104 AI judges</em> check it.', 'Weak drafts get rewritten.');
    cap(23.4, 26, 'Only the best <em>reaches you.</em>', '', 'Judges are simulated by AI, not real people.');
    cap(30.8, 35, 'All day, every day. <em>While you live your life.</em>', 'Posts, reviews, invites. All waiting for your OK.');
    cap(38.6, 41.5, 'It sees what’s missing. <em>Then builds it.</em>', 'A new department, working by tonight.');
    cap(42, 47.4, 'Every week, it searches the internet <em>for better ways to work.</em>', '');
    cap(47.8, 51.9, 'New skills get tested. <em>Only the best graduate.</em>', 'Every week, your whole city gets smarter.');
    cap(52.4, 56.3, 'Runs on <em>any AI</em> you choose.', 'Switch the brain anytime. The city keeps working.');
    cap(56.6, 59.2, 'Your city <em>never sleeps.</em>', '1,000 helpers. One goal: your life, easier.');
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
  .card{position:absolute;left:16px;right:64px;bottom:162px;padding:16px 16px 8px;border-radius:20px;background:rgba(10,12,22,.94);border:1px solid rgba(240,207,134,.4);box-shadow:0 16px 40px rgba(0,0,0,.6);opacity:0}
  .card>b{display:block;font:700 10.5px Inter,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#f0cf86;margin-bottom:10px}
  .step{display:flex;gap:11px;align-items:flex-start;margin-bottom:10px;opacity:0}.step i{flex:none;width:22px;height:22px;border-radius:50%;background:#f0cf86;color:#0b0d14;font:700 12px/22px Inter,sans-serif;font-style:normal;text-align:center}
  .step span{font:600 15px/1.35 Inter,sans-serif;color:#fbf7ef}
  .grade{position:absolute;left:50%;bottom:200px;margin-left:-125px;width:250px;padding:14px 0 16px;border-radius:22px;background:rgba(9,12,21,.94);border:1px solid #f0cf86;text-align:center;color:#fbf7ef;box-shadow:0 0 50px -8px #f0cf86;opacity:0}
  .grade small{display:block;font:700 10px Inter,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#f0cf86}.grade b{display:block;margin:6px 0 4px;font:400 58px/1 IS,Georgia,serif;color:#fbf7ef}.grade span{font:600 13.5px Inter,sans-serif;color:rgba(240,236,228,.88)}
  .prop .txt{font:500 15px/1.4 Inter,sans-serif;color:#fbf7ef;margin-bottom:14px}
  .vbtn{display:flex;gap:10px;margin-bottom:8px}.vbtn i{flex:1;padding:13px 0;border-radius:14px;text-align:center;font:700 15px Inter,sans-serif;font-style:normal;background:#fbf7ef;color:#1a1813}.vbtn i:first-child{background:#f0cf86;color:#0b0d14}
  .ask{position:absolute;left:16px;right:64px;bottom:162px;opacity:0}
  .ask .reply{margin:0 30px 12px 0;padding:11px 15px 12px;border-radius:18px 18px 18px 5px;background:rgba(251,247,239,.97);color:#1a1813;font:500 14.5px/1.35 Inter,sans-serif;opacity:0}
  .ask .reply b{display:block;font:700 9.5px/1.2 Inter,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#7a6330;margin-bottom:4px}
  .ask .field{display:flex;align-items:center;gap:10px;padding:8px 8px 8px 18px;border-radius:999px;background:rgba(10,12,22,.94);border:1px solid rgba(240,207,134,.5)}
  .ask .field span{flex:1;font:500 16px Inter,sans-serif;color:#fbf7ef;white-space:nowrap;overflow:hidden}.ask .field span.ph{color:rgba(240,236,228,.45)}
  .ask .field i{flex:none;width:38px;height:38px;border-radius:50%;background:#f0cf86;color:#0b0d14;font:700 19px/38px Inter,sans-serif;font-style:normal;text-align:center}
  .tap{position:absolute;left:0;top:0;width:50px;height:50px;margin:-25px 0 0 -25px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 20px #fff;opacity:0}
  .vchips{position:absolute;left:16px;right:64px;bottom:200px;padding:18px 16px 10px;border-radius:20px;background:rgba(10,12,22,.92);border:1px solid rgba(240,207,134,.35);opacity:0}
  .vchips b{display:block;font:700 10.5px Inter,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#f0cf86;margin-bottom:12px}
  .vchips span{display:inline-block;margin:0 8px 9px 0;padding:8px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.22);color:#fbf7ef;font:600 15px Inter,sans-serif;opacity:0}
  .vend{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 26px;background:radial-gradient(420px 380px at 50% 46%,rgba(4,6,12,.55),rgba(4,6,12,.9));opacity:0}
  .vend h1{margin:0;font:400 54px/1 IS,Georgia,serif;color:#fbf7ef}.vend h1 em{color:#f0cf86}
  .vend h2{margin:22px 0 0;font:italic 400 33px/1.1 IS,Georgia,serif;color:#f0cf86}
  .vend .pill{margin-top:30px;padding:13px 22px;border-radius:999px;background:#f0cf86;color:#0b0d14;font:700 14px Inter,sans-serif;white-space:nowrap}
  .vend small{position:absolute;bottom:168px;left:24px;right:64px;font:500 10.5px Inter,sans-serif;color:rgba(240,236,228,.6)}
  .dip{position:absolute;inset:0;background:#05070d;opacity:0}
  .arcs{position:absolute;inset:0;width:100%;height:100%;z-index:-1;overflow:visible;filter:drop-shadow(0 0 4px rgba(255,255,255,.6))}.arcs path{fill:none;stroke-linecap:round}
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
  const ASK = 'Build me a crypto trading desk';
  const ask = el('ask', '<div class="reply"><b>Your city</b>Hold tight! The Research desk is scanning GitHub for the best builds.</div><div class="field"><span></span><i>↑</i></div>'), askTxt = ask.querySelector('.field span');
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
  const taps = TAPS.map(([a, at]) => ({ a, at, e: el('tap', '') }));
  const chips = el('vchips', '<b>Your AI, your pick</b>' + ['Claude', 'ChatGPT', 'Gemini', 'OpenRouter', 'Groq', 'Mistral', 'Ollama'].map(x => '<span>' + x + '</span>').join(''));
  const end = el('vend', '<h1>Your <em>City</em></h1><h2>All you\'ll ever need.</h2><p style="margin:16px 0 0;font:600 14px Inter,sans-serif;color:rgba(240,236,228,.85)">Over 1,000 agents. One goal: make your life easier.</p><div class="pill">Message me to get started</div><small>Sample business shown. 1,000+ agents: 10 departments, each judged by 104 simulated AI judges.</small>');
  const dip = el('dip', '');
  const fade = (t, a, b, i, o) => Math.min(cl((t - a) / (i || .45)), cl((b - t) / (o || .4)));
  const rise = (e, t, a, px) => { e.style.transform = 'translateY(' + ((1 - ease(cl((t - a) / .5))) * px) + 'px)'; };
  const show = (e, w, t, px) => { if (!w) { e.style.opacity = 0; return false; } e.style.opacity = fade(t, w[0], w[1]); rise(e, t, w[0], px); return true; };
  function overlay(t) {
    caps.forEach(c => { c.e.style.opacity = fade(t, c.a, c.b); rise(c.e, t, c.a, 12); const n = c.e.querySelector('.n'); if (n && W.count) n.textContent = Math.round(1000 * ease(cl((t - W.count[0]) / (W.count[1] - W.count[0])))).toLocaleString('en-US'); });
    VISITS.forEach(v => { v.e.style.opacity = fade(t, v.a, v.b - .1, .4, .3); rise(v.e, t, v.a, 24); v.rows.forEach((r, i) => { const a = v.a + .3 + i * v.gap; r.style.opacity = cl((t - a) / .4); r.style.transform = 'translateX(' + ((1 - ease(cl((t - a) / .45))) * 14) + 'px)'; }); });
    C.crowdQuotes(W.quotes(t));
    if (show(grade, W.grade, t, 0)) grade.style.transform = 'scale(' + (0.8 + 0.2 * ease(cl((t - W.grade[0]) / .45))) + ')';
    if (show(prop, W.prop, t, 30)) { const bu = (t - W.prop[2]) / .7; prop.querySelector('.vbtn i').style.transform = bu > 0 && bu < .35 ? 'scale(.94)' : 'none'; }
    if (show(ask, W.ask, t, 30)) {
      const n = Math.round(cl((t - W.type[0]) / W.type[1]) * ASK.length); askTxt.textContent = n ? ASK.slice(0, n) + (t < W.send && Math.floor(t * 2.5) % 2 ? '|' : '') : 'Ask your city for anything…'; askTxt.className = n ? '' : 'ph';
      if (t > W.send + .1) askTxt.textContent = ''; const rp = ask.querySelector('.reply'), r0 = W.reply || 1e9; rp.style.opacity = cl((t - r0) / .4); rp.style.transform = 'translateY(' + ((1 - ease(cl((t - r0) / .45))) * 10) + 'px)'; }
    taps.forEach(p => { const u = (t - p.a) / .7; if (u <= 0 || u >= 1) { p.e.style.opacity = 0; return; } const q = p.at(); p.e.style.opacity = 1 - u; p.e.style.transform = 'translate3d(' + q.x.toFixed(1) + 'px,' + q.y.toFixed(1) + 'px,0) scale(' + (.5 + u * 1.4) + ')'; });
    if (show(chips, W.chips, t, 40)) chips.querySelectorAll('span').forEach((s, i) => { s.style.opacity = cl((t - W.chips[0] - .3 - i * .16) / .25); });
    const te = W.end, ef = cl((t - te) / .6); end.style.opacity = ef; end.querySelector('h1').style.transform = 'scale(' + lin(.94, 1, ease(cl((t - te) / 1))) + ')';
    end.querySelector('h2').style.opacity = cl((t - te - .6) / .5); end.querySelector('.pill').style.opacity = cl((t - te - 1.2) / .4);
    const city = C.mode === 'city' && !C.trans; let n = 0;
    (W.arcs || []).forEach(a => { const u = (t - a.t) / a.dur; if (!city || u <= 0 || u > 1.3) return; const head = Math.min(u, 1), tail = Math.max(0, head - (a.big ? .45 : .3)), f = u > 1 ? 1 - (u - 1) / .3 : 1;
      let d = ''; for (let i = 0; i <= 12; i++) { const q = C.projectXY(bez(a.P, tail + (head - tail) * i / 12)); if (q.z > 1) return; d += (i ? 'L' : 'M') + q.x.toFixed(1) + ' ' + q.y.toFixed(1); }
      const s = strand(n++), hq = C.projectXY(bez(a.P, head)); s.g.style.display = ''; s.g.style.opacity = f; s.p.setAttribute('d', d); s.p.setAttribute('stroke', a.col); s.p.setAttribute('stroke-width', a.big ? 2.6 : 1.6);
      s.c.setAttribute('cx', hq.x.toFixed(1)); s.c.setAttribute('cy', hq.y.toFixed(1)); s.c.setAttribute('fill', a.big ? '#fff' : a.col); s.c.style.display = u < 1 ? '' : 'none'; });
    pool.forEach((s, i) => { if (i >= n) s.g.style.display = 'none'; });
    const placed = [];
    msgs.forEach(m => { const f = city ? fade(t, m.t, m.t + 2.3, .3, .3) : 0; m.e.style.opacity = f; if (f <= 0) return; const q = C.projectXY(end3(m.at)), w = m.e.offsetWidth, h = m.e.offsetHeight;
      const x = Math.max(10, Math.min(345 - w, q.x - w / 2)); let y = Math.max(250, Math.min(540 - h, q.y - h - 14)); for (const r of placed) if (x < r.x + r.w && r.x < x + w && y < r.y + r.h && r.y < y + h) y = r.y + r.h + 8; placed.push({ x, y, w, h });
      m.e.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + (y + (1 - ease(cl((t - m.t) / .4))) * 8).toFixed(1) + 'px,0)'; });
    talk.forEach((s, i) => { const f = fade(t, s.a, s.b, .3, .3); s.e.style.opacity = f; if (f <= 0) return; const q = C.projectXY(C.headPos(C.cityChars[s.who], new V3())), w = s.e.offsetWidth, h = s.e.offsetHeight;
      const x = Math.max(10, Math.min(345 - w, i ? q.x - 24 : q.x - w + 24)); let y = Math.max(250, q.y - h - 16 - (i ? 0 : 34));   // the first bubble up and left, the reply right
      for (const r of placed) if (x < r.x + r.w && r.x < x + w && y < r.y + r.h && r.y < y + h) y = r.y + r.h + 8; placed.push({ x, y, w, h });
      s.e.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) scale(' + (.88 + .12 * ease(cl((t - s.a) / .35))) + ')'; });
    if (model) { const mf = fade(t, W.model.win[0], W.model.win[1]), cur = W.model.seq.filter(x => t >= x[0]).pop(); model.style.opacity = mf; rise(model, t, W.model.win[0], 30);
      model.querySelectorAll('.chips i').forEach(i => { const on = i.textContent === cur[1]; i.style.background = on ? cur[2] : 'transparent'; i.style.borderColor = on ? cur[2] : 'rgba(255,255,255,.22)'; i.style.transform = on ? 'scale(1.06)' : 'none'; });
      wash.style.opacity = mf * .45; wash.style.background = 'radial-gradient(120% 90% at 50% 45%,' + cur[2] + ',transparent 70%)'; }
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
    if (C.mode === 'inside' && !C.trans) { C.goal.az += dt * .02; C.cam.az = C.goal.az; }   // a slow drift while inside
    else if (!C.trans) { const s = camAt(t); Object.assign(C.goal, s); Object.assign(C.cam, s); }
    if (draw) overlay(t);
    C.step(dt, !draw); clock(t);
  };
  window.__vready = fetch('/api/state', { credentials: 'same-origin' }).then(r => r.json()).then(S0 => {
    const lead = S0.cards.find(c => c.kind === 'lead' && c.judged && c.judged.crowd); ROWS = lead ? lead.judged.crowd.rows : [];
  }).then(() => document.fonts.ready);
})();
