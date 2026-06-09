'use strict';

const puppeteer = require('puppeteer-core');

const EXECUTABLE_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
const BASE_URL = 'https://thegamerules.com/epitrapezia-paixnidia';
const MAX_PAGES = 30;

async function scrapeGames() {
  const browser = await puppeteer.launch({
    executablePath: EXECUTABLE_PATH,
    headless: true,
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

    for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
      const url = `${BASE_URL}?fq=1&page=${pageNum}`;
      console.log(`Fetching page ${pageNum}…`);

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 0 });
      await page.waitForSelector('.name', { timeout: 0 });

      const names = await page.$$eval('.name', (els) =>
        els.map((el) => el.textContent.trim()).filter(Boolean)
      );

      if (names.length === 0) break;

      names.forEach((n) => games.add(n));
      console.log(`Page ${pageNum}: ${names.length} games`);
    }
  } finally {
    await browser.close();
  }

  return [...games].sort();
}

module.exports = { scrapeGames };
