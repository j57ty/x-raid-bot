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
      `⚠️ <b>No comments found on target post</b>\n\n` +
      `🔗 <b>Target Post:</b> ${escapeHtml(targetUrl)}\n` +
      `Check if the post has any replies or if replies are restricted.`
    ];
  }

  // Chunk links so messages stay clean and under 4096 characters
  const chunkSize = config.MAX_LINKS_PER_MESSAGE;
  const chunks = chunkArray(selectedComments, chunkSize);
  const totalBatches = chunks.length;

  const messages = [];

  chunks.forEach((chunk, index) => {
    const batchNumber = index + 1;
    const startIndex = index * chunkSize;

    let msg = '';

    if (index === 0) {
      // Header on the first message
      msg += `⚔️ <b>X RAID MISSION ACTIVATED</b> ⚔️\n\n`;
      msg += `🎯 <b>Target Post:</b> <a href="${escapeHtml(targetUrl)}">${escapeHtml(targetUrl)}</a>\n`;
      msg += `📊 <b>Comments Found:</b> ${totalComments} | <b>Raid Selection (${samplePercentage}%):</b> ${selectedCount}\n\n`;
      msg += `👇 <b>Raiders, engage the target comments below:</b>\n\n`;
    } else {
      // Continuation header for subsequent messages
      msg += `⚔️ <b>RAID TARGETS (Part ${batchNumber}/${totalBatches})</b>\n\n`;
    }

    chunk.forEach((comment, idx) => {
      const globalNum = startIndex + idx + 1;
      const authorText = comment.author ? `@${comment.author}` : 'Comment';
      const cleanUrl = comment.url || targetUrl;
      msg += `${globalNum}. <a href="${escapeHtml(cleanUrl)}">${escapeHtml(authorText)}</a>\n   <code>${escapeHtml(cleanUrl)}</code>\n`;
    });

    if (index === totalBatches - 1) {
      msg += `\n🔥 <b>Instructions:</b> Click each link, drop likes, and reply to boost visibility!`;
    }

    messages.push(msg);
  });

  return messages;
}

module.exports = {
  formatRaidMessages,
  chunkArray,
  escapeHtml
};
