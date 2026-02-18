#!/usr/bin/env node

/**
 * Sets up Season 1 and Season 2, then assigns all tournaments to the correct season.
 * Runs against the Firestore emulator REST API (no Firebase SDK needed).
 *
 * Usage: node scripts/setupSeasons.mjs
 */

import { readFileSync } from 'fs';

const EMULATOR_HOST = '127.0.0.1:8080';
const PROJECT_ID = 'raggooneropen';
const BASE_PATH = 'artifacts/default-app/public/data';
const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer owner',
};

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
  // Extract doc ID from name path
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

async function updateDoc(collection, docId, fields) {
  // PATCH with updateMask to only update specific fields
  const params = Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join('&');
  const resp = await fetch(`${docUrl(collection, docId)}?${params}`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify({ fields: toFirestoreFields(fields) }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Failed to update ${collection}/${docId}: ${err}`);
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

// --- Main ---

async function main() {
  console.log('=== Season Setup ===\n');

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

  await setDoc('seasons', 'season-1', season1);
  await setDoc('seasons', 'season-2', season2);
  console.log('  Created Season 1 & Season 2');

  // Step 2: Fetch all tournaments and assign to seasons
  console.log('Step 2/3: Assigning tournaments to seasons...');

  const tournaments = await listDocs('tournaments');
  console.log(`  Found ${tournaments.length} tournaments`);

  const season1Ids = [];
  const season2Ids = [];

  for (const t of tournaments) {
    const name = t.name || '';
    const isS2 = name.includes('S2') || name.includes('Season 2');
    const targetSeasonId = isS2 ? 'season-2' : 'season-1';

    await updateDoc('tournaments', t.id, { seasonId: targetSeasonId });

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

  await setDoc('seasons', 'season-1', { ...season1, tournamentIds: season1Ids });
  await setDoc('seasons', 'season-2', { ...season2, tournamentIds: season2Ids });

  console.log('\nDone! Season setup complete.');
  process.exit(0);
}

main().catch(err => {
  console.error('\nFailed:', err.message);
  process.exit(1);
});
