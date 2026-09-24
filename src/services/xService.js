const axios = require('axios');
const { Scraper } = require('agent-twitter-client');
const config = require('../config');

// Standard X Public Web Client Bearer Token
const X_BEARER_TOKEN = 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

/**
 * Parses an X (Twitter) URL to extract username and tweet status ID.
 * Supports x.com and twitter.com URLs with or without query strings.
 * 
 * @param {string} url 
 * @returns {{ username: string, tweetId: string, cleanUrl: string } | null}
 */
function parseTweetUrl(url) {
  if (!url || typeof url !== 'string') return null;

  const trimmed = url.trim();
  const match = trimmed.match(/(?:twitter\.com|x\.com)\/(?:#!\/)?([a-zA-Z0-9_]+)\/status(?:es)?\/(\d+)/i);
  
  if (!match) return null;

  return {
    username: match[1],
    tweetId: match[2],
    cleanUrl: `https://x.com/${match[1]}/status/${match[2]}`
  };
}

/**
 * Safely extracts parent tweet ID from any known field variations.
 */
function extractParentTweetId(tweet) {
  if (!tweet) return null;
  if (tweet.inReplyToStatusId) return String(tweet.inReplyToStatusId);
  if (tweet.in_reply_to_status_id) return String(tweet.in_reply_to_status_id);
  if (tweet.in_reply_to_status_id_str) return String(tweet.in_reply_to_status_id_str);
  if (tweet.inReplyToId) return String(tweet.inReplyToId);
  if (tweet.in_reply_to_id) return String(tweet.in_reply_to_id);
  if (tweet.inReplyToTweetId) return String(tweet.inReplyToTweetId);
  if (tweet.replyToTweetId) return String(tweet.replyToTweetId);
  if (tweet.parentTweetId) return String(tweet.parentTweetId);
  if (tweet.parentId) return String(tweet.parentId);
  if (tweet.inReplyTo?.id) return String(tweet.inReplyTo.id);
  if (tweet.inReplyTo?.statusId) return String(tweet.inReplyTo.statusId);
  if (tweet.legacy?.in_reply_to_status_id_str) return String(tweet.legacy.in_reply_to_status_id_str);
  if (tweet.legacy?.in_reply_to_status_id) return String(tweet.legacy.in_reply_to_status_id);
  if (Array.isArray(tweet.referenced_tweets)) {
    const replied = tweet.referenced_tweets.find(r => r.type === 'replied_to');
    if (replied && replied.id) return String(replied.id);
  }
  if (Array.isArray(tweet.referencedTweets)) {
    const replied = tweet.referencedTweets.find(r => r.type === 'replied_to');
    if (replied && replied.id) return String(replied.id);
  }
  return null;
}

/**
 * Safely extracts in-reply-to username from any known field variations.
 */
function extractInReplyToScreenName(tweet) {
  if (!tweet) return null;
  const val = tweet.in_reply_to_screen_name || tweet.inReplyToScreenName || 
              tweet.in_reply_to_username || tweet.inReplyToUsername ||
              tweet.inReplyTo?.userName || tweet.inReplyTo?.username || tweet.inReplyTo?.screen_name ||
              tweet.legacy?.in_reply_to_screen_name;
  return val ? String(val).toLowerCase().replace(/^@/, '') : null;
}

/**
 * Determines if a tweet reply is a direct top-level comment to target post,
 * rather than a nested sub-reply to another commenter in the thread.
 */
function isDirectReply(tweet, targetTweetId, postAuthor = null) {
  if (!tweet) return false;

  const parentId = extractParentTweetId(tweet);
  if (parentId && String(parentId) !== String(targetTweetId)) {
    return false;
  }

  if (postAuthor) {
    const normPostAuthor = String(postAuthor).toLowerCase().replace(/^@/, '');
    const replyToUser = extractInReplyToScreenName(tweet);
    if (replyToUser && replyToUser !== normPostAuthor) {
      return false;
    }
  }

  return true;
}

/**
 * Initializes and authenticates an agent-twitter-client Scraper instance.
 */
let scraperInstance = null;
async function getAuthenticatedScraper() {
  if (scraperInstance) return scraperInstance;

  const scraper = new Scraper();

  if (config.TWITTER_AUTH_TOKEN && config.TWITTER_CT0) {
    const cookies = [
      `auth_token=${config.TWITTER_AUTH_TOKEN}; Domain=.twitter.com; Path=/`,
      `ct0=${config.TWITTER_CT0}; Domain=.twitter.com; Path=/`
    ];
    await scraper.setCookies(cookies);
    console.log('[XService] Initialized Scraper using auth_token & ct0 cookies.');
  } else if (config.TWITTER_USERNAME && config.TWITTER_PASSWORD) {
    await scraper.login(config.TWITTER_USERNAME, config.TWITTER_PASSWORD, config.TWITTER_EMAIL);
    console.log('[XService] Logged in to Twitter using username/password.');
  }

  scraperInstance = scraper;
  return scraper;
}

/**
 * Strategy 1: Fetch replies using conversation_id search on X.
 */
async function fetchRepliesViaScraper(tweetId, postAuthor = null, maxResults = 100) {
  const scraper = await getAuthenticatedScraper();
  const comments = [];

  const query = `conversation_id:${tweetId}`;
  const tweetIterator = scraper.searchTweets(query, maxResults);

  for await (const tweet of tweetIterator) {
    if (!tweet.id || String(tweet.id) === String(tweetId)) {
      continue;
    }

    const username = tweet.username || 'x_user';
    const normAuthor = String(username).toLowerCase().replace(/^@/, '');

    // 1. Exclude author comments
    if (postAuthor && normAuthor === String(postAuthor).toLowerCase().replace(/^@/, '')) {
      continue;
    }

    // 2. Exclude nested sub-replies if configured
    if (config.EXCLUDE_NESTED_REPLIES && !isDirectReply(tweet, tweetId, postAuthor)) {
      continue;
    }

    const authorName = tweet.name || username;
    const likes = Number(tweet.likes) || 0;
    const retweets = Number(tweet.retweets) || 0;
    const replies = Number(tweet.replies) || 0;
    const views = Number(tweet.views) || 0;
    const quotes = Number(tweet.quotes) || 0;
    comments.push({
      id: tweet.id,
      author: username,
      authorName,
      text: tweet.text || '',
      url: `https://x.com/${username}/status/${tweet.id}`,
      likes,
      retweets,
      replies,
      views,
      quotes,
      inReplyToStatusId: extractParentTweetId(tweet) || tweetId,
      engagement: likes + retweets + replies + quotes
    });
  }

  return comments;
}

/**
 * Strategy 2: Direct GraphQL TweetDetail via axios.
 */
async function fetchRepliesViaGraphQL(tweetId, postAuthor = null) {
  if (!config.TWITTER_AUTH_TOKEN || !config.TWITTER_CT0) {
    throw new Error('TWITTER_AUTH_TOKEN and TWITTER_CT0 are required for direct GraphQL.');
  }

  const queryId = '5GOHG62WSor32omqqDxFDw'; // TweetDetail query ID
  const url = `https://x.com/i/api/graphql/${queryId}/TweetDetail`;

  const variables = {
    focalTweetId: tweetId,
    with_rux_injections: false,
    rankingMode: "Relevance",
    includePromotedContent: false,
    withCommunity: true,
    withQuickPromoteEligibilityTweetFields: false,
    withBirdwatchNotes: true,
    withVoice: true
  };

  const features = {
    rweb_tipjar_consumption_enabled: true,
    responsive_web_graphql_exclude_directive_enabled: true,
    verified_phone_label_enabled: false,
    creator_subscriptions_tweet_preview_api_enabled: true,
    responsive_web_graphql_timeline_navigation_enabled: true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    tweetypie_unmention_optimization_enabled: true,
    responsive_web_edit_tweet_api_enabled: true,
    graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
    view_counts_everywhere_api_enabled: true,
    longform_notetweets_consumption_enabled: true,
    responsive_web_twitter_article_tweet_consumption_enabled: true,
    tweet_awards_web_tipping_enabled: false,
    freedom_of_speech_not_reached_appeal_enabled: true,
    standardized_nudges_misinfo: true,
    longform_notetweets_rich_text_read_enabled: true,
    responsive_web_enhance_cards_enabled: false
  };

  const response = await axios.get(url, {
    params: {
      variables: JSON.stringify(variables),
      features: JSON.stringify(features)
    },
    headers: {
      'authorization': X_BEARER_TOKEN,
      'x-csrf-token': config.TWITTER_CT0,
      'cookie': `auth_token=${config.TWITTER_AUTH_TOKEN}; ct0=${config.TWITTER_CT0};`,
      'x-twitter-active-user': 'yes',
      'x-twitter-auth-type': 'OAuth2Session',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    timeout: 15000
  });

  const comments = [];
  const instructions = response.data?.data?.threaded_conversation_with_injections_v2?.instructions || [];

  for (const instr of instructions) {
    if (instr.type === 'TimelineAddEntries' && Array.isArray(instr.entries)) {
      for (const entry of instr.entries) {
        // Items in conversation thread
        const items = entry.content?.items || [];
        for (const item of items) {
          const tweetResult = item.item?.itemContent?.tweet_results?.result;
          if (tweetResult && tweetResult.legacy) {
            const commentId = tweetResult.legacy.id_str;
            if (!commentId || String(commentId) === String(tweetId)) {
              continue;
            }

            const author = tweetResult.core?.user_results?.result?.legacy?.screen_name || 'user';
            const normAuthor = String(author).toLowerCase().replace(/^@/, '');

            // 1. Exclude post author
            if (postAuthor && normAuthor === String(postAuthor).toLowerCase().replace(/^@/, '')) {
              continue;
            }

            // 2. Exclude nested sub-replies if configured
            if (config.EXCLUDE_NESTED_REPLIES && !isDirectReply(tweetResult, tweetId, postAuthor)) {
              continue;
            }

            const authorName = tweetResult.core?.user_results?.result?.legacy?.name || author;
            const likes = Number(tweetResult.legacy.favorite_count) || 0;
            const retweets = Number(tweetResult.legacy.retweet_count) || 0;
            const replies = Number(tweetResult.legacy.reply_count) || 0;
            const quotes = Number(tweetResult.legacy.quote_count) || 0;
            const views = parseInt(tweetResult.views?.count || '0', 10) || 0;

            comments.push({
              id: commentId,
              author,
              authorName,
              text: tweetResult.legacy.full_text || '',
              url: `https://x.com/${author}/status/${commentId}`,
              likes,
              retweets,
              replies,
              views,
              quotes,
              inReplyToStatusId: extractParentTweetId(tweetResult) || tweetId,
              engagement: likes + retweets + replies + quotes
            });
          }
        }
      }
    }
  }

  return comments;
}

/**
 * Strategy 3: Third-Party API (e.g., twitterapi.io) with multi-page cursor pagination.
 */
async function fetchRepliesViaThirdParty(tweetId, postAuthor = null, maxPages = config.MAX_SCAN_PAGES, onProgress = null) {
  if (!config.TWITTERAPI_IO_KEY) {
    throw new Error('TWITTERAPI_IO_KEY not configured.');
  }

  const comments = [];
  let cursor = null;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  for (let page = 1; page <= maxPages; page++) {
    const params = { tweetId };
    if (cursor) {
      params.cursor = cursor;
    }

    try {
      console.log(`[TwitterAPI.io] Fetching replies page ${page}/${maxPages} for tweet ${tweetId}...`);
      const response = await axios.get('https://api.twitterapi.io/twitter/tweet/replies', {
        params,
        headers: { 'X-API-Key': config.TWITTERAPI_IO_KEY },
        timeout: 25000
      });

      const tweets = response.data?.tweets || response.data?.replies || [];
      for (const tweet of tweets) {
        if (!tweet.id || String(tweet.id) === String(tweetId)) {
          continue;
        }

        const author = tweet.author?.userName || tweet.userName || tweet.author?.username || 'user';
        const normAuthor = String(author).toLowerCase().replace(/^@/, '');

        // 1. Exclude author comments under their own post
        if (postAuthor && normAuthor === String(postAuthor).toLowerCase().replace(/^@/, '')) {
          continue;
        }

        // 2. Exclude nested sub-replies (replies to other commenters) if configured
        if (config.EXCLUDE_NESTED_REPLIES && !isDirectReply(tweet, tweetId, postAuthor)) {
          continue;
        }

        const authorName = tweet.author?.name || tweet.name || author;
        const rawUrl = tweet.url || tweet.twitterUrl || `https://x.com/${author}/status/${tweet.id}`;
        const likes = Number(tweet.likeCount ?? tweet.likes ?? tweet.favoriteCount ?? tweet.favorite_count ?? 0);
        const retweets = Number(tweet.retweetCount ?? tweet.retweets ?? 0);
        const replies = Number(tweet.replyCount ?? tweet.replies ?? 0);
        const views = Number(tweet.viewCount ?? tweet.views ?? 0);
        const quotes = Number(tweet.quoteCount ?? tweet.quotes ?? 0);
        comments.push({
          id: String(tweet.id),
          author,
          authorName,
          text: tweet.text || '',
          url: rawUrl.replace('twitter.com', 'x.com'),
          likes,
          retweets,
          replies,
          views,
          quotes,
          inReplyToStatusId: extractParentTweetId(tweet) || tweetId,
          engagement: likes + retweets + replies + quotes
        });
      }

      // Notify progress if callback provided - reflects ONLY direct comments!
      if (onProgress && typeof onProgress === 'function') {
        try {
          await onProgress(comments.length, page);
        } catch (e) {
          // ignore progress update errors
        }
      }

      // Check if there is another page
      if (!response.data?.has_next_page || !response.data?.next_cursor) {
        break;
      }

      cursor = response.data.next_cursor;

      // Respect TwitterAPI.io free-tier QPS limit (1 request every 5 seconds)
      if (page < maxPages) {
        await sleep(5500);
      }
    } catch (err) {
      console.warn(`[TwitterAPI.io] Page ${page} failed:`, err.response?.data?.message || err.message);
      // If we already got real comments from previous page, keep them!
      if (comments.length > 0) {
        break;
      }
      if (err.response?.status === 402 || err.response?.data?.message?.includes('Credits is not enough')) {
        throw new Error('💳 <b>Twitter API Credits Exhausted</b>: Your free starter credits on TwitterAPI.io have been used up. Please top up your balance at twitterapi.io or generate a new API key.');
      }
      if (err.response?.status === 429) {
        throw new Error('Twitter API rate limit: The free tier allows 1 request every 5 seconds. Please wait 5 seconds and retry.');
      }
      throw err;
    }
  }

  return comments;
}

/**
 * Strategy 4: Simulated / Test Mock Comments Generator.
 * Used for testing Telegram admin permissions and 40% sampling when no credentials are provided.
 */
function generateMockComments(tweetId, count = 25, postAuthor = null) {
  const mockAuthors = [
    { name: 'Crypto Raider', username: 'crypto_raider' },
    { name: 'Alpha Hunter', username: 'alpha_hunter' },
    { name: 'Web3 Degens', username: 'web3_degens' },
    { name: 'Sol Whale', username: 'sol_whale' },
    { name: 'ETH Maximalist', username: 'eth_maximalist' },
    { name: 'DeFi King', username: 'defi_king' },
    { name: 'Meme God', username: 'meme_god' },
    { name: 'NFT Flipper', username: 'nft_flipper' },
    { name: 'Bullish Trader', username: 'bullish_trader' },
    { name: 'Block Explorer', username: 'block_explorer' },
    { name: 'Satoshi Fan', username: 'satoshi_fan' },
    { name: 'Token Scout', username: 'token_scout' },
    { name: 'Super Holder', username: 'super_holder' },
    { name: 'Airdrop Sniper', username: 'airdrop_sniper' },
    { name: 'Yield Farmer', username: 'yield_farmer' },
    { name: 'DAO Governor', username: 'dao_governor' },
    { name: 'Laser Eyes', username: 'laser_eyes' },
    { name: 'Meta Builder', username: 'meta_builder' },
    { name: 'Base Enjoyer', username: 'base_enjoyer' },
    { name: 'Hype Machine', username: 'hype_machine' }
  ];

  const comments = [];
  const normPostAuthor = postAuthor ? String(postAuthor).toLowerCase().replace(/^@/, '') : null;

  for (let i = 1; i <= count; i++) {
    const item = mockAuthors[(i - 1) % mockAuthors.length];
    const author = item.username + (i > mockAuthors.length ? i : '');
    if (normPostAuthor && author.toLowerCase() === normPostAuthor) {
      continue;
    }

    const authorName = item.name + (i > mockAuthors.length ? ` #${i}` : '');
    const commentId = `${tweetId.slice(0, 10)}${1000 + i}`;
    const hasTraction = (i % 2 === 0) || (i % 5 === 0);
    const likes = hasTraction ? (i * 7) % 65 + 1 : 0;
    const retweets = hasTraction ? (i * 3) % 15 : 0;
    const replies = hasTraction ? (i * 2) % 8 : 0;
    const views = hasTraction ? (i * 120) % 2500 + 30 : 0;
    const quotes = hasTraction ? (i % 4) : 0;

    comments.push({
      id: commentId,
      author,
      authorName,
      text: `Mock reply #${i} supporting this post! Let's raid! 🚀`,
      url: `https://x.com/${author}/status/${commentId}`,
      likes,
      retweets,
      replies,
      views,
      quotes,
      inReplyToStatusId: tweetId,
      engagement: likes + retweets + replies + quotes
    });
  }

  return comments;
}

/**
 * Helper to wrap any promise with a strict timeout
 */
function withTimeout(promise, ms, operationName = 'Operation') {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${ms / 1000}s`));
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

/**
 * Main export: Fetches replies of a given tweet ID using available methods.
 * 
 * @param {string} tweetId 
 * @param {string|Function} [postAuthorOrOnProgress] 
 * @param {Function} [maybeOnProgress] 
 * @returns {Promise<{ comments: Array<Object>, warning?: string }>}
 */
async function getTweetComments(tweetId, postAuthorOrOnProgress = null, maybeOnProgress = null) {
  let postAuthor = null;
  let onProgress = null;

  if (typeof postAuthorOrOnProgress === 'function') {
    onProgress = postAuthorOrOnProgress;
  } else {
    postAuthor = postAuthorOrOnProgress;
    if (typeof maybeOnProgress === 'function') {
      onProgress = maybeOnProgress;
    }
  }

  // 1. Always prioritize live Third-Party API if key exists (Live real replies, no bans)
  if (config.TWITTERAPI_IO_KEY) {
    try {
      const scanTimeoutMs = Math.max(120000, (config.MAX_SCAN_PAGES * 6500) + 30000);
      console.log(`[XService] Fetching real live replies via TwitterAPI.io for tweet ${tweetId} (maxPages: ${config.MAX_SCAN_PAGES}, timeout: ${scanTimeoutMs / 1000}s)...`);
      const results = await withTimeout(
        fetchRepliesViaThirdParty(tweetId, postAuthor, config.MAX_SCAN_PAGES, onProgress),
        scanTimeoutMs,
        'TwitterAPI.io'
      );
      if (results && results.length > 0) {
        console.log(`[XService] Successfully retrieved ${results.length} direct comments for tweet ${tweetId}`);
        return { comments: results };
      }
      return { comments: [] };
    } catch (err) {
      console.error(`[XService] Live Twitter API failed:`, err.message);
      // DO NOT silently fall back to fake comments! Report the actual reason to user.
      throw new Error(err.message || 'Failed to fetch comments from Twitter API.');
    }
  }

  // 2. Try Scraper / GraphQL with cookies if configured
  if (config.TWITTER_AUTH_TOKEN) {
    let authError = null;

    try {
      console.log(`[XService] Attempting direct GraphQL for tweet ${tweetId}...`);
      const results = await withTimeout(fetchRepliesViaGraphQL(tweetId, postAuthor), 8000, 'Direct GraphQL');
      if (results && results.length > 0) return { comments: results };
    } catch (err) {
      console.warn(`[XService] GraphQL failed: ${err.message}`);
      if (err.response?.status === 401 || err.response?.status === 403 || err.response?.data?.errors?.[0]?.message?.includes('suspended')) {
        authError = 'X account suspended or session expired';
      }
    }

    try {
      console.log(`[XService] Attempting conversation search for tweet ${tweetId}...`);
      const results = await withTimeout(fetchRepliesViaScraper(tweetId, postAuthor), 8000, 'Scraper search');
      if (results && results.length > 0) return { comments: results };
    } catch (err) {
      console.warn(`[XService] Scraper search failed: ${err.message}`);
      if (err.message?.includes('suspended') || err.message?.includes('401') || err.message?.includes('403')) {
        authError = 'X account suspended or session expired';
      }
    }

    if (authError) {
      throw new Error(`⚠️ **X Account Suspended / Expired Session**: X flagged the session cookies. Use an API Key (e.g. from twitterapi.io).`);
    }
  }

  // 3. Fallback to test simulation ONLY if no credentials at all
  console.warn(`[XService] Notice: No credentials configured, using simulation mode.`);
  return {
    comments: generateMockComments(tweetId, 25, postAuthor),
    warning: '🧪 Simulated test comments (No API key found in configuration).'
  };
}

module.exports = {
  parseTweetUrl,
  extractParentTweetId,
  extractInReplyToScreenName,
  isDirectReply,
  getTweetComments,
  generateMockComments
};
