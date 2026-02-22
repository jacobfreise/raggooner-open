#!/usr/bin/env node

/**
 * Merges duplicate GlobalPlayer entries in Firestore.
 * For each pair, it:
 *   1. Updates all participations referencing the duplicate to point to the keeper
 *   2. Updates all race placements + umaMappings to use the keeper's ID
 *   3. Merges metadata (totalTournaments, totalRaces) and adds alias
 *   4. Deletes the duplicate player doc
 *
 * Usage:
 *   node scripts/mergePlayers.mjs                        # emulator (default)
 *   node scripts/mergePlayers.mjs --dry-run               # preview without writing
 *   node scripts/mergePlayers.mjs --live --dry-run         # preview against production
 *   node scripts/mergePlayers.mjs --live                   # live database
 */

import { confirmLiveMode, IS_LIVE, DRY_RUN, setDoc, deleteDoc, listAll } from './config.mjs';

// ============================================================
// CONFIGURE MERGES HERE: [keepName, duplicateName]
// The first name is kept, the second is merged into it.
// The commented out lines have already been executed on live!
// ============================================================
const MERGE_PAIRS = [
  // ['Synocra', 'Syno'],
  // ['Alfheix', 'Alfheiz'],
  // ['Pines', 'Pinesu'],
  // ['Eva', 'Eva Fotia'],
  // ['Carmine', 'CarmineView'],
  // ['NarrativeCroc', 'NarrativeCrocodiles'],
  //   ['NarrativeCroc', 'Crocodiles']
];

// --- Main ---

