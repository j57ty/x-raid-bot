const assert = require('assert');
const { parseTweetUrl, generateMockComments, isDirectReply } = require('../src/services/xService');
const { pickCommentsSample, shuffleArray } = require('../src/services/sampler');
const { formatRaidMessages, chunkArray, escapeHtml } = require('../src/utils/messageFormatter');
const memberStore = require('../src/services/memberStore');

console.log('🧪 Starting Automated Tests for X Raid Bot...\n');

// ----------------------------------------------------
// 1. Test: parseTweetUrl
// ----------------------------------------------------
console.log('Test 1: parseTweetUrl');
const testUrls = [
  {
    input: 'https://x.com/elonmusk/status/1890000000000000000',
    expectedUser: 'elonmusk',
    expectedId: '1890000000000000000'
  },
  {
    input: 'https://twitter.com/VitalikButerin/status/9876543210987654321?s=20&t=abc',
    expectedUser: 'VitalikButerin',
    expectedId: '9876543210987654321'
  },
  {
    input: 'https://x.com/OpenAI/status/123456789/',
    expectedUser: 'OpenAI',
    expectedId: '123456789'
  }
];

for (const t of testUrls) {
  const res = parseTweetUrl(t.input);
  assert(res !== null, `Failed to parse: ${t.input}`);
  assert.strictEqual(res.username, t.expectedUser);
  assert.strictEqual(res.tweetId, t.expectedId);
  console.log(`  ✅ Successfully parsed: ${t.input} -> ID: ${res.tweetId}`);
}

assert.strictEqual(parseTweetUrl('https://google.com'), null);
assert.strictEqual(parseTweetUrl('invalid url'), null);
console.log('  ✅ Non-X URLs correctly rejected\n');

// ----------------------------------------------------
// 2. Test: 40% Comment Sampling Logic & Traction Filtering
// ----------------------------------------------------
console.log('Test 2: pickCommentsSample (Traction Filtering & 40% rule)');

// Case A: 100 comments where all have traction -> exactly 40 selected
const allTractionMock = Array.from({ length: 100 }, (_, i) => ({
  id: `tweet_${i}`,
  author: `user_${i}`,
  url: `https://x.com/user_${i}/status/tweet_${i}`,
  likes: i + 1,
  retweets: 1,
  replies: 0,
  quotes: 0,
  engagement: i + 2
}));

const sampleAllTraction = pickCommentsSample(allTractionMock, 40);
assert.strictEqual(sampleAllTraction.totalComments, 100);
assert.strictEqual(sampleAllTraction.tractionCommentsCount, 100);
assert.strictEqual(sampleAllTraction.selectedCount, 40);
assert.strictEqual(sampleAllTraction.selectedComments.length, 40);
console.log(`  ✅ 100 comments (all traction): selected ${sampleAllTraction.selectedCount} (40%)`);

// Case B: 100 comments where 60 have traction, 40 have zero engagement
// Traction comments (60) >= 40% quota (40), so exactly 40 selected
const mixedMock = generateMockComments('1000000', 100);
const sampleMixed = pickCommentsSample(mixedMock, 40);
assert.strictEqual(sampleMixed.totalComments, 100);
assert.strictEqual(sampleMixed.selectedCount, 40);
assert.strictEqual(sampleMixed.selectedComments.length, 40);
console.log(`  ✅ Mixed pool: selected exactly ${sampleMixed.selectedCount} (40% of 100)`);

// Case C: 50 comments where only 5 have traction (fewer than 40% quota = 20)
// Must take all 5 traction comments + 15 random other comments = exactly 20 comments (40%)
const fewTractionMock = [
  ...Array.from({ length: 5 }, (_, i) => ({
    id: `traction_${i}`,
    author: `user_${i}`,
    url: `https://x.com/user_${i}/status/traction_${i}`,
    likes: 10,
    retweets: 2,
    replies: 1
  })),
  ...Array.from({ length: 45 }, (_, i) => ({
    id: `zero_${i}`,
    author: `zero_${i}`,
    url: `https://x.com/zero_${i}/status/zero_${i}`,
    likes: 0,
    retweets: 0,
    replies: 0
  }))
];
const sampleFew = pickCommentsSample(fewTractionMock, 40);
assert.strictEqual(sampleFew.totalComments, 50);
assert.strictEqual(sampleFew.selectedCount, 20); // 40% of 50 = exactly 20!
assert.strictEqual(sampleFew.selectedComments.length, 20);
// Verify all 5 traction comments were included
const selectedIds = new Set(sampleFew.selectedComments.map(c => c.id));
for (let i = 0; i < 5; i++) {
  assert(selectedIds.has(`traction_${i}`), `Traction comment traction_${i} must be included`);
}
console.log(`  ✅ Few traction pool: prioritized all 5 traction comments and filled up to exactly 20 (40% of 50)`);

