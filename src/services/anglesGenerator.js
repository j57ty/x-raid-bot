/**
 * Angles & Reply Vibes Generator Service
 * Assigns direct, actionable reply vibes to each comment so raiders know exactly how
 * to frame their replies (e.g., "try contradicting or asking questions", "be sarcastic").
 * Keeps threads lively, human, and avoids farmed-looking comment sections.
 */

const ACTIONABLE_VIBES = [
  'Try contradicting or asking questions',
  'Support without repeating the same thing',
  'Be sarcastic',
  'Try answering the question',
  'Play devil\'s advocate',
  'Call out the hype with humor',
  'Agree, but point out a potential flaw',
  'Challenge them to show proof or numbers',
  'Ask a genuine question that forces them to reply',
  'Share a skeptical take or personal doubt',
  'Drop a witty one-liner or tease them',
  'Relate it to real-world experience or past lessons',
  'Hype them up with your own original spin',
  'Ask what the catch or downside is',
  'Compare to competitors with a sharp take'
];

/**
 * Shuffles an array randomly
 */
function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Assigns an actionable, conversational reply vibe to each comment.
 * If a comment contains a question mark, prioritizes question-answering vibes.
 * If an admin custom focus is provided, weaves that focus into the vibe.
 * 
 * @param {Array<Object>} comments - Array of comment objects
 * @param {string} [customFocus] - Optional admin focus theme
 * @returns {Array<Object>} Comments with attached replyVibe string
 */
function attachVibesToComments(comments, customFocus = null) {
  if (!comments || !Array.isArray(comments) || comments.length === 0) {
    return [];
  }

  const cleanFocus = customFocus 
    ? customFocus.trim().replace(/^focus:\s*/i, '').replace(/^theme:\s*/i, '')
    : null;

  const shuffledVibes = shuffle(ACTIONABLE_VIBES);

  return comments.map((comment, idx) => {
    let vibe = '';
    const text = comment.text || '';

    // 1. If comment is asking a question, suggest answering it
    if (text.includes('?') && idx % 2 === 0) {
      vibe = 'Try answering the question with your own perspective';
    } else if (cleanFocus && idx % 3 === 0) {
      // 2. Weave custom focus if specified by admin
      vibe = `Challenge them on ${cleanFocus} or ask how it works`;
    } else {
      // 3. Rotate through diverse actionable vibes
      vibe = shuffledVibes[idx % shuffledVibes.length];
    }

    return {
      ...comment,
      replyVibe: vibe
    };
  });
}

/**
 * Generates sample reply vibes for preview (used by /angles command)
 * 
 * @param {string} [customFocus] 
 * @returns {Array<string>}
 */
function generateReplyAngles(customFocus = null) {
  const cleanFocus = customFocus 
    ? customFocus.trim().replace(/^focus:\s*/i, '').replace(/^theme:\s*/i, '')
    : null;

  const sample = shuffle(ACTIONABLE_VIBES).slice(0, 4);

  if (cleanFocus) {
    return [
      `Challenge them on ${cleanFocus} or ask how it works`,
      ...sample.slice(0, 3)
    ];
  }

  return sample;
}

module.exports = {
  ACTIONABLE_VIBES,
  attachVibesToComments,
  generateReplyAngles
};
