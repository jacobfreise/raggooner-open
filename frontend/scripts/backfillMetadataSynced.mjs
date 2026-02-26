#!/usr/bin/env node

/**
 * Sets metadataSynced = true on all completed tournaments.
 *
 * Usage:
 *   node scripts/backfillMetadataSynced.mjs              # emulator
 *   node scripts/backfillMetadataSynced.mjs --live        # production
 *   node scripts/backfillMetadataSynced.mjs --dry-run     # preview only
 */

import { confirmLiveMode, initDb, listAll, updateDoc, DRY_RUN, IS_LIVE } from './config.mjs';

async function main() {
  await confirmLiveMode();
  initDb();

  const tournaments = await listAll('tournaments');
  const completed = tournaments.filter(t => t.status === 'completed' && !t.metadataSynced);

  console.log(`Found ${completed.length} completed tournament(s) missing metadataSynced flag.\n`);

  if (completed.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  for (const t of completed) {
    console.log(`  ${DRY_RUN ? '[DRY-RUN] ' : ''}Setting metadataSynced on: ${t.name || t.id}`);
    if (!DRY_RUN) {
      await updateDoc('tournaments', t.id, { metadataSynced: true });
    }
  }

  console.log(`\nDone. ${DRY_RUN ? '(dry-run, no writes made)' : `Updated ${completed.length} tournament(s).`}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
