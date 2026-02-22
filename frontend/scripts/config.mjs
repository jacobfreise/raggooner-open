#!/usr/bin/env node

/**
 * Shared configuration and Firestore helpers for all scripts.
 * Uses Firebase Admin SDK with service account key for authentication.
 *
 * Supports two modes:
 *   - Emulator (default): connects to local emulator at 127.0.0.1:8080
 *   - Live (--live flag):  connects to production using serviceAccountKey.json
 */

import { readFileSync } from 'fs';
import { createInterface } from 'readline';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// --- Parse CLI flags ---

const args = process.argv.slice(2);
export const IS_LIVE = args.includes('--live');
export const DRY_RUN = args.includes('--dry-run');

export const PROJECT_ID = 'raggooneropen';
export const BASE_PATH = 'artifacts/default-app/public/data';

// --- Live mode confirmation ---

export async function confirmLiveMode() {
  if (!IS_LIVE) return;

  console.log('\n⚠️  WARNING: Running against LIVE database!');
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

let _db;

export function initDb() {
  if (_db) return _db;

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

  _db = getFirestore();
  return _db;
}

/** Get the raw Firestore instance (initializes if needed). */
export function getDb() {
  return initDb();
}

/** Get a collection reference scoped to BASE_PATH. */
export function col(name) {
  return initDb().collection(`${BASE_PATH}/${name}`);
}

// --- CRUD helpers ---

export async function getDoc(colName, docId) {
  const snap = await col(colName).doc(docId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

export async function setDoc(colName, docId, data) {
  await col(colName).doc(docId).set(data);
}

export async function updateDoc(colName, docId, fields) {
  await col(colName).doc(docId).update(fields);
}

export async function deleteDoc(colName, docId) {
  await col(colName).doc(docId).delete();
}

export async function listAll(colName) {
  const snap = await col(colName).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
