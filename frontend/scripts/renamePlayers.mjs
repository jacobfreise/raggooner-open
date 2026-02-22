#!/usr/bin/env node

/**
 * Renames GlobalPlayer entries in Firestore.
 * Updates:
 *   1. The global player doc (name + alias)
 *   2. Player name inside every tournament's players[] array
 *   3. Team name ("Team OldName" → "Team NewName") if the player is captain
 *
 * Usage:
 *   node scripts/renamePlayers.mjs                        # emulator (default)
 *   node scripts/renamePlayers.mjs --dry-run               # preview without writing
 *   node scripts/renamePlayers.mjs --live --dry-run         # preview against production
 *   node scripts/renamePlayers.mjs --live                   # live database
 */

import { confirmLiveMode, IS_LIVE, DRY_RUN, setDoc, listAll } from './config.mjs';

// ============================================================
// CONFIGURE RENAMES HERE: [currentName, newName]
// ============================================================
const RENAME_PAIRS = [
  // ['OldName', 'NewName'],
    ['Alfheiz', 'Alfheix']
];

// --- Main ---

async function main() {
  if (RENAME_PAIRS.length === 0) {
    console.log('No renames configured. Edit RENAME_PAIRS in the script.');
    process.exit(0);
  }

  await confirmLiveMode();

  console.log(`=== Player Rename Tool${IS_LIVE ? ' (LIVE)' : ''}${DRY_RUN ? ' [DRY RUN]' : ''} ===\n`);

  // Load all players
  console.log('Loading players...');
  const allPlayers = await listAll('players');
  console.log(`  Found ${allPlayers.length} players`);

  // Load all tournaments
  console.log('Loading tournaments...');
  const allTournaments = await listAll('tournaments');
  console.log(`  Found ${allTournaments.length} tournaments`);

  const playerByName = new Map();
  for (const p of allPlayers) {
    playerByName.set(p.name, p);
    // Also index by aliases so we can find players even if already renamed
    for (const alias of (p.aliases || [])) {
      if (!playerByName.has(alias)) playerByName.set(alias, p);
    }
  }

  // Validate rename pairs
  for (const [currentName, newName] of RENAME_PAIRS) {
    const player = playerByName.get(currentName);
    if (!player) {
      console.error(`Player "${currentName}" not found!`);
      process.exit(1);
    }
    // Check if new name conflicts with an existing different player
    const conflict = playerByName.get(newName);
    if (conflict && conflict.id !== player.id) {
      console.error(`Cannot rename "${currentName}" to "${newName}" — a different player with that name already exists (${conflict.id})!`);
      process.exit(1);
    }
    console.log(`  Will rename: "${currentName}" (${player.id}) → "${newName}"`);
  }

  // Process renames
  for (const [currentName, newName] of RENAME_PAIRS) {
    const player = playerByName.get(currentName);

    console.log(`\n--- Renaming "${currentName}" → "${newName}" ---`);

    // 1. Update global player doc
    const aliases = player.aliases || [];
    if (!aliases.includes(currentName) && currentName !== newName) {
      aliases.push(currentName);
    }

    const updated = { ...player };
    updated.name = newName;
    updated.aliases = aliases;

    if (!DRY_RUN) await setDoc('players', player.id, updated);
    console.log(`  ${DRY_RUN ? '[preview] ' : ''}Updated player doc: name="${newName}", aliases=${JSON.stringify(aliases)}`);
  }

  // 2. Update tournaments: players[] names and team names
  let tournamentsUpdated = 0;

  for (const tournament of allTournaments) {
    const players = tournament.players || [];
    const teams = tournament.teams || [];
    let changed = false;

    // Check each player in the tournament
    for (const p of (Array.isArray(players) ? players : Object.values(players))) {
      for (const [currentName, newName] of RENAME_PAIRS) {
        if (p.name === currentName) {
          p.name = newName;
          changed = true;
        }
      }
    }

    // Check each team — rename if captain's name changed
    for (const team of teams) {
      if (!team.captainId) continue;

      for (const [currentName, newName] of RENAME_PAIRS) {
        const expectedOldTeamName = `Team ${currentName}`;
        if (team.name === expectedOldTeamName) {
          team.name = `Team ${newName}`;
          changed = true;
        }
      }
    }

    // Check wildcards — they reference players by ID, but verify and log
    const wildcards = tournament.wildcards || [];
    const playerList = Array.isArray(players) ? players : Object.values(players);
    for (const wc of wildcards) {
      const wcPlayer = playerList.find(p => p.id === wc.playerId);
      if (wcPlayer) {
        for (const [currentName, newName] of RENAME_PAIRS) {
          if (wcPlayer.name === newName) {
            console.log(`    Wildcard in group ${wc.group}: player "${newName}" (was "${currentName}")`);
          }
        }
      }
    }

    if (changed) {
      tournamentsUpdated++;
      if (!DRY_RUN) {
        const updatedTournament = { ...tournament };
        updatedTournament.players = players;
        updatedTournament.teams = teams;
        await setDoc('tournaments', tournament.id, updatedTournament);
      }
      console.log(`  ${DRY_RUN ? '[preview] ' : ''}Updated tournament: "${tournament.name}" (${tournament.id})`);
    }
  }

  console.log(`\n  Tournaments updated: ${tournamentsUpdated}`);
  if (DRY_RUN) console.log('\n[DRY RUN] No data was written.');
  console.log('\nAll renames complete!');
  process.exit(0);
}

main().catch(err => {
  console.error('\nFailed:', err.message);
  process.exit(1);
});
