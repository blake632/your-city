# Setup guide

This is the full guide. The Guide inside your city shows the same steps, with your own address filled in, and it reads this file when you ask it a question.

## 1. Run your city on Railway

1. Make your own copy of this repository: on GitHub click **Fork**, then **Create fork**.
2. Sign in at railway.com with GitHub. Click **New Project**, then **Deploy from GitHub repo**, and pick your copy.
3. Add a database: in the project click **Create** (or **+ New**), then **Database**, then **PostgreSQL**. Without it, your city forgets everything each time Railway redeploys.
4. Click your app (not the database), then the **Variables** tab, then **New Variable**. Name: `DATABASE_URL`. Value: type exactly `${{Postgres.DATABASE_URL}}`. This is the only variable you need.
5. Click **Settings**. Under **Networking**, click **Generate Domain**. That address is your city.
6. Railway restarts the app after each change. Wait a minute, then open your address.
7. **Choose your password** on the first page. The first person to choose one becomes the owner, so do it right away. You can change it later in **Settings → Your password**.

## 2. Choose your AI and add its key

Your agents can run on any of these. Pick one in **Settings → Your AI**:

| AI | Where to get a key | Where to add credit |
|---|---|---|
| Claude (Anthropic) | console.anthropic.com, then API Keys, then Create Key | console.anthropic.com, then Billing |
| ChatGPT models (OpenAI) | platform.openai.com, then API keys, then Create new secret key | platform.openai.com, then Settings, then Billing |
| Gemini (Google AI Studio) | aistudio.google.com, then Get API key, then Create API key | aistudio.google.com, then Billing |
| Any model through OpenRouter | openrouter.ai, then Keys, then Create Key | openrouter.ai, then Credits |
| Another service that works like OpenAI (Groq, Together, Mistral, Ollama...) | That service's API keys page | That service's billing page |

1. Make an account with the AI you picked and add a little credit. $5 to $10 is plenty to start.
2. Make an API key and copy it.
3. In your city, open **Settings → Your AI**. Pick your AI from the list.
4. For "Another service": paste its address too (its help pages list it, for example `https://api.groq.com/openai/v1`).
5. Paste the key and press **Save and test**. The city checks the key and lists the models it can use. It costs nothing.
6. Pick a **Main model** from the list and press **Save and test** again. Your agents use it unless you pick another model for one of them under **Agents**.

Your key is kept in your city's database. It never shows on the page again, and a key that does not work never replaces one that does. Each AI keeps its own key, so you can switch back and forth.

Your city never spends more in a day than the **Daily AI budget** in Settings (it starts at $3). When the budget is used up, agents pause until tomorrow. For Claude the city knows the exact prices. For other services it estimates, so check your AI account's usage page now and then.

## 3. Let your city read Gmail (one time)

Your city runs on Railway, not on Google. This step only gives it permission to read and draft your email. Google asks every app for that permission through a small "app" you create for your own account. It takes about 5 minutes, once.

1. Go to console.cloud.google.com and sign in with the Google account whose email the city should read.
2. Click the project picker at the top, then **New Project**. Name it My City and click **Create**. Make sure the new project is selected.
3. Search for **Gmail API**, open it, and click **Enable**.
4. Open **Google Auth Platform** (older screens call it **OAuth consent screen**) and click **Get started**:
   - App name: My City. Support email: yours.
   - Audience: **External** for a regular Gmail account. **Internal** for a Google Workspace work account.
   - Contact email: yours. Agree and click **Create**.
5. For External only: open **Audience** and click **Publish app**, then confirm. This stops Google from disconnecting your city every 7 days.
6. Open **Clients**, click **Create client**, and choose **Web application**.
7. Under **Authorized redirect URIs**, click **Add URI** and paste your city address followed by `/connect/google/callback`. The Guide shows the exact line to paste. Example: `https://my-city.up.railway.app/connect/google/callback`
8. Click **Create**. Copy the **Client ID** and the **Client secret**.
9. In your city, open **Settings → Gmail**. Paste the **Client ID** and the **Client secret**, and press **Save**.
10. Press **Connect Google**.
11. Google may say it has not verified the app. That is expected: it is your own app. Click **Advanced**, then **Go to My City**, then allow Gmail access.

The city asks Google for one permission: read, label and draft your email. It sends an email only when you press **Send the email** on a card.

## 4. Tell the city about your business

In **Settings → Your business**, fill in:

- **Business name** and **your name**.
- **About your business**: what you sell, where, who you serve, and facts the agents may use. Agents never invent prices, dates or promises. When they don't know something, they ask the customer or say you will confirm.
- **How you write**: your voice in a sentence.
- **Your email signature.**
- **How to answer a new lead**: the Leads agent follows this for every first reply.

## 5. Your agents

- **Leads**: checks your inbox every 10 minutes. A new customer gets a first reply drafted right away, and the card shows who they are, with Call and Text buttons.
- **Mail room**: sorts new email into labels (City/Lead, City/Needs reply, City/FYI, City/Receipts, City/Newsletters, City/Junk?) and drafts replies for the ones that need you. It never deletes or archives anything.
- **Social posts**: writes 3 posts a week from your business notes. Approve one to keep it, then copy it from Updates when you post.
- **Guide**: always on. It checks your setup every minute and explains any problem.
- **Your own agents**: in Settings, under **Add your own agent**, say what it should do and how often.

On every card you can **Approve**, **Decline**, **Needs feedback** (tell it what to change and it rewrites the draft, in Gmail too), **Open in Gmail**, or **Skip**.

## 6. Phone alerts

On iPhone, alerts work only from the Home Screen:

1. Open your city in Safari.
2. Tap **Share**, then **Add to Home Screen**.
3. Open it from the Home Screen and sign in.
4. In **Settings → Phone alerts**, tap **Turn on alerts**. A test alert arrives right away.

On Android and computers, use Chrome or Edge and tap **Turn on alerts**.

## Fixes for common problems

- **The city asks for a password you never chose, or you forgot yours:** in Railway, click your app, then Variables. Add `CITY_PASSWORD` with a new password. It takes over in a minute and signs everyone else out.
- **Agents say "Waiting for your AI key":** open Settings, then Your AI. Pick your AI, paste its key, press Save and test.
- **"Your AI key is not working":** make a new key on your AI's website (the table in step 2) and paste it in Settings, then Your AI.
- **"Out of credit":** add credit on your AI's website (the table in step 2).
- **"That AI model is not available to you":** press Save and test in Settings, then Your AI, and pick a model from the list.
- **"Today's AI budget is used up":** raise the Daily AI budget in Settings, or wait until tomorrow.
- **Google says "redirect_uri_mismatch" (Error 400):** the redirect address in your Google client is not exact. Copy the line from the Guide into **Authorized redirect URIs**, save, and wait 5 minutes.
- **Google says "access blocked" or the app is in testing:** publish the app (step 3.5), or add yourself under Audience, Test users.
- **"Google disconnected your Gmail":** publish the app (step 3.5), then press Connect Google again.
- **"Turn on the Gmail API":** open the link on the card, click Enable, wait two minutes.
- **Settings vanish after a redeploy:** you have no database. Do step 1.3 and 1.4.
- **No address to open:** in Railway, Settings, Networking, Generate Domain.
