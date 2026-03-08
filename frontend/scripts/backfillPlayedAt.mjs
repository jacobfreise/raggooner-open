#!/usr/bin/env node

/**
 * Backfills playedAt on tournaments that are active or completed but missing the field,
 * using createdAt as a fallback value.
 *
 * Usage:
 *   node scripts/backfillPlayedAt.mjs              # emulator
 *   node scripts/backfillPlayedAt.mjs --live        # production
 *   node scripts/backfillPlayedAt.mjs --dry-run     # preview only
 */

import { confirmLiveMode, initDb, listAll, updateDoc, DRY_RUN } from './config.mjs';

async function main() {
  await confirmLiveMode();
  initDb();

  const tournaments = await listAll('tournaments');
  const missing = tournaments.filter(
    t => (t.status === 'active' || t.status === 'completed') && !t.playedAt
  );

  console.log(`Found ${missing.length} tournament(s) missing playedAt.\n`);

  if (missing.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  for (const t of missing) {
    const playedAt = t.createdAt;
    console.log(`  ${DRY_RUN ? '[DRY-RUN] ' : ''}${t.name || t.id}  →  playedAt = ${playedAt}`);
    if (!DRY_RUN) {
      await updateDoc('tournaments', t.id, { playedAt });
    }
  }

  console.log(`\nDone. ${DRY_RUN ? '(dry-run, no writes made)' : `Updated ${missing.length} tournament(s).`}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
