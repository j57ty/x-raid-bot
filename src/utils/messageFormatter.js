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
 * Formats a Telegram user mention safely.
 * @param {Object} user 
 * @returns {string}
 */
function formatUserMention(user) {
  if (!user) return 'Raider';
  if (user.username) {
    return `@${user.username.replace(/^@/, '')}`;
  }
  const name = user.firstName || user.first_name || 'Raider';
  if (user.id) {
    return `<a href="tg://user?id=${user.id}">${escapeHtml(name)}</a>`;
  }
  return escapeHtml(name);
}

/**
 * Formats raid comment links into one or more Telegram messages using safe HTML.
 * Groups comments by raider (default 4 targets per raider), tags each raider,
 * and includes the direct link to each comment.
 * 
 * @param {Object} params
 * @param {string} params.targetUrl - Original X post URL
 * @param {Object} params.sampleResult - Output from pickCommentsSample
 * @param {Array<Object>} [params.raiders] - Array of group member objects to tag
 * @returns {Array<string>} Array of message strings formatted in HTML for Telegram
 */
function formatRaidMessages({ targetUrl, sampleResult, raiders = [] }) {
  const { totalComments, samplePercentage, selectedCount, selectedComments } = sampleResult;

  if (selectedComments.length === 0) {
    return [
      `⚠️ <b>No comments found on target post</b>\n\n` +
      `🔗 <b>Target Post:</b> ${escapeHtml(targetUrl)}\n` +
      `Check if the post has any replies or if replies are restricted.`
    ];
  }

  const targetsPerRaider = config.TARGETS_PER_RAIDER || 4;
  const activeRaiders = (raiders && raiders.length > 0) ? raiders : null;

  // Group selected comments into blocks of 4 per raider
  const raiderBlocks = [];
  const raiderCount = activeRaiders ? activeRaiders.length : 1;

  for (let i = 0; i < selectedComments.length; i += targetsPerRaider) {
    const blockComments = selectedComments.slice(i, i + targetsPerRaider);
    const blockIndex = Math.floor(i / targetsPerRaider);
    const assignedRaider = activeRaiders ? activeRaiders[blockIndex % raiderCount] : null;

    raiderBlocks.push({
      raider: assignedRaider,
      comments: blockComments,
      startIndex: i
    });
  }

  // Chunk blocks into messages (e.g. 3-4 raider blocks per Telegram message to avoid 4096 char limit)
  const blocksPerMessage = Math.max(1, Math.floor(config.MAX_LINKS_PER_MESSAGE / targetsPerRaider));
  const chunkedBlocks = chunkArray(raiderBlocks, blocksPerMessage);
  const totalBatches = chunkedBlocks.length;

  const messages = [];

  chunkedBlocks.forEach((blocks, index) => {
    const batchNumber = index + 1;
    let msg = '';

    if (index === 0) {
      // Mission Header on first message
      msg += `⚔️ <b>X RAID MISSION ACTIVATED</b> ⚔️\n\n`;
      msg += `🎯 <b>Target Post:</b> <a href="${escapeHtml(targetUrl)}">${escapeHtml(targetUrl)}</a>\n`;
      msg += `📊 <b>Comments Found:</b> ${totalComments} | <b>Raid Targets (${samplePercentage}%):</b> ${selectedCount}\n`;
      if (activeRaiders) {
        const raiderTags = activeRaiders.map(r => formatUserMention(r)).join(' ');
        msg += `👥 <b>Roster (${activeRaiders.length}):</b> ${raiderTags}\n`;
      }
      msg += `\n👇 <b>Assigned targets (${targetsPerRaider} per raider):</b>\n\n`;
    } else {
      // Continuation header
      msg += `⚔️ <b>RAID TARGETS (Part ${batchNumber}/${totalBatches})</b>\n\n`;
    }

    blocks.forEach((block) => {
      const raiderTag = block.raider ? formatUserMention(block.raider) : null;

      if (raiderTag) {
        msg += `👤 <b>Raider:</b> ${raiderTag} (${block.comments.length} targets)\n`;
      }

      block.comments.forEach((comment, cIdx) => {
        const globalNum = block.startIndex + cIdx + 1;
        const username = comment.author ? comment.author.replace(/^@/, '') : 'user';
        const displayName = comment.authorName || comment.author || 'User';
        const commentUrl = comment.url || targetUrl;
        const tagSuffix = raiderTag ? ` 👉 ${raiderTag}` : '';

        msg += `${globalNum}. <b>${escapeHtml(displayName)}</b> (@${escapeHtml(username)})${tagSuffix}\n   <code>${escapeHtml(commentUrl)}</code>\n`;
      });

      msg += `\n`;
    });

    if (index === totalBatches - 1) {
      msg += `🔥 <b>Instructions:</b> Click your assigned comment links above, like, and drop your reply!`;
    }

    messages.push(msg.trim());
  });

  return messages;
}

module.exports = {
  formatRaidMessages,
  formatUserMention,
  chunkArray,
  escapeHtml
};
