'use strict';

const { load } = require('cheerio');
const TelegramBot = require('node-telegram-bot-api');
const { checkGameChanges } = require('./checker');
const { getStoredGames } = require('./storage');
const { pushTelegramUpdate, formatResult } = require('./telegram-push');

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Live search on thegamerules.com for a specific title.
 * Used as fallback when the Redis snapshot returns no results.
 * Returns array of matching product names, or null on error.
 */
async function liveSearch(query) {
  const url = `https://thegamerules.com/index.php?route=product/search&search=${encodeURIComponent(query)}&description=true`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const $ = load(html);
  const names = [];
  $('.name').each((_, el) => {
    const t = $(el).text().trim();
    if (t) names.push(t);
  });
  // Filter to results that actually match the query (search can return broad results)
  return names.filter((n) => n.toLowerCase().includes(query.toLowerCase()));
}

let bot;

/**
 * Handle an incoming Telegram update object (called from the webhook route).
 */
async function handleUpdate(update) {
  bot.processUpdate(update);
}

/**
 * Register webhook with Telegram and wire up command handlers.
 * Must be called after the Express server is listening so the URL is reachable.
 */
async function startTelegramBot(webhookBaseUrl) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log('TELEGRAM_BOT_TOKEN not set — Telegram bot disabled.');
    return;
  }

  // No polling — we receive updates via webhook
  bot = new TelegramBot(token, { polling: false });

  const webhookUrl = `${webhookBaseUrl}/telegram/webhook`;
  await bot.setWebHook(webhookUrl);
  console.log(`Telegram webhook registered: ${webhookUrl}`);

  // /check — run a full scrape and reply
  bot.onText(/\/check/, async (msg) => {
    const chatId = msg.chat.id;
    await bot.sendMessage(chatId, '🔍 Scraping thegamerules.com… this takes ~1 min.');
    try {
      const result = await checkGameChanges();
      await bot.sendMessage(chatId, formatResult(result), { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('Telegram /check error:', err);
      await bot.sendMessage(chatId, `❌ Error: ${err.message}`);
    }
  });

  // /status — show stored game count without scraping
  bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;
    try {
      const stored = await getStoredGames();
      await bot.sendMessage(
        chatId,
        `📦 Currently tracking *${stored.length}* games in storage.`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      await bot.sendMessage(chatId, `❌ Error: ${err.message}`);
    }
  });

  // /find <title> — check if a specific game is in stock
  bot.onText(/\/find (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const query = match[1].trim();
    try {
      const stored = await getStoredGames();
      const results = stored.filter((g) => g.toLowerCase().includes(query.toLowerCase()));
      if (results.length > 0) {
        await bot.sendMessage(
          chatId,
          `✅ Found ${results.length} match(es) for "*${query}*":\n\n${results.map((g) => `  • ${g}`).join('\n')}`,
          { parse_mode: 'Markdown' }
        );
      } else {
        // Not in snapshot — try a live search (catches uncategorized products like Revive)
        await bot.sendMessage(chatId, `🔎 Not in snapshot, doing live search for "*${query}*"…`, { parse_mode: 'Markdown' });
        const live = await liveSearch(query);
        if (live.length > 0) {
          await bot.sendMessage(
            chatId,
            `✅ Found on site (not yet in snapshot):\n\n${live.map((g) => `  • ${g}`).join('\n')}`,
            { parse_mode: 'Markdown' }
          );
        } else {
          await bot.sendMessage(chatId, `❌ "*${query}*" not found anywhere on thegamerules.com.`, { parse_mode: 'Markdown' });
        }
      }
    } catch (err) {
      await bot.sendMessage(chatId, `❌ Error: ${err.message}`);
    }
  });

  // Natural language fallback — any plain message gets routed by keyword
  bot.on('message', async (msg) => {
    if (msg.text && msg.text.startsWith('/')) return; // already handled above

    const text = (msg.text || '').toLowerCase();
    const chatId = msg.chat.id;

    if (/status|how many|count|stored/.test(text)) {
      try {
        const stored = await getStoredGames();
        await bot.sendMessage(
          chatId,
          `📦 Currently tracking *${stored.length}* games in storage.`,
          { parse_mode: 'Markdown' }
        );
      } catch (err) {
        await bot.sendMessage(chatId, `❌ Error: ${err.message}`);
      }
    } else if (/is .+ available|do you have|in stock|find|search/.test(text)) {
      // Looks like an availability question — extract the likely title
      // Strip common question words and search what's left
      const query = text
        .replace(/is\s+|do you have\s+|in stock.*|available.*|find\s+|search\s+/g, '')
        .replace(/["""'']/g, '')
        .trim();
      try {
        const stored = await getStoredGames();
        const results = stored.filter((g) => g.toLowerCase().includes(query));
        if (results.length > 0) {
          await bot.sendMessage(
            chatId,
            `✅ Found ${results.length} match(es) for "*${query}*":\n\n${results.map((g) => `  • ${g}`).join('\n')}`,
            { parse_mode: 'Markdown' }
          );
        } else {
          // Fallback: live search
          const live = await liveSearch(query);
          if (live.length > 0) {
            await bot.sendMessage(
              chatId,
              `✅ Found on site (not yet in snapshot):\n\n${live.map((g) => `  • ${g}`).join('\n')}`,
              { parse_mode: 'Markdown' }
            );
          } else {
            await bot.sendMessage(chatId, `❌ "*${query}*" not found anywhere on thegamerules.com.`, { parse_mode: 'Markdown' });
          }
        }
      } catch (err) {
        await bot.sendMessage(chatId, `❌ Error: ${err.message}`);
      }
    } else {
      // Default: trigger a full scan
      await bot.sendMessage(chatId, '🔍 Scraping thegamerules.com… this takes ~1 min.');
      try {
        const result = await checkGameChanges();
        await bot.sendMessage(chatId, formatResult(result), { parse_mode: 'Markdown' });
      } catch (err) {
        console.error('Telegram message error:', err);
        await bot.sendMessage(chatId, `❌ Error: ${err.message}`);
      }
    }
  });

  return bot;
}

module.exports = { startTelegramBot, pushTelegramUpdate, handleUpdate };
