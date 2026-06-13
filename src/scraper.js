'use strict';

const { load } = require('cheerio');

const MAX_PAGES = 30;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2_000;

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(url) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      console.warn(`Fetch attempt ${attempt} failed (${err.message}), retrying…`);
      await sleep(RETRY_DELAY_MS);
    }
  }
}

async function scrapeSection(section) {
  const games = new Set();

  for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
    const url = section.buildUrl(pageNum);
    console.log(`[${section.name}] Fetching page ${pageNum}…`);

    let html;
    try {
      html = await fetchPage(url);
    } catch (err) {
      console.error(`[${section.name}] Page ${pageNum}: failed after retries — ${err.message}`);
      break;
    }

    const $ = load(html);
    const names = [];
    $('.name').each((_, el) => {
      const t = $(el).text().trim();
      if (t) names.push(t);
    });

    if (names.length === 0) {
      console.log(`[${section.name}] Page ${pageNum}: no products — done.`);
      break;
    }

    names.forEach((n) => games.add(n));
    console.log(`[${section.name}] Page ${pageNum}: ${names.length} games`);
  }

  return games;
}

async function scrapeGames() {
  const all = new Set();

  for (const section of SECTIONS) {
    const games = await scrapeSection(section);
    games.forEach((g) => all.add(g));
    console.log(`[${section.name}] total: ${games.size}`);
  }

  return [...all].sort();
}

module.exports = { scrapeGames };
