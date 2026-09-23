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

## 📖 Usage Instructions

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
