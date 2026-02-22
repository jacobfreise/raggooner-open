#!/usr/bin/env node

/**
 * Fixes stale player IDs in tournament documents.
 *
 * For each tournament, checks every entry in players[], teams[], and wildcards[].
 * If a player ID doesn't exist in the global players/ collection, it matches by
 * name (exact, then case-insensitive, then alias) and replaces the ID with the
 * correct global player ID.
 *
 * Usage:
 *   node scripts/fixTournamentPlayerIds.mjs                        # emulator (default)
 *   node scripts/fixTournamentPlayerIds.mjs --dry-run               # preview changes
 *   node scripts/fixTournamentPlayerIds.mjs --live --dry-run         # preview against production
 *   node scripts/fixTournamentPlayerIds.mjs --live                   # live database
 */

import { confirmLiveMode, IS_LIVE, DRY_RUN, setDoc, listAll } from './config.mjs';

async function main() {
  await confirmLiveMode();

  console.log(`=== Fix Tournament Player IDs${IS_LIVE ? ' (LIVE)' : ''}${DRY_RUN ? ' [DRY RUN]' : ''} ===\n`);

  // Load global players
  console.log('Loading global players...');
  const allPlayers = await listAll('players');
  console.log(`  Found ${allPlayers.length} players`);

  // Build lookup maps
  const playerById = new Map();
  const playerByName = new Map();       // exact name → player
  const playerByLowerName = new Map();  // lowercase name → player
  const playerByAlias = new Map();      // alias → player

  for (const p of allPlayers) {
    playerById.set(p.id, p);

    playerByName.set(p.name, p);

    const lower = p.name.toLowerCase().trim();
    if (!playerByLowerName.has(lower)) playerByLowerName.set(lower, p);

    for (const alias of (p.aliases || [])) {
      playerByAlias.set(alias, p);
      const aliasLower = alias.toLowerCase().trim();
      if (!playerByAlias.has(aliasLower)) playerByAlias.set(aliasLower, p);
    }
  }

  /**
   * Try to find a global player by name using multiple strategies.
   */
  function findPlayerByName(name) {
    // 1. Exact name match
    const exact = playerByName.get(name);
    if (exact) return exact;

    // 2. Case-insensitive match
    const lower = name.toLowerCase().trim();
    const byLower = playerByLowerName.get(lower);
    if (byLower) return byLower;

    // 3. Alias match (exact then case-insensitive)
    const byAlias = playerByAlias.get(name) || playerByAlias.get(lower);
    if (byAlias) return byAlias;

    return null;
  }

  // Load tournaments
  console.log('Loading tournaments...');
  const allTournaments = await listAll('tournaments');
  console.log(`  Found ${allTournaments.length} tournaments\n`);

  let totalFixed = 0;
  let totalOrphaned = 0;
  let tournamentsUpdated = 0;

  for (const tournament of allTournaments) {
    const players = tournament.players || [];
    const teams = tournament.teams || [];
    const wildcards = tournament.wildcards || [];
    let changed = false;

    // Build a map of old ID → new ID for this tournament (to update teams/wildcards)
    const idReplacements = new Map();

    // Check each player in the tournament
    for (const p of players) {
      if (playerById.has(p.id)) continue; // ID is valid

      // ID doesn't exist in global players — try to match by name
      const match = findPlayerByName(p.name);
      if (match) {
        console.log(`  [${tournament.name}] "${p.name}": ${p.id} → ${match.id}`);
        idReplacements.set(p.id, match.id);
        p.id = match.id;
        changed = true;
        totalFixed++;
      } else {
        console.log(`  [${tournament.name}] "${p.name}": ${p.id} — NO MATCH FOUND`);
        totalOrphaned++;
      }
    }

    // Update teams[] — captainId and memberIds
    for (const team of teams) {
      const newCaptainId = idReplacements.get(team.captainId);
      if (newCaptainId) {
        team.captainId = newCaptainId;
        changed = true;
      }
      if (team.memberIds) {
        for (let i = 0; i < team.memberIds.length; i++) {
          const newId = idReplacements.get(team.memberIds[i]);
          if (newId) {
            team.memberIds[i] = newId;
            changed = true;
          }
        }
      }
    }

    // Update wildcards[] — playerId
    for (const wc of wildcards) {
      const newId = idReplacements.get(wc.playerId);
      if (newId) {
        wc.playerId = newId;
        changed = true;
      }
    }

    // Update races — placements keys
    const races = tournament.races || [];
    for (const race of (Array.isArray(races) ? races : Object.values(races))) {
      const placements = race.placements || {};
      for (const [oldId, newId] of idReplacements) {
        if (oldId in placements) {
          placements[newId] = placements[oldId];
          delete placements[oldId];
          changed = true;
        }
      }
    }

    if (changed) {
      tournamentsUpdated++;
      if (!DRY_RUN) {
        const updated = { ...tournament };
        updated.players = players;
        updated.teams = teams;
        updated.wildcards = wildcards;
        await setDoc('tournaments', tournament.id, updated);
      }
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`  IDs fixed:            ${totalFixed}`);
  console.log(`  Orphaned (no match):  ${totalOrphaned}`);
  console.log(`  Tournaments updated:  ${tournamentsUpdated}`);
  if (DRY_RUN) console.log('\n  [DRY RUN] No data was written.');
  console.log('\nDone!');
  process.exit(0);
}

main().catch(err => {
  console.error('\nFailed:', err.message);
  process.exit(1);
});
