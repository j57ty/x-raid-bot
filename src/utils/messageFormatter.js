const config = require('../config');

/**
 * Escapes special HTML characters so Telegram's HTML parser never breaks
 * on usernames with underscores, ampersands, or brackets.
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Splits an array into chunks of a given size.
 * @param {Array} arr 
 * @param {number} size 
 * @returns {Array<Array>}
 */
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Formats raid comment links into one or more Telegram messages using safe HTML.
 * Supports raiding top-level posts OR comments.
 * - If target comment has 0 sub-replies, sets up a direct target raid for that comment with its link & vibe.
 * - If target comment/post has sub-replies, sets up the main target with its vibe AND lists 40% of sub-replies with individual vibes.
 * - Does NOT tag group members on /raid (tagging is reserved exclusively for /tagall).
 * 
 * @param {Object} params
 * @param {string} params.targetUrl - Target post or comment URL
 * @param {Object} params.sampleResult - Output from pickCommentsSample (with attached replyVibe)
 * @param {string} [params.targetAuthor] - Author handle of target comment/post
 * @param {string} [params.targetAuthorName] - Display name of target author
 * @param {string} [params.targetVibe] - Reply vibe for the main target comment/post
 * @param {boolean} [params.isComment] - True if target is a comment/reply
 * @returns {Array<string>} Array of message strings formatted in HTML for Telegram
 */
function formatRaidMessages({ 
  targetUrl, 
  sampleResult, 
  targetAuthor = null, 
  targetAuthorName = null, 
  targetVibe = null, 
  isComment = false 
}) {
  const { totalComments, samplePercentage, selectedCount, selectedComments = [] } = sampleResult || {};

  const cleanAuthor = targetAuthor ? targetAuthor.replace(/^@/, '') : null;
  const authorName = targetAuthorName || cleanAuthor || 'Author';
  const targetLabel = isComment ? 'Target Comment' : 'Target Post';

  // Case A: Single Comment / Target Raid (0 sub-replies found)
  if (!selectedComments || selectedComments.length === 0) {
    let msg = `⚔️ <b>X RAID TARGET ACTIVATED</b> ⚔️\n\n`;
    msg += `🎯 <b>${targetLabel}:</b> <a href="${escapeHtml(targetUrl)}">${escapeHtml(targetUrl)}</a>\n`;
    if (cleanAuthor) {
      msg += `👤 <b>Author:</b> <b>${escapeHtml(authorName)}</b> (@${escapeHtml(cleanAuthor)})\n`;
    }
    if (targetVibe) {
      msg += `💬 <b>Reply Vibe:</b> <i>${escapeHtml(targetVibe)}</i>\n\n`;
    } else {
      msg += `\n`;
    }
    msg += `🔥 <b>Instructions:</b> Click the link above, like, and drop your reply matching the vibe!`;

    return [msg.trim()];
  }

  // Case B: Target with Sub-Replies
  const maxLinksPerMessage = Math.min(10, config.MAX_LINKS_PER_MESSAGE || 10);
  const batches = chunkArray(selectedComments, maxLinksPerMessage);
  const totalBatches = batches.length;

  const messages = [];

  batches.forEach((batch, index) => {
    const batchNumber = index + 1;
    let msg = '';

    if (index === 0) {
      const subLabel = isComment ? 'Sub-Replies' : 'Direct Comments';

      msg += `⚔️ <b>X RAID MISSION ACTIVATED</b> ⚔️\n\n`;
      msg += `🎯 <b>${targetLabel}:</b> <a href="${escapeHtml(targetUrl)}">${escapeHtml(targetUrl)}</a>\n`;
      if (cleanAuthor) {
        msg += `👤 <b>Author:</b> <b>${escapeHtml(authorName)}</b> (@${escapeHtml(cleanAuthor)})\n`;
      }
      if (targetVibe) {
        msg += `💬 <b>Target Reply Vibe:</b> <i>${escapeHtml(targetVibe)}</i>\n`;
      }
      msg += `📊 <b>${subLabel}:</b> ${totalComments} | <b>Raid Targets (${samplePercentage}%):</b> ${selectedCount}\n\n`;
      msg += `👇 <b>${isComment ? 'Sub-Thread Targets (with Reply Vibes):' : 'Target Comments to Raid (with Reply Vibes):'}</b>\n\n`;
    } else {
      // Continuation header for multi-part messages
      msg += `⚔️ <b>RAID TARGETS (Part ${batchNumber}/${totalBatches})</b>\n\n`;
    }

    batch.forEach((comment, cIdx) => {
      const globalNum = (index * maxLinksPerMessage) + cIdx + 1;
      const username = comment.author ? comment.author.replace(/^@/, '') : 'user';
      const displayName = comment.authorName || comment.author || 'User';
      const commentUrl = comment.url || `https://x.com/${username}/status/${comment.id}`;

      msg += `${globalNum}. <b>${escapeHtml(displayName)}</b> (@${escapeHtml(username)})\n`;
      msg += `   <code>${escapeHtml(commentUrl)}</code>\n`;

      if (comment.replyVibe) {
        const vibeText = typeof comment.replyVibe === 'string'
          ? comment.replyVibe
          : (comment.replyVibe.text || comment.replyVibe.label || '');
        if (vibeText) {
          msg += `   💬 <b>Reply Vibe:</b> <i>${escapeHtml(vibeText)}</i>\n`;
        }
      }

      msg += `\n`;
    });

    if (index === totalBatches - 1) {
      msg += `🔥 <b>Instructions:</b> Click each comment link above, like, and drop your reply matching the vibe!`;
    }

    messages.push(msg.trim());
  });

  return messages;
}

module.exports = {
  formatRaidMessages,
  chunkArray,
  escapeHtml
};
