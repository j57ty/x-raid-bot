const { Bot } = require('grammy');
const config = require('./config');
const { requireGroupAdmin } = require('./middleware/adminCheck');
const { parseTweetUrl, getTweetComments } = require('./services/xService');
const { pickCommentsSample } = require('./services/sampler');
const { formatRaidMessages, escapeHtml } = require('./utils/messageFormatter');
const memberStore = require('./services/memberStore');

if (!config.TELEGRAM_BOT_TOKEN) {
  console.error('❌ FATAL: TELEGRAM_BOT_TOKEN is not defined in .env!');
  console.error('Please add your bot token from @BotFather to .env and restart.');
  process.exit(1);
}

const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

// Automatically record active group members when they chat
bot.use(async (ctx, next) => {
  if (ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') && ctx.from && !ctx.from.is_bot) {
    memberStore.recordMember(ctx.chat.id, ctx.from);
  }
  return next();
});

// Global Error Handler
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`[Bot Error] Error while handling update ${ctx?.update?.update_id}:`, err.error);
});

/**
 * Robust message editing with automatic fallback to plain text if HTML parsing fails
 */
async function safeEditMessage(ctx, messageId, text, options = {}) {
  try {
    return await ctx.api.editMessageText(ctx.chat.id, messageId, text, {
      parse_mode: 'HTML',
      ...options
    });
  } catch (err) {
    console.warn('[SafeEdit] HTML edit failed, retrying plain text:', err.message);
    const plainText = text.replace(/<[^>]*>/g, '');
    return await ctx.api.editMessageText(ctx.chat.id, messageId, plainText, {
      ...options,
      parse_mode: undefined
    });
  }
}

/**
 * Robust reply with automatic fallback to plain text if HTML parsing fails
 */
async function safeReply(ctx, text, options = {}) {
  try {
    return await ctx.reply(text, {
      parse_mode: 'HTML',
      ...options
    });
  } catch (err) {
    console.warn('[SafeReply] HTML reply failed, retrying plain text:', err.message);
    const plainText = text.replace(/<[^>]*>/g, '');
    return await ctx.reply(plainText, {
      ...options,
      parse_mode: undefined
    });
  }
}

/**
 * Command: /start or /help
 */
