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
 * Strategy 3: Third-Party API (e.g., twitterapi.io).
 */
async function fetchRepliesViaThirdParty(tweetId) {
  if (!config.TWITTERAPI_IO_KEY) {
    throw new Error('TWITTERAPI_IO_KEY not configured.');
  }

  const response = await axios.get('https://api.twitterapi.io/twitter/tweet/replies', {
    params: { tweetId },
    headers: { 'X-API-Key': config.TWITTERAPI_IO_KEY },
    timeout: 15000
  });

  const comments = [];
  const tweets = response.data?.tweets || response.data?.replies || [];
  for (const tweet of tweets) {
    if (tweet.id && String(tweet.id) !== String(tweetId)) {
      const author = tweet.author?.userName || tweet.userName || 'user';
      comments.push({
        id: tweet.id,
        author,
        text: tweet.text || '',
        url: `https://x.com/${author}/status/${tweet.id}`
      });
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
 * Main export: Fetches replies of a given tweet ID using available methods.
 * 
 * @param {string} tweetId 
 * @returns {Promise<Array<Object>>} List of comment objects
 */
async function getTweetComments(tweetId) {
  // If test mode is enabled, return simulated comments
  if (config.TEST_MODE) {
    console.log(`[XService] TEST_MODE active: Generating simulated replies for tweet ${tweetId}`);
    return generateMockComments(tweetId, 25);
  }

  // 1. Try Third-Party API if key exists
  if (config.TWITTERAPI_IO_KEY) {
    try {
      console.log(`[XService] Fetching replies via Third-Party API for tweet ${tweetId}...`);
      const results = await fetchRepliesViaThirdParty(tweetId);
      if (results && results.length > 0) return results;
    } catch (err) {
      console.warn(`[XService] Third-Party API failed: ${err.message}. Falling back to cookies.`);
    }
  }

  // 2. Try agent-twitter-client Scraper with cookies / auth
  if (config.TWITTER_AUTH_TOKEN || config.TWITTER_USERNAME) {
    try {
      console.log(`[XService] Fetching replies via X conversation search for tweet ${tweetId}...`);
      const results = await fetchRepliesViaScraper(tweetId);
      if (results && results.length > 0) return results;
    } catch (err) {
      console.warn(`[XService] Scraper search failed: ${err.message}. Trying direct GraphQL...`);
    }

    // 3. Fallback to direct GraphQL
    try {
      console.log(`[XService] Fetching replies via X GraphQL for tweet ${tweetId}...`);
      const results = await fetchRepliesViaGraphQL(tweetId);
      if (results && results.length > 0) return results;
    } catch (err) {
      console.warn(`[XService] Direct GraphQL failed: ${err.message}`);
    }
  }

  // If no credentials configured, notify and provide mock for testing
  if (!config.TWITTER_AUTH_TOKEN && !config.TWITTER_USERNAME && !config.TWITTERAPI_IO_KEY) {
    console.warn(`[XService] Notice: No X credentials configured in .env. Falling back to test simulation mode.`);
    return generateMockComments(tweetId, 25);
  }

  return [];
}

module.exports = {
  parseTweetUrl,
  getTweetComments,
  generateMockComments
};
