const config = require('../config');

/**
 * Fisher-Yates (Knuth) shuffle algorithm for unbiased random permutation.
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
 * Picks a percentage (default 40%) of comments that gained traction.
 * Zero-engagement comments are filtered out first, then a random sample
 * is chosen from the traction pool to keep raiders distributed.
 * If no comments have engagement > 0, it falls back to sampling all comments.
 * 
 * @param {Array<Object>} comments - Array of comment objects
 * @param {number} [percentage] - Desired percentage (1 - 100). Defaults to 40%.
 * @param {Object} [options] - Optional configurations
 * @param {boolean} [options.filterZeroTraction=true] - Whether to filter out zero-engagement comments
 * @returns {Object} Sample result with metadata and selected comment list
 */
function pickCommentsSample(comments, percentage = config.DEFAULT_SAMPLE_PERCENT, options = {}) {
  const shouldFilterZero = options.filterZeroTraction !== undefined 
    ? options.filterZeroTraction 
    : (config.FILTER_ZERO_TRACTION !== false);

  if (!comments || !Array.isArray(comments) || comments.length === 0) {
    return {
      totalComments: 0,
      tractionCommentsCount: 0,
      samplePercentage: percentage,
      selectedCount: 0,
      selectedComments: [],
      filterApplied: false
    };
  }

  // Ensure percentage is bounded between 1 and 100
  const validPercentage = Math.min(100, Math.max(1, percentage));

  // Identify comments that have gained traction (engagement > 0)
  const tractionComments = comments.filter(c => getEngagementScore(c) > 0);

  // If enabled and traction comments exist, use them as the pool; otherwise fallback
  const useTractionPool = shouldFilterZero && tractionComments.length > 0;
  const pool = useTractionPool ? tractionComments : comments;

  // Calculate target count based on the pool (at least 1 if pool is not empty)
  const targetCount = Math.max(1, Math.round(pool.length * (validPercentage / 100)));

  // Randomly shuffle the pool to ensure raiders get distributed
  const shuffled = shuffleArray(pool);

  // Take the target count
  const selectedComments = shuffled.slice(0, targetCount);

  return {
    totalComments: comments.length,
    tractionCommentsCount: tractionComments.length,
    samplePercentage: validPercentage,
    selectedCount: selectedComments.length,
    selectedComments,
    filterApplied: useTractionPool
  };
}

module.exports = {
  getEngagementScore,
  pickCommentsSample,
  shuffleArray
};
