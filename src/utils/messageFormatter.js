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
 * Drops the direct comment links, tags group raiders once in the mission header,
 * and presents lively, human suggested reply angles to keep threads engaging.
 * 
 * @param {Object} params
 * @param {string} params.targetUrl - Original X post URL
 * @param {Object} params.sampleResult - Output from pickCommentsSample
 * @param {Array<Object>} [params.raiders] - Array of group member objects to tag once in header
 * @param {Array<Object>} [params.angles] - Lively suggested reply angles/hooks
 * @returns {Array<string>} Array of message strings formatted in HTML for Telegram
 */
function formatRaidMessages({ targetUrl, sampleResult, raiders = [], angles = [] }) {
  const { totalComments, samplePercentage, selectedCount, selectedComments } = sampleResult;

  if (selectedComments.length === 0) {
    return [
      `⚠️ <b>No direct comments found on target post</b>\n\n` +
      `🔗 <b>Target Post:</b> ${escapeHtml(targetUrl)}\n` +
      `Check if the post has any replies or if replies are restricted.`
    ];
  }

  // Deduplicate raiders strictly so every member is tagged exactly ONCE
  const uniqueRaiders = [];
  const seenIds = new Set();
  const seenUsernames = new Set();

  for (const r of (raiders || [])) {
    const id = r.id ? String(r.id) : null;
    const username = r.username ? r.username.replace(/^@/, '').toLowerCase().trim() : null;

    if (id && seenIds.has(id)) continue;
    if (username && seenUsernames.has(username)) continue;

    if (id) seenIds.add(id);
    if (username) seenUsernames.add(username);
    uniqueRaiders.push(r);
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
      msg += `📊 <b>Direct Comments:</b> ${totalComments} | <b>Raid Targets (${samplePercentage}%):</b> ${selectedCount}\n`;

      if (uniqueRaiders.length > 0) {
        const raiderTags = uniqueRaiders.map(r => {
          if (r.username) {
            return `@${r.username.replace(/^@/, '')}`;
          }
          const name = r.firstName || r.first_name || 'Raider';
          return `<a href="tg://user?id=${r.id}">${escapeHtml(name)}</a>`;
        }).join(' ');
        msg += `👥 <b>Raiders:</b> ${raiderTags}\n`;
      }

      // Lively & organic suggested reply angles to keep threads active and non-farmed
      if (angles && angles.length > 0) {
        msg += `\n🔥 <b>Suggested Reply Angles (Keep it lively & human — NO bot talk):</b>\n`;
        angles.forEach(a => {
          msg += `• <b>${escapeHtml(a.category)}:</b> <i>${escapeHtml(a.example)}</i>\n`;
        });
      }

      msg += `\n👇 <b>Target Comments to Raid:</b>\n\n`;
    } else {
      // Continuation header for multi-part messages
      msg += `⚔️ <b>RAID TARGETS (Part ${batchNumber}/${totalBatches})</b>\n\n`;
    }

    batch.forEach((comment, cIdx) => {
      const globalNum = (index * maxLinksPerMessage) + cIdx + 1;
      const username = comment.author ? comment.author.replace(/^@/, '') : 'user';
      const displayName = comment.authorName || comment.author || 'User';
      const commentUrl = comment.url || `https://x.com/${username}/status/${comment.id}`;

      // Clean comment link without tagging members on comments (tagged once in header)
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
