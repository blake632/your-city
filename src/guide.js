// The Guide: the agent that helps when something does not work. It checks the setup every minute (no AI, no cost), turns every
// failure into a "How to fix it" card with exact steps, and answers questions about setup ("Ask the guide"), using the AI when it
// can and these steps when it cannot. Every fix below is one plain step per line, for someone who has never used these sites.
const fs = require('node:fs'), path = require('node:path');

const RAILWAY_VARS = 'In Railway, open your project, click your app (not the database), then the Variables tab.';
const FIXES = {
  no_business: { title: 'Tell the city about your business', steps: () => ['Open Settings.', 'Fill in Your business: the name, what you do, your signature and how to answer a new lead.', 'Press Save. Your agents start on their next run.'] },
  agent_off: { title: 'That agent is turned off', steps: () => ['Open Settings, find the agent under Agents, and press Turn on.'] },
  no_ai_key: { title: 'Add your AI key', steps: () => ['Go to console.anthropic.com and sign in (or make an account).', 'Click API Keys, then Create Key. Copy the key.', 'Under Billing, add at least $5 of credit.', RAILWAY_VARS, 'Click New Variable. Name: ANTHROPIC_API_KEY. Value: paste the key.', 'Railway restarts the city by itself. Come back here in a minute.'] },
  ai_key_wrong: { title: 'Your AI key is not working', steps: () => ['Anthropic did not accept the key. It may be mistyped, have a space in it, or have been deleted.', 'Go to console.anthropic.com, click API Keys, and make a new key.', RAILWAY_VARS, 'Click ANTHROPIC_API_KEY, paste the new key, and save.'] },
  ai_credit: { title: 'Your Anthropic account is out of credit', steps: () => ['Go to console.anthropic.com and click Billing.', 'Add credit. $5 to $10 is plenty to start.', 'The city tries again on its next run.'] },
  ai_model: { title: 'That AI model is not available to you', steps: () => ['Open Settings in the city.', 'Under Agents, pick a different model for this agent, like Claude Sonnet 5.5.'] },
  ai_busy: { title: 'Anthropic asked the city to slow down', steps: () => ['Nothing to do. The city waits and tries again on its next run.', 'If this keeps happening, lower how often agents run in Settings.'] },
  ai_offline: { title: 'The city could not reach Anthropic', steps: () => ['Usually a short internet hiccup. The city tries again on its next run.', 'If it lasts more than an hour, check status.anthropic.com.'] },
  ai_down: { title: 'Anthropic had a problem', steps: () => ['Usually short. The city tries again on its next run.', 'If it lasts more than an hour, check status.anthropic.com.'] },
  ai_request: { title: 'Anthropic could not use one request', steps: () => ['The city skips that item and keeps going.', 'If it keeps happening for one agent, try a different model for it in Settings.'] },
  refusal: { title: 'The AI declined one request', steps: () => ['The city skipped that item.', 'If it was your own agent, reword its instructions in Settings.'] },
  bad_answer: { title: 'The AI gave a messy answer', steps: () => ['Nothing to do. The city tries again on its next run.'] },
  cut_off: { title: 'An AI answer was cut off', steps: () => ['Nothing to do. The city tries again on its next run.'] },
  budget: { title: 'Today\'s AI budget is used up', steps: c => ['Agents pause until tomorrow so you never spend more than you chose ($' + c.cap.toFixed(2) + ' a day).', 'To keep going today, raise Daily AI budget in Settings.'] },
  no_database: { title: 'Your city forgets everything on each restart', steps: () => ['Right now it saves to a file, and Railway wipes that file every time it redeploys.', 'In Railway, open your project and click Create (or + New), then Database, then PostgreSQL.', RAILWAY_VARS, 'Click New Variable. Name: DATABASE_URL. Value: ${{Postgres.DATABASE_URL}} (type it exactly, with the dollar sign and braces).', 'Railway restarts the city. Your settings start fresh once, then stay.'] },
  no_address: { title: 'Your city has no web address', steps: () => ['In Railway, click your app, then Settings.', 'Under Networking, click Generate Domain.', 'Open that address. That is your city.'] },
  google_no_client: { title: 'Let your city read your Gmail (one time)', steps: c => [
    'Your city runs on Railway. This only gives it permission to read and draft your email.',
    'Go to console.cloud.google.com and sign in with the Google account whose email the city should read.',
    'At the top, click the project picker, then New Project. Name it My City and click Create.',
    'Search for Gmail API, open it, and click Enable.',
    'Open Google Auth Platform (it may be called OAuth consent screen). Click Get started. App name: My City. Pick your email. Audience: External (Internal if you use a work Google Workspace account). Finish.',
    'Under Audience, click Publish app and confirm. (Skip this for Internal.) This stops Google from disconnecting you every 7 days.',
    'Under Clients, click Create client. Type: Web application.',
    'Under Authorized redirect URIs, click Add URI and paste exactly: ' + c.redirect,
    'Click Create. Copy the Client ID and the Client secret.',
    RAILWAY_VARS,
    'Add two variables: GOOGLE_CLIENT_ID (the Client ID) and GOOGLE_CLIENT_SECRET (the Client secret).',
    'Wait a minute for Railway to restart, then press Connect Google in Settings.'] },
  google_not_connected: { title: 'Connect your Gmail', steps: () => ['Open Settings and press Connect Google.', 'Pick your account. If Google says it has not verified the app, click Advanced, then Go to My City. (It is your own app.)', 'Allow the Gmail permission.'] },
  google_redirect: { title: 'Google does not know your city\'s address yet', steps: c => ['Go to console.cloud.google.com, then Google Auth Platform, then Clients.', 'Click your client. Under Authorized redirect URIs, add exactly: ' + c.redirect, 'Click Save, wait 5 minutes, then press Connect Google again.'] },
  google_client: { title: 'Google did not accept your client ID or secret', steps: () => ['Go to console.cloud.google.com, then Google Auth Platform, then Clients, and open your client.', 'Copy the Client ID and secret again. If the secret is hidden, add a new secret.', RAILWAY_VARS, 'Paste them into GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET with no spaces.', 'Then press Connect Google again.'] },
  google_expired: { title: 'Google disconnected your Gmail', steps: () => ['While your Google app is in Testing, Google ends the connection every 7 days.', 'Fix it for good: console.cloud.google.com, then Google Auth Platform, then Audience, then Publish app.', 'Then press Connect Google in Settings again.'] },
  google_no_refresh: { title: 'Google did not give the city a lasting pass', steps: () => ['Go to myaccount.google.com/permissions and remove My City.', 'Then press Connect Google in Settings again.'] },
  google_scope: { title: 'Gmail did not get permission', steps: () => ['Press Connect Google in Settings again.', 'On Google\'s screen, tick the box that lets the app read and draft your email.'] },
  gmail_api_off: { title: 'Turn on the Gmail API', steps: c => ['Open this link: ' + (c.detail || 'console.cloud.google.com/apis/library/gmail.googleapis.com'), 'Click Enable.', 'Wait two minutes. The city tries again by itself.'] },
  google_busy: { title: 'Gmail asked the city to slow down', steps: () => ['Nothing to do. The city tries again on its next run.'] },
  google_offline: { title: 'The city could not reach Google', steps: () => ['Usually a short hiccup. The city tries again on its next run.'] },
  google_error: { title: 'Gmail had a problem', steps: () => ['The city tries again on its next run.', 'If it keeps happening, press Connect Google in Settings again.'] },
  draft_gone: { title: 'That draft is gone from Gmail', steps: () => ['It was sent or deleted in Gmail already. Nothing else to do.'] },
  unknown: { title: 'Something unexpected went wrong', steps: c => ['What happened: ' + c.message, 'The city tries again on its next run.', 'Ask the guide below if it keeps happening.'] },
};
function fixFor(code, ctx) { const f = FIXES[code] || FIXES.unknown; return { code: FIXES[code] ? code : 'unknown', title: f.title, steps: f.steps(ctx) }; }

