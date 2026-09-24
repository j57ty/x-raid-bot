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
 * Drops the direct comment links without tagging group members.
 * 
 * @param {Object} params
 * @param {string} params.targetUrl - Original X post URL
 * @param {Object} params.sampleResult - Output from pickCommentsSample
 * @returns {Array<string>} Array of message strings formatted in HTML for Telegram
 */
function formatRaidMessages({ targetUrl, sampleResult }) {
  const { totalComments, samplePercentage, selectedCount, selectedComments } = sampleResult;

  if (selectedComments.length === 0) {
    return [
      `⚠️ <b>No direct comments found on target post</b>\n\n` +
      `🔗 <b>Target Post:</b> ${escapeHtml(targetUrl)}\n` +
      `Check if the post has any replies or if replies are restricted.`
    ];
  }

  const maxLinksPerMessage = config.MAX_LINKS_PER_MESSAGE || 15;
  const batches = chunkArray(selectedComments, maxLinksPerMessage);
  const totalBatches = batches.length;

  const messages = [];

  batches.forEach((batch, index) => {
    const batchNumber = index + 1;
    let msg = '';

    if (index === 0) {
      // First batch header
      msg += `⚔️ <b>X RAID MISSION ACTIVATED</b> ⚔️\n\n`;
      msg += `🎯 <b>Target Post:</b> <a href="${escapeHtml(targetUrl)}">${escapeHtml(targetUrl)}</a>\n`;
      msg += `📊 <b>Direct Comments:</b> ${totalComments} | <b>Raid Targets (${samplePercentage}%):</b> ${selectedCount}\n\n`;
      msg += `👇 <b>Target Comments to Raid:</b>\n\n`;
    } else {
      // Continuation header for multi-part messages
      msg += `⚔️ <b>RAID TARGETS (Part ${batchNumber}/${totalBatches})</b>\n\n`;
    }

    batch.forEach((comment, cIdx) => {
      const globalNum = (index * maxLinksPerMessage) + cIdx + 1;
      const username = comment.author ? comment.author.replace(/^@/, '') : 'user';
      const displayName = comment.authorName || comment.author || 'User';
      const commentUrl = comment.url || `https://x.com/${username}/status/${comment.id}`;

      msg += `${globalNum}. <b>${escapeHtml(displayName)}</b> (@${escapeHtml(username)})\n   <code>${escapeHtml(commentUrl)}</code>\n\n`;
    });

    if (index === totalBatches - 1) {
      msg += `🔥 <b>Instructions:</b> Click each comment link above, like, and drop your reply!`;
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