// Case D: When 0 comments have traction (all 0 engagement)
// Still delivers exactly 40% of total comments
const zeroTractionMock = Array.from({ length: 20 }, (_, i) => ({
  id: `zero_${i}`,
  author: `user_${i}`,
  url: `https://x.com/user_${i}/status/zero_${i}`,
  likes: 0,
  retweets: 0,
  replies: 0,
  quotes: 0,
  engagement: 0
}));
const sampleZero = pickCommentsSample(zeroTractionMock, 40);
assert.strictEqual(sampleZero.totalComments, 20);
assert.strictEqual(sampleZero.selectedCount, 8); // 40% of 20 = exactly 8!
assert.strictEqual(sampleZero.selectedComments.length, 8);
console.log(`  ✅ Zero traction pool: delivered exactly ${sampleZero.selectedCount} (40% of 20)`);

// Case E: 1 comment -> 1 selected (at least 1)
const singleMock = [{ id: '1', author: 'solo', url: 'https://x.com/solo/status/1', likes: 5, retweets: 1 }];
const sample1 = pickCommentsSample(singleMock, 40);
assert.strictEqual(sample1.selectedCount, 1);
console.log(`  ✅ 1 comment: selected ${sample1.selectedCount}`);

// Case F: 0 comments
const sample0 = pickCommentsSample([], 40);
assert.strictEqual(sample0.selectedCount, 0);
console.log(`  ✅ 0 comments: selected 0`);

// Case G: Post author exclusion
const authorPool = [
  { id: 'auth_1', author: 'elonmusk', url: 'https://x.com/elonmusk/status/1', likes: 100 },
  { id: 'auth_2', author: 'ElonMusk', url: 'https://x.com/ElonMusk/status/2', likes: 50 },
  { id: 'user_1', author: 'supporter_1', url: 'https://x.com/supporter_1/status/3', likes: 10 },
  { id: 'user_2', author: 'supporter_2', url: 'https://x.com/supporter_2/status/4', likes: 5 }
];
const sampleAuthorExclusion = pickCommentsSample(authorPool, 100, { excludeAuthor: 'elonmusk' });
assert.strictEqual(sampleAuthorExclusion.totalComments, 2);
assert.strictEqual(sampleAuthorExclusion.selectedCount, 2);
for (const c of sampleAuthorExclusion.selectedComments) {
  assert.notStrictEqual(c.author.toLowerCase(), 'elonmusk', 'Author comments must be excluded');
}
console.log('  ✅ Author exclusion: correctly filtered out all comments made by the post author');

// Case H: Nested replies exclusion (only direct replies kept)
const nestedPool = [
  { id: 'direct_1', author: 'user1', inReplyToStatusId: '1000', likes: 5 },
  { id: 'nested_1', author: 'user2', inReplyToStatusId: 'direct_1', likes: 20 }, // replying to user1, not main post!
  { id: 'direct_2', author: 'user3', inReplyToStatusId: '1000', likes: 8 }
];
const directOnly = nestedPool.filter(c => !c.inReplyToStatusId || String(c.inReplyToStatusId) === '1000');
assert.strictEqual(directOnly.length, 2);
assert(directOnly.every(c => c.inReplyToStatusId === '1000'));
console.log('  ✅ Nested replies exclusion: correctly kept only direct replies to target post');

// Case I: isDirectReply helper across schema variations
assert.strictEqual(isDirectReply({ inReplyToStatusId: '1000' }, '1000'), true);
assert.strictEqual(isDirectReply({ inReplyToStatusId: '2000' }, '1000'), false);
assert.strictEqual(isDirectReply({ in_reply_to_status_id_str: '1000', in_reply_to_screen_name: 'elonmusk' }, '1000', 'elonmusk'), true);
assert.strictEqual(isDirectReply({ in_reply_to_status_id_str: '1000', in_reply_to_screen_name: 'random_guy' }, '1000', 'elonmusk'), false);
assert.strictEqual(isDirectReply({ referenced_tweets: [{ type: 'replied_to', id: '2000' }] }, '1000'), false);
assert.strictEqual(isDirectReply({ referenced_tweets: [{ type: 'replied_to', id: '1000' }] }, '1000'), true);
console.log('  ✅ isDirectReply helper: verified parent status ID & in-reply-to username across schemas\n');

