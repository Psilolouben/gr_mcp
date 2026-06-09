'use strict';

const { Redis } = require('@upstash/redis');

const REDIS_KEY = 'gr_scraper:games';

let _redis;
function getRedis() {
  if (!_redis) {
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return _redis;
}

async function getStoredGames() {
  const data = await getRedis().get(REDIS_KEY);
  if (!data) return [];
  // Upstash auto-parses JSON, but guard against plain string
  return Array.isArray(data) ? data : JSON.parse(data);
}

async function updateStoredGames(games) {
  await getRedis().set(REDIS_KEY, JSON.stringify(games));
}

module.exports = { getStoredGames, updateStoredGames };
