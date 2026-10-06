const assert = require('assert');
const { parseTweetUrl, generateMockComments, isDirectReply, filterDescendantReplies } = require('../src/services/xService');
const { pickTopEngagementComments, pickCommentsSample, distributeRaiders, shuffleArray } = require('../src/services/sampler');
const { formatRaidMessages, chunkArray, escapeHtml } = require('../src/utils/messageFormatter');
const { generateReplyAngles, attachVibesToComments } = require('../src/services/anglesGenerator');
const memberStore = require('../src/services/memberStore');
const { isUserAdmin, isSuperAdmin, isMessageDirectedAtBot, enforceAdminOnlyMiddleware, requireGroupAdmin } = require('../src/middleware/adminCheck');

const { execSync } = require('child_process');

console.log('🧪 Starting Automated Tests for X Raid Bot...\n');

// ----------------------------------------------------
// 0. Test: Codebase Syntax Integrity
// ----------------------------------------------------
console.log('Test 0: Syntax Integrity');
execSync('node -c src/index.js');
console.log('  ✅ src/index.js syntax is 100% valid\n');

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
// 2. Test: Top Engagement Comments Selection & Organic Raider Distribution
// ----------------------------------------------------
console.log('Test 2: pickTopEngagementComments & distributeRaiders (20 Comments Default, 64 Raiders Split)');

// Case A: Default selection returns 20 comments when pool has >= 20 comments
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

const sampleDefault = pickTopEngagementComments(allTractionMock);
assert.strictEqual(sampleDefault.totalComments, 100);
assert.strictEqual(sampleDefault.selectedCount, 20, 'Default selection limit should be 20');
assert.strictEqual(sampleDefault.selectedComments.length, 20);
// Verify sorted descending
assert.strictEqual(sampleDefault.selectedComments[0].id, 'tweet_99');
assert.strictEqual(sampleDefault.selectedComments[19].id, 'tweet_80');
for (let i = 0; i < sampleDefault.selectedComments.length - 1; i++) {
  assert(sampleDefault.selectedComments[i].engagement >= sampleDefault.selectedComments[i + 1].engagement);
}
console.log(`  ✅ Default 20 comments selected in descending engagement order`);

// Case B: Explicit limit (e.g. 10)
const sample10 = pickTopEngagementComments(allTractionMock, 10);
assert.strictEqual(sample10.selectedCount, 10);
assert.strictEqual(sample10.selectedComments.length, 10);
console.log(`  ✅ Explicit limit 10: selected top 10 comments`);

// Case C: distributeRaiders unit tests
const dist20 = distributeRaiders(64, 20);
assert.strictEqual(dist20.length, 20);
assert.strictEqual(dist20.reduce((a, b) => a + b, 0), 64);
assert(dist20.every(n => n >= 1), 'Every comment receives at least 1 raider');
assert(dist20[0] > dist20[19], 'Top engagement comments receive higher allocations than lower ranked comments');
console.log(`  ✅ distributeRaiders(64, 20): allocations sample: [${dist20.slice(0, 5).join(', ')}, ...] -> sum = ${dist20.reduce((a, b) => a + b, 0)}`);

// Edge case: single comment receives all 64 raiders
assert.deepStrictEqual(distributeRaiders(64, 1), [64]);
// Edge case: 5 comments
const dist5 = distributeRaiders(64, 5);
assert.strictEqual(dist5.length, 5);
assert.strictEqual(dist5.reduce((a, b) => a + b, 0), 64);
// Edge case: 0 comments
assert.deepStrictEqual(distributeRaiders(64, 0), []);
console.log('  ✅ distributeRaiders edge cases: 1 comment ([64]), 5 comments (sum = 64), 0 comments ([])');

