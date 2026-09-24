require('dotenv').config();

module.exports = {
  // Telegram Bot Token (from @BotFather)
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',

  // X (Twitter) Credentials
  // Required: auth_token and ct0 from a logged-in X browser session (burner account)
  TWITTER_AUTH_TOKEN: process.env.TWITTER_AUTH_TOKEN || '',
  TWITTER_CT0: process.env.TWITTER_CT0 || '',
  
  // Optional: Twitter login credentials (if using direct login)
  TWITTER_USERNAME: process.env.TWITTER_USERNAME || '',
  TWITTER_PASSWORD: process.env.TWITTER_PASSWORD || '',
  TWITTER_EMAIL: process.env.TWITTER_EMAIL || '',

  // Third-party Twitter API (e.g., twitterapi.io or rapidapi)
  TWITTERAPI_IO_KEY: process.env.TWITTERAPI_IO_KEY || 'new1_bed66c7f5fd840ca8e72230f54751e86',

  // Bot Settings
  DEFAULT_SAMPLE_PERCENT: parseInt(process.env.DEFAULT_SAMPLE_PERCENT || '40', 10),
  MAX_LINKS_PER_MESSAGE: parseInt(process.env.MAX_LINKS_PER_MESSAGE || '15', 10),
  MAX_SCAN_PAGES: parseInt(process.env.MAX_SCAN_PAGES || '25', 10), // 25 pages = up to 500+ comments
  FILTER_ZERO_TRACTION: process.env.FILTER_ZERO_TRACTION !== 'false', // Default true: filters zero-engagement comments
  EXCLUDE_NESTED_REPLIES: process.env.EXCLUDE_NESTED_REPLIES !== 'false', // Default true: excludes nested sub-replies
  TARGETS_PER_RAIDER: parseInt(process.env.TARGETS_PER_RAIDER || '4', 10), // Targets assigned per group member (default: 4)
  GROUP_INVITE_LINK: process.env.GROUP_INVITE_LINK || '', // Optional: Group invite link for welcome message
  
  // Admin & Permission Settings
  // In private chats, allow anyone or only specific telegram user IDs
  ALLOWED_PRIVATE_USERS: process.env.ALLOWED_PRIVATE_USERS 
    ? process.env.ALLOWED_PRIVATE_USERS.split(',').map(id => id.trim()) 
    : [],
  
  // Delete non-admin warning message after seconds (0 to keep)
  DELETE_WARNING_AFTER_SECONDS: parseInt(process.env.DELETE_WARNING_AFTER_SECONDS || '8', 10),

  // Pin raid message in group
  PIN_RAID_MESSAGE: process.env.PIN_RAID_MESSAGE === 'true',

  // Test mode: if true or if no X credentials provided, simulates comment retrieval for testing
  TEST_MODE: process.env.TEST_MODE === 'true'
};
