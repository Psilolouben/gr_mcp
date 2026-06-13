'use strict';

const puppeteer = require('puppeteer-core');

const EXECUTABLE_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
const MAX_PAGES = 30;
const MAX_RETRIES = 2;

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const BLOCKED_URLS = [
  '*.png', '*.jpg', '*.jpeg', '*.gif', '*.svg', '*.webp',
  '*.css', '*.woff', '*.woff2', '*.ttf', '*.eot',
];

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
  // Block images/fonts/styles via CDP — no per-request interception overhead
  const client = await page.target().createCDPSession();
  await client.send('Network.setBlockedURLs', { urls: BLOCKED_URLS });
  return page;
}

// One page per section, reused across all page navigations (mirrors local Ruby script)
async function scrapeSection(browser, section) {
  const games = new Set();
  let page = await openPage(browser);

  for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
    const url = section.buildUrl(pageNum);
    console.log(`[${section.name}] Fetching page ${pageNum}…`);

    let names = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
        await page.waitForSelector('.name', { timeout: 30_000 });
        names = await page.$$eval('.name', (els) =>
          els.map((el) => el.textContent.trim()).filter(Boolean)
        );
        break;
      } catch (err) {
        const isSelectorTimeout = err.message.includes('waiting for selector');
        const isNavTimeout = err.name === 'TimeoutError' && !isSelectorTimeout;
        const isCrash = err.name === 'TargetCloseError' || err.message.includes('Target closed');

        if (isSelectorTimeout) {
          console.log(`[${section.name}] Page ${pageNum}: no products — done.`);
          names = [];
          break;
        }

        console.warn(`[${section.name}] Page ${pageNum} attempt ${attempt} failed: ${err.message}`);

        if (isCrash) {
          await page.close().catch(() => {});
          await browser.close().catch(() => {});
          browser = await launchBrowser();
          page = await openPage(browser);
        }

        if (attempt === MAX_RETRIES) {
          if (isNavTimeout) {
            console.log(`[${section.name}] Page ${pageNum}: nav timeout after retries — done.`);
          } else {
            console.error(`[${section.name}] Page ${pageNum}: giving up.`);
          }
          names = [];
        }
      }
    }

    if (names.length === 0) break;

    names.forEach((n) => games.add(n));
    console.log(`[${section.name}] Page ${pageNum}: ${names.length} games`);
  }

  await page.close().catch(() => {});
  return { games, browser };
}

async function scrapeGames() {
  const all = new Set();
  let browser = await launchBrowser();

  try {
    for (const section of SECTIONS) {
      const result = await scrapeSection(browser, section);
      browser = result.browser; // track any relaunched browser
      result.games.forEach((g) => all.add(g));
      console.log(`[${section.name}] total: ${result.games.size}`);
    }
  } finally {
    await browser.close().catch(() => {});
  }

  return [...all].sort();
}

module.exports = { scrapeGames };
