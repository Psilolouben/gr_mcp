'use strict';

// Run: node fetch-test.js
// Tests whether thegamerules.com serves product names in the initial HTML
// (no JS required). If it prints game names, we can ditch Puppeteer entirely.

const { load } = require('cheerio');

const URL = 'https://thegamerules.com/epitrapezia-paixnidia?fq=1&page=1';
const UA  = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

(async () => {
  console.log('Fetching', URL);
  const res = await fetch(URL, { headers: { 'User-Agent': UA } });
  const html = await res.text();
  console.log(`Got ${html.length} bytes, status ${res.status}`);

  const $ = load(html);
  const names = [];
  $('.name').each((_, el) => {
    const t = $(el).text().trim();
    if (t) names.push(t);
  });

  if (names.length > 0) {
    console.log(`\n✅ Found ${names.length} .name elements — server-side rendered, no Puppeteer needed!\n`);
    names.slice(0, 5).forEach(n => console.log(' ', n));
  } else {
    console.log('\n❌ No .name elements in raw HTML — JS rendering required, keep Puppeteer.\n');
    // Show a snippet to help debug
    const snippet = html.slice(0, 500);
    console.log('HTML snippet:', snippet);
  }
})();
