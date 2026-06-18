'use strict';

const TelegramBot = require('node-telegram-bot-api');
const { checkGameChanges } = require('./checker');
const { getStoredGames } = require('./storage');
const { pushTelegramUpdate, formatResult } = require('./telegram-push');

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
    } else {
      // Default: anything else triggers a check
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
