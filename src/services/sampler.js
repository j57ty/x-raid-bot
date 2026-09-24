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
 * Picks a percentage (default 40%) of comments.
 * Prioritizes comments that gained traction first, and fills the remaining quota
 * randomly from the other comments so it ALWAYS delivers exactly 40% of total comments.
 * 
 * @param {Array<Object>} comments - Array of comment objects
 * @param {number} [percentage] - Desired percentage (1 - 100). Defaults to 40%.
 * @param {Object} [options] - Optional configurations
 * @returns {Object} Sample result with metadata and selected comment list
 */
function pickCommentsSample(comments, percentage = config.DEFAULT_SAMPLE_PERCENT, options = {}) {
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

  // Filter out comments made by the post author if specified
  let poolComments = comments;
  if (options.excludeAuthor) {
    const authorToExclude = String(options.excludeAuthor).toLowerCase().replace(/^@/, '');
    poolComments = poolComments.filter(c => (c.author || '').toLowerCase().replace(/^@/, '') !== authorToExclude);
  }

  if (poolComments.length === 0) {
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

  // ALWAYS calculate target count from total comments (guaranteeing exact percentage)
  const targetCount = Math.max(1, Math.round(poolComments.length * (validPercentage / 100)));

  // Separate comments that gained traction from the rest
  const tractionComments = poolComments.filter(c => getEngagementScore(c) > 0);
  const nonTractionComments = poolComments.filter(c => getEngagementScore(c) === 0);

  let selected = [];

  if (tractionComments.length >= targetCount) {
    // If we have enough traction comments, randomly select targetCount from them
    const shuffledTraction = shuffleArray(tractionComments);
    selected = shuffledTraction.slice(0, targetCount);
  } else {
    // Take all available traction comments
    selected = [...tractionComments];

    // Fill the remainder of the 40% quota randomly from non-traction comments
    const needed = targetCount - selected.length;
    const shuffledNonTraction = shuffleArray(nonTractionComments);
    const filler = shuffledNonTraction.slice(0, needed);
    selected.push(...filler);
  }

  // Shuffle final selection so raiders get a distributed mix
  const finalSelectedComments = shuffleArray(selected);

  return {
    totalComments: poolComments.length,
    tractionCommentsCount: tractionComments.length,
    samplePercentage: validPercentage,
    selectedCount: finalSelectedComments.length,
    selectedComments: finalSelectedComments,
    filterApplied: tractionComments.length > 0
  };
}

module.exports = {
  getEngagementScore,
  pickCommentsSample,
  shuffleArray
};
