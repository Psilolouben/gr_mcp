'use strict';

const puppeteer = require('puppeteer-core');
const cheerio = require('cheerio');

const EXECUTABLE_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
const BASE_URL = 'https://thegamerules.com/epitrapezia-paixnidia';
const MAX_PAGES = 30;

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function extractNames(html) {
  const $ = cheerio.load(html);
  return $('.name')
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);
}

async function scrapeGames() {
  // ── Step 1: one real browser load to get session cookies ──────────────────
  const browser = await puppeteer.launch({
    executablePath: EXECUTABLE_PATH,
    headless: true,
    protocolTimeout: 600_000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  let cookies;
  let firstPageNames;

  try {
    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);

    // Block non-essential resources even for the warm-up page
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'stylesheet', 'font', 'media', 'other'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    console.log('Fetching page 1 (browser warm-up)…');
    await page.goto(`${BASE_URL}?fq=1&page=1`, { waitUntil: 'networkidle2', timeout: 0 });

    firstPageNames = await page.$$eval('.name', (els) =>
      els.map((el) => el.textContent.trim()).filter(Boolean)
    );

    // Grab cookies to reuse in plain HTTP requests
    cookies = await page.cookies();
  } finally {
    await browser.close();
  }

  console.log(`Page 1: ${firstPageNames.length} games (browser)`);

  const games = new Set(firstPageNames);

  if (firstPageNames.length === 0) return [];

  // ── Step 2: remaining pages via plain fetch (much faster) ─────────────────
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const headers = {
    'User-Agent': USER_AGENT,
    Cookie: cookieHeader,
    Accept: 'text/html,application/xhtml+xml',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: 'https://thegamerules.com/',
  };

  for (let pageNum = 2; pageNum <= MAX_PAGES; pageNum++) {
    const url = `${BASE_URL}?fq=1&page=${pageNum}`;
    console.log(`Fetching page ${pageNum} (fetch)…`);

    try {
      const res = await fetch(url, { headers });
      const html = await res.text();
      const names = extractNames(html);

      if (names.length === 0) {
        console.log(`Page ${pageNum}: empty — done.`);
        break;
      }

      names.forEach((n) => games.add(n));
      console.log(`Page ${pageNum}: ${names.length} games`);
    } catch (err) {
      console.warn(`Page ${pageNum} failed: ${err.message}`);
      break;
    }
  }

  return [...games].sort();
}

module.exports = { scrapeGames };
