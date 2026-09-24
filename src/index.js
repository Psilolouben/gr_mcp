'use strict';

const express = require('express');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { checkGameChanges } = require('./checker');
const { getStoredGames } = require('./storage');
const { startTelegramBot, pushTelegramUpdate, handleUpdate } = require('./telegram');

// ── MCP Server setup ──────────────────────────────────────────────────────────

const mcpServer = new McpServer({
  name: 'gr-scraper',
  version: '1.0.0',
});

mcpServer.tool(
  'check_game_changes',
  'Scrape thegamerules.com for live board games, compare to the last stored snapshot, and return what was added and removed. Also updates the stored snapshot. Takes ~1 minute to complete.',
  {},
  async () => {
    const result = await checkGameChanges();

    await pushTelegramUpdate(result).catch((err) =>
      console.error('Telegram push error:', err)
    );

    const summary = [
      result.added.length === 0 && result.removed.length === 0
        ? 'No changes since last check.'
        : '',
      result.added.length > 0
        ? `Added (${result.added.length}):\n${result.added.map((g) => `  + ${g}`).join('\n')}`
        : 'No games added.',
      result.removed.length > 0
        ? `Removed (${result.removed.length}):\n${result.removed.map((g) => `  - ${g}`).join('\n')}`
        : 'No games removed.',
      `\nTotal on site: ${result.total} | Previously tracked: ${result.stored_before}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    return { content: [{ type: 'text', text: summary }] };
  }
);

mcpServer.tool(
  'get_available_games',
  'Return the full list of currently available board games from the last stored snapshot (updated hourly). Fast — reads from Redis, no scraping. Optionally filter by a search term.',
  {
    search: {
      type: 'string',
      description: 'Optional title filter — returns only games whose name contains this string (case-insensitive).',
      optional: true,
    },
  },
  async ({ search }) => {
    const games = await getStoredGames();
    const filtered = search
      ? games.filter((g) => g.toLowerCase().includes(search.toLowerCase()))
      : games;

    const header = search
      ? `${filtered.length} game(s) matching "${search}" (snapshot may be up to 1 hour old):`
      : `${filtered.length} games currently available (snapshot may be up to 1 hour old):`;

    return {
      content: [{ type: 'text', text: `${header}\n\n${filtered.join('\n')}` }],
    };
  }
);

// ── Express HTTP server ───────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// Health check for Render
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Cron trigger — called by cron-job.org every hour
// Protected by a simple token to prevent unauthorized triggers
app.get('/trigger', async (req, res) => {
  const token = process.env.CRON_SECRET;
  if (token && req.query.secret !== token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json({ status: 'triggered' }); // respond immediately so cron-job.org doesn't time out
  try {
    const result = await checkGameChanges();
    await pushTelegramUpdate(result).catch((err) =>
      console.error('Telegram push error:', err)
    );
  } catch (err) {
    console.error('Trigger error:', err);
  }
});

// Telegram webhook — Telegram POSTs updates here
app.post('/telegram/webhook', (req, res) => {
  res.sendStatus(200); // ack immediately
  handleUpdate(req.body).catch((err) =>
    console.error('Telegram update error:', err)
  );
});

// MCP endpoint — stateless: new transport per request
app.post('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on('close', () => transport.close());

  try {
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('MCP request error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
// RENDER_EXTERNAL_URL is set automatically by Render
const BASE_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

app.listen(PORT, async () => {
  console.log(`gr-scraper MCP server listening on port ${PORT}`);
  console.log(`  MCP endpoint: POST /mcp`);
  console.log(`  Health:       GET  /health`);
  await startTelegramBot(BASE_URL);
});
