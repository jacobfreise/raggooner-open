#!/usr/bin/env node

/**
 * Shared configuration and Firestore REST API helpers for all scripts.
 *
 * Supports two modes:
 *   - Emulator (default): http://127.0.0.1:8080, Bearer owner
 *   - Live (--live flag):  https://firestore.googleapis.com, requires auth token
 *
 * Token for live mode: pass --token <TOKEN> or set FIREBASE_TOKEN env var.
 * Get a token via: gcloud auth print-access-token
 */

import { createInterface } from 'readline';

// --- Parse CLI flags ---

const args = process.argv.slice(2);
export const IS_LIVE = args.includes('--live');

function getFlagValue(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

const EMULATOR_HOST = '127.0.0.1:8080';
export const PROJECT_ID = 'raggooneropen';
export const BASE_PATH = 'artifacts/default-app/public/data';

let HOST;
let AUTH_TOKEN;

if (IS_LIVE) {
  HOST = 'firestore.googleapis.com';
  AUTH_TOKEN = getFlagValue('--token') || process.env.FIREBASE_TOKEN;
  if (!AUTH_TOKEN) {
    console.error('ERROR: Live mode requires an auth token.');
    console.error('  Pass --token <TOKEN> or set FIREBASE_TOKEN env var.');
    console.error('  Get one via: gcloud auth print-access-token');
    process.exit(1);
  }
} else {
  HOST = EMULATOR_HOST;
  AUTH_TOKEN = 'owner';
}

export const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${AUTH_TOKEN}`,
};

const PROTOCOL = IS_LIVE ? 'https' : 'http';
const BASE_URL = `${PROTOCOL}://${HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// --- Live mode confirmation ---

export async function confirmLiveMode() {
  if (!IS_LIVE) return;

  console.log('\n⚠️  WARNING: Running against LIVE database!');
  console.log(`   Project: ${PROJECT_ID}`);
  console.log('   This will modify production data.\n');

  const answer = await askQuestion('Type "yes" to continue: ');
  if (answer.trim().toLowerCase() !== 'yes') {
    console.log('Aborted.');
    process.exit(0);
  }
  console.log('');
}

function askQuestion(prompt) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(prompt, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

// --- Firestore value conversion ---

export function toFirestoreValue(val) {
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

export function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) fields[k] = toFirestoreValue(v);
  }
  return fields;
}

export function fromFirestoreValue(val) {
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

export function fromFirestoreDoc(doc) {
  const obj = {};
  for (const [k, v] of Object.entries(doc.fields || {})) {
    obj[k] = fromFirestoreValue(v);
  }
  const parts = doc.name.split('/');
  obj._docId = parts[parts.length - 1];
  if (!obj.id) obj.id = obj._docId;
  return obj;
}

// --- URL builders ---

export function docUrl(col, docId) {
  return `${BASE_URL}/${BASE_PATH}/${col}/${docId}`;
}

export function collectionUrl(col) {
  return `${BASE_URL}/${BASE_PATH}/${col}`;
}

/**
 * Build a raw document URL (not scoped to BASE_PATH).
 * Used by restoreBackup which writes to arbitrary paths.
 */
export function rawDocUrl(documentPath) {
  return `${BASE_URL}/${documentPath}`;
}

// --- CRUD helpers ---

export async function getDoc(col, docId) {
  const resp = await fetch(docUrl(col, docId), { headers: HEADERS });
  if (!resp.ok) return null;
  return fromFirestoreDoc(await resp.json());
}

export async function setDoc(col, docId, data) {
  const resp = await fetch(docUrl(col, docId), {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
  });
  if (!resp.ok) throw new Error(`Failed to write ${col}/${docId}: ${await resp.text()}`);
}

export async function updateDoc(col, docId, fields) {
  const params = Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join('&');
  const resp = await fetch(`${docUrl(col, docId)}?${params}`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify({ fields: toFirestoreFields(fields) }),
  });
  if (!resp.ok) throw new Error(`Failed to update ${col}/${docId}: ${await resp.text()}`);
}

export async function deleteDoc(col, docId) {
  const resp = await fetch(docUrl(col, docId), { method: 'DELETE', headers: HEADERS });
  if (!resp.ok) throw new Error(`Failed to delete ${col}/${docId}: ${await resp.text()}`);
}

export async function listAll(col) {
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
