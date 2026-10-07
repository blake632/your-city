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
    // The 30-second teaser: one long fly-in over the whole city, one tap inside, then quick cuts (each through a dip to dark) to what makes it
    // feel alive: the judges, a department going up by itself, one going up because you asked, the prizes. Every cut lands on a frame (t*30 whole).
    const RISE = Object.assign({}, CITY, { az: CITY.az - 1.1, el: 1.3, dist: CITY.dist * 2.1, pitch: 1.08 });
    window.__vdur = 30;
    MOVES.push([0, 6.2, RISE, CITY], [11, 15.6, S.J1, S.J2], [15.6, 20, S.B1, S.B2], [20, 24.4, S.X1, S.X2], [24.4, 27, S.P1, S.P2], [27, 30, S.P2, FIN]);
    visit(K.L, 6.2, 2.4, 'Answers every new customer, in your voice.', ['Dana emails about a new kitchen.', 'Her reply is already written. You tap Send.'], { cut: true, kicker: 'Leads', lead: .8, gap: .7 });
    DIPS.push(15.6, 20, 24.4);
    const YES = QUOTES.filter(q => q.yes);
    EVENTS.push([9.4, () => C.judgeCrowd(ROWS, YES, [0, 0])], [15.6, () => C.clearCrowd()], [15.9, () => C.addDept(BOOK)], [21.9, () => C.addDept(CRYPTO)]);
    W.quotes = t => t < 11.6 ? 0 : t < 12.3 ? 1 : 2;
    W.grade = [12.9, 15.45]; W.ask = [20.1, 22.9]; W.type = [20.35, 1.2]; W.send = 21.75; W.end = 26.9; W.count = [.4, 2.2];
    cap(.3, 3.3, '<span class="n">1,000</span> <em>AI agents.</em>', 'Running their own city. Making it better every week. All for your life.');
    cap(3.4, 6, 'Every building is <em>a department.</em>', 'Email. Leads. Posts. Reviews. Research. Working 24/7.');
    cap(11.2, 15.4, '<em>104 AI judges</em> check every draft.', 'Only the best ever reaches you.', 'Judges are simulated by AI, not real people.');
    cap(15.8, 19.8, 'It sees what’s missing. <em>You tap. It builds.</em>', '14 unfiled invoices? Here comes Bookkeeping.');
    cap(20.2, 24.2, 'Ask for anything. <em>Watch it rise.</em>', '', 'Crypto Desk: paper trading only, never real money.');
    cap(24.6, 26.9, 'It gets <em>better every week.</em>', 'The best agents win prizes. Then they teach the rest.');
  }
  if (W.send) TAPS.push([W.send, center('.ask .field i')]);
  if (W.prop) TAPS.push([W.prop[2], center('.prop .vbtn i')]);
  const camAt = t => { let hold = MOVES[0][2]; for (const [a, b, A, B] of MOVES) { if (t >= a && t < b) return mix(A, B, ease((t - a) / (b - a))); if (t >= b) hold = B; } return hold; };   // between moves: hold the last shot
  const css = `
  @font-face{font-family:IS;src:url(/__v/fonts/is-regular.woff2) format('woff2');font-style:normal}
  @font-face{font-family:IS;src:url(/__v/fonts/is-italic.woff2) format('woff2');font-style:italic}
  #hud,#hint,#marks,#qbubs{display:none!important}
  #inside{background:linear-gradient(180deg,rgba(5,7,13,.96) 60%,rgba(5,7,13,0))!important}#inSub{color:rgba(240,236,228,.9)!important}
  #vo{position:absolute;inset:0;z-index:20;pointer-events:none;font-family:Inter,system-ui,sans-serif}
  .vcap{position:absolute;left:0;right:0;top:0;padding:26px 22px 90px;background:linear-gradient(rgba(4,6,12,.9),rgba(4,6,12,.6) 55%,rgba(4,6,12,0));opacity:0}
  .vcap h1{margin:0;font:400 35px/1.06 IS,Georgia,serif;color:#fbf7ef;letter-spacing:-.2px;text-shadow:0 2px 18px rgba(0,0,0,.6)}.vcap h1 em{color:#f0cf86}
  .vcap p{margin:11px 0 0;font:600 14.5px/1.35 Inter,sans-serif;color:rgba(240,236,228,.88)}.vcap small{display:block;margin-top:8px;font:500 10.5px/1.3 Inter,sans-serif;color:rgba(240,236,228,.62)}
  .card{position:absolute;left:16px;right:16px;bottom:22px;padding:16px 16px 8px;border-radius:20px;background:rgba(10,12,22,.94);border:1px solid rgba(240,207,134,.4);box-shadow:0 16px 40px rgba(0,0,0,.6);opacity:0}
  .card>b{display:block;font:700 10.5px Inter,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#f0cf86;margin-bottom:10px}
  .step{display:flex;gap:11px;align-items:flex-start;margin-bottom:10px;opacity:0}.step i{flex:none;width:22px;height:22px;border-radius:50%;background:#f0cf86;color:#0b0d14;font:700 12px/22px Inter,sans-serif;font-style:normal;text-align:center}
  .step span{font:600 15px/1.35 Inter,sans-serif;color:#fbf7ef}
  .grade{position:absolute;left:50%;bottom:70px;margin-left:-125px;width:250px;padding:14px 0 16px;border-radius:22px;background:rgba(9,12,21,.94);border:1px solid #f0cf86;text-align:center;color:#fbf7ef;box-shadow:0 0 50px -8px #f0cf86;opacity:0}
  .grade small{display:block;font:700 10px Inter,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#f0cf86}.grade b{display:block;margin:6px 0 4px;font:400 58px/1 IS,Georgia,serif;color:#fbf7ef}.grade span{font:600 13.5px Inter,sans-serif;color:rgba(240,236,228,.88)}
  .prop .txt{font:500 15px/1.4 Inter,sans-serif;color:#fbf7ef;margin-bottom:14px}
  .vbtn{display:flex;gap:10px;margin-bottom:8px}.vbtn i{flex:1;padding:13px 0;border-radius:14px;text-align:center;font:700 15px Inter,sans-serif;font-style:normal;background:#fbf7ef;color:#1a1813}.vbtn i:first-child{background:#f0cf86;color:#0b0d14}
  .ask{position:absolute;left:16px;right:16px;bottom:24px;opacity:0}
  .ask .reply{margin:0 30px 12px 0;padding:11px 15px 12px;border-radius:18px 18px 18px 5px;background:rgba(251,247,239,.97);color:#1a1813;font:500 14.5px/1.35 Inter,sans-serif;opacity:0}
  .ask .reply b{display:block;font:700 9.5px/1.2 Inter,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#7a6330;margin-bottom:4px}
  .ask .field{display:flex;align-items:center;gap:10px;padding:8px 8px 8px 18px;border-radius:999px;background:rgba(10,12,22,.94);border:1px solid rgba(240,207,134,.5)}
  .ask .field span{flex:1;font:500 16px Inter,sans-serif;color:#fbf7ef;white-space:nowrap;overflow:hidden}.ask .field span.ph{color:rgba(240,236,228,.45)}
  .ask .field i{flex:none;width:38px;height:38px;border-radius:50%;background:#f0cf86;color:#0b0d14;font:700 19px/38px Inter,sans-serif;font-style:normal;text-align:center}
  .tap{position:absolute;left:0;top:0;width:50px;height:50px;margin:-25px 0 0 -25px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 20px #fff;opacity:0}
  .vchips{position:absolute;left:24px;right:24px;bottom:110px;padding:18px 16px 10px;border-radius:20px;background:rgba(10,12,22,.92);border:1px solid rgba(240,207,134,.35);opacity:0}
  .vchips b{display:block;font:700 10.5px Inter,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#f0cf86;margin-bottom:12px}
  .vchips span{display:inline-block;margin:0 8px 9px 0;padding:8px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.22);color:#fbf7ef;font:600 15px Inter,sans-serif;opacity:0}
  .vend{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 26px;background:radial-gradient(420px 380px at 50% 46%,rgba(4,6,12,.55),rgba(4,6,12,.9));opacity:0}
  .vend h1{margin:0;font:400 54px/1 IS,Georgia,serif;color:#fbf7ef}.vend h1 em{color:#f0cf86}
  .vend h2{margin:22px 0 0;font:italic 400 33px/1.1 IS,Georgia,serif;color:#f0cf86}
  .vend .pill{margin-top:30px;padding:13px 22px;border-radius:999px;background:#f0cf86;color:#0b0d14;font:700 14px Inter,sans-serif;white-space:nowrap}
  .vend small{position:absolute;bottom:26px;left:0;right:0;font:500 10.5px Inter,sans-serif;color:rgba(240,236,228,.6)}
  .dip{position:absolute;inset:0;background:#05070d;opacity:0}`;
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
  const taps = TAPS.map(([a, at]) => ({ a, at, e: el('tap', '') }));
  const chips = el('vchips', '<b>Your AI, your pick</b>' + ['Claude', 'ChatGPT', 'Gemini', 'OpenRouter', 'Groq', 'Mistral', 'Ollama'].map(x => '<span>' + x + '</span>').join(''));
  const end = el('vend', '<h1>Your <em>City</em></h1><h2>All you\'ll ever need.</h2><p style="margin:16px 0 0;font:600 14px Inter,sans-serif;color:rgba(240,236,228,.85)">Over 1,000 agents. One goal: make your life easier.</p><div class="pill">Free to test · DM me</div><small>Sample business shown. 1,000+ agents: 10 departments, each judged by 104 simulated AI judges.</small>');
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
    dip.style.opacity = DIPS.reduce((m, c) => Math.max(m, t <= c ? cl(1 - (c - t) / .22) : cl(1 - (t - c) / .3)), 0);   // a quick dip to dark around each cut
  }
  // The page's CSS fades and pulses run on the wall clock, but a frame takes far longer to draw than 1/30 s, so they jumped from frame to frame.
  // Pause every one and play it on the video's clock instead.
  const born = new WeakMap();
  function clock(t) { document.getAnimations().forEach(a => { if (!born.has(a)) { born.set(a, t); a.pause(); } a.currentTime = (t - born.get(a)) * 1000; }); }
  let lastT = -1;
  window.__vstep = async (t, dt, draw) => {
    EVENTS.forEach(([et, fn]) => { if (lastT < et && t >= et) fn(); }); lastT = t;
    if (C.mode === 'inside' && !C.trans) { C.goal.az += dt * .02; C.cam.az = C.goal.az; }   // a slow drift while inside
    else if (!C.trans) { const s = camAt(t); Object.assign(C.goal, s); Object.assign(C.cam, s); }
    if (draw) overlay(t);
    C.step(dt, !draw); clock(t);
  };
  window.__vready = fetch('/api/state', { credentials: 'same-origin' }).then(r => r.json()).then(S0 => {
    const lead = S0.cards.find(c => c.kind === 'lead' && c.judged && c.judged.crowd); ROWS = lead ? lead.judged.crowd.rows : [];
  }).then(() => document.fonts.ready);
})();