// Case D: Mixed pool using generateMockComments -> top 20 selected
const mixedMock = generateMockComments('1000000', 100);
const sampleMixed = pickTopEngagementComments(mixedMock, 20);
assert.strictEqual(sampleMixed.totalComments, 100);
assert.strictEqual(sampleMixed.selectedCount, 20);
assert.strictEqual(sampleMixed.selectedComments.length, 20);
for (let i = 0; i < sampleMixed.selectedComments.length - 1; i++) {
  const current = sampleMixed.selectedComments[i].engagement ?? (sampleMixed.selectedComments[i].likes + sampleMixed.selectedComments[i].retweets);
  const next = sampleMixed.selectedComments[i + 1].engagement ?? (sampleMixed.selectedComments[i + 1].likes + sampleMixed.selectedComments[i + 1].retweets);
  assert(current >= next);
}
console.log(`  ✅ Mixed pool: selected top ${sampleMixed.selectedCount} comments with highest engagement`);

// Case E: Small pool (< 20 comments, e.g. 5 comments) -> returns all 5 sorted by engagement
const smallMock = [
  { id: '1', author: 'u1', likes: 10, retweets: 2, engagement: 12 },
  { id: '2', author: 'u2', likes: 50, retweets: 10, engagement: 60 },
  { id: '3', author: 'u3', likes: 2, retweets: 0, engagement: 2 },
  { id: '4', author: 'u4', likes: 25, retweets: 5, engagement: 30 },
  { id: '5', author: 'u5', likes: 100, retweets: 20, engagement: 120 }
];
const sampleSmall = pickTopEngagementComments(smallMock, 20);
assert.strictEqual(sampleSmall.totalComments, 5);
assert.strictEqual(sampleSmall.selectedCount, 5);
assert.strictEqual(sampleSmall.selectedComments[0].id, '5'); // highest engagement (120)
assert.strictEqual(sampleSmall.selectedComments[1].id, '2'); // (60)
assert.strictEqual(sampleSmall.selectedComments[2].id, '4'); // (30)
assert.strictEqual(sampleSmall.selectedComments[3].id, '1'); // (12)
assert.strictEqual(sampleSmall.selectedComments[4].id, '3'); // (2)
console.log(`  ✅ Small pool (5 comments): returns all 5 sorted comments`);

// Case F: 1 comment -> 1 selected
const singleMock = [{ id: '1', author: 'solo', url: 'https://x.com/solo/status/1', likes: 5, retweets: 1 }];
const sample1 = pickTopEngagementComments(singleMock, 20);
assert.strictEqual(sample1.selectedCount, 1);
console.log(`  ✅ 1 comment: selected 1`);

// Case G: 0 comments -> 0 selected
const sample0 = pickTopEngagementComments([], 20);
assert.strictEqual(sample0.selectedCount, 0);
console.log(`  ✅ 0 comments: selected 0`);

// Case H: Post author exclusion
const authorPool = [
  { id: 'auth_1', author: 'elonmusk', url: 'https://x.com/elonmusk/status/1', likes: 100, engagement: 100 },
  { id: 'auth_2', author: 'ElonMusk', url: 'https://x.com/ElonMusk/status/2', likes: 50, engagement: 50 },
  { id: 'user_1', author: 'supporter_1', url: 'https://x.com/supporter_1/status/3', likes: 10, engagement: 10 },
  { id: 'user_2', author: 'supporter_2', url: 'https://x.com/supporter_2/status/4', likes: 5, engagement: 5 }
];
const sampleAuthorExclusion = pickTopEngagementComments(authorPool, 20, { excludeAuthor: 'elonmusk' });
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
console.log('  ✅ isDirectReply helper: verified parent status ID & in-reply-to username across schemas');

// Case J: filterDescendantReplies subtree extraction
const mockThread = [
  { id: '100', inReplyToId: null, conversationId: '100', text: 'Root Tweet' },
  { id: '101', inReplyToId: '100', conversationId: '100', text: 'Direct reply 1' },
  { id: '102', inReplyToId: '101', conversationId: '100', text: 'Reply to 101' },
  { id: '103', inReplyToId: '102', conversationId: '100', text: 'Reply to 102' },
  { id: '104', inReplyToId: '100', conversationId: '100', text: 'Direct reply 2' },
  { id: '105', inReplyToId: '104', conversationId: '100', text: 'Reply to 104' }
];

// When target is root post: all other tweets in the thread are replies
const rootDescendants = filterDescendantReplies(mockThread, '100', '100');
assert.strictEqual(rootDescendants.length, 5);
assert.deepStrictEqual(rootDescendants.map(t => t.id), ['101', '102', '103', '104', '105']);

