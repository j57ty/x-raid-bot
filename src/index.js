const { Bot } = require('grammy');
const config = require('./config');
const { requireGroupAdmin } = require('./middleware/adminCheck');
const { parseTweetUrl, getTweetComments } = require('./services/xService');
const { pickCommentsSample } = require('./services/sampler');
const { formatRaidMessages } = require('./utils/messageFormatter');

if (!config.TELEGRAM_BOT_TOKEN) {
  console.error('❌ FATAL: TELEGRAM_BOT_TOKEN is not defined in .env!');
  console.error('Please add your bot token from @BotFather to .env and restart.');
  process.exit(1);
}

const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

// Global Error Handler
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`[Bot Error] Error while handling update ${ctx?.update?.update_id}:`, err.error);
});

/**
 * Command: /start or /help
 */
bot.command(['start', 'help'], async (ctx) => {
  const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';

  if (isGroup) {
    // Check if sender is admin for group usage
    try {
      const member = await ctx.getChatMember(ctx.from.id);
      const isAdmin = member.status === 'creator' || member.status === 'administrator';
      if (!isAdmin) {
        return; // Silently ignore non-admins for /start in groups
      }
    } catch (e) {
      // Ignore
    }
  }

  const welcomeMessage = 
    `🤖 **X Raid Telegram Bot**\n\n` +
    `This bot extracts comments from any X (Twitter) post, selects **40% of the comments randomly**, ` +
    `and delivers direct links to the group for raiders to work on.\n\n` +
    `🔒 **Security:** Only group administrators can trigger raids.\n\n` +
    `📌 **Commands:**\n` +
    `• \`/raid <X_LINK>\` — Start a raid (selects 40% of comments by default)\n` +
    `• \`/raid <X_LINK> <PERCENT>\` — Raid with custom percentage (e.g., \`/raid https://x.com/... 50\`)\n` +
    `• \`/status\` — View bot operational status\n` +
    `• \`/help\` — Display this instructions menu\n\n` +
    `💡 **Example:**\n` +
    `\`/raid https://x.com/elonmusk/status/1890000000000000000\``;

  await ctx.reply(welcomeMessage, { parse_mode: 'Markdown' });
});

/**
 * Command: /status (Admin only)
 */
bot.command('status', requireGroupAdmin, async (ctx) => {
  const uptimeMinutes = Math.floor(process.uptime() / 60);
  const hasXCookies = Boolean(config.TWITTER_AUTH_TOKEN && config.TWITTER_CT0);
  const hasThirdParty = Boolean(config.TWITTERAPI_IO_KEY);
  
  const modeStatus = config.TEST_MODE 
    ? '🧪 Test/Simulation Mode' 
    : (hasXCookies ? '✅ Live X Cookies' : (hasThirdParty ? '✅ Third-Party API' : '⚠️ Test/Simulation (No X credentials)'));

  const statusMsg = 
    `📊 **Bot Status Report**\n\n` +
    `• **Uptime:** ${uptimeMinutes} minutes\n` +
    `• **X Data Source:** ${modeStatus}\n` +
    `• **Default Sample Rate:** ${config.DEFAULT_SAMPLE_PERCENT}%\n` +
    `• **Auto-delete warnings:** ${config.DELETE_WARNING_AFTER_SECONDS}s\n` +
    `• **Group Pinning:** ${config.PIN_RAID_MESSAGE ? 'Enabled' : 'Disabled'}\n` +
    `• **Bot Permissions:** Admin in this chat ✅`;

  await ctx.reply(statusMsg, { parse_mode: 'Markdown' });
});

/**
 * Core Handler for initiating a raid
 */
