# gr-scraper-mcp

MCP server that tracks live board game inventory on [thegamerules.com](https://thegamerules.com). On each run it scrapes the full catalogue, diffs it against the last stored snapshot, and reports what was added and what was removed. Deployed on Render, backed by Upstash Redis, with a Telegram bot interface.

## How it works

1. Puppeteer launches a headless Chromium browser and visits the product listing pages
2. Images, fonts, stylesheets, and tracking scripts are blocked to speed up rendering
3. The scraper waits for `.name` elements to appear, then collects all game titles
4. The live list is compared against the snapshot stored in Redis
5. Added and removed games are returned, and the snapshot is updated

## MCP tool

| Tool | Description |
|------|-------------|
| `check_game_changes` | Scrape live games, diff against stored snapshot, update storage. Returns `added`, `removed`, `total`, `stored_before`. |

## Telegram bot

| Command | Action |
|---------|--------|
| `/check` | Trigger a scrape and reply with what changed |
| `/status` | Show stored game count without scraping |
| Any other message | Treated as a `/check` request |

If `TELEGRAM_CHAT_ID` is set, the bot also pushes a notification whenever the MCP tool is called from Claude.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `UPSTASH_REDIS_REST_URL` | ✅ | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | ✅ | Upstash Redis REST token |
| `TELEGRAM_BOT_TOKEN` | ✅ | Token from @BotFather |
| `TELEGRAM_CHAT_ID` | Optional | Chat ID for push notifications |

## Setup

See [DEPLOY.md](./DEPLOY.md) for full step-by-step deployment instructions.

## Local development

```bash
cp .env.example .env   # fill in your credentials
npm install
npm start              # requires Chromium at /usr/bin/chromium
                       # or set PUPPETEER_EXECUTABLE_PATH
```

## Stack

- **Runtime**: Node.js 20
- **MCP**: `@modelcontextprotocol/sdk` over HTTP (Streamable HTTP transport)
- **Browser**: Puppeteer Core + system Chromium
- **Storage**: Upstash Redis
- **Bot**: `node-telegram-bot-api` (webhook mode)
- **Deployment**: Render (Docker, web service)