// The setup checklist the Guide tab shows: each line ok, or what to do.
function checks(city, { redirect }) {
  const out = [], ctx = { redirect, cap: city.ai.cap() }, errs = city.store.get('errors', {});
  out.push(Object.assign({ id: 'business', ok: !!city.settings().business.trim(), text: city.settings().business.trim() ? 'Business details are filled in' : fixFor('no_business', ctx).title }, city.settings().business.trim() ? {} : { fix: fixFor('no_business', ctx) }));
  const add = (id, ok, okText, code, extra) => out.push(Object.assign({ id, ok, text: ok ? okText : fixFor(code, Object.assign({}, ctx, extra || {})).title }, ok ? {} : { fix: fixFor(code, Object.assign({}, ctx, extra || {})) }));
  const aiErr = Object.values(errs).find(e => /^ai_(key_wrong|credit)$/.test(e.code));
  add('ai', city.ai.ready() && !aiErr, 'AI key is set', aiErr ? aiErr.code : 'no_ai_key');
  const onRailway = !!process.env.RAILWAY_ENVIRONMENT || !!process.env.RAILWAY_PROJECT_ID;
  add('db', city.store.kind() === 'postgres' || !onRailway, city.store.kind() === 'postgres' ? 'Database is connected' : 'Saving to data/city.json on this computer', 'no_database');
  const mail = city.agentOn('mailroom') || city.agentOn('leads');
  if (mail) {
    const gErr = Object.values(errs).find(e => /^(google|gmail)_/.test(e.code));
    if (!city.google.configured()) add('google', false, '', 'google_no_client');
    else if (!city.google.connected()) add('google', false, '', 'google_not_connected');
    else add('google', !gErr, 'Gmail is connected (' + city.google.email() + ')', gErr ? gErr.code : 'google_error', gErr ? { detail: gErr.detail } : {});
  }
  const spent = city.ai.spentToday(), cap = city.ai.cap();
  add('budget', spent < cap, 'AI spend today: $' + spent.toFixed(2) + ' of $' + cap.toFixed(2), 'budget');
  return out;
}

