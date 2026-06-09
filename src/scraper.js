'use strict';

const puppeteer = require('puppeteer-core');

const EXECUTABLE_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
const BASE_URL = 'https://thegamerules.com/epitrapezia-paixnidia';
const MAX_PAGES = 30;

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function scrapeGames() {
  const browser = await puppeteer.launch({
    executablePath: EXECUTABLE_PATH,
    headless: true,
    protocolTimeout: 600_000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const games = new Set();

  try {
    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);

    // Block resources that don't affect product rendering
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'stylesheet', 'font', 'media', 'other'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
      const url = `${BASE_URL}?fq=1&page=${pageNum}`;
      console.log(`Fetching page ${pageNum}…`);

      // domcontentloaded fires early; then we wait specifically for .name to render
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 0 });
      await page.waitForSelector('.name', { timeout: 0 });

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
