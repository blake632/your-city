// The Panel and the Crowd: before a department's work reaches you, people it is meant for judge it. They are simulated: your AI plays
// each person (from what you said the department does and who it is for). They are not real people, and the page says so.
// - The Panel: 8 people. Each reacts in a sentence or two and scores it 1 to 5. It passes at 3.5 on average with at least half at 4 or 5.
//   A failed panel gets one rewrite aimed at the harshest reactions, kept only if the panel scores it higher.
// - The Crowd: the same 8 people in 12 moods (96 seats). Each says yes or no. It only advises: it never holds work back.
const MOODS = ['skimming fast on a phone', 'actively shopping this month', 'skeptical, burned before', 'comparing three options side by side',
  'just browsing for ideas', 'busy, between meetings', 'detail-minded, reads every line', 'price-sensitive, looking for the catch', 'impressed by craft and care',
  'cares most about trust and reviews', 'in no hurry, a year or more out', 'ready to act this week'];
const SEATS = 8, BAR = { avg: 3.5, top: 0.5 };
const PEOPLE = { type: 'object', additionalProperties: false, required: ['question', 'people'], properties: {
  question: { type: 'string' },
  people: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'who'], properties: { name: { type: 'string' }, who: { type: 'string' } } } } } };
const PANEL = { type: 'object', additionalProperties: false, required: ['reactions'], properties: { reactions: { type: 'array', items: { type: 'object', additionalProperties: false,
  required: ['name', 'said', 'score'], properties: { name: { type: 'string' }, said: { type: 'string' }, score: { type: 'integer' } } } } } };
const CROWD = { type: 'object', additionalProperties: false, required: ['people', 'typical'], properties: { typical: { type: 'boolean' }, people: { type: 'array', items: { type: 'object', additionalProperties: false,
  required: ['name', 'yes'], properties: { name: { type: 'string' }, yes: { type: 'array', items: { type: 'boolean' } } } } } } };

// The 8 people this department's work is for, made once from your business and the department, and kept (shown on the department page).
async function people(city, d) {
  if (d.panel && d.panel.people && d.panel.people.length >= 4) return d.panel;
  const s = city.settings();
  const r = await city.ai.ask({ model: city.agentConf(d.id).model, effort: 'low', maxTokens: 4000, schema: PEOPLE,
    system: 'You design a test audience for a small business. Plain words. No real names of real people.',
    prompt: 'THE BUSINESS: ' + (s.business || 'a small business') + '. ' + (s.about || '') + '\nTHE DEPARTMENT: "' + d.name + '". What it does: ' + d.does +
      '\nWHO ITS WORK IS FOR: ' + (d.audience || 'the business\'s customers') + '\n\nWrite ' + SEATS + ' different people who would really see this department\'s work. Each: a first name and one line on who they are and what they care about (age, situation, what would win them over or put them off). Make them varied, and include two hard-to-please ones.' +
      '\nThen write the one yes-or-no question each of them answers about a piece of this work, from their side (for example: "Would you reply to this?" or "Would you stop scrolling for this post?").' });
  const panel = { question: String(r.question || 'Would you act on this?').slice(0, 200), people: (r.people || []).slice(0, SEATS).map(p => ({ name: String(p.name).slice(0, 40), who: String(p.who).slice(0, 240) })) };
  if (panel.people.length < 4) throw new Error('The panel could not be made.');
  city.saveDepartment({ id: d.id, panel });
  return panel;
}
async function score(city, d, P, work) {
  const r = await city.ai.ask({ model: city.agentConf(d.id).model, effort: 'low', maxTokens: 4000, schema: PANEL,
    system: 'You play ' + P.people.length + ' different people, one at a time, honestly. Most people are lukewarm about most things. For each person, in order: their first reaction in one or two short sentences in their own voice, then a score from 1 to 5 for "' + P.question + '" (1 no, 2 probably not, 3 maybe, 4 yes, 5 yes and I would act on it now).',
    prompt: 'THE PEOPLE:\n' + P.people.map((p, i) => (i + 1) + '. ' + p.name + ': ' + p.who).join('\n') + '\n\nWHAT THEY SEE:\n' + String(work).slice(0, 6000) });
  const reactions = (r.reactions || []).slice(0, P.people.length).map(x => ({ name: String(x.name).slice(0, 40), said: String(x.said).slice(0, 300), score: Math.max(1, Math.min(5, Math.round(Number(x.score) || 1))) }));
  if (!reactions.length) throw new Error('The panel did not answer.');
  const avg = reactions.reduce((a, x) => a + x.score, 0) / reactions.length, top = reactions.filter(x => x.score >= 4).length;
  return { avg: Math.round(avg * 10) / 10, top, n: reactions.length, pass: avg >= BAR.avg && top / reactions.length >= BAR.top, reactions };
}
async function crowd(city, d, P, work) {
  const r = await city.ai.ask({ model: city.agentConf(d.id).model, effort: 'low', maxTokens: 4000, schema: CROWD,
    system: 'You play each person below in ' + MOODS.length + ' different moods, in this order: ' + MOODS.join('; ') + '. For each person, give ' + MOODS.length + ' honest yes or no answers to "' + P.question + '", one per mood, in that order. Then answer for a typical person who sees it (typical).',
    prompt: 'THE PEOPLE:\n' + P.people.map((p, i) => (i + 1) + '. ' + p.name + ': ' + p.who).join('\n') + '\n\nWHAT THEY SEE:\n' + String(work).slice(0, 6000) });
  const rows = (r.people || []).slice(0, P.people.length).map(x => ({ name: String(x.name).slice(0, 40), yes: (x.yes || []).slice(0, MOODS.length).map(Boolean) }));
  const n = rows.reduce((a, x) => a + x.yes.length, 0);
  if (n < (P.people.length * MOODS.length) / 2) return null;   // too few answers to count
  return { n, yes: rows.reduce((a, x) => a + x.yes.filter(Boolean).length, 0), typical: !!r.typical, rows };
}
// Judge a piece of work. Returns the text to show (rewritten once if the panel did not pass and the rewrite scored higher) and what the judges said.
// rewrite(text, note) -> the department's own rewrite. A judging problem never blocks the work: it arrives without a verdict.
async function judge(city, d, text, rewrite) {
  if (!d.judge) return { text, judged: null };
  try {
    const P = await people(city, d);
    let p = await score(city, d, P, text), trail = [];
    if (!p.pass && rewrite) {
      const low = p.reactions.slice().sort((a, b) => a.score - b.score).slice(0, 3).map(x => x.name + ' (' + x.score + '/5): "' + x.said + '"').join('\n');
      const next = await rewrite(text, 'A test panel of the people this is for scored it ' + p.avg + '/5. The harshest reactions:\n' + low + '\nRewrite it so it wins these people, keeping every fact and rule.');
      const p2 = next && next.trim() ? await score(city, d, P, next) : null;
      if (p2 && p2.avg > p.avg) { trail.push('Rewritten after the panel: ' + p.avg + ' to ' + p2.avg + ' out of 5.'); text = next; p = p2; }
      else trail.push('A rewrite did not score higher' + (p2 ? ' (' + p2.avg + '/5)' : '') + ', so you see the first version.');
    }
    const c = await crowd(city, d, P, text).catch(() => null);
    return { text, judged: { question: P.question, panel: p, crowd: c, moods: MOODS.length, trail, simulated: true } };
  } catch (e) {   // the work is already made: it still reaches you, marked as not judged
    return { text, judged: { error: 'Not judged: ' + String(e.message || e).slice(0, 140) } };
  }
}
module.exports = { judge, people, score, crowd, MOODS, SEATS, BAR };
