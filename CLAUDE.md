# gr-scraper-mcp — Claude context

## What this is

An MCP server deployed on Render that scrapes thegamerules.com for live board game inventory, diffs against a Redis snapshot, and exposes the result via a single MCP tool and a Telegram bot.

## Project structure

```
src/
  index.js      — Express server, MCP endpoint (POST /mcp), Telegram webhook (POST /telegram/webhook)
  scraper.js    — Puppeteer scraping logic
  checker.js    — Core diff logic: scrape → compare → update → return result
  storage.js    — Upstash Redis read/write (key: gr_scraper:games)
  telegram.js   — Telegram bot (webhook mode), formatResult, pushTelegramUpdate
```

## Key decisions and why

**Puppeteer over plain HTTP**: thegamerules.com blocks datacenter requests with `X-Proxy-Error: blocked-by-allowlist`. A real browser session is required. Plain `fetch` with stolen cookies also fails — bot protection is deeper than cookie reuse.

**`domcontentloaded` + `waitForSelector('.name')`**: Faster than `networkidle2` because it doesn't wait for analytics/tracking XHRs (Google Analytics, Brevo, WonderPush, Skroutz etc.) to complete. We only wait for the product elements we actually need.

**Resource blocking**: Images, stylesheets, fonts, and media are aborted via `setRequestInterception`. Reduces noise that would otherwise delay the wait condition.

**Webhook not polling**: Telegram bot uses webhook mode (`POST /telegram/webhook`) rather than polling. Polling caused 409 conflicts on Render because overlapping deploys briefly run two instances simultaneously.

**Upstash Redis**: Render's filesystem is ephemeral — local files don't persist across deploys. Redis is the simplest persistent store. The entire game list is stored as a JSON array under the key `gr_scraper:games`.

**Stateless MCP transport**: Each `POST /mcp` request creates a new `StreamableHTTPServerTransport`. No session state needed — the single tool just runs and returns.

## The single MCP tool: `check_game_changes`

- No parameters
- Scrapes all pages (up to 30, stops on first empty page)
- Returns `{ added: string[], removed: string[], total: number, stored_before: number }`
- Pushes to Telegram if `TELEGRAM_CHAT_ID` is set
- Takes 1–3 minutes depending on site speed

## Scraping approach

The scraper reuses a single browser page and navigates sequentially (one page at a time). Parallel scraping was tried with CONCURRENCY=2 and CONCURRENCY=3 but the site throttles/blocks concurrent requests from the same IP. Sequential with resource blocking is the current sweet spot.

## Adding new tools

Add a `mcpServer.tool(name, description, schema, handler)` call in `src/index.js`. The handler receives parsed args and must return `{ content: [{ type: 'text', text: string }] }`.

## Environment variables

- `UPSTASH_REDIS_REST_URL` — Upstash REST URL
- `UPSTASH_REDIS_REST_TOKEN` — Upstash REST token
- `TELEGRAM_BOT_TOKEN` — from @BotFather
- `TELEGRAM_CHAT_ID` — optional push target
- `RENDER_EXTERNAL_URL` — set automatically by Render, used to register the Telegram webhook
- `PORT` — set automatically by Render (default 3000)
- `PUPPETEER_EXECUTABLE_PATH` — path to Chromium binary (default `/usr/bin/chromium`)

## Common failure modes

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `Navigation timeout` | Site slow or page doesn't exist | `timeout: 0` handles this; last page returns empty and loop breaks |
| `Runtime.callFunctionOn timed out` | CDP protocol timeout | `protocolTimeout: 600_000` in launch options |
| Telegram 409 Conflict | Two instances polling simultaneously | Fixed by switching to webhook mode |
| `fetch failed` on page N | Site rejects non-browser requests | Revert to full Puppeteer; don't use fetch hybrid |
| Empty diff on first run | Expected — storage was empty, all games appear as added | Normal behaviour |
| Telegram message too long | Large first-run diff | Handled: falls back to count summary if >4000 chars |
