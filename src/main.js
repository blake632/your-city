// Start the city: storage, the AI, Gmail, alerts, the agents' clock and the web server.
const { Store } = require('./store');
const { AI } = require('./ai');
const { Google } = require('./google');
const { Push } = require('./push');
const { City } = require('./city');
const { Social } = require('./social');
const { School } = require('./school');
const { Research } = require('./research');
const { createServer } = require('./server');

(async () => {
  const store = await Store.open();
  const ai = new AI({ store }), google = new Google({ store });
  const push = new Push(store, { subject: 'mailto:' + (google.email() || 'city-owner@example.com') });
  const city = new City({ store, ai, google, push });
  city.accounts = new Social({ store });
  city.school = new School({ city }); city.research = new Research({ city, school: city.school });   // they reach GitHub, so they are added here, not in tests
  const server = createServer({ city });
  const port = Number(process.env.PORT) || 3000;
  server.listen(port, () => console.log('Your city is up on port ' + port + ' (storage: ' + store.kind() + '). Open it in your browser.'));
  if (process.env.CITY_AGENTS !== 'off') city.start();
  const stop = async () => { city.stop(); server.close(); await store.flush(); process.exit(0); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
})().catch(e => { console.error('The city could not start: ' + (e && e.stack || e)); process.exit(1); });
