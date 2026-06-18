'use strict';

// Lightweight Telegram push — no bot instance, no webhook, no Express needed.
// Used by GitHub Actions (and re-exported from telegram.js for the MCP server).

const TELEGRAM_MAX = 4000;

function formatList(emoji, label, items) {
  if (items.length === 0) return '';
  const header = `${emoji} *${items.length} ${label}:*`;
  const body = items.map((g) => `  • ${g}`).join('\n');
  return `${header}\n${body}`;
}

function formatResult(result) {
  const lines = [];

  if (result.added.length === 0 && result.removed.length === 0) {
    lines.push('✅ No changes — inventory is the same as last check.');
  } else {
    const added   = formatList('🟢', 'new game(s) added',   result.added);
    const removed = formatList('🔴', 'game(s) removed',     result.removed);
    if (added)   lines.push(added);
    if (removed) lines.push(removed);
  }

  lines.push('');
  lines.push(`📦 Total games on site: ${result.total}`);

  const text = lines.join('\n');
  if (text.length <= TELEGRAM_MAX) return text;

  return [
    result.added.length   > 0 ? `🟢 *${result.added.length} game(s) added*`   : '',
    result.removed.length > 0 ? `🔴 *${result.removed.length} game(s) removed*` : '',
    '',
    `📦 Total games on site: ${result.total}`,
    '',
    '_List too long for Telegram — check Claude for the full diff._',
  ].filter(Boolean).join('\n');
}

async function pushTelegramUpdate(result) {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const text = formatResult(result);
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram sendMessage failed: ${res.status} ${body}`);
  }
}

module.exports = { pushTelegramUpdate, formatResult };
