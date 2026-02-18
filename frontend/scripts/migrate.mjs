#!/usr/bin/env node

/**
 * Migrates tournament data to the new normalized structure:
 * - Creates players/ collection (global player pool, matched by name)
 * - Creates participations/ collection (player <-> tournament links)
 * - Creates races/ collection (top-level race documents with global IDs)
 *
 * Runs against the Firestore emulator REST API (no Firebase SDK needed).
 *
 * Usage: node scripts/migrate.mjs [--dry-run]
 */

const EMULATOR_HOST = '127.0.0.1:8080';
const PROJECT_ID = 'raggooneropen';
const BASE_PATH = 'artifacts/default-app/public/data';
const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer owner',
};

const DRY_RUN = process.argv.includes('--dry-run');

// --- Firestore REST helpers ---

function toFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) fields[k] = toFirestoreValue(v);
  }
  return fields;
}

function fromFirestoreValue(val) {
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return val.doubleValue;
  if ('booleanValue' in val) return val.booleanValue;
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) return (val.arrayValue.values || []).map(fromFirestoreValue);
  if ('mapValue' in val) {
    const obj = {};
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
      obj[k] = fromFirestoreValue(v);
    }
    return obj;
  }
  return null;
}

function fromFirestoreDoc(doc) {
  const obj = {};
  for (const [k, v] of Object.entries(doc.fields || {})) {
    obj[k] = fromFirestoreValue(v);
  }
  const parts = doc.name.split('/');
  obj.id = parts[parts.length - 1];
  return obj;
}

function docUrl(collection, docId) {
  return `http://${EMULATOR_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${BASE_PATH}/${collection}/${docId}`;
}

function collectionUrl(collection) {
  return `http://${EMULATOR_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${BASE_PATH}/${collection}`;
}

async function setDoc(collection, docId, data) {
  const resp = await fetch(docUrl(collection, docId), {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Failed to write ${collection}/${docId}: ${err}`);
  }
}

async function listDocs(collection) {
  const docs = [];
  let pageToken = '';
  while (true) {
    const url = pageToken
      ? `${collectionUrl(collection)}?pageSize=300&pageToken=${pageToken}`
      : `${collectionUrl(collection)}?pageSize=300`;
    const resp = await fetch(url, { headers: HEADERS });
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Failed to list ${collection}: ${err}`);
    }
    const body = await resp.json();
    if (body.documents) {
      docs.push(...body.documents.map(fromFirestoreDoc));
    }
    if (body.nextPageToken) {
      pageToken = body.nextPageToken;
    } else {
      break;
    }
  }
  return docs;
}

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
  console.log(DRY_RUN ? '=== Migration (DRY RUN) ===\n' : '=== Migration ===\n');

  // Step 1: Fetch all tournaments
  console.log('Step 1/4: Fetching tournaments...');
  const tournaments = await listDocs('tournaments');
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
