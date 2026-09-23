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
 * Picks a percentage (default 40%) of comments randomly from the total list.
 * 
 * @param {Array<Object>} comments - Array of comment objects { id, author, text, url }
 * @param {number} [percentage] - Desired percentage (1 - 100). Defaults to 40%.
 * @returns {Object} Sample result with metadata and selected comment list
 */
function pickCommentsSample(comments, percentage = config.DEFAULT_SAMPLE_PERCENT) {
  if (!comments || !Array.isArray(comments) || comments.length === 0) {
    return {
      totalComments: 0,
      samplePercentage: percentage,
      selectedCount: 0,
      selectedComments: []
    };
  }

  // Ensure percentage is bounded between 1 and 100
  const validPercentage = Math.min(100, Math.max(1, percentage));

  // Calculate target count (at least 1 comment if comments exist)
  const targetCount = Math.max(1, Math.round(comments.length * (validPercentage / 100)));

  // Randomly shuffle comments to ensure raiders get distributed across different comments
  const shuffled = shuffleArray(comments);

  // Take the target count
  const selectedComments = shuffled.slice(0, targetCount);

  return {
    totalComments: comments.length,
    samplePercentage: validPercentage,
    selectedCount: selectedComments.length,
    selectedComments
  };
}

module.exports = {
  pickCommentsSample,
  shuffleArray
};
