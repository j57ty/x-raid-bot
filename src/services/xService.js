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
async function fetchRepliesViaScraper(tweetId, maxResults = 100) {
  const scraper = await getAuthenticatedScraper();
  const comments = [];

  const query = `conversation_id:${tweetId}`;
  const tweetIterator = scraper.searchTweets(query, maxResults);

  for await (const tweet of tweetIterator) {
    // Exclude the root tweet itself if it shows up in search
    if (tweet.id && String(tweet.id) !== String(tweetId)) {
      const username = tweet.username || 'x_user';
      comments.push({
        id: tweet.id,
        author: username,
        text: tweet.text || '',
        url: `https://x.com/${username}/status/${tweet.id}`
      });
    }
  }

  return comments;
}

/**
 * Strategy 2: Direct GraphQL TweetDetail via axios.
 */
async function fetchRepliesViaGraphQL(tweetId) {
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
            const author = tweetResult.core?.user_results?.result?.legacy?.screen_name || 'user';
            if (commentId && commentId !== tweetId) {
              comments.push({
                id: commentId,
                author,
                text: tweetResult.legacy.full_text || '',
                url: `https://x.com/${author}/status/${commentId}`
              });
            }
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
async function fetchRepliesViaThirdParty(tweetId, maxPages = config.MAX_SCAN_PAGES, onProgress = null) {
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
        if (tweet.id && String(tweet.id) !== String(tweetId)) {
          const author = tweet.author?.userName || tweet.userName || 'user';
          const rawUrl = tweet.url || tweet.twitterUrl || `https://x.com/${author}/status/${tweet.id}`;
          comments.push({
            id: tweet.id,
            author,
            text: tweet.text || '',
            url: rawUrl.replace('twitter.com', 'x.com')
          });
        }
      }

      // Notify progress if callback provided
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
function generateMockComments(tweetId, count = 25) {
  const mockAuthors = [
    'crypto_raider', 'alpha_hunter', 'web3_degens', 'sol_whale',
    'eth_maximalist', 'defi_king', 'meme_god', 'nft_flipper',
    'bullish_trader', 'block_explorer', 'satoshi_fan', 'token_scout',
    'super_holder', 'airdrop_sniper', 'yield_farmer', 'dao_governor',
    'laser_eyes', 'meta_builder', 'base_enjoyer', 'hype_machine'
  ];

  const comments = [];
  for (let i = 1; i <= count; i++) {
    const author = mockAuthors[(i - 1) % mockAuthors.length] + (i > mockAuthors.length ? i : '');
    const commentId = `${tweetId.slice(0, 10)}${1000 + i}`;
    comments.push({
      id: commentId,
      author,
      text: `Mock reply #${i} supporting this post! Let's raid! 🚀`,
      url: `https://x.com/${author}/status/${commentId}`
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
 * @param {Function} [onProgress] - Optional callback (count, page)
 * @returns {Promise<{ comments: Array<Object>, warning?: string }>}
 */
async function getTweetComments(tweetId, onProgress = null) {
  // 1. Always prioritize live Third-Party API if key exists (Live real replies, no bans)
  if (config.TWITTERAPI_IO_KEY) {
    try {
      console.log(`[XService] Fetching real live replies via TwitterAPI.io for tweet ${tweetId}...`);
      const results = await withTimeout(
        fetchRepliesViaThirdParty(tweetId, config.MAX_SCAN_PAGES, onProgress),
        120000,
        'TwitterAPI.io'
      );
      if (results && results.length > 0) {
        console.log(`[XService] Successfully retrieved ${results.length} real comments for tweet ${tweetId}`);
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
      const results = await withTimeout(fetchRepliesViaGraphQL(tweetId), 8000, 'Direct GraphQL');
      if (results && results.length > 0) return { comments: results };
    } catch (err) {
      console.warn(`[XService] GraphQL failed: ${err.message}`);
      if (err.response?.status === 401 || err.response?.status === 403 || err.response?.data?.errors?.[0]?.message?.includes('suspended')) {
        authError = 'X account suspended or session expired';
      }
    }

    try {
      console.log(`[XService] Attempting conversation search for tweet ${tweetId}...`);
      const results = await withTimeout(fetchRepliesViaScraper(tweetId), 8000, 'Scraper search');
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
    comments: generateMockComments(tweetId, 25),
    warning: '🧪 Simulated test comments (No API key found in configuration).'
  };
}

module.exports = {
  parseTweetUrl,
  getTweetComments,
  generateMockComments
};