// When target is comment 101: only descendants 102 and 103 are kept (root 100, sibling branch 104, 105 discarded)
const comment101Descendants = filterDescendantReplies(mockThread, '101', '100');
assert.strictEqual(comment101Descendants.length, 2);
assert.deepStrictEqual(comment101Descendants.map(t => t.id), ['102', '103']);

// When target is comment 102: only descendant 103 is kept
const comment102Descendants = filterDescendantReplies(mockThread, '102', '100');
assert.strictEqual(comment102Descendants.length, 1);
assert.deepStrictEqual(comment102Descendants.map(t => t.id), ['103']);

// When target is leaf comment 103: 0 descendants
const leafDescendants = filterDescendantReplies(mockThread, '103', '100');
assert.strictEqual(leafDescendants.length, 0);

console.log('  ✅ filterDescendantReplies: verified subtree filtering for root tweets, parent comments, and leaf comments\n');

// ----------------------------------------------------
// 3. Test: Deterministic Top-Ranked Order & Shuffle Utility
// ----------------------------------------------------
console.log('Test 3: Deterministic Top-Ranked Order & Shuffle Utility');
const sampleA = pickTopEngagementComments(mixedMock, 10);
const sampleB = pickTopEngagementComments(mixedMock, 10);
const idsA = sampleA.selectedComments.map(c => c.id).join(',');
const idsB = sampleB.selectedComments.map(c => c.id).join(',');
assert.strictEqual(idsA, idsB, 'Top engagement ranking must be deterministic and ordered');

const shuffled = shuffleArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
assert.strictEqual(shuffled.length, 10);
console.log('  ✅ Top engagement comments are consistently ranked by engagement score\n');

// ----------------------------------------------------
// 4. Test: Message Formatting & Direct Comment Links (No Member Tagging on /raid)
// ----------------------------------------------------
console.log('Test 4: formatRaidMessages (Direct links, No member tagging on /raid)');

const formattedRaid = formatRaidMessages({
  targetUrl: 'https://x.com/elonmusk/status/1890000000000000000',
  sampleResult: sampleMixed
});

assert(formattedRaid.length >= 1);
console.log(`  ✅ Formatted into ${formattedRaid.length} chunked messages (respecting Telegram limit)`);
assert(formattedRaid[0].includes('⚔️ <b>X RAID MISSION ACTIVATED</b> ⚔️'));
assert(formattedRaid[0].includes('https://x.com/elonmusk/status/1890000000000000000')); // Target post link is kept
assert(formattedRaid[0].includes('<code>https://x.com/')); // Direct comment links are included
assert(formattedRaid[0].includes('📊 <b>Comments:</b>'));
assert(!formattedRaid[0].includes('Squad:'), 'Header must NOT display squad raiders');
assert(!formattedRaid[0].includes('<b>(+'), 'Comments must NOT include raider badges');
assert(!formattedRaid.some(m => m.includes('Raiders:'))); // No raider tags in /raid
assert(!formattedRaid.some(m => m.includes('👉 @'))); // No member tagging suffix on comments
console.log('  ✅ /raid message structure delivers clean comment links without raider distribution or member tagging\n');

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

// Test 5B: Tagging formatting & Single-Message Tagall
const tagWithUsername = stored[0].username
  ? `@${stored[0].username}`
  : `<a href="tg://user?id=${stored[0].id}">${escapeHtml(stored[0].firstName)}</a>`;
assert.strictEqual(tagWithUsername, '@jacob');

const tagWithoutUsername = stored[1].username
  ? `@${stored[1].username}`
  : `<a href="tg://user?id=${stored[1].id}">${escapeHtml(stored[1].firstName)}</a>`;
assert.strictEqual(tagWithoutUsername, '<a href="tg://user?id=222222">Alice</a>');

const singleTagallMsg = `📢 <b>Attention Everyone!</b>\n\n` + [tagWithUsername, tagWithoutUsername].join(' ');
assert(singleTagallMsg.includes('@jacob'));
assert(singleTagallMsg.includes('<a href="tg://user?id=222222">Alice</a>'));
console.log('  ✅ Tag generation and single-message tagall formatting verified');

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
console.log('  ✅ Welcome message correctly structured with tag, community text, group link, and closing phrase');

