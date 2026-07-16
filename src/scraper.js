'use strict';

const { load } = require('cheerio');

// The site's default page size dropped to 12 items/page at some point (was much
// higher before), which silently capped each section at MAX_PAGES * 12 products.
// `&limit=100` restores the larger page size (confirmed against the live site —
// same ".name" selector, same real product data, just 100/page instead of 12).
// MAX_PAGES is bumped up too, purely as safety headroom in case the catalog is
// ever bigger than PAGE_LIMIT * old MAX_PAGES — the "0 products" check below
// still stops the loop as soon as a section actually runs out of real pages.
const PAGE_LIMIT = 100;
const MAX_PAGES = 60;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2_000;

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const SECTIONS = [
  {
    name: 'Board Games',
    buildUrl: (page) => `https://thegamerules.com/epitrapezia-paixnidia?fq=1&page=${page}&limit=${PAGE_LIMIT}`,
  },
  {
    name: 'New Arrivals',
    buildUrl: (page) =>
      `https://thegamerules.com/index.php?route=product/search&search=&description=true&fq=1&page=${page}&limit=${PAGE_LIMIT}`,
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
  let previousSignature = null;

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
      if (pageNum === 1) {
        // Zero results on the very first page is a different signal than running
        // out of pages later: it usually means the `.name` selector no longer
        // matches anything (e.g. the site redesigned its markup and renamed the
        // class), not that the category is genuinely empty. Flag it loudly so a
        // silent selector break doesn't just look like "0 games" in the logs.
        console.warn(
          `[${section.name}] Page 1: 0 products matched — the ".name" selector likely no ` +
            `longer matches this page's markup (site redesign?), rather than the category ` +
            `being genuinely empty. Needs a manual check, not just a pagination issue.`
        );
      } else {
        console.log(`[${section.name}] Page ${pageNum}: no products — done.`);
      }
      break;
    }

    // Detect a stuck/fallback page: if this page's product list is byte-for-byte
    // identical to the previous page's, the site almost certainly isn't paginating
    // for real (e.g. an unsupported query string silently falling back to the
    // homepage, or a 404 route rendering the same content every time). Real
    // pagination should never repeat the exact same ordered list of names. Stop
    // the section instead of burning through MAX_PAGES harvesting duplicate junk.
    const signature = names.join('|');
    if (previousSignature !== null && signature === previousSignature) {
      console.warn(
        `[${section.name}] Page ${pageNum}: product list identical to page ${pageNum - 1} — ` +
          `this page is very likely not real pagination (e.g. the site silently falling back to ` +
          `another page instead of the actual listing). Stopping this section early instead of ` +
          `collecting duplicate/bogus results.`
      );
      break;
    }
    previousSignature = signature;

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
    if (games.size === 0) {
      console.error(
        `[${section.name}] ALERT: 0 games scraped for this section. Check the logs above — ` +
          `this is either a broken selector or a broken/redirecting URL, not a real empty catalog.`
      );
    }
  }

  return [...all].sort();
}

module.exports = { scrapeGames };