// "Ask the guide": the AI answers from the setup guide, the checklist and the recent errors; without a working AI, the checklist's own steps answer.
async function ask(city, question, { redirect }) {
  const list = checks(city, { redirect }), bad = list.filter(c => !c.ok);
  const fallback = () => bad.length ? bad.map(c => c.fix.title + ':\n' + c.fix.steps.map((s, i) => (i + 1) + '. ' + s).join('\n')).join('\n\n') : 'Everything in the checklist looks good. If an agent did something wrong, open it and tap Needs feedback.';
  if (!city.ai.ready()) return { answer: fallback(), by: 'checklist' };
  let setup = ''; try { setup = fs.readFileSync(path.join(__dirname, '..', 'SETUP.md'), 'utf8').slice(0, 30000); } catch (e) {}
  const errs = Object.entries(city.store.get('errors', {})).map(([a, e]) => a + ': ' + e.code + ' (' + e.message + (e.detail ? '; ' + String(e.detail).slice(0, 200) : '') + ')').join('\n') || 'none';
  try {
    const answer = await city.ai.ask({ model: city.agentConf('guide').model, effort: 'low', maxTokens: 2000,
      system: 'You are the Guide inside Starter City, a small self-hosted app where AI agents sort email, answer leads and draft posts. The person asking is not technical. Answer with a few short numbered steps in plain words, one action per step, naming the exact button or page. Use only the setup guide, the checklist and the errors below; if they do not cover the question, say what you would check and suggest asking the person who shared the app. Never ask for or repeat a key or password.',
      prompt: 'SETUP GUIDE:\n' + setup + '\n\nCHECKLIST NOW:\n' + list.map(c => (c.ok ? 'OK: ' : 'PROBLEM: ') + c.text).join('\n') + '\n\nRECENT ERRORS:\n' + errs + '\n\nThe app\'s Google redirect address is: ' + redirect + '\n\nQUESTION: ' + String(question || '').slice(0, 2000) });
    return { answer, by: 'ai' };
  } catch (e) { return { answer: fallback(), by: 'checklist', note: e.message }; }
}
module.exports = { FIXES, fixFor, checks, ask };
