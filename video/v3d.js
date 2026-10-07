// The video: the 3D city (video mode) with vdirector.js on top, drawn frame by frame and encoded to a 1080x1920 MP4.
//   node v3d.js stills 1.5 9 20 ...   a few frames as PNGs, to check
//   node v3d.js                        the whole video: 3 workers draw a third each, then the pieces are joined
//   node v3d.js short                  the 74-second teaser (vout/your-city-short.mp4)
// A worker fast-forwards the world (without drawing) to its first frame, so the pieces meet exactly.
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const { spawn, execFileSync } = require('child_process'), fs = require('fs'), path = require('path'), os = require('os');
// A Mac draws with its own graphics chip; a server with none draws in software (SwiftShader), about 10x slower.
const GPU = process.platform === 'darwin', ARGS = GPU ? ['--use-angle=metal', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const CUT = ['short', 'endcard'].includes(process.argv[2]) ? process.argv[2] : ['short', 'endcard'].includes(process.env.VCUT) ? process.env.VCUT : 'full'; process.env.VCUT = CUT;   // workers inherit it
const FPS = 30, DUR = { full: 104, short: 74.2, endcard: 4.5 }[CUT], N = Math.round(DUR * FPS), DIR = __dirname, OUTDIR = path.join(DIR, 'vout'), W = 405, H = 720, DPR = 2;
fs.mkdirSync(OUTDIR, { recursive: true }); fs.mkdirSync(path.join(DIR, 'shots'), { recursive: true });
const FILES = { '/__v/fonts/': path.join(DIR, 'fonts'), '/__v/assets/': path.join(DIR, 'vassets') };

async function openCity(base) {
  const br = await chromium.launch({ args: ARGS });
  const pg = await br.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DPR }), errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await pg.route('**/__v/**', r => { const u = new URL(r.request().url()); const pre = Object.keys(FILES).find(p => u.pathname.startsWith(p)); if (!pre) return r.abort();
    const f = path.join(FILES[pre], path.basename(u.pathname)); if (!fs.existsSync(f)) return r.abort(); r.fulfill({ path: f, contentType: f.endsWith('.woff2') ? 'font/woff2' : 'image/png' }); });
  await pg.goto(base + '/'); await pg.fill('#pw', 'pw'); await pg.click('button'); await pg.waitForTimeout(300);
  await pg.goto(base + '/city3d?video=1'); await pg.waitForFunction(() => window.__city && window.__city.step);
  await pg.evaluate(c => { window.__vcut = c; }, CUT); await pg.addScriptTag({ path: path.join(DIR, 'vdirector.js') }); await pg.evaluate(() => window.__vready);
  const vd = await pg.evaluate(() => window.__vdur); if (Math.abs(vd - DUR) > .5) console.log('NOTE: the director runs ' + vd.toFixed(1) + 's but DUR in v3d.js is ' + DUR);
  return { br, pg, errs };
}
async function worker(base, a, b, out) {
  const { br, pg, errs } = await openCity(base);
  for (let f = 0; f < a; f++) await pg.evaluate(([t, dt]) => window.__vstep(t, dt, false), [f / FPS, 1 / FPS]);   // fast-forward
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-vf', 'scale=1080:1920:flags=lanczos',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS), out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', c => c ? rej(new Error('ffmpeg ' + c)) : res()));
  const t0 = Date.now();
  for (let f = a; f < b; f++) {
    await pg.evaluate(([t, dt]) => window.__vstep(t, dt, true), [f / FPS, 1 / FPS]);
    const buf = await pg.screenshot({ type: 'jpeg', quality: 94 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if ((f - a) % 60 === 0) console.log('[' + path.basename(out) + '] frame', f, 'of', a + '-' + b, Math.round((Date.now() - t0) / 1000) + 's');
  }
  ff.stdin.end(); await done; await br.close();
  if (errs.length) console.log('[' + path.basename(out) + '] page errors:', errs.slice(0, 3));
}
async function stills(base, times) {
  const { br, pg, errs } = await openCity(base), want = times.map(Number).sort((x, y) => x - y);
  let f = 0;
  for (const t of want) {
    const target = Math.round(t * FPS);
    for (; f < target; f++) await pg.evaluate(([tt, dt, draw]) => window.__vstep(tt, dt, draw), [f / FPS, 1 / FPS, f >= target - 20]);
    await pg.evaluate(([tt, dt]) => window.__vstep(tt, dt, true), [f / FPS, 1 / FPS]); f++;
    await pg.screenshot({ path: path.join(DIR, 'shots', 'v3d-' + t.toFixed(1) + '.png') });
  }
  console.log('stills done; page errors:', errs.length ? errs : 'none'); await br.close();
}
(async () => {
  const mode = process.argv[2];
  if (mode === 'worker') return worker(process.argv[3], +process.argv[4], +process.argv[5], process.argv[6]);
  const { vsample } = require('./vsample'), s = await vsample({ proposals: false });
  try {
    if (mode === 'stills') return await stills(s.base, process.argv.slice(3));
    const parts = Math.max(1, Math.min(6, Math.floor(os.cpus().length / 2))), cut = [...Array(parts).keys()].map(i => Math.round(N * i / parts)).concat(N), segs = [];
    console.log('drawing', N, 'frames with', parts, 'workers');
    await Promise.all([...Array(parts).keys()].map(i => { const out = path.join(OUTDIR, 'seg' + i + '.mp4'); segs.push(out);
      return new Promise((res, rej) => { const p = spawn(process.execPath, [__filename, 'worker', s.base, String(cut[i]), String(cut[i + 1]), out], { stdio: 'inherit' }); p.on('close', c => c ? rej(new Error('worker ' + i + ' failed')) : res()); }); }));
    fs.writeFileSync(path.join(OUTDIR, 'list.txt'), segs.map(f => "file '" + f + "'").join('\n'));
    const final = path.join(OUTDIR, { short: 'your-city-short.mp4', endcard: 'your-city-endcard.mp4' }[CUT] || 'your-city.mp4');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(OUTDIR, 'list.txt'), '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', final]);
    console.log('WROTE', final);
  } finally { s.close(); }
})().catch(e => { console.error('FAILED', e); process.exit(1); });