async function handleRaidExecution(ctx, inputUrl, inputPercent) {
  const parsed = parseTweetUrl(inputUrl);
  if (!parsed) {
    await ctx.reply(
      `⚠️ **Invalid Link**: Please provide a valid X (Twitter) post URL.\n\n` +
      `**Usage:**\n\`/raid https://x.com/username/status/1234567890\`\n` +
      `**Optional custom percentage:**\n\`/raid https://x.com/username/status/1234567890 50\``,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const samplePercent = inputPercent 
    ? parseInt(inputPercent, 10) 
    : config.DEFAULT_SAMPLE_PERCENT;

  // Send initial pending message
  const statusMsg = await ctx.reply(
    `⏳ **Scanning X Post...**\n` +
    `🎯 Post: \`${parsed.cleanUrl}\`\n` +
    `Fetching comments and preparing a **${samplePercent}%** raid selection...`,
    { parse_mode: 'Markdown' }
  );

  try {
    // 1. Fetch comments from X
    const result = await getTweetComments(parsed.tweetId);
    const comments = result.comments || [];

    if (!comments || comments.length === 0) {
      await ctx.api.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        `⚠️ **No comments found on target post.**\n\n` +
        `Post: ${parsed.cleanUrl}\n` +
        `Either the tweet has no replies yet, or replies are restricted.\n\n` +
        `💡 *If X has flagged your account, switch to TEST_MODE=true in Render or use a TwitterAPI.io key.*`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // 2. Select 40% (or requested percent) randomly
    const sampleResult = pickCommentsSample(comments, samplePercent);

    // 3. Format into chunked raid messages
    const formattedMessages = formatRaidMessages({
      targetUrl: parsed.cleanUrl,
      sampleResult
    });

    // 4. Update the initial message with the first batch
    let firstMsgText = formattedMessages[0];
    if (result.warning) {
      firstMsgText += `\n\n_${result.warning}_`;
    }

    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      firstMsgText,
      {
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true }
      }
    );

    // 5. Pin first raid message if enabled
    if (config.PIN_RAID_MESSAGE && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')) {
      try {
        await ctx.pinChatMessage(statusMsg.message_id);
      } catch (pinErr) {
        console.warn('[Raid] Could not pin message (check if bot has pin permissions):', pinErr.message);
      }
    }

    // 6. Send remaining batches if comments exceeded single message limit
    for (let i = 1; i < formattedMessages.length; i++) {
      await ctx.reply(formattedMessages[i], {
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true }
      });
    }

  } catch (error) {
    console.error('[Raid Error]:', error);
    try {
      await ctx.api.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        `❌ **Raid Failed:** ${error.message || 'Unknown error occurred.'}\n\n` +
        `💡 *Tip: If your X account was suspended, use TEST_MODE=true in Render or configure a TwitterAPI.io key.*`,
        { parse_mode: 'Markdown' }
      );
    } catch (editErr) {
      console.error('[Raid Error] Failed to edit status message:', editErr.message);
    }
  }
}

/**
 * Command: /raid <URL> [PERCENTAGE]
 * Protected by requireGroupAdmin middleware
 */
bot.command('raid', requireGroupAdmin, async (ctx) => {
  const args = ctx.message.text.split(/\s+/).slice(1);
  let inputUrl = args[0];
  let inputPercent = args[1] ? parseInt(args[1], 10) : null;

  // Check if user replied to another message containing an X link
  if (!inputUrl && ctx.message?.reply_to_message?.text) {
    const replyText = ctx.message.reply_to_message.text;
    const match = replyText.match(/https?:\/\/(?:twitter\.com|x\.com)\/[a-zA-Z0-9_]+\/status(?:es)?\/\d+[^\s]*/i);
    if (match) {
      inputUrl = match[0];
      // If an argument was provided (like /raid 50), treat it as percentage
      if (args[0] && !isNaN(parseInt(args[0], 10))) {
        inputPercent = parseInt(args[0], 10);
      }
    }
  }

  if (!inputUrl) {
    await ctx.reply(
      `⚔️ **How to Launch a Raid** ⚔️\n\n` +
      `**Method 1:** Send with URL:\n` +
      `\`/raid https://x.com/username/status/1890000000000000000\`\n\n` +
      `**Method 2:** Reply to any message containing an X link with \`/raid\`!\n\n` +
      `**Optional:** Add percentage at the end (e.g. \`/raid <url> 50\`, defaults to 40%).`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  await handleRaidExecution(ctx, inputUrl, inputPercent);
});

/**
 * Register Telegram command popup menus
 * (Admins get /raid, /status, /help; regular members only see /help)
 */
async function registerBotCommands() {
  try {
    // Default menu (for regular members)
    await bot.api.setMyCommands([
      { command: 'help', description: 'Show bot usage instructions' }
    ], { scope: { type: 'default' } });

    // Admin menu (only visible to administrators in groups)
    await bot.api.setMyCommands([
      { command: 'raid', description: 'Launch raid on X post (selects 40% comments)' },
      { command: 'status', description: 'View bot operational metrics & settings' },
      { command: 'help', description: 'Show raid instructions & guide' }
    ], { scope: { type: 'all_chat_administrators' } });

    console.log(`[Bot] Registered Telegram command menu for admins and members.`);
  } catch (err) {
    console.warn(`[Bot] Notice: Could not register Telegram UI commands:`, err.message);
  }
}

// Launch Bot
bot.start({
  onStart: async (botInfo) => {
    console.log(`===============================================`);
    console.log(`🚀 X Raid Bot is running as @${botInfo.username}`);
    console.log(`🔒 Admin protection: ACTIVE`);
    console.log(`🎯 Default comment sample: ${config.DEFAULT_SAMPLE_PERCENT}%`);
    console.log(`===============================================`);
    await registerBotCommands();
  }
});

// Lightweight HTTP Health Server for Render & UptimeRobot
const http = require('http');
const PORT = process.env.PORT || 3000;

const healthServer = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/health' || req.url === '/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'online',
      service: 'Telegram X Raid Bot',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    }));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

healthServer.listen(PORT, () => {
  console.log(`🌐 [Render/UptimeRobot] Health server listening on port ${PORT}`);
});

// Graceful termination
process.once('SIGINT', () => {
  bot.stop();
  healthServer.close();
});
process.once('SIGTERM', () => {
  bot.stop();
  healthServer.close();
});

