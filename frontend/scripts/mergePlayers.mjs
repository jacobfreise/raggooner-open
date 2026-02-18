#!/usr/bin/env node

/**
 * Merges duplicate GlobalPlayer entries in the Firestore emulator.
 * For each pair, it:
 *   1. Updates all participations referencing the duplicate to point to the keeper
 *   2. Updates all race placements + umaMappings to use the keeper's ID
 *   3. Merges metadata (totalTournaments, totalRaces) and adds alias
 *   4. Deletes the duplicate player doc
 *
 * Usage: node scripts/mergePlayers.mjs
 */

const EMULATOR_HOST = '127.0.0.1:8080';
const PROJECT_ID = 'raggooneropen';
const BASE_PATH = 'artifacts/default-app/public/data';
const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer owner',
};

// ============================================================
// CONFIGURE MERGES HERE: [keepName, duplicateName]
// The first name is kept, the second is merged into it.
// ============================================================
const MERGE_PAIRS = [
  ['Alfheix', 'Alfheiz'],
  ['Pines', 'Pinesu'],
];

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
      if (v !== undefined) fields[k] = toFirestoreValue(v);
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
  obj._docId = parts[parts.length - 1];
  if (!obj.id) obj.id = obj._docId;
  return obj;
}

function docUrl(col, docId) {
  return `http://${EMULATOR_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${BASE_PATH}/${col}/${docId}`;
}

function collectionUrl(col) {
  return `http://${EMULATOR_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${BASE_PATH}/${col}`;
}

async function getDoc(col, docId) {
  const resp = await fetch(docUrl(col, docId), { headers: HEADERS });
  if (!resp.ok) return null;
  return fromFirestoreDoc(await resp.json());
}

async function setDoc(col, docId, data) {
  const resp = await fetch(docUrl(col, docId), {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
  });
  if (!resp.ok) throw new Error(`Failed to write ${col}/${docId}: ${await resp.text()}`);
}

async function deleteDoc(col, docId) {
  const resp = await fetch(docUrl(col, docId), { method: 'DELETE', headers: HEADERS });
  if (!resp.ok) throw new Error(`Failed to delete ${col}/${docId}: ${await resp.text()}`);
}

async function listAll(col) {
  const docs = [];
  let pageToken = '';
  while (true) {
    const url = pageToken
      ? `${collectionUrl(col)}?pageSize=300&pageToken=${pageToken}`
      : `${collectionUrl(col)}?pageSize=300`;
    const resp = await fetch(url, { headers: HEADERS });
    if (!resp.ok) throw new Error(`Failed to list ${col}: ${await resp.text()}`);
    const body = await resp.json();
    if (body.documents) docs.push(...body.documents.map(fromFirestoreDoc));
    if (body.nextPageToken) pageToken = body.nextPageToken;
    else break;
  }
  return docs;
}

// --- Main ---

async function main() {
  console.log('=== Player Merge Tool ===\n');

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

  // Load participations and races
  console.log('\nLoading participations...');
  const allParticipations = await listAll('participations');
  console.log(`  Found ${allParticipations.length} participations`);

  console.log('Loading races...');
  const allRaces = await listAll('races');
  console.log(`  Found ${allRaces.length} races`);

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
        console.log(`    Skipping ${part._docId} (keeper already in tournament ${part.tournamentId})`);
        await deleteDoc('participations', part._docId);
      } else {
        // Write new participation with keeper's ID, delete old one
        const updated = { ...part };
        delete updated._docId;
        updated.id = newDocId;
        updated.playerId = keeperId;
        await setDoc('participations', newDocId, updated);
        await deleteDoc('participations', part._docId);
        console.log(`    ${part._docId} → ${newDocId}`);
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
        const updated = { ...race };
        delete updated._docId;
        updated.placements = placements;
        updated.umaMapping = umaMapping;
        await setDoc('races', race._docId, updated);
        racesUpdated++;
      }
    }
    console.log(`  Races updated: ${racesUpdated}`);

    // 3. Update keeper's metadata and aliases
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
    delete updatedKeeper._docId;
    updatedKeeper.aliases = aliases;
    updatedKeeper.metadata = mergedMeta;
    await setDoc('players', keeperId, updatedKeeper);
    console.log(`  Updated keeper: aliases=${JSON.stringify(aliases)}, tournaments=${mergedMeta.totalTournaments}, races=${mergedMeta.totalRaces}`);

    // 4. Delete the duplicate player doc
    await deleteDoc('players', dupId);
    console.log(`  Deleted duplicate player: ${dupId}`);
  }

  console.log('\nAll merges complete!');
  process.exit(0);
}

main().catch(err => {
  console.error('\nFailed:', err.message);
  process.exit(1);
});