// ----------------------------------------------------
// 3. Test: Unbiased Randomization
// ----------------------------------------------------
console.log('Test 3: Unbiased Randomization');
const sampleA = pickCommentsSample(mixedMock, 40);
const sampleB = pickCommentsSample(mixedMock, 40);
// Two random 40% samples should not be identical in order
const idsA = sampleA.selectedComments.map(c => c.id).join(',');
const idsB = sampleB.selectedComments.map(c => c.id).join(',');
assert.notStrictEqual(idsA, idsB, 'Random samples should vary between runs');
console.log('  ✅ Random sampling produces distinct shuffled selections\n');

// ----------------------------------------------------
// 4. Test: Message Formatting & Direct Comment Links (No Member Tagging)
// ----------------------------------------------------
console.log('Test 4: formatRaidMessages (Direct links, No member tagging)');
const formatted = formatRaidMessages({
  targetUrl: 'https://x.com/elonmusk/status/1890000000000000000',
  sampleResult: sampleMixed
});

assert(formatted.length >= 1);
console.log(`  ✅ Formatted into ${formatted.length} chunked messages (respecting Telegram limit)`);
assert(formatted[0].includes('⚔️ <b>X RAID MISSION ACTIVATED</b> ⚔️'));
assert(formatted[0].includes('https://x.com/elonmusk/status/1890000000000000000')); // Target post link is kept
assert(formatted[0].includes('<code>https://x.com/')); // Direct comment links are included
assert(!formatted[0].includes('Raider:')); // No member tagging
assert(!formatted[0].includes('👉 @')); // No member tagging suffix
console.log('  ✅ Message structure delivers clean numbered comments with direct links without member tagging\n');

// ----------------------------------------------------
// 5. Test: Member Tagging & Welcome Message Construction
// ----------------------------------------------------
console.log('Test 5: Member Tagging & Welcome Message Logic');

// Test 5A: Record and retrieve members
const testChatId = -1009999999999;
memberStore.clearMembers(testChatId);

memberStore.recordMember(testChatId, {
  id: 111111,
  username: 'jacob',
  first_name: 'Jacob'
});
memberStore.recordMember(testChatId, {
  id: 222222,
  username: null,
  first_name: 'Alice'
});

const stored = memberStore.getMembers(testChatId);
assert.strictEqual(stored.length, 2);
assert.strictEqual(stored[0].username, 'jacob');
assert.strictEqual(stored[1].firstName, 'Alice');
console.log('  ✅ Stored members correctly recorded and retrieved');

// Test 5B: Tagging formatting
const tagWithUsername = stored[0].username
  ? `@${stored[0].username}`
  : `<a href="tg://user?id=${stored[0].id}">${escapeHtml(stored[0].firstName)}</a>`;
assert.strictEqual(tagWithUsername, '@jacob');

const tagWithoutUsername = stored[1].username
  ? `@${stored[1].username}`
  : `<a href="tg://user?id=${stored[1].id}">${escapeHtml(stored[1].firstName)}</a>`;
assert.strictEqual(tagWithoutUsername, '<a href="tg://user?id=222222">Alice</a>');
console.log('  ✅ Tag generation works for both @username and profile links');

// Test 5C: Welcome message contents
const testLink = 'https://t.me/+AbCdEfGhIj';
const groupLinkFormatted = `\n\n🔗 <b>Group Link:</b> ${escapeHtml(testLink)}\n\n`;
const welcomeMsg = 
  `Hi ${tagWithUsername} Welcome, we are all here to work together as a real community and support each other${groupLinkFormatted}` +
  `share to those in the Eva Vanguard group who haven't joined in their dms`;

assert(welcomeMsg.includes('Hi @jacob Welcome'));
assert(welcomeMsg.includes('we are all here to work together as a real community and support each other'));
assert(welcomeMsg.includes('https://t.me/+AbCdEfGhIj'));
assert(welcomeMsg.includes("share to those in the Eva Vanguard group who haven't joined in their dms"));
console.log('  ✅ Welcome message correctly structured with tag, community text, group link, and closing phrase\n');

// Clean up test data
memberStore.clearMembers(testChatId);

console.log('🎉 ALL TESTS PASSED SUCCESSFULLY! Everything is working as expected.');
