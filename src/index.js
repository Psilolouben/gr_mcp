'use strict';

const express = require('express');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { checkGameChanges } = require('./checker');
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

// ── Express HTTP server ───────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// Health check for Render
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

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
