# Your City (starter)

A small Node.js app, drawn as a city: departments the owner names and describes (plus ready-made Leads, Mail room and Social), whose work a simulated Panel (8) and Crowd (96) judge before one small business owner approves it.

## Rules that never bend
- It runs on Railway. Google is only the Gmail permission (an OAuth client the owner makes once), never hosting: no Apps Script, no Google Cloud servers.
- Nothing is sent, posted or deleted without the owner's click. Departments make Gmail drafts and cards; only `City.decide` with `approve` sends.
- Departments never invent prices, dates or promises. Facts come from the owner's Settings or the message itself.
- Never log, print, store in the page state, or commit a key, a password or the Google refresh token.
- Every failure the owner can fix gets a plain-English fix in `src/guide.js` (`FIXES`): one action per step, naming the exact button. Throw a `CityError` with that code.

## Working on it
- Node 22, CommonJS, two packages. No build step. Run `npm test` (offline: fake Gmail, fake Anthropic and fake OpenAI-style service in `test/fakes.js`) before every push.
- AI calls go through `src/ai.js` only: any AI the owner picks (Claude through the official `@anthropic-ai/sdk`; ChatGPT, Gemini, OpenRouter or any OpenAI-style service through `chat/completions`), the owner's chosen model, the daily budget.
- No Railway variable is required except `DATABASE_URL`. The owner chooses the password on first visit and pastes the AI key and the Google client in Settings; variables still work, and Settings win. Keys live only in the store and never go back to the page.
- Gmail calls go through `src/google.js` only (scope `gmail.modify`).
- A new city has no departments: the owner builds each one (`City.saveDepartment`). Never add a department by default.
- The Panel and the Crowd (`src/judge.js`) are simulated people played by the owner's AI. Always label them simulated, never as real people or real metrics. A judging problem never holds work back.
- The home screen is one file, `public/index.html`. Keep it readable on a phone at 400px with no sideways scrolling.
- The owner is usually not technical: short words, one idea per line, in the app and in the docs.
