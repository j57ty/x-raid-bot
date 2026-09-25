/**
 * Angles & Reply Vibes Generator Service
 * Generates lively, human, and thread-igniting reply hooks with casual/spicy degen language.
 * Ensures raid comments don't sound like farmed/botted comment sections and keeps conversations going.
 */

// Full pool of lively, thread-igniting reply vibes
const ALL_VIBES = [
  {
    label: 'Call-Out / Doubt',
    text: 'ngl sounds wild as hell, but what happens when volume dumps? ain\'t no way this sustains without liquidity'
  },
  {
    label: 'Real Grill / Risk',
    text: 'looks almost too good... where\'s the damn catch? what\'s the biggest risk you guys are sweating right now?'
  },
  {
    label: 'Normie UX Test',
    text: 'wtf is the onboarding like for normies? if it takes more than 2 clicks, nobody\'s gonna use it'
  },
  {
    label: 'Unfiltered Hype',
    text: 'holy shit, was ready to call bullshit on this, but damn that concept is actually clean. when does this drop?'
  },
  {
    label: 'Timeline Grill',
    text: 'no fucking way this ships on schedule. we\'ve seen this movie before, what\'s the actual backup plan?'
  },
  {
    label: 'Token Utility Grill',
    text: 'sick tech, but where does the actual value accrue? don\'t tell me it\'s just governance bullshit'
  },
  {
    label: 'Competitor Challenge',
    text: 'alright this is cool, but how does this not get completely eaten alive once giants copy it?'
  },
  {
    label: 'Hidden Flaw Check',
    text: 'damn, everyone\'s hyping this up but nobody\'s talking about the gas fees / slippage. how are you solving that?'
  },
  {
    label: 'High Conviction',
    text: 'damn, if this actually works in the wild the way you say, it\'s gonna shake up the whole space. LFG'
  },
  {
    label: 'Street Wisdom',
    text: 'been in this trenches long enough to see 99% of ideas fail, but this might actually be onto something badass'
  },
  {
    label: 'Proof & Receipts',
    text: 'sounds dope on paper, but who the fuck is actually testing this in production right now?'
  },
  {
    label: 'Impatient Degen',
    text: 'fuck the talk, when does this actually drop for the public? don\'t leave us hanging'
  }
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
 * Assigns a distinct, lively reply vibe/angle to each comment.
 * If customFocus is provided by admin, every few comments will target that focus,
 * while others provide diverse conversational and skeptical hooks so the thread stays organic.
 * 
 * @param {Array<Object>} comments - Array of comment objects
 * @param {string} [customFocus] - Optional admin focus theme
 * @returns {Array<Object>} Comments with attached replyVibe property
 */
function attachVibesToComments(comments, customFocus = null) {
  if (!comments || !Array.isArray(comments) || comments.length === 0) {
    return [];
  }

  const cleanFocus = customFocus 
    ? customFocus.trim().replace(/^focus:\s*/i, '').replace(/^theme:\s*/i, '')
    : null;

  const shuffledVibes = shuffle(ALL_VIBES);

  return comments.map((comment, idx) => {
    let vibeObj;

    // If custom focus provided, assign it to every 2nd or 3rd comment
    if (cleanFocus && idx % 3 === 0) {
      vibeObj = {
        label: 'Mission Focus',
        text: `ngl all eyes are on ${cleanFocus} right now — how are you guys actually delivering on this without cutting corners?`
      };
    } else {
      vibeObj = shuffledVibes[idx % shuffledVibes.length];
    }

    return {
      ...comment,
      replyVibe: vibeObj
    };
  });
}

/**
 * Generates sample lively angles for preview (used by /angles command)
 * 
 * @param {string} [customFocus] 
 * @returns {Array<{ label: string, text: string }>}
 */
function generateReplyAngles(customFocus = null) {
  const cleanFocus = customFocus 
    ? customFocus.trim().replace(/^focus:\s*/i, '').replace(/^theme:\s*/i, '')
    : null;

  const sample = shuffle(ALL_VIBES).slice(0, 3);

  if (cleanFocus) {
    return [
      {
        label: `Mission Focus: ${cleanFocus}`,
        text: `ngl all eyes are on ${cleanFocus} right now — how are you guys actually delivering on this without cutting corners?`
      },
      sample[0],
      sample[1]
    ];
  }

  return sample;
}

module.exports = {
  ALL_VIBES,
  attachVibesToComments,
  generateReplyAngles
};
