# gr-scraper-mcp — Deployment Guide

## 1. Upstash Redis (free tier)

1. Go to [upstash.com](https://upstash.com) → create account → **Create Database**
2. Pick a region close to your Render region
3. Copy **REST URL** and **REST Token** from the database console

## 2. Telegram bot

1. Message [@BotFather](https://t.me/BotFather) → `/newbot` → follow prompts
2. Copy the **bot token** (looks like `123456:ABC-def...`)
3. To get push notifications, message your bot once, then visit:
   `https://api.telegram.org/bot<TOKEN>/getUpdates`
   and copy the `chat.id` from the response → that's your `TELEGRAM_CHAT_ID`
4. Provide the bot token when prompted in step 3 below

**Bot commands:**
- `/check` — scrape now and reply with what changed (~1 min)
- `/status` — show how many games are tracked without scraping

## 3. Deploy to Render

1. Push this folder (`gr-scraper-mcp/`) to a GitHub repo (can be a subfolder of your existing repo)
2. In [Render dashboard](https://render.com) → **New → Web Service**
3. Connect your GitHub repo → set **Root directory** to `gr-scraper-mcp`
4. Render will detect the `Dockerfile` automatically
5. Under **Environment**, add these variables:

   | Key | Value |
   |-----|-------|
   | `UPSTASH_REDIS_REST_URL` | from step 1 |
   | `UPSTASH_REDIS_REST_TOKEN` | from step 1 |
   | `TELEGRAM_BOT_TOKEN` | from step 2 |
   | `TELEGRAM_CHAT_ID` | (optional) your chat ID for push alerts |

6. Deploy — first build takes ~3 min (installs Chromium)

## 4. Connect to Claude (Cowork / Claude Code)

Add the MCP server in your Claude settings:

```json
{
  "mcpServers": {
    "gr-scraper": {
      "url": "https://your-render-service.onrender.com/mcp"
    }
  }
}
```

The server exposes one tool: **`check_game_changes`**

## Notes

- The scrape visits up to 30 pages with `networkidle2` — allow ~60–90 seconds
- Render's **Starter** plan ($7/mo) is recommended; the free plan spins down after inactivity and Chromium needs RAM
- Upstash free tier is 10K commands/day — well within limits for occasional checks
- To run locally: `cp .env.example .env` → fill in values → `npm install` → `npm start` (needs Chromium at `/usr/bin/chromium` or set `PUPPETEER_EXECUTABLE_PATH`)
