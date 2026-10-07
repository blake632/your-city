# Your City (starter)

A small Node.js app, drawn as a city: departments the owner names and describes (plus ready-made Leads, Mail room and Social), whose work a simulated Panel (8) and Crowd (96) judge before one small business owner approves it.

## Rules that never bend
- It runs on Railway. Google is only the Gmail permission (an app password, or an OAuth client the owner makes once), never hosting: no Apps Script, no Google Cloud servers.
- Nothing is sent, posted or deleted without the owner's click. Departments make Gmail drafts and cards; only `City.decide` with `approve` sends.
- The one exception is autopilot, which the owner turns on per department (`City.setAutopilot`) after it earns it (8 of its last 10 approved as written). It approves through the same `City.decide`; questions, fixes, new buildings and work the panel marked weak always wait; at most 20 a day; a new job turns it off. Never turn it on for the owner.
- Departments never invent prices, dates or promises. Facts come from the owner's Settings or the message itself.
- Never log, print, store in the page state, or commit a key, a password or the Google refresh token.
- Every failure the owner can fix gets a plain-English fix in `src/guide.js` (`FIXES`): one action per step, naming the exact button. Throw a `CityError` with that code.

## Working on it
- Node 22, CommonJS, two packages. No build step. Run `npm test` (offline: fake Gmail, fake Anthropic and fake OpenAI-style service in `test/fakes.js`) before every push.
- AI calls go through `src/ai.js` only: any AI the owner picks (Claude through the official `@anthropic-ai/sdk`; ChatGPT, Gemini, OpenRouter or any OpenAI-style service through `chat/completions`), the owner's chosen model, the daily budget.
- No Railway variable is required except `DATABASE_URL`. The owner chooses the password on first visit and pastes the AI key and the Google client in Settings; variables still work, and Settings win. Keys live only in the store and never go back to the page.
- Gmail calls go through `src/google.js` only: the easy way is an app password over IMAP and SMTP (`src/apppass.js`), the advanced way Google sign-in (scope `gmail.modify`). The app password lives only in the store and never goes back to the page. A draft is sent only as it is in Gmail now; one that changed or is gone is never sent from an old copy.
- A new city has no departments: the owner builds each one (`City.saveDepartment`). Never add a department by default.
- Jev (`src/jev.js`) runs the original city's quick checks (quiet-lane audit, lead kind, effort, done and verdict, the crowd). The real Jev (typesafe-ai/jev on the Vercel AI Gateway) only with the owner's key; otherwise the owner's AI answers the same questions. A Jev failure falls back, never blocks.
- The Panel and the Crowd (`src/judge.js`) are simulated people played by the owner's AI. Always label them simulated, never as real people or real metrics. A judging problem never holds work back.
- The home screen is `public/index.html`. The City tab shows `public/city3d.html` in a frame: the 3D night city (three.js r134 served from `public/vendor`, never a CDN), one building per department, City Hall, the Research desk and the School; it gets its data from `/city3d` and `/api/city3d` and asks the app to open pages with postMessage. A city has 10 department lots. Keep both readable on a phone at 400px with no sideways scrolling.
- The School (`src/school.js`) and the Research desk (`src/research.js`) reach GitHub with no key. Nothing they find ever installs itself: a playbook joins a department only after passing its class; a repo's plan waits for the owner's approval.
- The owner is usually not technical: short words, one idea per line, in the app and in the docs.
