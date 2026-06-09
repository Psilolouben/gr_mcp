'use strict';

const puppeteer = require('puppeteer-core');

const EXECUTABLE_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
const BASE_URL = 'https://thegamerules.com/epitrapezia-paixnidia';
const MAX_PAGES = 30;
const MAX_RETRIES = 2;

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

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

async function fetchPage(browser, pageNum) {
  const url = `${BASE_URL}?fq=1&page=${pageNum}`;
  const page = await openPage(browser);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 0 });
    await page.waitForSelector('.name', { timeout: 0 });
    const names = await page.$$eval('.name', (els) =>
      els.map((el) => el.textContent.trim()).filter(Boolean)
    );
    return names;
  } finally {
    await page.close().catch(() => {});
  }
}

async function scrapeGames() {
  const games = new Set();
  let browser = await launchBrowser();

  try {
    for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
      console.log(`Fetching page ${pageNum}…`);

      let names = null;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          names = await fetchPage(browser, pageNum);
          break; // success
        } catch (err) {
          console.warn(`Page ${pageNum} attempt ${attempt} failed: ${err.message}`);
          // If browser crashed, relaunch before retrying
          if (err.name === 'TargetCloseError' || err.message.includes('Target closed')) {
            await browser.close().catch(() => {});
            browser = await launchBrowser();
          }
          if (attempt === MAX_RETRIES) {
            console.error(`Page ${pageNum}: giving up after ${MAX_RETRIES} attempts.`);
            names = [];
          }
        }
      }

      if (names.length === 0) {
        console.log(`Page ${pageNum}: empty — done.`);
        break;
      }

      names.forEach((n) => games.add(n));
      console.log(`Page ${pageNum}: ${names.length} games`);
    }
  } finally {
    await browser.close().catch(() => {});
  }

  return [...games].sort();
}

module.exports = { scrapeGames };
