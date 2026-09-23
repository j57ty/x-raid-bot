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
// 2. Test: 40% Comment Sampling Logic
// ----------------------------------------------------
console.log('Test 2: pickCommentsSample (40% requirement)');

// Case A: 100 comments -> exactly 40 selected
const mock100 = generateMockComments('1000000', 100);
const sample100 = pickCommentsSample(mock100, 40);
assert.strictEqual(sample100.totalComments, 100);
assert.strictEqual(sample100.selectedCount, 40);
assert.strictEqual(sample100.selectedComments.length, 40);
console.log(`  ✅ 100 comments: selected ${sample100.selectedCount} (40%)`);

// Case B: 25 comments -> 10 selected (40% of 25 = 10)
const mock25 = generateMockComments('1000000', 25);
const sample25 = pickCommentsSample(mock25, 40);
assert.strictEqual(sample25.totalComments, 25);
assert.strictEqual(sample25.selectedCount, 10);
console.log(`  ✅ 25 comments: selected ${sample25.selectedCount} (40%)`);

// Case C: 1 comment -> 1 selected (at least 1)
const mock1 = generateMockComments('1000000', 1);
const sample1 = pickCommentsSample(mock1, 40);
assert.strictEqual(sample1.selectedCount, 1);
console.log(`  ✅ 1 comment: selected ${sample1.selectedCount}`);

// Case D: 0 comments
const sample0 = pickCommentsSample([], 40);
assert.strictEqual(sample0.selectedCount, 0);
console.log(`  ✅ 0 comments: selected 0\n`);

// ----------------------------------------------------
// 3. Test: Unbiased Randomization
// ----------------------------------------------------
console.log('Test 3: Unbiased Randomization');
const sampleA = pickCommentsSample(mock100, 40);
const sampleB = pickCommentsSample(mock100, 40);
// Two random 40% samples from 100 items should not be identical in order or exact selection
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
  sampleResult: sample100
});

// 40 comments with MAX_LINKS_PER_MESSAGE = 15 should produce 3 chunked messages (15 + 15 + 10)
assert.strictEqual(formatted.length, 3);
console.log(`  ✅ Formatted into ${formatted.length} chunked messages (respecting Telegram limit)`);
assert(formatted[0].includes('⚔️ <b>X RAID MISSION ACTIVATED</b> ⚔️'));
assert(formatted[0].includes('https://x.com/'));
console.log('  ✅ Message structure contains proper HTML & raid instructions\n');

console.log('🎉 ALL TESTS PASSED SUCCESSFULLY! Everything is working as expected.');
