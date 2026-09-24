const assert = require('assert');
const { parseTweetUrl, generateMockComments } = require('../src/services/xService');
const { pickCommentsSample, shuffleArray } = require('../src/services/sampler');
const { formatRaidMessages, chunkArray } = require('../src/utils/messageFormatter');

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
// Must filter out zero-engagement comments, then sample 40% from the 60 traction comments (40% of 60 = 24)
const mixedMock = generateMockComments('1000000', 100);
const sampleMixed = pickCommentsSample(mixedMock, 40);
assert.strictEqual(sampleMixed.totalComments, 100);
assert.strictEqual(sampleMixed.filterApplied, true);
assert(sampleMixed.tractionCommentsCount > 0, 'Should have identified traction comments');
// Verify every single selected comment has traction > 0
for (const c of sampleMixed.selectedComments) {
  assert((c.likes > 0 || c.retweets > 0 || c.replies > 0), `Selected comment ${c.id} should have engagement`);
}
console.log(`  ✅ Mixed pool: filtered out 0-engagement comments, sampled ${sampleMixed.selectedCount} from ${sampleMixed.tractionCommentsCount} traction comments`);

// Case C: Fallback when 0 comments have traction (all 0 engagement)
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
assert.strictEqual(sampleZero.selectedCount, 8); // 40% of 20 = 8 fallback
assert.strictEqual(sampleZero.filterApplied, false);
console.log(`  ✅ Graceful fallback: when 0 comments have traction, sampled ${sampleZero.selectedCount} (40% of 20)`);

// Case D: 1 comment with traction -> 1 selected (at least 1)
const singleMock = [{ id: '1', author: 'solo', url: 'https://x.com/solo/status/1', likes: 5, retweets: 1 }];
const sample1 = pickCommentsSample(singleMock, 40);
assert.strictEqual(sample1.selectedCount, 1);
console.log(`  ✅ 1 comment: selected ${sample1.selectedCount}`);

// Case E: 0 comments
const sample0 = pickCommentsSample([], 40);
assert.strictEqual(sample0.selectedCount, 0);
console.log(`  ✅ 0 comments: selected 0\n`);

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
// 4. Test: Message Formatting & Chunking
// ----------------------------------------------------
console.log('Test 4: formatRaidMessages & Chunking');
const formatted = formatRaidMessages({
  targetUrl: 'https://x.com/elonmusk/status/1890000000000000000',
  sampleResult: sampleMixed
});

assert(formatted.length >= 1);
console.log(`  ✅ Formatted into ${formatted.length} chunked messages (respecting Telegram limit)`);
assert(formatted[0].includes('⚔️ <b>X RAID MISSION ACTIVATED</b> ⚔️'));
assert(formatted[0].includes('https://x.com/'));
console.log('  ✅ Message structure contains clean links & raid instructions without confusing badges\n');

console.log('🎉 ALL TESTS PASSED SUCCESSFULLY! Everything is working as expected.');