async function main() {
  await confirmLiveMode();

  console.log(`=== Player Merge Tool${IS_LIVE ? ' (LIVE)' : ''}${DRY_RUN ? ' [DRY RUN]' : ''} ===\n`);

  // Load all players to find IDs by name
  console.log('Loading players...');
  const allPlayers = await listAll('players');
  console.log(`  Found ${allPlayers.length} players`);

  const playerByName = new Map();
  for (const p of allPlayers) {
    playerByName.set(p.name, p);
  }

  // Validate merge pairs
  for (const [keepName, dupName] of MERGE_PAIRS) {
    const keeper = playerByName.get(keepName);
    const dup = playerByName.get(dupName);
    if (!keeper) { console.error(`Player "${keepName}" not found!`); process.exit(1); }
    if (!dup) { console.error(`Player "${dupName}" not found!`); process.exit(1); }
    console.log(`\n  Will merge: "${dupName}" (${dup.id}) → "${keepName}" (${keeper.id})`);
  }

  // Load participations, races, and tournaments
  console.log('\nLoading participations...');
  const allParticipations = await listAll('participations');
  console.log(`  Found ${allParticipations.length} participations`);

  console.log('Loading races...');
  const allRaces = await listAll('races');
  console.log(`  Found ${allRaces.length} races`);

  console.log('Loading tournaments...');
  const allTournaments = await listAll('tournaments');
  console.log(`  Found ${allTournaments.length} tournaments`);

  // Process each merge pair
  for (const [keepName, dupName] of MERGE_PAIRS) {
    const keeper = playerByName.get(keepName);
    const dup = playerByName.get(dupName);
    const keeperId = keeper.id;
    const dupId = dup.id;

    console.log(`\n--- Merging "${dupName}" → "${keepName}" ---`);

    // 1. Update participations: change playerId, update doc ID
    const dupParts = allParticipations.filter(p => p.playerId === dupId);
    console.log(`  Participations to update: ${dupParts.length}`);

    for (const part of dupParts) {
      const newDocId = `${part.tournamentId}_${keeperId}`;

      // Check if keeper already has a participation for this tournament
      const existing = allParticipations.find(
        p => p.playerId === keeperId && p.tournamentId === part.tournamentId
      );

      if (existing) {
        // Both participated in the same tournament — just delete the duplicate's participation
        console.log(`    Skipping ${part.id} (keeper already in tournament ${part.tournamentId})`);
        if (!DRY_RUN) await deleteDoc('participations', part.id);
      } else {
        // Write new participation with keeper's ID, delete old one
        const updated = { ...part };
        updated.id = newDocId;
        updated.playerId = keeperId;
        if (!DRY_RUN) {
          await setDoc('participations', newDocId, updated);
          await deleteDoc('participations', part.id);
        }
        console.log(`    ${part.id} → ${newDocId}`);
      }
    }

    // 2. Update races: swap dupId for keeperId in placements and umaMapping
    let racesUpdated = 0;
    for (const race of allRaces) {
      const placements = race.placements || {};
      const umaMapping = race.umaMapping || {};
      let changed = false;

      if (dupId in placements) {
        placements[keeperId] = placements[dupId];
        delete placements[dupId];
        changed = true;
      }

      if (dupId in umaMapping) {
        umaMapping[keeperId] = umaMapping[dupId];
        delete umaMapping[dupId];
        changed = true;
      }

      if (changed) {
        if (!DRY_RUN) {
          const updated = { ...race };
          updated.placements = placements;
          updated.umaMapping = umaMapping;
          await setDoc('races', race.id, updated);
        }
        racesUpdated++;
      }
    }
    console.log(`  Races updated: ${racesUpdated}`);

    // 3. Update tournaments: replace dupId in players[], teams[], and wildcards[]
    let tournamentsUpdated = 0;
    for (const tournament of allTournaments) {
      const players = tournament.players || [];
      const teams = tournament.teams || [];
      const wildcards = tournament.wildcards || [];
      let changed = false;

      // Update players[] array — replace dupId with keeperId
      for (const p of (Array.isArray(players) ? players : Object.values(players))) {
        if (p.id === dupId) {
          p.id = keeperId;
          p.name = keepName;
          changed = true;
        }
      }

      // Update teams[] — captainId and memberIds
      for (const team of teams) {
        if (team.captainId === dupId) {
          team.captainId = keeperId;
          changed = true;
        }
        if (team.memberIds) {
          const idx = team.memberIds.indexOf(dupId);
          if (idx !== -1) {
            team.memberIds[idx] = keeperId;
            changed = true;
          }
        }
      }

      // Update wildcards[] — playerId
      for (const wc of wildcards) {
        if (wc.playerId === dupId) {
          wc.playerId = keeperId;
          changed = true;
        }
      }

      if (changed) {
        if (!DRY_RUN) {
          const updated = { ...tournament };
          updated.players = players;
          updated.teams = teams;
          updated.wildcards = wildcards;
          await setDoc('tournaments', tournament.id, updated);
        }
        tournamentsUpdated++;
        console.log(`    Updated tournament: "${tournament.name}" (${tournament.id})`);
      }
    }
    console.log(`  Tournaments updated: ${tournamentsUpdated}`);

    // 5. Update keeper's metadata and aliases
    const aliases = keeper.aliases || [];
    if (!aliases.includes(dupName)) aliases.push(dupName);
    // Add any aliases the dup had too
    for (const a of (dup.aliases || [])) {
      if (!aliases.includes(a)) aliases.push(a);
    }

    const mergedMeta = {
      totalTournaments: (keeper.metadata?.totalTournaments || 0) + (dup.metadata?.totalTournaments || 0),
      totalRaces: (keeper.metadata?.totalRaces || 0) + (dup.metadata?.totalRaces || 0),
      lastPlayed: keeper.metadata?.lastPlayed || dup.metadata?.lastPlayed,
    };

    const updatedKeeper = { ...keeper };
    updatedKeeper.aliases = aliases;
    updatedKeeper.metadata = mergedMeta;
    if (!DRY_RUN) await setDoc('players', keeperId, updatedKeeper);
    console.log(`  Updated keeper: aliases=${JSON.stringify(aliases)}, tournaments=${mergedMeta.totalTournaments}, races=${mergedMeta.totalRaces}`);

    // 6. Delete the duplicate player doc
    if (!DRY_RUN) await deleteDoc('players', dupId);
    console.log(`  Deleted duplicate player: ${dupId}`);
  }

  if (DRY_RUN) console.log('\n[DRY RUN] No data was written.');
  console.log('\nAll merges complete!');
  process.exit(0);
}

main().catch(err => {
  console.error('\nFailed:', err.message);
  process.exit(1);
});
