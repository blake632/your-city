# Your City

Your own AI office. Agents that:

- **Answer new leads fast.** They spot a new customer in your email and write your first reply.
- **Sort your email.** New email gets labels, and anything that needs you gets a reply drafted.
- **Draft your social posts.** Three posts a week, written from what you tell it about your business.
- **Do whatever you tell them.** Add your own agent in plain words, like "Every Monday, give me 3 ideas to get more reviews."

**Nothing is sent, posted or deleted without your click.** Agents write drafts and cards. You press Send.

**Use any AI you like:** Claude, ChatGPT, Gemini, any model through OpenRouter, or another service that works like OpenAI (Groq, Together, Mistral, Ollama...). You pick it inside the app and can switch any time.

When something does not work, the **Guide** agent tells you exactly what to do, one step at a time. You can also ask it questions in your own words.

## What you need

Your city runs on Railway. Nothing runs on Google: Google only gives your city permission to read and draft your email.

| Thing | Cost |
|---|---|
| A [Railway](https://railway.com) account, to run your city 24/7 | Hobby plan, about $5 a month |
| A key from the AI you choose | Pay as you go. You set a daily limit (starts at $3) |
| A Gmail or Google Workspace account, only so the city may read your email | Free |

## Start in 10 minutes

1. On this GitHub page, click **Fork** (top right), then **Create fork**. That makes your own copy.
2. Go to [railway.com](https://railway.com) and sign in with GitHub.
3. Click **New Project**, then **Deploy from GitHub repo**, and pick your copy.
4. In the project, click **Create**, then **Database**, then **PostgreSQL**. This is where your city keeps its memory.
5. Click your app (not the database), then **Variables**, then **New Variable**. Name: `DATABASE_URL`. Value: `${{Postgres.DATABASE_URL}}` (type it exactly like this).
6. Click **Settings**, then under **Networking** click **Generate Domain**.
7. Open that address. **Choose your password.** The first person to choose one becomes the owner, so do this right away.

Everything else happens inside your city:

8. **Settings → Your AI**: pick your AI, paste its key, press **Save and test**, then pick a model.
9. **Settings → Your business**: tell the city about your business.
10. **Settings → Gmail**: the Guide walks you through giving your city permission to read your email (about 5 minutes, once).

Stuck? Open the **Guide** and type your question. More detail is in [SETUP.md](SETUP.md).

## Choose your agents

In **Settings → Agents** you can, for each agent:

- Turn it on or off.
- Pick its AI model, or leave it on your main model.
- Choose how often it runs.
- Press **Run now** to try it.

**Add your own agent** lets you write what it should do in plain words, and how often. You can have it show you its work before keeping it.

## On your phone

Open your city in Safari, tap **Share**, then **Add to Home Screen**. Open it from there, sign in, and in **Settings → Phone alerts** turn alerts on. Your phone buzzes when a new lead's reply is ready.

## Forgot your password?

In Railway, click your app, then **Variables**. Add `CITY_PASSWORD` with a new password. It takes over in a minute and signs everyone else out.

## For developers

Plain Node.js 22, two packages (`@anthropic-ai/sdk`, `pg`), no build step.

```
src/main.js     start-up
src/city.js     settings, agents, cards, the clock
src/guide.js    the setup checklist and every fix, in plain words
src/ai.js       any AI: Claude, or any OpenAI-style service; models, daily budget, errors
src/google.js   Google sign-in and Gmail
src/server.js   sign-in, the API, the Connect Google flow
src/push.js     phone alerts (web push, no package)
src/store.js    Postgres, or data/city.json without a database
public/         the home screen
```

Run it on your own computer:

```
npm install
```

```
npm start
```

Then open http://localhost:3000, choose a password, and set up your AI in Settings. For Gmail on your computer, add `http://localhost:3000/connect/google/callback` as a redirect URI in your Google OAuth client.

Optional variables, if you prefer them to Settings: `CITY_PASSWORD`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `AI_API_KEY` with `AI_BASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DATABASE_URL`. Anything saved in Settings wins over a variable.

Tests run offline against a fake Gmail, a fake Anthropic and a fake OpenAI-style service:

```
npm test
```
