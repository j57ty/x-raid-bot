const config = require('../config');

/**
 * Checks whether the user sending the update is an administrator or creator in the chat.
 * For private chats, checks ALLOWED_PRIVATE_USERS if configured.
 */
async function isUserAdmin(ctx) {
  const chatType = ctx.chat?.type;
  const userId = ctx.from?.id;

  if (!userId) {
    return false;
  }

  // Handle Private (Direct Message) Chats
  if (chatType === 'private') {
    if (config.ALLOWED_PRIVATE_USERS && config.ALLOWED_PRIVATE_USERS.length > 0) {
      return config.ALLOWED_PRIVATE_USERS.includes(String(userId));
    }
    return true;
  }

  // Handle Group / Supergroup Chats
  if (chatType === 'group' || chatType === 'supergroup') {
    try {
      const member = await ctx.getChatMember(userId);
      return member.status === 'creator' || member.status === 'administrator';
    } catch (error) {
      console.error(`[AdminCheck] Error verifying admin status for user ${userId}:`, error.message);
      return false;
    }
  }

  return true;
}

/**
 * Detects if a message is directed at this bot:
 * 1. Explicit mention of @bot_username in text or caption
 * 2. Telegram entity of type 'mention' matching the bot's username
 * 3. Telegram entity of type 'text_mention' referencing the bot's user ID
 * 4. Telegram entity of type 'bot_command' (e.g. /raid, /raid@bot_username)
 * 5. Reply to a message previously sent by this bot
 */
function isMessageDirectedAtBot(ctx) {
  if (!ctx.message) {
    return false;
  }

  const botInfo = ctx.me || ctx.api?.botInfo || (ctx.bot ? ctx.bot.botInfo : null);
  const botUsername = (botInfo?.username || config.BOT_USERNAME || '').toLowerCase().replace(/^@/, '');
  const botId = botInfo?.id;

  // 1. Reply to a message sent by the bot
  if (ctx.message.reply_to_message?.from) {
    const replyFrom = ctx.message.reply_to_message.from;
    if (replyFrom.is_bot) {
      if (botId && replyFrom.id === botId) {
        return true;
      }
      if (botUsername && replyFrom.username && replyFrom.username.toLowerCase() === botUsername) {
        return true;
      }
    }
  }

  const text = ctx.message.text || ctx.message.caption || '';
  const entities = ctx.message.entities || ctx.message.caption_entities || [];

  // 2. Check entities (mentions & bot commands)
  for (const ent of entities) {
    if (ent.type === 'mention' && botUsername) {
      const mentionText = text.substring(ent.offset, ent.offset + ent.length).toLowerCase().replace(/^@/, '');
      if (mentionText === botUsername) {
        return true;
      }
    }
    if (ent.type === 'text_mention' && botId && ent.user?.id === botId) {
      return true;
    }
    if (ent.type === 'bot_command') {
      const cmdText = text.substring(ent.offset, ent.offset + ent.length).toLowerCase();
      if (cmdText.includes('@')) {
        if (botUsername && cmdText.endsWith(`@${botUsername}`)) {
          return true;
        }
      } else {
        // Unqualified command (e.g. /raid or /help)
        return true;
      }
    }
  }

  // 3. Fallback substring/regex check for @bot_username in text/caption
  if (botUsername && text.toLowerCase().includes(`@${botUsername}`)) {
    return true;
  }

  return false;
}

/**
 * Global middleware enforcing that ONLY administrators can tag, reply to, or use the bot in groups.
 * If a non-admin tags or sends any command to the bot:
 * 1. Their message is immediately deleted (if bot has permission).
 * 2. An ephemeral admin-only notice is sent.
 * 3. The notice is auto-deleted after DELETE_WARNING_AFTER_SECONDS to keep the group spotless.
 */
async function enforceAdminOnlyMiddleware(ctx, next) {
  const chatType = ctx.chat?.type;
  const isGroup = chatType === 'group' || chatType === 'supergroup';

  // If not a group or message is not directed at the bot, proceed normally
  if (!isGroup || !isMessageDirectedAtBot(ctx)) {
    return next();
  }

  const isAdmin = await isUserAdmin(ctx);
  if (isAdmin) {
    return next();
  }

  // SENDER IS NOT AN ADMIN
  console.log(`[AdminCheck] Blocked non-admin user ${ctx.from?.id} (@${ctx.from?.username}) from tagging/using bot in chat ${ctx.chat?.id}`);

  // 1. Immediately delete the non-admin's message that tagged/invoked the bot
  if (ctx.message?.message_id) {
    try {
      await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id);
    } catch (delErr) {
      // Bot might lack delete permissions; proceed to send warning
    }
  }

  // 2. Send ephemeral warning notice
  const username = ctx.from?.username ? `@${ctx.from.username}` : (ctx.from?.first_name || 'Member');
  try {
    const warning = await ctx.reply(
      `⛔ <b>Admin Only:</b> ${username}, only group administrators are permitted to tag or use this bot.`,
      { parse_mode: 'HTML' }
    );

    // 3. Auto-delete warning notice
    const deleteAfter = config.DELETE_WARNING_AFTER_SECONDS || 5;
    if (deleteAfter > 0) {
      setTimeout(async () => {
        try {
          await ctx.api.deleteMessage(ctx.chat.id, warning.message_id);
        } catch (e) {
          // Ignore if already deleted
        }
      }, deleteAfter * 1000);
    }
  } catch (err) {
    // Silently ignore if bot cannot reply
  }

  // Halt execution chain - do not process command or tag
  return;
}

/**
 * Route-level middleware for specific commands (defense-in-depth).
 */
async function requireGroupAdmin(ctx, next) {
  const isAdmin = await isUserAdmin(ctx);
  if (isAdmin) {
    return next();
  }

  if (ctx.message?.message_id) {
    try {
      await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id);
    } catch (e) {}
  }

  const username = ctx.from?.username ? `@${ctx.from.username}` : (ctx.from?.first_name || 'User');
  try {
    const warning = await ctx.reply(
      `⛔ <b>Admin Only:</b> ${username}, only group administrators can use this bot.`,
      { parse_mode: 'HTML' }
    );

    const deleteAfter = config.DELETE_WARNING_AFTER_SECONDS || 5;
    if (deleteAfter > 0) {
      setTimeout(async () => {
        try {
          await ctx.api.deleteMessage(ctx.chat.id, warning.message_id);
        } catch (e) {}
      }, deleteAfter * 1000);
    }
  } catch (e) {}

  return;
}

module.exports = {
  isUserAdmin,
  isMessageDirectedAtBot,
  enforceAdminOnlyMiddleware,
  requireGroupAdmin
};
