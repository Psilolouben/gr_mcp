'use strict';

// One-off diagnostic script — NOT part of the running server.
// Run locally (or anywhere with normal network access):
//   node debug-selectors.js
// Paste the full output back for review, then delete this file once we've
// confirmed/updated the real selector in src/scraper.js.

const { load } = require('cheerio');

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const URLS = [
  { label: 'Board Games (fq=1, page 1)', url: 'https://thegamerules.com/epitrapezia-paixnidia?fq=1&page=1' },
  { label: 'Board Games (fq=1, page 2)', url: 'https://thegamerules.com/epitrapezia-paixnidia?fq=1&page=2' },
  { label: 'Board Games (no fq, page 1)', url: 'https://thegamerules.com/epitrapezia-paixnidia?page=1' },
  {
    label: 'New Arrivals (page 1)',
    url: 'https://thegamerules.com/index.php?route=product/search&search=&description=true&fq=1&page=1',
  },
  {
    label: 'Board Games (fq=1, page 1, limit=100)',
    url: 'https://thegamerules.com/epitrapezia-paixnidia?fq=1&page=1&limit=100',
  },
  {
    label: 'New Arrivals (page 1, limit=100)',
    url: 'https://thegamerules.com/index.php?route=product/search&search=&description=true&fq=1&page=1&limit=100',
  },
];

const CANDIDATE_KEYWORDS = ['name', 'title', 'product', 'card'];

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function analyze(html) {
  const $ = load(html);

  // 1. What the CURRENT scraper selector finds, as-is.
  const currentMatches = [];
  $('.name').each((_, el) => {
    const t = $(el).text().trim();
    if (t) currentMatches.push(t);
  });

  // 2. Scan every class on the page in one pass, tallying counts and
  //    grabbing a few text samples per class — no re-querying, no
  //    CSS-escaping headaches.
  const classInfo = new Map(); // class -> { count, samples: [] }
  $('[class]').each((_, el) => {
    const $el = $(el);
    const text = $el.text().trim();
    const classes = ($el.attr('class') || '').split(/\s+/).filter(Boolean);
    classes.forEach((c) => {
      if (!classInfo.has(c)) classInfo.set(c, { count: 0, samples: [] });
      const info = classInfo.get(c);
      info.count += 1;
      if (text && text.length < 120 && info.samples.length < 3) {
        info.samples.push(text);
      }
    });
  });

  const candidates = [...classInfo.entries()]
    .filter(([cls]) => CANDIDATE_KEYWORDS.some((k) => cls.toLowerCase().includes(k)))
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20);

  // 3. Rough independent cross-check: links that look like individual
  //    product pages rather than nav/category links (crude heuristic,
  //    just meant as a sanity-check number, not exact).
  const productLikeLinks = new Set();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (
      /^https:\/\/(www\.)?thegamerules\.com\/[a-z0-9-]+\/?$/i.test(href) &&
      !/^https:\/\/(www\.)?thegamerules\.com\/(index\.php|epitrapezia-paixnidia|new-arrivals|offers|blog|ola-ta-proionta)/i.test(
        href
      )
    ) {
      productLikeLinks.add(href);
    }
  });

  return {
    htmlLength: html.length,
    titleTag: $('title').text().trim(),
    currentSelectorCount: currentMatches.length,
    currentSelectorSample: currentMatches.slice(0, 5),
    candidates,
    productLikeLinkCount: productLikeLinks.size,
    productLikeLinkSample: [...productLikeLinks].slice(0, 5),
  };
}

(async () => {
  for (const { label, url } of URLS) {
    console.log('='.repeat(90));
    console.log(label);
    console.log(url);
    try {
      const html = await fetchHtml(url);
      const r = analyze(html);
      console.log(`<title>: ${r.titleTag}`);
      console.log(`HTML length: ${r.htmlLength} chars`);
      console.log(`Current ".name" selector: ${r.currentSelectorCount} matches`);
      if (r.currentSelectorSample.length) console.log('  sample:', r.currentSelectorSample);
      console.log(`Product-like links (rough heuristic): ${r.productLikeLinkCount}`);
      if (r.productLikeLinkSample.length) console.log('  sample:', r.productLikeLinkSample);
      console.log('Candidate classes (name/title/product/card-ish), by frequency:');
      if (r.candidates.length === 0) console.log('  (none found)');
      for (const [cls, info] of r.candidates) {
        console.log(`  .${cls}  — ${info.count} matches — e.g. ${JSON.stringify(info.samples)}`);
      }
    } catch (err) {
      console.log('ERROR:', err.message);
    }
    console.log('');
  }
})();