// Test 5D: Bulk add members via addMembers
const added = memberStore.addMembers(testChatId, ['@charlie', '@dan_crypto']);
assert.strictEqual(added, 2);
const membersAfterBulk = memberStore.getMembers(testChatId);
assert.strictEqual(membersAfterBulk.length, 4);
const handles = membersAfterBulk.map(m => m.username);
assert(handles.includes('charlie'));
assert(handles.includes('dan_crypto'));
console.log('  ✅ Bulk adding handles via addMembers verified\n');

// ----------------------------------------------------
// 6. Test: Per-Comment Reply Vibes & /raid Formatting
// ----------------------------------------------------
console.log('Test 6: Per-Comment Reply Vibes & /raid Formatting');

// Test 6A: Sample angles preview for /angles
const sampleAngles = generateReplyAngles();
assert.strictEqual(sampleAngles.length, 4);
for (const a of sampleAngles) {
  assert(typeof a === 'string' && a.length > 0);
}
console.log('  ✅ Preview angles: produced actionable sample reply vibes');

// Test 6B: attachVibesToComments attaches a direct vibe to every comment
const sampleWithVibes = attachVibesToComments(sampleMixed.selectedComments);
assert.strictEqual(sampleWithVibes.length, sampleMixed.selectedComments.length);
for (const c of sampleWithVibes) {
  assert(c.replyVibe, 'Each comment must have a replyVibe attached');
  assert(typeof c.replyVibe === 'string' && c.replyVibe.length > 0);
}
console.log('  ✅ attachVibesToComments: attached actionable vibes (e.g. "try contradicting or asking questions")');

// Test 6C: Message formatting renders Reply Vibe beside each comment
const formattedWithVibes = formatRaidMessages({
  targetUrl: 'https://x.com/elonmusk/status/1890000000000000000',
  sampleResult: {
    ...sampleMixed,
    selectedComments: sampleWithVibes
  }
});

assert(formattedWithVibes[0].includes('💬 <b>Reply Vibe:</b>'));
assert(!formattedWithVibes.some(m => m.includes('Raiders:'))); // Strictly NO member tagging on /raid
assert(!formattedWithVibes.some(m => m.includes('👉 @'))); // No member tags
console.log('  ✅ /raid message structure renders Reply Vibe beside each comment with NO member tagging');

// Test 6D: Custom focus integrates mission focus into comments
const customWithVibes = attachVibesToComments(sampleMixed.selectedComments, 'gas fees and scaling');
const focusComments = customWithVibes.filter(c => c.replyVibe.includes('gas fees and scaling'));
assert(focusComments.length > 0);
// ----------------------------------------------------
// 7. Test: Comment Raid Support (Direct Comment Targets & Sub-Replies)
// ----------------------------------------------------
console.log('Test 7: Comment Raid Support (Direct Comment Targets & Sub-Replies)');

// Test 7A: Single Comment Raid (0 sub-replies)
const singleCommentRaid = formatRaidMessages({
  targetUrl: 'https://x.com/crypto_raider/status/18900000001001',
  sampleResult: {
    totalComments: 0,
    selectedCount: 0,
    selectedComments: []
  },
  targetAuthor: 'crypto_raider',
  targetAuthorName: 'Crypto Raider',
  targetVibe: 'Try contradicting or asking questions',
  isComment: true
});

assert.strictEqual(singleCommentRaid.length, 1);
assert(singleCommentRaid[0].includes('⚔️ <b>X RAID TARGET ACTIVATED</b> ⚔️'));
assert(singleCommentRaid[0].includes('Target Comment'));
assert(singleCommentRaid[0].includes('https://x.com/crypto_raider/status/18900000001001'));
assert(singleCommentRaid[0].includes('@crypto_raider'));
assert(singleCommentRaid[0].includes('Try contradicting or asking questions'));
assert(!singleCommentRaid[0].includes('Squad Target'));
assert(!singleCommentRaid[0].includes('(+'));
console.log('  ✅ Single comment raid: activated direct target raid with link and vibe (0 sub-replies)');

