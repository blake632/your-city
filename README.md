# Your City

Your own AI office, as a 3D city at night: each department a lit building, its people at work, walking finished work over to you.

- **You build the departments.** Name each one and say what it does in plain words: "Leads", "Instagram", "Reviews", "Newsletter", anything. Each one becomes a building in your city. Tap it to go inside.
- **They ask you instead of guessing.** Missing a fact (an address, a date, a price)? A department asks you one short question. A pink "?" floats over its building. Your answer is kept for next time.
- **Their work is judged before you see it.** A panel of 8 people the work is for scores it from 1 to 5. A weak draft is rewritten once. Then a crowd of 96 (the same 8 people in 12 moods) votes yes or no. These people are simulated by your AI, not real people, and the app says so.
- **Jev, the fast judge, checks everything.** Is this email from a real person? Is this lead a customer or a vendor? How hard should the AI think? Is the work finished? Should this idea ship? Jev answers each one, and runs the Crowd's 96 votes. Add a Vercel AI Gateway key for the real Jev, or your own AI plays Jev.
- **A Research desk and a School.** Every week the Research desk looks on GitHub for open-source playbooks and tools that could help your departments. Each one goes to the School first: orientation (is it real, kept up and safe?), three practice jobs graded by the department's head, then a grade. Only a playbook that passes joins a department. Nothing installs itself.
- **Ready-made departments if you want them.** Leads reads your Gmail and drafts a reply to each new customer. Mail room sorts your email and drafts replies. Social media writes your posts. Or start from nothing.
- **You approve everything, until you choose otherwise.** Approve, Decline, or tell it what to change. Each department learns your way from that.
- **Autopilot, when it has earned it.** Once 8 of a department's last 10 pieces of work were approved as written, one tap lets it approve its own work (up to 20 a day). Questions and weak work still come to you. Turn it off any time.

**Nothing is sent, posted or deleted without your click.** Departments write drafts and cards. You press Send. The only exception is a department you put on autopilot yourself.

**Use any AI you like:** Claude, ChatGPT, Gemini, any model through OpenRouter, or another service that works like OpenAI (Groq, Together, Mistral, Ollama...). You pick it inside the app and can switch any time.

When something does not work, **City Hall** (the Guide) tells you exactly what to do, one step at a time. You can also ask it questions in your own words.

## What you need

Your city runs on Railway. Nothing runs on Google: Google only gives your city permission to read and draft your email.

| Thing | Cost |
|---|---|
| A [Railway](https://railway.com) account, to run your city 24/7 | Hobby plan, about $5 a month |
| A key from the AI you choose | Pay as you go. You set a daily limit (starts at $3) |
| A Gmail or Google Workspace account, only so the city may read your email | Free |

## Start in 5 minutes

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/your-city?referralCode=6eIidp&utm_medium=integration&utm_source=template&utm_campaign=generic)

1. Click **Deploy on Railway** above. No GitHub account needed.
2. Sign in to Railway (Google or email works).
3. Type the password you want for your city (at least 8 characters), then press **Deploy**.
4. Wait about 2 minutes. Click your app: its address is at the top (it ends in `.up.railway.app`). Open it and sign in with your password.

Everything else happens inside your city:

5. **Settings → Your AI**: press **Connect with OpenRouter**. Sign in there and add $5 to $10 of credit. (Or pick another AI and paste its key.)
6. **Settings → Your business**: tell the city about your business.
7. **City → + Build a department**: name it and say what it does. Build up to 10.
8. Only if a department reads email (Leads, Mail room): **Settings → Gmail**. Make a Google app password (2 minutes, no Google Cloud) and paste it. The Guide walks you through it.

Railway costs about $5 a month (the Hobby plan; new accounts start with a free trial). Your AI bills you for what your agents use, with a daily limit you set.

Rather do it by hand? [SETUP.md](SETUP.md) has the manual steps.

Stuck? Open the **Guide** and type your question. More detail is in [SETUP.md](SETUP.md).

## Your departments

Tap **+ Build a department** in your city (up to 10), or open one to change it. For each one you choose:

- Its **name** and **what it does**, in your own words. Its building's look comes from its name.
- **How often** it works, and which **AI model** it uses (or your main model).
- **Who its work is for.** Its panel is made of people like this.
- **Judge its work before I see it**: the Panel and the Crowd. Each check costs a little AI, so you can turn it off.
- **Show me what it makes before keeping it**, or let it just report in Updates.

In the 3D city, a number on a building's sign means something needs you, a gold "!" floats over it, and a light rises from a department that worked in the last 15 minutes. Drag to look around, pinch to zoom, and tap a building to go inside: you see its people at their desks. Press **Open** to see its **Needs you**, **Updates**, and its **Panel**: the 8 people who judge its work.

## On your phone

Open your city in Safari, tap **Share**, then **Add to Home Screen**. Open it from there, sign in, and in **Settings → Phone alerts** turn alerts on. Your phone buzzes when a new lead's reply is ready.

## Forgot your password?

In Railway, click your app, then **Variables**. Add `CITY_PASSWORD` with a new password. It takes over in a minute and signs everyone else out.

## For developers

Plain Node.js 22, two packages (`@anthropic-ai/sdk`, `pg`), no build step.

```
src/main.js     start-up
src/city.js     settings, departments, cards, the clock
src/judge.js    the Panel and the Crowd that judge each department's work
src/jev.js      Jev, the fast judge (the real Jev with a key, or your AI)
src/school.js   the School: new tools try out before they join a department
src/research.js the Research desk: finds new tools on GitHub every week
src/guide.js    the setup checklist and every fix, in plain words
src/ai.js       any AI: Claude, or any OpenAI-style service; models, daily budget, errors
src/google.js   Gmail: Google sign-in, or the app password in src/apppass.js (IMAP and SMTP)
src/server.js   sign-in, the API, the Connect Google flow
src/push.js     phone alerts (web push, no package)
src/store.js    Postgres, or data/city.json without a database
public/         the home screen; city3d.html is the 3D city (three.js r134, in public/vendor)
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

## Help make it better

Your City is free and open source. Fixes and ideas are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md).

Don't want to set it up yourself? A done-for-you setup is available: you get your whole city set up with you on a call.

## License

[AGPL-3.0](LICENSE). Use it and change it for free. If you share or sell a changed version, or run one for other people online, you share your code under the same license.
