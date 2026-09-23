# ⚔️ Telegram X (Twitter) Raid Bot

A Telegram bot built for raid groups. Given any X (Twitter) post link, it fetches the comments, selects **40% of the comments at random**, and posts direct links to the Telegram group for raiders to work on.

To protect group operations, **only group administrators** can trigger or use the bot.

---

## 🚀 Features

- **🎯 40% Comment Sampling**: Automatically grabs 40% of the comments uniformly at random (or a custom percentage if specified by an admin).
- **🔒 Admin-Only Protection**: Restricts regular group members from triggering raids. Only group `creator` or `administrator` members can execute bot commands.
- **🛡️ Ephemeral Warning**: If a non-admin attempts to invoke the bot, an alert is sent and automatically cleaned up after a few seconds to prevent chat clutter.
- **📦 Smart Chunking & Formatting**: Automatically splits long link lists into formatted batches (max 15 links per message) with link previews suppressed, ensuring the chat stays clean and readable.
- **📌 Auto-Pinning (Optional)**: Automatically pins the active raid targets in the group.
- **🧪 Built-in Test / Simulation Mode**: Test bot permissions and group mechanics immediately even before configuring live X credentials.

---

## 🛠️ Step-by-Step Setup Guide

### 1. Create your Telegram Bot
1. Open Telegram and search for `@BotFather`.
2. Send `/newbot` and follow the prompts to choose a name and username.
3. Copy your HTTP API **Bot Token** (e.g. `123456789:ABCdefGhIJKlmNoPQR...`).

---

### 2. Add Bot to Group & Grant Admin Privileges
1. Add your bot to your target Telegram group.
2. Go to **Group Settings** -> **Administrators** -> **Add Administrator**.
3. Select your bot and ensure permissions (such as **Delete Messages** and **Pin Messages**) are enabled.
4. *Important:* Because the bot checks `getChatMember`, only group admins and the group owner can use `/raid`. Regular members are blocked.

---

### 3. Get X (Twitter) Session Cookies (Free & Recommended)
Because X requires authentication to view comment threads, use a burner/throwaway X account:
1. Open your browser (Chrome, Edge, Brave, or Firefox) and log into [x.com](https://x.com) with your burner account.
2. Press `F12` (or right-click -> **Inspect**) to open Developer Tools.
3. Go to the **Application** tab (on Firefox, it's called **Storage**).
4. In the left sidebar, expand **Cookies** and click on `https://x.com`.
5. Locate and copy the values for:
   - `auth_token`
   - `ct0`

---

### 4. Configure the Environment
Open the `.env` file in `x-raid-bot/` and fill in your values:

```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
TWITTER_AUTH_TOKEN=your_auth_token_here
TWITTER_CT0=your_ct0_here

DEFAULT_SAMPLE_PERCENT=40
MAX_LINKS_PER_MESSAGE=15
DELETE_WARNING_AFTER_SECONDS=8
PIN_RAID_MESSAGE=true
TEST_MODE=false
```

*(Note: If `TEST_MODE=true` or if cookies are omitted, the bot will generate simulated comments so you can test permissions and group flows right away!)*

---

### 5. Run the Bot

In PowerShell or terminal:

```powershell
cd c:\Users\USER\Desktop\KARE\x-raid-bot
npm start
```

---

## ☁️ 24/7 Cloud Deployment (Render + UptimeRobot)

You can host this bot completely free without running it on your PC.

### Step A: Push to GitHub
1. Create a new repository on [GitHub](https://github.com/new) (e.g. `x-raid-bot`, set to **Private**).
2. Link your local project and push:
   ```powershell
   git remote add origin https://github.com/YOUR_USERNAME/x-raid-bot.git
   git branch -M main
   git push -u origin main
   ```

### Step B: Deploy on Render
1. Go to [render.com](https://render.com) and click **New +** -> **Web Service**.
2. Connect your `x-raid-bot` GitHub repository.
3. Configure settings:
   - **Name**: `x-raid-bot`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: **Free**
4. Under **Environment Variables**, add:
   - `TELEGRAM_BOT_TOKEN`: `8889712063:AAHTho8wQ0uvAiy_htM7qyNXeK7WayTQ0q4`
   - `TWITTER_AUTH_TOKEN`: *(your burner X account auth_token)*
   - `TWITTER_CT0`: *(your burner X account ct0)*
   - `DEFAULT_SAMPLE_PERCENT`: `40`
   - `DELETE_WARNING_AFTER_SECONDS`: `8`
   - `PIN_RAID_MESSAGE`: `true`
   - `TEST_MODE`: `false` *(or `true` if testing first)*
5. Click **Deploy Web Service**.
6. Once deployed, Render will show your public web service URL:
   `https://x-raid-bot-xxxx.onrender.com`

### Step C: Keep Awake 24/7 with UptimeRobot
Render's free tier sleeps after 15 minutes of inactivity. Our bot includes an internal HTTP health server listening on `/health` and `/` so UptimeRobot can keep it awake 24/7:
1. Go to [uptimerobot.com](https://uptimerobot.com) (free).
2. Click **+ Add New Monitor**:
   - **Monitor Type**: `HTTP(s)`
   - **Friendly Name**: `X Raid Bot`
   - **URL (or IP)**: `https://your-service-name.onrender.com/health`
   - **Monitoring Interval**: `5 minutes`
3. Click **Create Monitor**.
4. That's it! Your bot is now permanently online 24/7!

In your Telegram group (as an admin):

### Standard Raid (40% of comments)
```
/raid https://x.com/username/status/1890000000000000000
```

### Custom Percentage Raid
```
/raid https://x.com/username/status/1890000000000000000 50
```

### Bot Status
```
/status
```

### Help Menu
```
/help
```

---

## 🧪 Testing

To run the automated test suite verifying URL parsing, random 40% math, and message chunking:

```powershell
npm test
```
