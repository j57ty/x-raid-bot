const config = require('../config');

/**
 * Calculates total engagement / traction score for a comment.
 * Sum of likes, retweets, replies, and quotes.
 * 
 * @param {Object} comment 
 * @returns {number}
 */
function getEngagementScore(comment) {
  if (!comment) return 0;
  if (typeof comment.engagement === 'number') return comment.engagement;
  const likes = Number(comment.likes) || 0;
  const retweets = Number(comment.retweets) || 0;
  const replies = Number(comment.replies) || 0;
  const quotes = Number(comment.quotes) || 0;
  return likes + retweets + replies + quotes;
}

/**
 * Fisher-Yates (Knuth) shuffle algorithm.
 * @param {Array} array 
 * @returns {Array} Shuffled array copy
 */
function shuffleArray(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Organically distributes total raiders across a list of comments.
 * Higher engagement comments receive a higher share while maintaining organic random variance,
 * ensuring every comment gets at least 1 raider and the total sum matches totalRaiders exactly.
 * 
 * @param {number} totalRaiders - Total number of participating raiders (default: 64)
 * @param {number} count - Number of comments to distribute across (default: 20)
 * @returns {Array<number>} Array of raider allocations per comment
 */
function distributeRaiders(totalRaiders = config.TOTAL_RAIDERS || 64, count = config.TOP_COMMENTS_LIMIT || 20) {
  if (count <= 0) return [];
  if (count === 1) return [totalRaiders];
  if (totalRaiders < count) {
    const res = new Array(count).fill(0);
    for (let i = 0; i < totalRaiders; i++) res[i] = 1;
    return res;
  }

  const alloc = new Array(count).fill(1);
  let remaining = totalRaiders - count;

  const weights = [];
  for (let i = 0; i < count; i++) {
    const rankFactor = 0.4 + (4.0 * Math.pow((count - i) / count, 1.8));
    const noise = 0.6 + Math.random() * 1.4;
    weights.push(rankFactor * noise);
  }

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  let distributed = 0;
  const additions = weights.map(w => {
    const share = Math.floor((w / totalWeight) * remaining);
    distributed += share;
    return share;
  });

  let leftOver = remaining - distributed;
  while (leftOver > 0) {
    const r = Math.random() * totalWeight;
    let acc = 0;
    let pickedIdx = 0;
    for (let i = 0; i < count; i++) {
      acc += weights[i];
      if (r <= acc) {
        pickedIdx = i;
        break;
      }
    }
    additions[pickedIdx]++;
    leftOver--;
  }

  for (let i = 0; i < count; i++) {
    alloc[i] += additions[i];
  }

  return alloc;
}

/**
 * Selects the top comments with the highest engagement from the post (default: 20).
 * Discovered comments are sorted in descending order of engagement score (likes + retweets + replies + quotes).
 * Also splits the participating raiders (default: 64) organically across the selected comments.
 * 
 * @param {Array<Object>} comments - Array of comment objects
 * @param {number} [limit=25] - Number of top comments to return (default: 25)
 * @param {Object} [options] - Optional configurations (e.g. excludeAuthor)
 * @returns {Object} Result with totalComments, targetLimit, selectedCount, and sorted selectedComments
 */
function pickTopEngagementComments(comments, limit = config.TOP_COMMENTS_LIMIT || 25, options = {}) {
  if (!comments || !Array.isArray(comments) || comments.length === 0) {
    return {
      totalComments: 0,
      targetLimit: limit,
      selectedCount: 0,
      selectedComments: []
    };
  }

  // Filter out comments made by the post author if specified
  let poolComments = comments;
  if (options.excludeAuthor) {
    const authorToExclude = String(options.excludeAuthor).toLowerCase().replace(/^@/, '');
    poolComments = poolComments.filter(c => (c.author || '').toLowerCase().replace(/^@/, '') !== authorToExclude);
  }

  if (poolComments.length === 0) {
    return {
      totalComments: 0,
      targetLimit: limit,
      selectedCount: 0,
      selectedComments: []
    };
  }

  const targetLimit = Math.max(1, parseInt(limit, 10) || 25);

  // Sort descending by highest engagement score
  // Tie-breaker 1: likes, Tie-breaker 2: views
  const sorted = [...poolComments].sort((a, b) => {
    const scoreDiff = getEngagementScore(b) - getEngagementScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    const likesDiff = (Number(b.likes) || 0) - (Number(a.likes) || 0);
    if (likesDiff !== 0) return likesDiff;
    return (Number(b.views) || 0) - (Number(a.views) || 0);
  });

  const selected = sorted.slice(0, targetLimit);

  return {
    totalComments: poolComments.length,
    targetLimit,
    selectedCount: selected.length,
    selectedComments: selected
  };
}

/**
 * Backward-compatibility alias: calls pickTopEngagementComments.
 * If a custom limit is provided, uses it.
 */
function pickCommentsSample(comments, countOrPercent = 25, options = {}) {
  const limit = typeof countOrPercent === 'number' && countOrPercent > 0 ? countOrPercent : (config.TOP_COMMENTS_LIMIT || 25);
  return pickTopEngagementComments(comments, limit, options);
}

module.exports = {
  getEngagementScore,
  pickTopEngagementComments,
  pickCommentsSample,
  distributeRaiders,
  shuffleArray
};
