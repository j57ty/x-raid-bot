const config = require('../config');

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
 * Formats raid comment links into one or more Telegram messages.
 * 
 * @param {Object} params
 * @param {string} params.targetUrl - Original X post URL
 * @param {Object} params.sampleResult - Output from pickCommentsSample
 * @returns {Array<string>} Array of message strings ready to be sent to Telegram
 */
function formatRaidMessages({ targetUrl, sampleResult }) {
  const { totalComments, samplePercentage, selectedCount, selectedComments } = sampleResult;

  if (selectedComments.length === 0) {
    return [
      `⚠️ **No comments found on target post**\n\n` +
      `🔗 **Target Post:** ${targetUrl}\n` +
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
      msg += `⚔️ **X RAID MISSION ACTIVATED** ⚔️\n\n`;
      msg += `🎯 **Target Post:** ${targetUrl}\n`;
      msg += `📊 **Comments Found:** ${totalComments} | **Raid Selection (${samplePercentage}%):** ${selectedCount}\n\n`;
      msg += `👇 **Raiders, engage the target comments below:**\n\n`;
    } else {
      // Continuation header for subsequent messages
      msg += `⚔️ **RAID TARGETS (Part ${batchNumber}/${totalBatches})**\n\n`;
    }

    chunk.forEach((comment, idx) => {
      const globalNum = startIndex + idx + 1;
      const authorText = comment.author ? `@${comment.author}` : 'Comment';
      msg += `${globalNum}. [${authorText}](${comment.url})\n   \`${comment.url}\`\n`;
    });

    if (index === totalBatches - 1) {
      msg += `\n🔥 **Instructions:** Click each link, drop likes, and reply to boost visibility!`;
    }

    messages.push(msg);
  });

  return messages;
}

module.exports = {
  formatRaidMessages,
  chunkArray
};
