# Setup guide

This is the full guide. The Guide inside your city shows the same steps, with your own address filled in, and it reads this file when you ask it a question.

## 1. Run your city on Railway

1. Make your own copy of this repository: on GitHub click **Use this template**, then **Create a new repository** (or click **Fork**).
2. Sign in at railway.com with GitHub. Click **New Project**, then **Deploy from GitHub repo**, and pick your copy.
3. Add a database: in the project click **Create** (or **+ New**), then **Database**, then **PostgreSQL**. Without it, your city forgets everything each time Railway redeploys.
4. Click your app (not the database), then the **Variables** tab, and add:
   - `CITY_PASSWORD`: a password only you know. It opens your city.
   - `ANTHROPIC_API_KEY`: your AI key (step 2 below).
   - `DATABASE_URL`: type exactly `${{Postgres.DATABASE_URL}}`.
5. Click **Settings**. Under **Networking**, click **Generate Domain**. That address is your city.
6. Railway restarts the app after each change. Wait a minute, then open your address.

If the page says "Almost there", the `CITY_PASSWORD` variable is missing. The page lists which other variables are set.

## 2. Get your AI key

1. Go to console.anthropic.com and sign in or make an account.
2. Click **Billing** and add credit. $5 to $10 is plenty to start.
3. Click **API Keys**, then **Create Key**. Copy it.
4. In Railway, put it in the `ANTHROPIC_API_KEY` variable. No spaces before or after.

Your city never spends more in a day than the **Daily AI budget** in Settings (it starts at $3). When the budget is used up, agents pause until tomorrow.

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
9. In Railway, add two variables: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
10. Wait a minute, open your city, go to **Settings**, and press **Connect Google**.
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

- **"Almost there" page:** add the `CITY_PASSWORD` variable in Railway.
- **"That password is not right":** it is the `CITY_PASSWORD` value in Railway, exactly.
- **Agents say "Waiting for your AI key":** add `ANTHROPIC_API_KEY` in Railway.
- **"Your AI key is not working":** make a new key at console.anthropic.com and replace the variable.
- **"Out of credit":** add credit at console.anthropic.com, under Billing.
- **"Today's AI budget is used up":** raise the Daily AI budget in Settings, or wait until tomorrow.
- **Google says "redirect_uri_mismatch" (Error 400):** the redirect address in your Google client is not exact. Copy the line from the Guide into **Authorized redirect URIs**, save, and wait 5 minutes.
- **Google says "access blocked" or the app is in testing:** publish the app (step 3.5), or add yourself under Audience, Test users.
- **"Google disconnected your Gmail":** publish the app (step 3.5), then press Connect Google again.
- **"Turn on the Gmail API":** open the link on the card, click Enable, wait two minutes.
- **Settings vanish after a redeploy:** you have no database. Do step 1.3 and set `DATABASE_URL`.
- **No address to open:** in Railway, Settings, Networking, Generate Domain.
