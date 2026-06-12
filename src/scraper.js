'use strict';

const puppeteer = require('puppeteer-core');

const EXECUTABLE_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
const MAX_PAGES = 30;
const MAX_RETRIES = 2;

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Sections to scrape — add more entries here to extend coverage
const SECTIONS = [
  {
    name: 'Board Games',
    buildUrl: (page) => `https://thegamerules.com/epitrapezia-paixnidia?fq=1&page=${page}`,
  },
  {
    name: 'New Arrivals',
    buildUrl: (page) =>
      `https://thegamerules.com/index.php?route=product/search&search=&description=true&fq=1&page=${page}`,
  },
];

async function launchBrowser() {
  return puppeteer.launch({
    executablePath: EXECUTABLE_PATH,
    headless: true,
    protocolTimeout: 600_000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
}

async function openPage(browser) {
  const page = await browser.newPage();
  await page.setUserAgent(USER_AGENT);
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (['image', 'stylesheet', 'font', 'media', 'other'].includes(req.resourceType())) {
      req.abort();
    } else {
      req.continue();
    }
  });
  return page;
}

async function fetchPage(browser, url) {
  const page = await openPage(browser);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 0 });
    // 30s to find .name — timeout means page doesn't exist
    await page.waitForSelector('.name', { timeout: 30_000 });
    return await page.$$eval('.name', (els) =>
      els.map((el) => el.textContent.trim()).filter(Boolean)
    );
  } finally {
    await page.close().catch(() => {});
  }
}

async function scrapeSection(browser, section) {
  const games = new Set();

  for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
    const url = section.buildUrl(pageNum);
    console.log(`[${section.name}] Fetching page ${pageNum}…`);

    let names = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        names = await fetchPage(browser, url);
        break;
      } catch (err) {
        const isTimeout = err.name === 'TimeoutError' || err.message.includes('waiting for selector');
        const isCrash = err.name === 'TargetCloseError' || err.message.includes('Target closed');

        if (isTimeout) {
          console.log(`[${section.name}] Page ${pageNum}: no products — done.`);
          names = [];
          break;
        }

        console.warn(`[${section.name}] Page ${pageNum} attempt ${attempt} failed: ${err.message}`);

        if (isCrash) {
          await browser.close().catch(() => {});
          browser = await launchBrowser();
        }

        if (attempt === MAX_RETRIES) {
          console.error(`[${section.name}] Page ${pageNum}: giving up.`);
          names = [];
        }
      }
    }

    if (names.length === 0) break;

    names.forEach((n) => games.add(n));
    console.log(`[${section.name}] Page ${pageNum}: ${names.length} games`);
  }

  return games;
}

async function scrapeGames() {
  const all = new Set();
  let browser = await launchBrowser();

  try {
    for (const section of SECTIONS) {
      const games = await scrapeSection(browser, section);
      games.forEach((g) => all.add(g));
      console.log(`[${section.name}] total: ${games.size}`);
    }
  } finally {
    await browser.close().catch(() => {});
  }

  return [...all].sort();
}

module.exports = { scrapeGames };
