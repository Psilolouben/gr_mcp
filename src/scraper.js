'use strict';

const puppeteer = require('puppeteer-core');

const EXECUTABLE_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
const BASE_URL = 'https://thegamerules.com/epitrapezia-paixnidia';
const MAX_PAGES = 30;

async function scrapeGames() {
  const browser = await puppeteer.launch({
    executablePath: EXECUTABLE_PATH,
    headless: true,
    protocolTimeout: 600_000, // 10 min — covers slow pages at the CDP level
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  const games = new Set();

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (compatible; gr-scraper-mcp/1.0)');

    // Log all XHR/fetch URLs on the first page so we can identify the product API
    page.on('response', async (res) => {
      const url = res.url();
      const type = res.request().resourceType();
      if (['xhr', 'fetch'].includes(type)) {
        console.log(`[API] ${res.status()} ${url}`);
      }
    });

    // Block everything that doesn't affect product rendering
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media', 'other'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
      const url = `${BASE_URL}?fq=1&page=${pageNum}`;
      console.log(`Fetching page ${pageNum}…`);

      // Mirror the Ruby script: wait for networkidle2, no timeout
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 0 });

      const names = await page.$$eval('.name', (els) =>
        els.map((el) => el.textContent.trim()).filter(Boolean)
      );

      if (names.length === 0) {
        console.log(`Page ${pageNum}: empty — done.`);
        break;
      }

      names.forEach((n) => games.add(n));
      console.log(`Page ${pageNum}: ${names.length} games`);
    }
  } finally {
    await browser.close();
  }

  return [...games].sort();
}

module.exports = { scrapeGames };