bot.command(['start', 'help'], async (ctx) => {
  const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';

  if (isGroup) {
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
    `🤖 <b>X Raid Telegram Bot</b>\n\n` +
    `This bot extracts comments from any X (Twitter) post, selects <b>40% of the comments randomly</b>, ` +
    `and delivers direct links to the group for raiders to work on.\n\n` +
    `🔒 <b>Security:</b> Only group administrators can trigger raids.\n\n` +
    `📌 <b>Commands:</b>\n` +
    `• <code>/raid &lt;X_LINK&gt;</code> — Start a raid (selects 40% of comments by default)\n` +
    `• <code>/raid &lt;X_LINK&gt; &lt;PERCENT&gt;</code> — Raid with custom percentage\n` +
    `• <code>/tagall [message]</code> — Tag and notify all group members (Admin only)\n` +
    `• <code>/raiders</code> — View current active raiders roster (Admin only)\n` +
    `• <code>/join</code> — Register yourself to the raid roster\n` +
    `• <code>/status</code> — View bot operational status\n` +
    `• <code>/help</code> — Display this instructions menu\n\n` +
    `💡 <b>Example:</b>\n` +
    `<code>/raid https://x.com/elonmusk/status/1890000000000000000</code>`;

  await safeReply(ctx, welcomeMessage);
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
    : (hasThirdParty ? '✅ Live TwitterAPI.io' : (hasXCookies ? '✅ Live X Cookies' : '⚠️ Test/Simulation (No X credentials)'));

  const statusMsg = 
    `📊 <b>Bot Status Report</b>\n\n` +
    `• <b>Uptime:</b> ${uptimeMinutes} minutes\n` +
    `• <b>X Data Source:</b> ${escapeHtml(modeStatus)}\n` +
    `• <b>Default Sample Rate:</b> ${config.DEFAULT_SAMPLE_PERCENT}%\n` +
    `• <b>Auto-delete warnings:</b> ${config.DELETE_WARNING_AFTER_SECONDS}s\n` +
    `• <b>Group Pinning:</b> ${config.PIN_RAID_MESSAGE ? 'Enabled' : 'Disabled'}\n` +
    `• <b>Bot Permissions:</b> Admin in this chat ✅`;

  await safeReply(ctx, statusMsg);
});

/**
 * Resolves the active raiders for a chat.
 * Fetches group administrators from Telegram API and merges with active members from memberStore.
 */
async function getRaidersForChat(ctx) {
  const chatId = ctx.chat.id;
  const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';

  if (!isGroup) {
    return [ctx.from];
  }

  const memberMap = new Map();

  // 1. Fetch current chat administrators (always available without waiting for chat messages)
  try {
    const chatAdmins = await ctx.api.getChatAdministrators(chatId);
    for (const admin of chatAdmins) {
      if (admin.user && !admin.user.is_bot) {
        memberMap.set(String(admin.user.id), admin.user);
        memberStore.recordMember(chatId, admin.user);
      }
    }
  } catch (err) {
    console.warn('[Raiders] Could not get chat administrators:', err.message);
  }

  // 2. Add any other members who chatted or registered in this group
  const storedMembers = memberStore.getMembers(chatId);
  for (const m of storedMembers) {
    if (!memberMap.has(String(m.id))) {
      memberMap.set(String(m.id), m);
    }
  }

  // 3. Fallback to command sender if no other members found
  if (memberMap.size === 0 && ctx.from) {
    memberMap.set(String(ctx.from.id), ctx.from);
  }

  // Deduplicate strictly by ID and username so no member appears twice
  const unique = [];
  const seenIds = new Set();
  const seenUsernames = new Set();

  for (const m of memberMap.values()) {
    const id = m.id ? String(m.id) : null;
    const username = m.username ? m.username.replace(/^@/, '').toLowerCase().trim() : null;

    if (id && seenIds.has(id)) continue;
    if (username && seenUsernames.has(username)) continue;

    if (id) seenIds.add(id);
    if (username) seenUsernames.add(username);
    unique.push(m);
  }

  return unique;
}

/**
 * Command: /join or /register
 * Group members can voluntarily register themselves into the raid roster
 */
bot.command(['join', 'register'], async (ctx) => {
  const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
  if (!isGroup) {
    await safeReply(ctx, 'ℹ️ Use <code>/join</code> inside your Telegram raid group to join the roster.');
    return;
  }
  memberStore.recordMember(ctx.chat.id, ctx.from);
  const tag = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name || 'Raider');
  await safeReply(ctx, `✅ <b>${escapeHtml(tag)}</b> joined the raid squad! You will be assigned targets on the next raid.`);
});

/**
 * Command: /raiders (Admin only)
 * View current active raiders in the group roster
 */
bot.command('raiders', requireGroupAdmin, async (ctx) => {
  const raiders = await getRaidersForChat(ctx);
  if (raiders.length === 0) {
    await safeReply(ctx, '⚠️ No raiders found. Group admins and members who chat are automatically added, or members can type <code>/join</code>.');
    return;
  }
  const list = raiders.map((r, i) => `${i + 1}. ${r.username ? `@${r.username}` : (r.firstName || r.first_name || 'Member')}`).join('\n');
  await safeReply(
    ctx,
    `👥 <b>Active Raiders Roster (${raiders.length}):</b>\n\n` +
    `${escapeHtml(list)}\n\n` +
    `💡 Each raider gets tagged with <b>${config.TARGETS_PER_RAIDER}</b> comments to reply to during a raid.`
  );
});

/**
 * Command: /tagall or /everyone or /mentionall (Admin only)
 * Mentions and tags all known members in the group roster once in a single message
 */
