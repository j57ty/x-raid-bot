const config = require('../config');

/**
 * Middleware to restrict bot commands to group administrators only.
 * Normal group members will receive an access denied notice (or be ignored).
 */
async function requireGroupAdmin(ctx, next) {
  const chatType = ctx.chat?.type;
  const userId = ctx.from?.id;
  const username = ctx.from?.username ? `@${ctx.from.username}` : (ctx.from?.first_name || 'User');

  if (!userId) {
    return;
  }

  // Handle Private (Direct Message) Chats
  if (chatType === 'private') {
    if (config.ALLOWED_PRIVATE_USERS.length > 0) {
      const isAllowed = config.ALLOWED_PRIVATE_USERS.includes(String(userId));
      if (!isAllowed) {
        await ctx.reply('⛔ **Access Denied**: You are not authorized to use this bot in private chat.');
        return;
      }
    }
    // Allow private chat if no explicit restriction list is set
    return next();
  }

  // Handle Group / Supergroup Chats
  if (chatType === 'group' || chatType === 'supergroup') {
    try {
      const member = await ctx.getChatMember(userId);
      const isAdmin = member.status === 'creator' || member.status === 'administrator';

      if (!isAdmin) {
        // Send alert message that only admins can use the bot
        const warning = await ctx.reply(
          `⛔ **Admin Only**: ${username}, only group administrators can use this bot.`,
          {
            reply_to_message_id: ctx.message?.message_id
          }
        );

        // Optional: Auto-delete warning and trigger message to keep group clean
        if (config.DELETE_WARNING_AFTER_SECONDS > 0) {
          setTimeout(async () => {
            try {
              await ctx.api.deleteMessage(ctx.chat.id, warning.message_id);
              if (ctx.message?.message_id) {
                await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id);
              }
            } catch (err) {
              // Silently ignore if bot lacks delete permissions
            }
          }, config.DELETE_WARNING_AFTER_SECONDS * 1000);
        }

        return; // Halt middleware chain - do not process command
      }

      // User is verified admin/creator -> proceed to command
      return next();
    } catch (error) {
      console.error(`[AdminCheck] Error verifying admin status for user ${userId}:`, error.message);
      await ctx.reply('⚠️ Error verifying your permissions in this group.');
      return;
    }
  }

  // Other chat types (e.g. channel)
  return next();
}

module.exports = {
  requireGroupAdmin
};
