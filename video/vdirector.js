// Runs inside the 3D city page (video mode). The camera, the agents talking to you, the judges, new buildings going up, the captions:
// all a function of time t. window.__vstep(t, dt, draw) plays the events t has passed, places the camera, draws the overlay, moves the world on.
(() => {
  const C = window.__city, V3 = window.THREE.Vector3, byName = n => C.DEPTS.find(d => d.name === n);
  const K = { L: byName('Leads').k, O: byName('Open House').k, I: byName('Instagram').k, M: byName('Mail Room').k };
  const ease = x => x <= 0 ? 0 : x >= 1 ? 1 : x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2, lin = (a, b, x) => a + (b - a) * x, cl = x => Math.max(0, Math.min(1, x));
  const angLerp = (a, b, x) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * x; };
  const mix = (A, B, x) => ({ az: angLerp(A.az, B.az, x), el: lin(A.el, B.el, x), dist: Math.exp(lin(Math.log(A.dist), Math.log(B.dist), x)), pitch: lin(A.pitch, B.pitch, x), px: lin(A.px, B.px, x), py: lin(A.py, B.py, x), pz: lin(A.pz, B.pz, x) });
  const spot = (x, z, h, az, el, dist, tilt) => ({ az, el, dist, pitch: el + (tilt != null ? tilt : .14), px: x, py: h, pz: z });
  const at = (k, az, el, dist, dy) => { const d = C.DK[k]; return spot(d.bx, d.bz - 1.5, d.b.h * .35 + (dy || 0), az, el, dist); };
  const agent = (k, i) => C.cityChars[k + '_' + i], hp = ch => C.headPos(ch, new V3());
  const face = (k, i, az, dist) => { const p = agent(k, i).root.position; return spot(p.x, p.z, 3.2, az, .2, dist || 21, .1); };   // close on an agent's face
  const bx = c => -72 + 36 * c, bz = r => -36 + 36 * r;
  const CITY = C.cityState(), HIGH = Object.assign({}, CITY, { az: .62, el: 1.18, dist: CITY.dist * 1.75, pitch: 1.0 }), FIN = Object.assign({}, CITY, { az: .42, el: .98, dist: CITY.dist * 1.22, pitch: CITY.pitch + .08 });
  const S = { L1: at(K.L, .55, .42, 78), LF: face(K.L, 0, .72), LF2: face(K.L, 0, .8, 19),
    J1: spot(bx(0), bz(0), 2, .3, .5, 50, .1), J2: spot(bx(0), bz(0), 2, .5, .46, 40, .1),
    I1: at(K.I, .62, .36, 58), IF: face(K.I, 1, .6), OF: at(K.O, -.05, .45, 70, 6), OF2: at(K.O, -.16, .44, 64, 6),
    M1: at(K.M, .2, .4, 70), MF: face(K.M, 0, .1), MF2: face(K.M, 0, .18, 18),
    B1: spot(bx(0), bz(2), 6, .35, .42, 76), B2: spot(bx(0), bz(2), 9, .58, .36, 66),
    R1: at('research', -.24, .42, 64), RF: face('research', 0, -.3), RF2: face('research', 0, -.22, 18),
    X1: spot(bx(4), bz(2), 6, -.3, .42, 76), X2: spot(bx(4), bz(2), 9, -.52, .36, 66),
    P1: spot(-49, -77, 3, .25, .3, 72, .08), P2: spot(-49, -77, 3, .45, .27, 60, .08),
    T1: spot(-7, 37.5, 4, -.75, .55, 34, .02), T2: spot(-7, 37.5, 4, -.55, .5, 28, .02),
    A1: Object.assign({}, CITY, { az: .36, el: .7, dist: CITY.dist * .9 }) };
  const MOVES = [[0, 4, HIGH, CITY], [4, 5.4, CITY, S.L1], [5.4, 6.8, S.L1, S.LF], [6.8, 11, S.LF, S.LF2],
    [11, 12.8, S.LF2, S.J1], [12.8, 23.5, S.J1, S.J2], [23.5, 25, S.J2, S.I1], [25, 26.2, S.I1, S.IF], [26.2, 29, S.IF, S.IF],
    [29, 30.4, S.IF, S.OF], [30.4, 34, S.OF, S.OF2], [34, 35.4, S.OF2, S.M1], [35.4, 36.8, S.M1, S.MF], [36.8, 42.4, S.MF, S.MF2],
    [42.4, 44, S.MF2, S.B1], [44, 48.4, S.B1, S.B2], [48.4, 49.8, S.B2, S.R1], [49.8, 51.2, S.R1, S.RF], [51.2, 55.2, S.RF, S.RF2],
    [55.2, 56.6, S.RF2, S.X1], [56.6, 60, S.X1, S.X2], [60, 61.5, S.X2, S.P1], [61.5, 64.5, S.P1, S.P2], [64.5, 66, S.P2, S.T1], [66, 70, S.T1, S.T2],
    [70, 72.6, S.T2, S.A1], [72.6, 79.5, S.A1, FIN]];
  function camAt(t) { for (const [a, b, A, B] of MOVES) if (t >= a && t < b) return mix(A, B, ease((t - a) / (b - a))); return FIN; }
  let ROWS = [];
  const QUOTES = [{ yes: false, text: 'I hate this. It says nothing.' }, { yes: false, text: 'Generic. Feels automated.' }, { yes: true, text: 'I\'d reply to this email.' }, { yes: true, text: 'Warm, and it asks one clear question.' }];
  const EVENTS = [[11, () => C.judgeCrowd(ROWS, QUOTES, [0, 0])], [23.6, () => C.clearCrowd()],
    [42.6, () => C.addDept({ name: 'Bookkeeping', does: 'File every invoice and receipt each week, and tell me what is due.' })],
    [56.4, () => C.addDept({ name: 'Crypto Desk', does: 'Paper-trade a small test portfolio and report weekly. Paper only.' })]];
  const css = `
  @font-face{font-family:IS;src:url(/__v/fonts/is-regular.woff2) format('woff2');font-style:normal}
  @font-face{font-family:IS;src:url(/__v/fonts/is-italic.woff2) format('woff2');font-style:italic}
  #hud,#hint,#inside{display:none!important}
  #vo{position:absolute;inset:0;z-index:20;pointer-events:none;font-family:Inter,system-ui,sans-serif}
  .vcap{position:absolute;left:0;right:0;top:0;padding:26px 22px 90px;background:linear-gradient(rgba(4,6,12,.9),rgba(4,6,12,.6) 55%,rgba(4,6,12,0));opacity:0}
  .vcap h1{margin:0;font:400 35px/1.06 IS,Georgia,serif;color:#fbf7ef;letter-spacing:-.2px;text-shadow:0 2px 18px rgba(0,0,0,.6)}.vcap h1 em{color:#f0cf86}
  .vcap p{margin:11px 0 0;font:600 14.5px/1.35 Inter,sans-serif;color:rgba(240,236,228,.88)}.vcap small{display:block;margin-top:8px;font:500 10.5px/1.3 Inter,sans-serif;color:rgba(240,236,228,.62)}
  .say{position:absolute;left:0;top:0;width:max-content;max-width:260px;padding:11px 15px 12px;border-radius:18px 18px 18px 5px;background:rgba(251,247,239,.97);color:#1a1813;box-shadow:0 16px 40px rgba(0,0,0,.6),0 0 0 2px var(--c);opacity:0}
  .say .who{font:700 9.5px/1.2 Inter,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--c);margin-bottom:4px;filter:brightness(.7)}.say .txt{font:500 15px/1.35 Inter,sans-serif}
  .grade{position:absolute;left:50%;bottom:70px;margin-left:-125px;width:250px;padding:14px 0 16px;border-radius:22px;background:rgba(9,12,21,.94);border:1px solid #f0cf86;text-align:center;color:#fbf7ef;box-shadow:0 0 50px -8px #f0cf86;opacity:0}
  .grade small{display:block;font:700 10px Inter,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#f0cf86}.grade b{display:block;margin:6px 0 4px;font:400 58px/1 IS,Georgia,serif;color:#fbf7ef}.grade span{font:600 13.5px Inter,sans-serif;color:rgba(240,236,228,.88)}
  .vbtn{position:absolute;left:50%;bottom:80px;margin-left:-110px;width:220px;display:flex;gap:10px;opacity:0}
  .vbtn i{flex:1;padding:15px 0;border-radius:14px;text-align:center;font:700 16px Inter,sans-serif;font-style:normal;background:#fbf7ef;color:#1a1813}.vbtn i:first-child{background:#f0cf86;color:#0b0d14}
  .tap{position:absolute;left:25%;top:50%;width:50px;height:50px;margin:-25px 0 0 -25px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 20px #fff;opacity:0}
  .vchips{position:absolute;left:24px;right:24px;bottom:110px;padding:18px 16px 10px;border-radius:20px;background:rgba(10,12,22,.92);border:1px solid rgba(240,207,134,.35);opacity:0}
  .vchips b{display:block;font:700 10.5px Inter,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#f0cf86;margin-bottom:12px}
  .vchips span{display:inline-block;margin:0 8px 9px 0;padding:8px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.22);color:#fbf7ef;font:600 15px Inter,sans-serif;opacity:0}
  .vend{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 26px;background:radial-gradient(420px 380px at 50% 46%,rgba(4,6,12,.55),rgba(4,6,12,.9));opacity:0}
  .vend h1{margin:0;font:400 54px/1 IS,Georgia,serif;color:#fbf7ef}.vend h1 em{color:#f0cf86}
  .vend h2{margin:22px 0 0;font:italic 400 33px/1.1 IS,Georgia,serif;color:#f0cf86}
  .vend .pill{margin-top:30px;padding:13px 22px;border-radius:999px;background:#f0cf86;color:#0b0d14;font:700 14px Inter,sans-serif;white-space:nowrap}
  .vend small{position:absolute;bottom:26px;left:0;right:0;font:500 10.5px Inter,sans-serif;color:rgba(240,236,228,.6)}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const vo = document.createElement('div'); vo.id = 'vo'; document.body.appendChild(vo);
  const el = (cls, html) => { const e = document.createElement('div'); e.className = cls; e.innerHTML = html; vo.appendChild(e); return e; };
  const CAPS = [
    [0.5, 4.0, 'Over <em>1,000 agents.</em><br>One goal.', 'Make your life easier.'],
    [4.3, 7.0, 'A new customer <em>emails you.</em>', ''],
    [7.2, 10.9, 'An AI checker reads <em>every lead first.</em>', 'Vendors and spam never get a reply.'],
    [11.3, 15.4, 'Before you see it, <em>104 agents</em> judge it.', '8 judges score it. 96 more vote.'],
    [15.6, 19.4, 'Weak draft? <em>Rewritten.</em>', 'The first try scored 1.9 out of 5.'],
    [19.6, 23.4, 'Only the best <em>reaches you.</em>', '', 'Judges are simulated by AI, not real people.'],
    [23.8, 28.9, 'Marketing writes your <em>week of posts.</em>', ''],
    [29.3, 33.9, 'Missing a fact? <em>It asks you.</em>', 'Your answer is kept for next time.'],
    [34.3, 37.0, 'Connect Gmail. The <em>Mail Room</em> reads it all.', ''],
    [37.2, 42.3, 'Your city <em>improves itself.</em>', ''],
    [42.7, 48.3, 'Tap Build it. <em>It goes up.</em>', 'A new department, working by tonight.'],
    [48.6, 51.0, 'Want something new? <em>Just ask.</em>', '“Build me a crypto trading desk.”'],
    [56.6, 59.9, 'Your <em>Crypto Desk</em> is going up.', 'Paper trading only: it never trades real money.'],
    [60.3, 64.4, 'Agents compete for <em>nicer luxuries.</em>', 'Yachts. Sports cars. The best grades win.'],
    [64.8, 69.9, 'The <em>#1 agent</em> teaches the rest.', 'Every department learns its tip.'],
    [70.3, 72.5, 'Runs on <em>Claude, ChatGPT, Gemini</em> or any model.', ''],
    [72.8, 75.7, 'Every department.<br><em>One city.</em>', 'You approve everything.'],
  ].map(([a, b, h, p, s]) => ({ a, b, e: el('vcap', '<h1>' + h + '</h1>' + (p ? '<p>' + p + '</p>' : '') + (s ? '<small>' + s + '</small>' : '')) }));
  const col = k => C.DK[k].col;
  const SAYS = [
    [6.5, 10.9, () => agent(K.L, 0), K.L, 'Leads', 'Sam! Dana wants a new kitchen this spring. Her reply is ready for you.'],
    [26.0, 28.9, () => agent(K.I, 1), K.I, 'Instagram', 'Three posts ready for this week. The panel loved the first one.'],
    [30.6, 33.9, () => agent(K.O, 0), K.O, 'Open House', 'Quick question, Sam: should the invite mention parking?'],
    [36.6, 42.4, () => agent(K.M, 0), K.M, 'Mail Room', 'Sam, 14 invoices came in this month and nobody files them. We need a Bookkeeping desk.'],
    [51.0, 55.2, () => agent('research', 0), 'research', 'Research desk', 'Hold tight! Scanning GitHub and the internet for the best builds for you.'],
  ].map(([a, b, ch, k, who, text]) => { const e = el('say', '<div class="who">' + who + '</div><div class="txt">' + text + '</div>'); e.style.setProperty('--c', col(k)); return { a, b, ch, e }; });
  const grade = el('grade', '<small>The grade</small><b>4.4 / 5</b><span>74 of 96 said yes</span>');
  const btn = el('vbtn', '<i>Build it</i><i>Not now</i><div class="tap"></div>');
  const chips = el('vchips', '<b>Your AI, your pick</b>' + ['Claude', 'ChatGPT', 'Gemini', 'OpenRouter', 'Groq', 'Mistral', 'Ollama'].map(x => '<span>' + x + '</span>').join(''));
  const end = el('vend', '<h1>Your <em>City</em></h1><h2>All you\'ll ever need.</h2><p style="margin:16px 0 0;font:600 14px Inter,sans-serif;color:rgba(240,236,228,.85)">Over 1,000 agents. One goal: make your life easier.</p><div class="pill">Free · Open source · Link in bio</div><small>Sample business shown. 1,000+ agents: 10 departments, each judged by 104 simulated AI judges.</small>');
  const fade = (t, a, b, i, o) => Math.min(cl((t - a) / (i || .35)), cl((b - t) / (o || .3)));
  function overlay(t) {
    CAPS.forEach(c => { c.e.style.opacity = fade(t, c.a, c.b); c.e.style.transform = 'translateY(' + ((1 - ease(cl((t - c.a) / .5))) * 14) + 'px)'; });
    SAYS.forEach(s => { const f = fade(t, s.a, s.b, .3, .3); s.e.style.opacity = f; if (f <= 0) return; const p = C.projectXY(hp(s.ch())), w = s.e.offsetWidth, h = s.e.offsetHeight;
      s.e.style.transform = 'translate3d(' + Math.max(10, Math.min(395 - w, p.x - 22)).toFixed(1) + 'px,' + Math.max(175, p.y - h - 16).toFixed(1) + 'px,0) scale(' + (0.88 + 0.12 * ease(cl((t - s.a) / .35))) + ')'; });
    C.crowdQuotes(t < 12.8 ? 0 : t < 13.7 ? 1 : t < 16.8 ? 2 : t < 17.7 ? 3 : 4);
    const g = fade(t, 20, 23.4, .35, .3); grade.style.opacity = g; grade.style.transform = 'scale(' + (0.8 + 0.2 * ease(cl((t - 20) / .45))) + ')';
    const bf = fade(t, 40.6, 42.6, .3, .3); btn.style.opacity = bf; btn.style.transform = 'translateY(' + ((1 - ease(cl((t - 40.6) / .4))) * 30) + 'px)';
    const u = (t - 41.6) / .7, tp = btn.querySelector('.tap'); tp.style.opacity = u > 0 && u < 1 ? 1 - u : 0; tp.style.transform = 'scale(' + (.5 + Math.max(0, u) * 1.4) + ')';
    btn.querySelector('i').style.transform = u > 0 && u < .35 ? 'scale(.94)' : 'none';
    const cf = fade(t, 70.4, 72.5, .4, .3); chips.style.opacity = cf; chips.style.transform = 'translateY(' + ((1 - ease(cl((t - 70.4) / .5))) * 40) + 'px)';
    chips.querySelectorAll('span').forEach((s, i) => { s.style.opacity = cl((t - 70.7 - i * .16) / .25); });
    const ef = cl((t - 75.8) / .6); end.style.opacity = ef; end.querySelector('h1').style.transform = 'scale(' + lin(.94, 1, ease(cl((t - 75.8) / 1))) + ')';
    end.querySelector('h2').style.opacity = cl((t - 76.4) / .5); end.querySelector('.pill').style.opacity = cl((t - 77) / .4);
  }
  let lastT = -1;
  window.__vstep = async (t, dt, draw) => {
    EVENTS.forEach(([et, fn]) => { if (lastT < et && t >= et) fn(); }); lastT = t;
    const s = camAt(t); if (s && !C.trans) { Object.assign(C.goal, s); Object.assign(C.cam, s); }
    if (draw) overlay(t);
    C.step(dt, !draw);
  };
  window.__vready = fetch('/api/state', { credentials: 'same-origin' }).then(r => r.json()).then(S0 => {
    const lead = S0.cards.find(c => c.kind === 'lead' && c.judged && c.judged.crowd); ROWS = lead ? lead.judged.crowd.rows : [];
  }).then(() => document.fonts.ready);
})();