bot.command(['tagall', 'everyone', 'mentionall'], requireGroupAdmin, async (ctx) => {
  const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
  if (!isGroup) {
    await safeReply(ctx, '⚠️ This command can only be used inside a group.');
    return;
  }

  const customText = ctx.message.text.split(/\s+/).slice(1).join(' ').trim();
  const raiders = await getRaidersForChat(ctx);

  if (raiders.length === 0) {
    await safeReply(ctx, '⚠️ No members found to tag yet. Members will be tagged as they join or chat in the group.');
    return;
  }

  const tags = raiders.map(r => {
    if (r.username) {
      return `@${r.username.replace(/^@/, '')}`;
    }
    const name = r.firstName || r.first_name || 'Raider';
    return `<a href="tg://user?id=${r.id}">${escapeHtml(name)}</a>`;
  });

  const announcement = customText 
    ? `📢 <b>Announcement:</b> ${escapeHtml(customText)}\n\n`
    : `📢 <b>Attention Everyone!</b>\n\n`;

  const fullText = announcement + tags.join(' ');

  // Tag everyone once in a single message (splits only if exceeding Telegram 4096 character limit)
  if (fullText.length <= 4000) {
    await safeReply(ctx, fullText, {
      link_preview_options: { is_disabled: true }
    });
  } else {
    const CHUNK_SIZE = 50;
    for (let i = 0; i < tags.length; i += CHUNK_SIZE) {
      const chunk = tags.slice(i, i + CHUNK_SIZE);
      const msg = (i === 0 ? announcement : '') + chunk.join(' ');
      await safeReply(ctx, msg, {
        link_preview_options: { is_disabled: true }
      });
      if (i + CHUNK_SIZE < tags.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }
});

/**
 * Event: New user joins the group
 * Immediately tags the user and delivers a warm community welcome message with group link
 */
bot.on('message:new_chat_members', async (ctx) => {
  const newMembers = ctx.message.new_chat_members || [];

  for (const member of newMembers) {
    if (member.is_bot) continue;

    // Immediately record new member
    memberStore.recordMember(ctx.chat.id, member);

    // Format tag (@username or profile link)
    const tag = member.username
      ? `@${member.username.replace(/^@/, '')}`
      : `<a href="tg://user?id=${member.id}">${escapeHtml(member.first_name || 'Member')}</a>`;

    // Resolve group invite link
    let groupLink = config.GROUP_INVITE_LINK;
    if (!groupLink) {
      try {
        if (ctx.chat.username) {
          groupLink = `https://t.me/${ctx.chat.username}`;
        } else {
          const chat = await ctx.getChat();
          groupLink = chat.invite_link;
          if (!groupLink) {
            const created = await ctx.api.createChatInviteLink(ctx.chat.id);
            groupLink = created.invite_link;
          }
        }
      } catch (err) {
        console.warn('[Welcome] Could not resolve group invite link:', err.message);
      }
    }

    const groupLinkFormatted = groupLink 
      ? `\n\n🔗 <b>Group Link:</b> ${escapeHtml(groupLink)}\n\n` 
      : '\n\n';

    const welcomeMsg = 
      `Hi ${tag} Welcome, we are all here to work together as a real community and support each other${groupLinkFormatted}` +
      `share to those in the Eva Vanguard group who haven't joined in their dms`;

    await safeReply(ctx, welcomeMsg, {
      link_preview_options: { is_disabled: true }
    });
  }
});

/**
 * Core Handler for initiating a raid
 */
async function handleRaidExecution(ctx, inputUrl, inputPercent) {
  const parsed = parseTweetUrl(inputUrl);
  if (!parsed) {
    await safeReply(
      ctx,
      `⚠️ <b>Invalid Link</b>: Please provide a valid X (Twitter) post URL.\n\n` +
      `<b>Usage:</b>\n<code>/raid https://x.com/username/status/1234567890</code>\n` +
      `<b>Optional custom percentage:</b>\n<code>/raid https://x.com/username/status/1234567890 50</code>`
    );
    return;
  }

  const samplePercent = inputPercent 
    ? parseInt(inputPercent, 10) 
    : config.DEFAULT_SAMPLE_PERCENT;

  // Send initial pending message
  const statusMsg = await safeReply(
    ctx,
    `⏳ <b>Scanning X Post...</b>\n` +
    `🎯 Post: <code>${escapeHtml(parsed.cleanUrl)}</code>\n` +
    `Fetching comments and preparing a <b>${samplePercent}%</b> raid selection...`
  );

  try {
    const postAuthor = (parsed.username || '').toLowerCase().replace(/^@/, '');

    // 1. Fetch comments from X with live progress updates (filtering nested replies & post author)
    const onProgress = async (count, page) => {
      try {
        await safeEditMessage(
          ctx,
          statusMsg.message_id,
          `⏳ <b>Scanning X Post...</b>\n` +
          `🎯 Post: <code>${escapeHtml(parsed.cleanUrl)}</code>\n` +
          `📥 Discovered <b>${count}</b> direct comments so far (scanning page ${page})...`
        );
      } catch (e) {
        // Ignore progress reporting errors
      }
    };

    const result = await getTweetComments(parsed.tweetId, postAuthor, onProgress);
    const rawComments = result.comments || [];

    // Filter out:
    // 1. Any comments made by the post author under their own post
    // 2. Any nested sub-replies (comments replying to other commenters instead of main tweet)
    const comments = rawComments.filter(c => {
      const commentAuthor = (c.author || '').toLowerCase().replace(/^@/, '');
      if (commentAuthor === postAuthor) return false;

      if (config.EXCLUDE_NESTED_REPLIES) {
        const inReplyTo = c.inReplyToStatusId || c.in_reply_to_status_id || c.inReplyToTweetId;
        if (inReplyTo && String(inReplyTo) !== String(parsed.tweetId)) {
          return false;
        }
      }

      return true;
    });

    if (!comments || comments.length === 0) {
      await safeEditMessage(
        ctx,
        statusMsg.message_id,
        `⚠️ <b>No eligible direct comments found on target post.</b>\n\n` +
        `Post: ${escapeHtml(parsed.cleanUrl)}\n` +
        `Either the tweet has no replies yet, or all comments were nested replies or made by the post author (@${escapeHtml(parsed.username)}).`,
        { link_preview_options: { is_disabled: true } }
      );
      return;
    }

    // 2. Select 40% (or requested percent) prioritizing traction comments
    const sampleResult = pickCommentsSample(comments, samplePercent, { excludeAuthor: postAuthor });

    // 3. Resolve active group raiders (tags everyone once in the raid mission header)
    const raiders = await getRaidersForChat(ctx);

    // 4. Format into chunked raid messages (tags raiders once in header, clean direct links on comments)
    const formattedMessages = formatRaidMessages({
      targetUrl: parsed.cleanUrl,
      sampleResult,
      raiders
    });

    // 5. Send first raid message (delete pending scanning message so Telegram triggers instant notifications to tagged raiders)
    let firstMsgText = formattedMessages[0];
    if (result.warning) {
      firstMsgText += `\n\n<i>${escapeHtml(result.warning)}</i>`;
    }

    let raidMsgId = statusMsg.message_id;

    try {
      await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id);
      const sent = await safeReply(ctx, firstMsgText, {
        link_preview_options: { is_disabled: true }
      });
      raidMsgId = sent.message_id;
    } catch (delErr) {
      // If delete fails, fall back to editing the message in-place
      await safeEditMessage(ctx, statusMsg.message_id, firstMsgText, {
        link_preview_options: { is_disabled: true }
      });
    }

    // 6. Pin first raid message if enabled
    if (config.PIN_RAID_MESSAGE && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')) {
      try {
        await ctx.pinChatMessage(raidMsgId);
      } catch (pinErr) {
        console.warn('[Raid] Could not pin message (check if bot has pin permissions):', pinErr.message);
      }
    }

    // 7. Send remaining batches if comments exceeded single message limit
    for (let i = 1; i < formattedMessages.length; i++) {
      await safeReply(ctx, formattedMessages[i], {
        link_preview_options: { is_disabled: true }
      });
    }

  } catch (error) {
    console.error('[Raid Error]:', error);
    try {
      await safeEditMessage(
        ctx,
        statusMsg.message_id,
        `❌ <b>Raid Failed:</b> ${escapeHtml(error.message || 'Unknown error occurred.')}`
      );
    } catch (e) {
      await safeReply(
        ctx,
        `❌ <b>Raid Failed:</b> ${escapeHtml(error.message || 'Unknown error occurred.')}`
      );
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
      { command: 'tagall', description: 'Tag and notify all group members' },
      { command: 'raiders', description: 'View active raiders in group' },
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

