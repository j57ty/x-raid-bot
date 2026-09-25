/**
 * Angles Generator Service
 * Generates lively, human, and thread-igniting reply hooks with casual/spicy degen language.
 * Ensures raid comments don't sound like farmed/botted comment sections and keeps conversations going.
 */

// Category 1: The Skeptic / Call-Out (Sparks immediate defensive replies and debates)
const SKEPTIC_ANGLES = [
  {
    category: 'The Call-Out',
    angle: 'Call bullshit or challenge their claim',
    prompt: 'ngl sounds wild as hell, but what happens when volume dumps? ain\'t no way this sustains without liquidity.',
    tip: 'Pushes them to explain how their system actually survives pressure.'
  },
  {
    category: 'The Timeline Check',
    angle: 'Doubt their launch or delivery speed',
    prompt: 'No fucking way this ships on schedule. We\'ve seen this movie before, what\'s the actual contingency plan?',
    tip: 'Forces the team or community to drop concrete dates.'
  },
  {
    category: 'The Reality Check',
    angle: 'Demand proof and battle-testing',
    prompt: 'Sounds dope on paper, but who the fuck is actually testing this in production right now?',
    tip: 'Demands live receipts and real metrics.'
  },
  {
    category: 'The Hidden Flaw',
    angle: 'Point out friction or hidden costs',
    prompt: 'Damn, everyone\'s hyping this up but nobody\'s talking about the gas fees / slippage. How are you guys solving that?',
    tip: 'Starts a genuine discussion about real user experience.'
  }
];

// Category 2: The Direct Grill / Curiosity (Asks punchy questions that demand an answer)
const GRILL_ANGLES = [
  {
    category: 'The "What\'s the Catch?" Grill',
    angle: 'Sniff out the hidden catch',
    prompt: 'This looks almost too good... where\'s the damn catch? What\'s the single biggest risk you guys are sweating right now?',
    tip: 'Authors almost always reply to defend transparency.'
  },
  {
    category: 'The Normie Test',
    angle: 'Challenge UX and ease of use',
    prompt: 'WTF is the onboarding like for normies though? If it takes more than 2 clicks, nobody\'s gonna use it.',
    tip: 'Brings retail investors into the thread to agree or disagree.'
  },
  {
    category: 'The Value Accrual Grill',
    angle: 'Grill them on real token/economic utility',
    prompt: 'Sick tech, but where does the actual value accrue? Don\'t tell me it\'s just governance bullshit.',
    tip: 'Ignites strong opinions from other investors in the thread.'
  },
  {
    category: 'The Comparison Challenge',
    angle: 'Compare them directly to top competitors',
    prompt: 'Alright this is cool, but how does this not get completely eaten alive by existing giants once they copy it?',
    tip: 'Sparks rivalries and gets both sides debating.'
  }
];

// Category 3: Raw Reaction / Authentic Hype (Natural enthusiasm, never corporate bot PR)
const REACTION_ANGLES = [
  {
    category: 'The Unfiltered Reaction',
    angle: 'Express raw shock or pleasant surprise',
    prompt: 'Holy shit, was ready to call bullshit on this thread, but damn that concept is actually clean. Need to dig deeper.',
    tip: 'Sounds 100% human and disarms defensive readers.'
  },
  {
    category: 'The High-Conviction Take',
    angle: 'Hype the disruption factor',
    prompt: 'Damn, if this actually works in the wild the way you say, it\'s gonna shake up the whole space. LFG.',
    tip: 'Generates excitement while inviting others to validate the tech.'
  },
  {
    category: 'The Impatient Degen',
    angle: 'Demand immediate access or links',
    prompt: 'Fuck the talk, when does this actually drop for the public? Don\'t leave us hanging.',
    tip: 'Shows high organic demand in the comments.'
  },
  {
    category: 'The Seasoned Vet',
    angle: 'Relatable industry veteran banter',
    prompt: 'Been in this trenches long enough to see 99% of ideas fail, but this might actually be onto something badass.',
    tip: 'Lends street credibility to the thread.'
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
 * Generates 3 lively, thread-igniting reply angles.
 * If a custom focus is provided, generates one custom angle around the focus
 * plus complementary spicy angles to keep threads engaging and human.
 * 
 * @param {string} [customFocus] - Optional admin focus string (e.g. "gas fees", "upcoming staking")
 * @returns {Array<{ category: string, angle: string, example: string }>}
 */
function generateReplyAngles(customFocus = null) {
  const angles = [];

  if (customFocus && typeof customFocus === 'string' && customFocus.trim().length > 0) {
    const cleanFocus = customFocus.trim().replace(/^focus:\s*/i, '').replace(/^theme:\s*/i, '');
    angles.push({
      category: '🎯 Mission Focus',
      angle: `Target: ${cleanFocus}`,
      example: `Drop a raw take on ${cleanFocus}: "ngl all eyes are on ${cleanFocus} right now — how are you guys actually delivering on this without cutting corners?"`
    });

    // Add 1 skeptic and 1 reaction angle to complement the custom focus
    const randSkeptic = shuffle(SKEPTIC_ANGLES)[0];
    const randReaction = shuffle(REACTION_ANGLES)[0];

    angles.push({
      category: randSkeptic.category,
      angle: randSkeptic.angle,
      example: `"${randSkeptic.prompt}"`
    });

    angles.push({
      category: randReaction.category,
      angle: randReaction.angle,
      example: `"${randReaction.prompt}"`
    });

    return angles;
  }

  // Pick 1 from each distinct category for maximum diversity in the thread
  const skeptic = shuffle(SKEPTIC_ANGLES)[0];
  const grill = shuffle(GRILL_ANGLES)[0];
  const reaction = shuffle(REACTION_ANGLES)[0];

  return [
    {
      category: skeptic.category,
      angle: skeptic.angle,
      example: `"${skeptic.prompt}"`
    },
    {
      category: grill.category,
      angle: grill.angle,
      example: `"${grill.prompt}"`
    },
    {
      category: reaction.category,
      angle: reaction.angle,
      example: `"${reaction.prompt}"`
    }
  ];
}

module.exports = {
  generateReplyAngles,
  SKEPTIC_ANGLES,
  GRILL_ANGLES,
  REACTION_ANGLES
};
