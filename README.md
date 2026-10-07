# Your City

Your own AI office. Agents that:

- **Answer new leads fast.** They spot a new customer in your email and write your first reply.
- **Sort your email.** New email gets labels, and anything that needs you gets a reply drafted.
- **Draft your social posts.** Three posts a week, written from what you tell it about your business.
- **Do whatever you tell them.** Add your own agent in plain words, like "Every Monday, give me 3 ideas to get more reviews."

**Nothing is sent, posted or deleted without your click.** Agents write drafts and cards. You press Send.

When something does not work, the **Guide** agent tells you exactly what to do, one step at a time. You can also ask it questions in your own words.

## What you need

Your city runs on Railway. Nothing runs on Google: Google only gives your city permission to read and draft your email.


| Thing | Cost |
|---|---|
| A [Railway](https://railway.com) account, to run your city 24/7 | Hobby plan, about $5 a month |
| An [Anthropic](https://console.anthropic.com) account, for the AI | Pay as you go. You set a daily limit (starts at $3) |
| A Gmail or Google Workspace account, only so the city may read your email | Free |

## Start in 10 minutes

1. On this GitHub page, click **Use this template**, then **Create a new repository**. Make it private. (No such button? Click **Fork** instead.)
2. Go to [railway.com](https://railway.com) and sign in with GitHub.
3. Click **New Project**, then **Deploy from GitHub repo**, and pick your new repository.
4. In the project, click **Create**, then **Database**, then **PostgreSQL**.
5. Click your app (not the database), then **Variables**. Add these three:

   | Name | Value |
   |---|---|
   | `CITY_PASSWORD` | a password only you know |
   | `ANTHROPIC_API_KEY` | your key from console.anthropic.com, API Keys |
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (type it exactly like this) |

6. Click **Settings**, then under **Networking** click **Generate Domain**.
7. Open that address and sign in with your password.
8. In **Settings**, tell the city about your business.
9. Open the **Guide**. It walks you through giving your city permission to read Gmail, step by step.

Stuck? Open the Guide and type your question. More detail is in [SETUP.md](SETUP.md).

## Choose your agents

In **Settings → Agents** you can, for each agent:

- Turn it on or off.
- Pick its AI model: Claude Opus 5.5 (best writing), Claude Sonnet 5.5 (fast, half the price) or Claude Haiku 4.5 (cheapest).
- Choose how often it runs.
- Press **Run now** to try it.

**Add your own agent** lets you write what it should do in plain words, and how often. You can have it show you its work before keeping it.

## On your phone

Open your city in Safari, tap **Share**, then **Add to Home Screen**. Open it from there, sign in, and in **Settings → Phone alerts** turn alerts on. Your phone buzzes when a new lead's reply is ready.

## For developers

Plain Node.js 22, two packages (`@anthropic-ai/sdk`, `pg`), no build step.

```
src/main.js     start-up
src/city.js     settings, agents, cards, the clock
src/guide.js    the setup checklist and every fix, in plain words
src/ai.js       Anthropic calls, models, daily budget, errors
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
CITY_PASSWORD=pick-one ANTHROPIC_API_KEY=your-key npm start
```

Then open http://localhost:3000. For Gmail on your computer, add `http://localhost:3000/connect/google/callback` as a redirect URI in your Google OAuth client.

Tests run offline against a fake Gmail and a fake Anthropic:

```
npm test
```
