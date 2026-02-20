#!/usr/bin/env node

/**
 * Backfills dominance counters (opponentsFaced, opponentsBeaten, seasons.*)
 * on GlobalPlayer documents from completed tournament race data.
 *
 * Uses Firebase Admin SDK — no auth token needed, just the service account key.
 *
 * Usage:
 *   node scripts/backfillDominance.mjs --dry-run          # preview (emulator)
 *   node scripts/backfillDominance.mjs                    # write to emulator
 *   node scripts/backfillDominance.mjs --live --dry-run   # preview against production
 *   node scripts/backfillDominance.mjs --live              # write to production
 */

import { readFileSync } from 'fs';
import { createInterface } from 'readline';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// --- CLI flags ---
const args = process.argv.slice(2);
const IS_LIVE = args.includes('--live');
const DRY_RUN = args.includes('--dry-run');

const PROJECT_ID = 'raggooneropen';
const BASE_PATH = 'artifacts/default-app/public/data';

// --- Live-mode confirmation ---
async function confirmLiveMode() {
  if (!IS_LIVE) return;
  console.log('\n\u26a0\ufe0f  WARNING: Running against LIVE database!');
  console.log(`   Project: ${PROJECT_ID}`);
  if (!DRY_RUN) console.log('   This will modify production data.\n');
  else console.log('   (dry-run: no writes will be made)\n');

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise(resolve => {
    rl.question('Type "yes" to continue: ', resolve);
  });
  rl.close();
  if (answer.trim().toLowerCase() !== 'yes') {
    console.log('Aborted.');
    process.exit(0);
  }
  console.log('');
}

// --- Initialize Admin SDK ---
function initFirebase() {
  if (!IS_LIVE) {
    process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
    initializeApp({ projectId: PROJECT_ID });
  } else {
    const serviceAccount = JSON.parse(
      readFileSync(new URL('./serviceAccountKey.json', import.meta.url))
    );
    initializeApp({
      credential: cert(serviceAccount),
      projectId: PROJECT_ID,
    });
  }
  return getFirestore();
}

// --- Main ---
async function main() {
  await confirmLiveMode();
  const db = initFirebase();

  console.log(`=== Backfill Dominance${IS_LIVE ? ' (LIVE)' : ''}${DRY_RUN ? ' [DRY RUN]' : ''} ===\n`);

  const col = (name) => db.collection(`${BASE_PATH}/${name}`);

  // 1. Fetch completed tournaments and all players
  console.log('Fetching data...');
  const [tournamentSnap, playerSnap] = await Promise.all([
    col('tournaments').where('status', '==', 'completed').get(),
    col('players').get(),
  ]);

  const tournaments = tournamentSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const players = playerSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  console.log(`  Completed tournaments: ${tournaments.length}`);
  console.log(`  Players: ${players.length}`);

  if (tournaments.length === 0) {
    console.log('\nNo completed tournaments found. Nothing to do.');
    return;
  }

  // 2. Compute dominance per player
  // Structure: playerId -> { faced, beaten, totalTournaments, totalRaces, lastPlayed, seasons: { seasonId -> { faced, beaten } } }
  const stats = new Map();

  for (const t of tournaments) {
    const races = t.races || [];
    const playerIds = [...new Set((t.players || []).map(p => p.id))];

    for (const playerId of playerIds) {
      if (!stats.has(playerId)) {
        stats.set(playerId, {
          faced: 0,
          beaten: 0,
          totalTournaments: 0,
          totalRaces: 0,
          lastPlayed: null,
          seasons: {},
        });
      }

      const s = stats.get(playerId);
      s.totalTournaments++;

      // Track lastPlayed from completedAt
      if (t.completedAt && (!s.lastPlayed || t.completedAt > s.lastPlayed)) {
        s.lastPlayed = t.completedAt;
      }

      let playerRaceCount = 0;

      for (const race of races) {
        const position = race.placements?.[playerId];
        if (position == null) continue;

        playerRaceCount++;
        const playersInRace = Object.keys(race.placements).length;
        const beaten = playersInRace - position;
        const faced = playersInRace - 1;

        s.faced += faced;
        s.beaten += beaten;

        // Per-season
        if (t.seasonId) {
          if (!s.seasons[t.seasonId]) {
            s.seasons[t.seasonId] = { faced: 0, beaten: 0 };
          }
          s.seasons[t.seasonId].faced += faced;
          s.seasons[t.seasonId].beaten += beaten;
        }
      }

      s.totalRaces += playerRaceCount;
    }
  }

  console.log(`\nComputed stats for ${stats.size} players.`);

  // 3. Print preview
  const playerMap = new Map(players.map(p => [p.id, p]));

  for (const [playerId, s] of stats) {
    const player = playerMap.get(playerId);
    const name = player?.name || playerId;
    const dom = s.faced > 0 ? ((s.beaten / s.faced) * 100).toFixed(1) : '0.0';
    const seasonKeys = Object.keys(s.seasons);

    console.log(
      `  ${name.padEnd(20)} | ${String(s.totalTournaments).padStart(2)} tournaments | ${String(s.totalRaces).padStart(3)} races | dom: ${dom.padStart(5)}% | seasons: ${seasonKeys.length}`
    );
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No writes performed.');
    return;
  }

  // 4. Write to Firestore in batches of 500
  console.log('\nWriting to Firestore...');
  const entries = [...stats.entries()];
  let written = 0;

  for (let i = 0; i < entries.length; i += 500) {
    const batch = db.batch();
    const chunk = entries.slice(i, i + 500);

    for (const [playerId, s] of chunk) {
      const ref = col('players').doc(playerId);

      const updateData = {
        'metadata.totalTournaments': s.totalTournaments,
        'metadata.totalRaces': s.totalRaces,
        'metadata.opponentsFaced': s.faced,
        'metadata.opponentsBeaten': s.beaten,
      };

      if (s.lastPlayed) {
        updateData['metadata.lastPlayed'] = s.lastPlayed;
      }

      // Write per-season counters
      for (const [seasonId, seasonStats] of Object.entries(s.seasons)) {
        updateData[`metadata.seasons.${seasonId}.opponentsFaced`] = seasonStats.faced;
        updateData[`metadata.seasons.${seasonId}.opponentsBeaten`] = seasonStats.beaten;
      }

      batch.update(ref, updateData);
    }

    await batch.commit();
    written += chunk.length;
    console.log(`  Batch committed: ${written}/${entries.length}`);
  }

  console.log(`\nDone! Updated ${written} player documents.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
