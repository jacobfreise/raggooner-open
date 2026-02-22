#!/usr/bin/env node

/**
 * Migrates tournament data to the new normalized structure:
 * - Creates players/ collection (global player pool, matched by name)
 * - Creates participations/ collection (player <-> tournament links)
 * - Creates races/ collection (top-level race documents with global IDs)
 *
 * Usage:
 *   node scripts/migrate.mjs                        # emulator (default)
 *   node scripts/migrate.mjs --dry-run               # preview without writing
 *   node scripts/migrate.mjs --live --dry-run         # preview against production
 *   node scripts/migrate.mjs --live                   # live database
 */

import { confirmLiveMode, IS_LIVE, DRY_RUN, setDoc, listAll } from './config.mjs';

// --- Name normalization ---

function normalizeName(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '');
}

function nameSimilarity(a, b) {
  const n1 = normalizeName(a);
  const n2 = normalizeName(b);
  if (n1 === n2) return 1;

  const longer = n1.length > n2.length ? n1 : n2;
  const shorter = n1.length > n2.length ? n2 : n1;
  if (longer.length === 0) return 1;

  const editDistance = [...longer].reduce((prev, char, i) => {
    return prev + (shorter[i] !== char ? 1 : 0);
  }, 0);

  return 1 - editDistance / longer.length;
}

// --- Main migration ---

async function main() {
  await confirmLiveMode();

  const modeLabel = DRY_RUN ? ' (DRY RUN)' : IS_LIVE ? ' (LIVE)' : '';
  console.log(`=== Migration${modeLabel} ===\n`);

  // Step 1: Fetch all tournaments
  console.log('Step 1/4: Fetching tournaments...');
  const tournaments = await listAll('tournaments');
  console.log(`  Found ${tournaments.length} tournaments`);

  // Step 2: Build global player pool
  console.log('Step 2/4: Building global player pool...');

  const playersMap = new Map();        // normalizedName -> GlobalPlayer
  const playerIdMapping = new Map();   // oldId -> globalId
  const nameOccurrences = new Map();   // normalizedName -> Set<originalName>
  let duplicatesFound = 0;

  for (const tournament of tournaments) {
    const players = tournament.players || [];
    for (const player of players) {
      const normalizedName = normalizeName(player.name);

      if (!nameOccurrences.has(normalizedName)) {
        nameOccurrences.set(normalizedName, new Set());
      }
      nameOccurrences.get(normalizedName).add(player.name);

      if (!playersMap.has(normalizedName)) {
        const globalId = crypto.randomUUID();
        playersMap.set(normalizedName, {
          id: globalId,
          name: player.name,
          aliases: [],
          createdAt: tournament.createdAt,
          metadata: { totalTournaments: 0, totalRaces: 0 },
        });
        console.log(`  New player: "${player.name}"`);
      } else {
        const existing = playersMap.get(normalizedName);
        if (existing.name !== player.name) {
          if (!existing.aliases.includes(player.name)) {
            existing.aliases.push(player.name);
            console.log(`  Merged: "${player.name}" -> "${existing.name}"`);
            duplicatesFound++;
          }
        }
      }

      const globalPlayer = playersMap.get(normalizedName);
      globalPlayer.metadata.totalTournaments++;
      playerIdMapping.set(player.id, globalPlayer.id);
    }
  }

  // Detect fuzzy duplicates
  const playerNames = Array.from(playersMap.keys());
  const reported = new Set();
  for (let i = 0; i < playerNames.length; i++) {
    for (let j = i + 1; j < playerNames.length; j++) {
      const p1 = playersMap.get(playerNames[i]);
      const p2 = playersMap.get(playerNames[j]);
      const sim = nameSimilarity(p1.name, p2.name);
      if (sim > 0.7 && sim < 1) {
        const key = [p1.name, p2.name].sort().join('|');
        if (!reported.has(key)) {
          reported.add(key);
          console.log(`  ⚠️  Potential duplicate: "${p1.name}" ≈ "${p2.name}" (${Math.round(sim * 100)}%)`);
        }
      }
    }
  }

  console.log(`  ${playersMap.size} unique players (${duplicatesFound} duplicates merged)`);

  // Step 3: Build participations
  console.log('Step 3/4: Creating participations...');

  const participations = [];

  for (const tournament of tournaments) {
    const players = tournament.players || [];
    const teams = tournament.teams || [];

    for (const player of players) {
      const globalId = playerIdMapping.get(player.id);
      if (!globalId) {
        console.log(`  ⚠️  No global ID for "${player.name}" in ${tournament.name}`);
        continue;
      }

      const team = teams.find(t =>
        t.captainId === player.id || (t.memberIds || []).includes(player.id)
      );

      const participation = {
        id: `${tournament.id}_${globalId}`,
        tournamentId: tournament.id,
        playerId: globalId,
        uma: player.uma || '',
        isCaptain: player.isCaptain || false,
        totalPoints: player.totalPoints || 0,
        groupPoints: player.groupPoints || 0,
        finalsPoints: player.finalsPoints || 0,
        createdAt: tournament.createdAt,
      };
      if (tournament.seasonId) participation.seasonId = tournament.seasonId;
      if (team?.id) participation.teamId = team.id;

      participations.push(participation);
    }
  }

  console.log(`  ${participations.length} participation records`);

  // Step 4: Build races
  console.log('Step 4/4: Migrating races...');

  const races = [];

  for (const tournament of tournaments) {
    for (const race of (tournament.races || [])) {
      const umaMapping = {};
      const newPlacements = {};

      for (const [oldPlayerId, position] of Object.entries(race.placements || {})) {
        const globalId = playerIdMapping.get(oldPlayerId);
        if (!globalId) continue;

        newPlacements[globalId] = position;

        const player = (tournament.players || []).find(p => p.id === oldPlayerId);
        if (player) {
          umaMapping[globalId] = player.uma || '';

          const normalizedName = normalizeName(player.name);
          const globalPlayer = playersMap.get(normalizedName);
          if (globalPlayer) globalPlayer.metadata.totalRaces++;
        }
      }

      const raceDoc = {
        id: race.id,
        tournamentId: tournament.id,
        stage: race.stage,
        group: race.group,
        raceNumber: race.raceNumber,
        timestamp: race.timestamp,
        placements: newPlacements,
        umaMapping,
      };
      if (tournament.seasonId) raceDoc.seasonId = tournament.seasonId;

      races.push(raceDoc);
    }
  }

  console.log(`  ${races.length} race documents`);

  // --- Write to Firestore ---
  if (DRY_RUN) {
    console.log('\nDRY RUN — no data written.');
    process.exit(0);
  }

  console.log('\nWriting to Firestore...');

  // Write players
  let count = 0;
  for (const [, player] of playersMap) {
    await setDoc('players', player.id, player);
    count++;
    if (count % 50 === 0) console.log(`  ...players: ${count}/${playersMap.size}`);
  }
  console.log(`  ✓ ${count} players written`);

  // Write participations
  count = 0;
  for (const p of participations) {
    await setDoc('participations', p.id, p);
    count++;
    if (count % 50 === 0) console.log(`  ...participations: ${count}/${participations.length}`);
  }
  console.log(`  ✓ ${count} participations written`);

  // Write races
  count = 0;
  for (const r of races) {
    await setDoc('races', r.id, r);
    count++;
    if (count % 50 === 0) console.log(`  ...races: ${count}/${races.length}`);
  }
  console.log(`  ✓ ${count} races written`);

  console.log('\nMigration complete!');
  process.exit(0);
}

main().catch(err => {
  console.error('\nFailed:', err.message);
  process.exit(1);
});
