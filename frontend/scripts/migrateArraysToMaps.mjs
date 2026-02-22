#!/usr/bin/env node

/**
 * Migrates tournament.players (array → map) and tournament.races (array → map)
 * from their legacy array format to keyed maps, matching the in-app
 * migrate-on-read logic (migratePlayers / migrateRaces).
 *
 * - players: Array<Player> → Record<playerId, Player>
 * - races:   Array<Race>   → Record<`${stage}-${group}-${raceNumber}`, Race>
 *
 * Tournaments that already use maps are skipped.
 *
 * Usage:
 *   node scripts/migrateArraysToMaps.mjs                        # emulator (default)
 *   node scripts/migrateArraysToMaps.mjs --dry-run               # preview without writing
 *   node scripts/migrateArraysToMaps.mjs --live --dry-run         # preview against production
 *   node scripts/migrateArraysToMaps.mjs --live                   # live database
 */

import { confirmLiveMode, IS_LIVE, DRY_RUN, setDoc, listAll } from './config.mjs';

// Same key format as raceKey() in src/utils/utils.ts
function raceKey(stage, group, raceNumber) {
  return `${stage}-${group}-${raceNumber}`;
}

async function main() {
  await confirmLiveMode();

  const modeLabel = DRY_RUN ? ' [DRY RUN]' : IS_LIVE ? ' (LIVE)' : '';
  console.log(`=== Migrate Arrays to Maps${modeLabel} ===\n`);

  // Fetch all tournaments
  console.log('Fetching tournaments...');
  const tournaments = await listAll('tournaments');
  console.log(`  Found ${tournaments.length} tournaments\n`);

  let playersConverted = 0;
  let racesConverted = 0;
  let alreadyMaps = 0;
  let tournamentsUpdated = 0;

  for (const tournament of tournaments) {
    let changed = false;
    const updates = {};

    // --- Migrate players ---
    const players = tournament.players;
    if (Array.isArray(players)) {
      const playerMap = {};
      for (const player of players) {
        playerMap[player.id] = player;
      }
      updates.players = playerMap;
      changed = true;
      playersConverted++;
      console.log(`  [${tournament.name || tournament.id}] players: array (${players.length}) → map (${Object.keys(playerMap).length} keys)`);
    } else if (players && typeof players === 'object') {
      // Already a map
    } else {
      console.log(`  [${tournament.name || tournament.id}] players: missing or empty — skipping`);
    }

    // --- Migrate races ---
    const races = tournament.races;
    if (Array.isArray(races)) {
      const raceMap = {};
      for (const race of races) {
        const key = raceKey(race.stage, race.group, race.raceNumber);
        raceMap[key] = race;
      }
      updates.races = raceMap;
      changed = true;
      racesConverted++;
      console.log(`  [${tournament.name || tournament.id}] races:   array (${races.length}) → map (${Object.keys(raceMap).length} keys)`);
    } else if (races && typeof races === 'object') {
      // Already a map
    } else {
      console.log(`  [${tournament.name || tournament.id}] races:   missing or empty — skipping`);
    }

    if (!changed) {
      alreadyMaps++;
      continue;
    }

    tournamentsUpdated++;

    if (!DRY_RUN) {
      const updated = { ...tournament, ...updates };
      await setDoc('tournaments', tournament.id, updated);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Tournaments scanned:          ${tournaments.length}`);
  console.log(`  Tournaments updated:          ${tournamentsUpdated}`);
  console.log(`  Already using maps (skipped): ${alreadyMaps}`);
  console.log(`  players[] → players{}:        ${playersConverted}`);
  console.log(`  races[]   → races{}:          ${racesConverted}`);
  if (DRY_RUN) console.log('\n  [DRY RUN] No data was written.');
  console.log('\nDone!');
  process.exit(0);
}

main().catch(err => {
  console.error('\nFailed:', err.message);
  process.exit(1);
});