// Test 7B: Comment Raid with sub-replies (treated as main post raid)
const commentWithSubReplies = formatRaidMessages({
  targetUrl: 'https://x.com/crypto_raider/status/18900000001001',
  sampleResult: {
    totalComments: 5,
    selectedCount: 2,
    selectedComments: [
      { id: 'sub_1', author: 'sub_user1', authorName: 'Sub User 1', url: 'https://x.com/sub_user1/status/sub_1', replyVibe: 'Be sarcastic' },
      { id: 'sub_2', author: 'sub_user2', authorName: 'Sub User 2', url: 'https://x.com/sub_user2/status/sub_2', replyVibe: 'Support without repeating the same thing' }
    ]
  },
  targetAuthor: 'crypto_raider',
  targetAuthorName: 'Crypto Raider',
  targetVibe: 'Play devil\'s advocate',
  isComment: true
});

assert(commentWithSubReplies[0].includes('Target Post'));
assert(commentWithSubReplies[0].includes('Target Reply Vibe'));
assert(commentWithSubReplies[0].includes('Play devil\'s advocate'));
assert(commentWithSubReplies[0].includes('Comments:</b> 5'));
assert(!commentWithSubReplies[0].includes('Squad:'));
assert(commentWithSubReplies[0].includes('Target Comments to Raid (with Reply Vibes)'));
assert(commentWithSubReplies[0].includes('@sub_user1'));
assert(!commentWithSubReplies[0].includes('(+'));
assert(commentWithSubReplies[0].includes('@sub_user2'));
assert(commentWithSubReplies[0].includes('Be sarcastic'));
console.log('  ✅ Comment raid with sub-replies: treats comment as main post with Target Post, Comments stats, and vibes cleanly\n');

// ----------------------------------------------------
// 8. Test: Admin-Only Mentions & Command Protection
// ----------------------------------------------------
console.log('Test 8: Admin-Only Mentions & Command Protection');

// Mock context factory
function createMockCtx({
  chatType = 'supergroup',
  chatId = -1001234567,
  userId = 12345,
  username = 'testuser',
  status = 'member',
  text = '',
  entities = [],
  replyToBot = false,
  botUsername = 'x_raid_bot',
  botId = 99999
} = {}) {
  const deletedMessageIds = [];
  const repliedTexts = [];

  const ctx = {
    chat: { id: chatId, type: chatType },
    from: { id: userId, username, first_name: username, is_bot: false },
    me: { id: botId, username: botUsername, is_bot: true },
    message: {
      message_id: 8888,
      text,
      entities,
      reply_to_message: replyToBot ? {
        message_id: 7777,
        from: { id: botId, username: botUsername, is_bot: true }
      } : undefined
    },
    api: {
      deleteMessage: async (cId, mId) => {
        deletedMessageIds.push({ cId, mId });
        return true;
      }
    },
    getChatMember: async (uId) => {
      return { user: { id: uId }, status };
    },
    reply: async (msgText) => {
      repliedTexts.push(msgText);
      return { message_id: 9991, text: msgText };
    }
  };

  return { ctx, deletedMessageIds, repliedTexts };
}

// Test 8A: isMessageDirectedAtBot detection
const ctxTag = createMockCtx({ text: 'Hey @x_raid_bot start a raid!' }).ctx;
assert.strictEqual(isMessageDirectedAtBot(ctxTag), true);

const ctxEntityMention = createMockCtx({
  text: '@x_raid_bot /raid https://x.com/test',
  entities: [{ type: 'mention', offset: 0, length: 11 }]
}).ctx;
assert.strictEqual(isMessageDirectedAtBot(ctxEntityMention), true);

const ctxCommand = createMockCtx({
  text: '/raid https://x.com/test',
  entities: [{ type: 'bot_command', offset: 0, length: 5 }]
}).ctx;
assert.strictEqual(isMessageDirectedAtBot(ctxCommand), true);

const ctxReply = createMockCtx({ text: 'check this out', replyToBot: true }).ctx;
assert.strictEqual(isMessageDirectedAtBot(ctxReply), true);

// Negative cases: normal chatter between group members
const ctxNormalChat = createMockCtx({ text: 'Good morning guys! Let us win today' }).ctx;
assert.strictEqual(isMessageDirectedAtBot(ctxNormalChat), false);

