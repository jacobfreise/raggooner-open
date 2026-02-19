#!/usr/bin/env node

/**
 * Sets up Season 1 and Season 2, then assigns all tournaments to the correct season.
 *
 * Usage:
 *   node scripts/setupSeasons.mjs                        # emulator (default)
 *   node scripts/setupSeasons.mjs --dry-run               # preview without writing
 *   node scripts/setupSeasons.mjs --live --token <TOKEN>  # live database
 */

import { confirmLiveMode, IS_LIVE, setDoc, updateDoc, listAll } from './config.mjs';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  await confirmLiveMode();

  console.log(`=== Season Setup${IS_LIVE ? ' (LIVE)' : ''}${DRY_RUN ? ' [DRY RUN]' : ''} ===\n`);

  // Step 1: Create seasons
  console.log('Step 1/3: Creating seasons...');

  const season1 = {
    id: 'season-1',
    name: 'Season 1',
    startDate: new Date('2025-09-01').toISOString(),
    endDate: new Date('2025-12-31').toISOString(),
    tournamentIds: [],
    description: 'First season',
  };

  const season2 = {
    id: 'season-2',
    name: 'Season 2',
    startDate: new Date('2026-01-01').toISOString(),
    tournamentIds: [],
    description: 'Second season',
  };

  if (!DRY_RUN) {
    await setDoc('seasons', 'season-1', season1);
    await setDoc('seasons', 'season-2', season2);
  }
  console.log('  Created Season 1 & Season 2');

  // Step 2: Fetch all tournaments and assign to seasons
  console.log('Step 2/3: Assigning tournaments to seasons...');

  const tournaments = await listAll('tournaments');
  console.log(`  Found ${tournaments.length} tournaments`);

  const season1Ids = [];
  const season2Ids = [];

  for (const t of tournaments) {
    const name = t.name || '';
    const isS2 = name.includes('S2') || name.includes('Season 2');
    const targetSeasonId = isS2 ? 'season-2' : 'season-1';

    if (!DRY_RUN) {
      await updateDoc('tournaments', t.id, { seasonId: targetSeasonId });
    }
    console.log(`    ${name || t.id} → ${targetSeasonId}`);

    if (isS2) {
      season2Ids.push(t.id);
    } else {
      season1Ids.push(t.id);
    }
  }

  console.log(`  Assigned ${season1Ids.length} to Season 1`);
  console.log(`  Assigned ${season2Ids.length} to Season 2`);

  // Step 3: Update season docs with tournament references
  console.log('Step 3/3: Updating season docs with tournament IDs...');

  if (!DRY_RUN) {
    await setDoc('seasons', 'season-1', { ...season1, tournamentIds: season1Ids });
    await setDoc('seasons', 'season-2', { ...season2, tournamentIds: season2Ids });
  }

  if (DRY_RUN) console.log('\n[DRY RUN] No data was written.');
  console.log('\nDone! Season setup complete.');
  process.exit(0);
}

main().catch(err => {
  console.error('\nFailed:', err.message);
  process.exit(1);
});
