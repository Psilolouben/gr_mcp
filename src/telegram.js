'use strict';

const TelegramBot = require('node-telegram-bot-api');
const { checkGameChanges } = require('./checker');
const { getStoredGames } = require('./storage');

let bot;

function formatResult(result) {
  const lines = [];

  if (result.added.length === 0 && result.removed.length === 0) {
    lines.push('✅ No changes — inventory is the same as last check.');
  } else {
    if (result.added.length > 0) {
      lines.push(`🟢 *${result.added.length} new game(s) added:*`);
      result.added.forEach((g) => lines.push(`  • ${g}`));
    }
    if (result.removed.length > 0) {
      lines.push('');
      lines.push(`🔴 *${result.removed.length} game(s) removed:*`);
      result.removed.forEach((g) => lines.push(`  • ${g}`));
    }
  }

  lines.push('');
  lines.push(`📦 Total games on site: ${result.total}`);

  return lines.join('\n');
}

/**
 * Send a diff result to the configured TELEGRAM_CHAT_ID (if set).
 */
async function pushTelegramUpdate(result) {
  if (!bot || !process.env.TELEGRAM_CHAT_ID) return;
  await bot.sendMessage(process.env.TELEGRAM_CHAT_ID, formatResult(result), {
    parse_mode: 'Markdown',
  });
}

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

  return bot;
}

module.exports = { startTelegramBot, pushTelegramUpdate, handleUpdate };