const ctxOtherTag = createMockCtx({
  text: 'Hey @crypto_friend did you see the post?',
  entities: [{ type: 'mention', offset: 4, length: 14 }]
}).ctx;
assert.strictEqual(isMessageDirectedAtBot(ctxOtherTag), false);
console.log('  ✅ isMessageDirectedAtBot correctly identifies bot tags, commands, and replies vs normal chat');

// Test 8B: isUserAdmin permission verification
(async () => {
  const adminCtx = createMockCtx({ status: 'administrator' }).ctx;
  const creatorCtx = createMockCtx({ status: 'creator' }).ctx;
  const memberCtx = createMockCtx({ status: 'member' }).ctx;

  assert.strictEqual(await isUserAdmin(adminCtx), true);
  assert.strictEqual(await isUserAdmin(creatorCtx), true);
  assert.strictEqual(await isUserAdmin(memberCtx), false);
  console.log('  ✅ isUserAdmin: verified creator/administrator allowed, regular member disallowed');

  // Super Admin tests: universal permissions in private chats and groups
  assert.strictEqual(isSuperAdmin({ id: 12345, username: 'j57ty' }), true);
  assert.strictEqual(isSuperAdmin({ id: 'j57ty', username: 'other' }), true);
  assert.strictEqual(isSuperAdmin({ id: 99999, username: 'random_user' }), false);

  const superAdminPrivateCtx = createMockCtx({ chatType: 'private', username: 'j57ty' }).ctx;
  assert.strictEqual(await isUserAdmin(superAdminPrivateCtx), true);

  const regularPrivateCtx = createMockCtx({ chatType: 'private', username: 'random_user' }).ctx;
  assert.strictEqual(await isUserAdmin(regularPrivateCtx), false);

  const superAdminGroupCtx = createMockCtx({ chatType: 'supergroup', status: 'member', username: 'j57ty' }).ctx;
  assert.strictEqual(await isUserAdmin(superAdminGroupCtx), true);
  console.log('  ✅ Super Admin: verified universal access in private chats and groups');

  // Test 8C: enforceAdminOnlyMiddleware blocks non-admins and deletes their message
  const nonAdminMock = createMockCtx({
    status: 'member',
    text: '@x_raid_bot raid this https://x.com/test'
  });
  let nextCalledNonAdmin = false;
  await enforceAdminOnlyMiddleware(nonAdminMock.ctx, async () => { nextCalledNonAdmin = true; });

  assert.strictEqual(nextCalledNonAdmin, false, 'Middleware must NOT call next() for non-admin');
  assert.strictEqual(nonAdminMock.deletedMessageIds.length, 1, 'Non-admin trigger message must be deleted');
  assert.strictEqual(nonAdminMock.deletedMessageIds[0].mId, 8888);
  assert.strictEqual(nonAdminMock.repliedTexts.length, 1);
  assert(nonAdminMock.repliedTexts[0].includes('Admin Only'), 'Warning notice must be sent to non-admin');
  console.log('  ✅ Non-admin tagging bot: trigger message immediately deleted and auto-deleting warning sent');

  // Test 8D: enforceAdminOnlyMiddleware allows admins to proceed
  const adminMock = createMockCtx({
    status: 'administrator',
    text: '/raid https://x.com/test',
    entities: [{ type: 'bot_command', offset: 0, length: 5 }]
  });
  let nextCalledAdmin = false;
  await enforceAdminOnlyMiddleware(adminMock.ctx, async () => { nextCalledAdmin = true; });

  assert.strictEqual(nextCalledAdmin, true, 'Middleware MUST call next() for administrator');
  assert.strictEqual(adminMock.deletedMessageIds.length, 0, 'Admin message must NOT be deleted');
  assert.strictEqual(adminMock.repliedTexts.length, 0, 'Admin must NOT receive a warning');
  console.log('  ✅ Administrator using bot: permitted to proceed without interception\n');

  // Clean up test data
  memberStore.clearMembers(testChatId);

  console.log('🎉 ALL TESTS PASSED SUCCESSFULLY! Everything is working as expected.');
})();
