'use strict';

const puppeteer = require('puppeteer-core');

const EXECUTABLE_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
const BASE_URL = 'https://thegamerules.com/epitrapezia-paixnidia';
const MAX_PAGES = 30;
const CONCURRENCY = 3;       // pages fetched in parallel per batch
const BATCH_PAUSE_MS = 1000; // polite pause between batches

async function fetchPage(browserPage, pageNum) {
  const url = `${BASE_URL}?fq=1&page=${pageNum}`;
  try {
    await browserPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    // Wait for the product list to render (JS-driven site)
    await browserPage.waitForSelector('.name', { timeout: 20_000 });
    const names = await browserPage.$$eval('.name', (els) =>
      els.map((el) => el.textContent.trim()).filter(Boolean)
    );
    console.log(`Page ${pageNum}: ${names.length} games`);
    return names;
  } catch (err) {
    console.warn(`Page ${pageNum} failed: ${err.message}`);
    return [];
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
    // Pre-open CONCURRENCY pages so we reuse them across batches
    const pages = await Promise.all(
      Array.from({ length: CONCURRENCY }, () => browser.newPage())
    );
    await Promise.all(
      pages.map((p) =>
        p.setUserAgent('Mozilla/5.0 (compatible; gr-scraper-mcp/1.0)')
      )
    );

    let pageNum = 1;

    while (pageNum <= MAX_PAGES) {
      const batch = Array.from(
        { length: Math.min(CONCURRENCY, MAX_PAGES - pageNum + 1) },
        (_, i) => pageNum + i
      );

      const results = await Promise.all(
        batch.map((num, i) => fetchPage(pages[i], num))
      );

      let anyResults = false;
      for (const names of results) {
        if (names.length > 0) {
          anyResults = true;
          names.forEach((n) => games.add(n));
        }
      }

      if (!anyResults) break; // all pages in batch were empty — we're done

      pageNum += CONCURRENCY;

      if (pageNum <= MAX_PAGES) await sleep(BATCH_PAUSE_MS);
    }
  } finally {
    await browser.close();
  }

  return [...games].sort();
}

module.exports = { scrapeGames };
