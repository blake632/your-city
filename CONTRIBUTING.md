# Helping with Your City

Thanks for helping. Your City is for small business owners who are not technical, so everything stays simple: short words, one idea per line.

## Run it

1. Install Node 22.
2. `npm install`
3. `npm test` (runs offline, with a fake Gmail and a fake AI)
4. `npm start`, then open http://localhost:3000

## The rules

- Nothing is sent, posted or deleted without the owner's click. The one exception is autopilot, which the owner turns on per department.
- Departments never invent prices, dates or promises.
- The Panel and the Crowd are simulated people. Always label them simulated.
- Never log, print or commit a key, a password or a token.
- Every problem the owner can fix gets plain-English steps in `src/guide.js`.
- Everything works on a phone at 400px wide.

`CLAUDE.md` has the full list.

## Send a change

1. Fork the repo and make a branch.
2. Keep the change small. Add or update a test in `test/`.
3. Make sure `npm test` passes.
4. Open a pull request that says what it does, in plain words.

## Good places to start

- **Setup.** The Gmail step (Google Cloud) is where most people get stuck. Anything that makes it easier helps the most.
- **New ready-made departments** in `src/city.js` (`PICKS`).
- **Bugs.** Open an issue: what you did, what you expected, what happened.

By sending a change, you agree to share it under the [AGPL-3.0](LICENSE).
