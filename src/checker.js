'use strict';

const { scrapeGames } = require('./scraper');
const { getStoredGames, updateStoredGames } = require('./storage');

/**
 * Core logic: scrape live games, diff against stored list, persist update.
 * @returns {{ added: string[], removed: string[], total: number, stored_before: number }}
 */
async function checkGameChanges() {
  console.log('Starting game check…');

  const [liveGames, storedGames] = await Promise.all([
    scrapeGames(),
    getStoredGames(),
  ]);

  const storedSet = new Set(storedGames);
  const liveSet = new Set(liveGames);

  const added = liveGames.filter((g) => !storedSet.has(g));
  const removed = storedGames.filter((g) => !liveSet.has(g));

  await updateStoredGames(liveGames);

  console.log(`Done. +${added.length} added, -${removed.length} removed, ${liveGames.length} total`);

  return {
    added,
    removed,
    total: liveGames.length,
    stored_before: storedGames.length,
  };
}

module.exports = { checkGameChanges };
