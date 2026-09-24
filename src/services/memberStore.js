const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'members.json');

// Ensure storage directory exists
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (err) {
      console.warn('[MemberStore] Could not create data directory:', err.message);
    }
  }
}

// Load members cache from file safely
function loadData() {
  ensureDataDir();
  if (!fs.existsSync(DATA_FILE)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[MemberStore] Error reading members file, resetting in-memory cache:', err.message);
    return {};
  }
}

// Persist data safely
function saveData(data) {
  try {
    ensureDataDir();
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn('[MemberStore] Error saving members:', err.message);
  }
}

// In-memory cache
let cache = loadData();

/**
 * Records or updates a member for a given chat.
 * 
 * @param {string|number} chatId 
 * @param {Object} user - Telegram User object
 */
function recordMember(chatId, user) {
  if (!chatId || !user || user.is_bot) return;

  const key = String(chatId);
  if (!cache[key]) {
    cache[key] = {};
  }

  cache[key][String(user.id)] = {
    id: user.id,
    username: user.username ? user.username.replace(/^@/, '') : null,
    firstName: user.first_name || '',
    lastName: user.last_name || '',
    lastSeen: Date.now()
  };

  saveData(cache);
}

/**
 * Retrieves all known members for a chat.
 * 
 * @param {string|number} chatId 
 * @returns {Array<Object>}
 */
function getMembers(chatId) {
  const key = String(chatId);
  if (!cache[key]) return [];
  return Object.values(cache[key]);
}

/**
 * Clears the member list for a chat.
 * 
 * @param {string|number} chatId 
 */
function clearMembers(chatId) {
  const key = String(chatId);
  if (cache[key]) {
    delete cache[key];
    saveData(cache);
  }
}

/**
 * Manually sets raiders for a chat (e.g. via /setraiders).
 * 
 * @param {string|number} chatId 
 * @param {Array<Object>} raiders 
 */
function setRaiders(chatId, raiders) {
  const key = String(chatId);
  cache[key] = {};
  for (const r of raiders) {
    const id = r.id || `manual_${r.username || Math.random()}`;
    cache[key][String(id)] = {
      id,
      username: r.username ? r.username.replace(/^@/, '') : null,
      firstName: r.firstName || r.username || 'Raider',
      lastName: r.lastName || '',
      lastSeen: Date.now()
    };
  }
  saveData(cache);
}

module.exports = {
  recordMember,
  getMembers,
  clearMembers,
  setRaiders
};
