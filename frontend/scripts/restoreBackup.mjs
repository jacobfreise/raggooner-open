#!/usr/bin/env node

/**
 * Imports a database backup JSON file into Firestore.
 * Works against both the emulator (default) and live database (--live flag).
 *
 * Usage:
 *   node scripts/restoreBackup.mjs                        # emulator (default)
 *   node scripts/restoreBackup.mjs --dry-run               # preview without writing
 *   node scripts/restoreBackup.mjs --live --dry-run         # preview against production
 *   node scripts/restoreBackup.mjs --live                   # live database
 */

import { readFileSync } from 'fs';
import { confirmLiveMode, IS_LIVE, DRY_RUN, getDb } from './config.mjs';

const BACKUP_FILE = new URL('../scripts/emulator-import.json', import.meta.url);

/**
 * Recursively walks the nested backup format:
 *   { collectionName: { docId: { ...fields, _subcollections?: { ... } } } }
 *
 * Yields { path, data } for every document that has at least one field.
 * Intermediate container documents with no fields are skipped.
 */
function* walkCollections(collections, parentPath = '') {
  for (const [colName, docs] of Object.entries(collections)) {
    for (const [docId, docData] of Object.entries(docs)) {
      const docPath = parentPath ? `${parentPath}/${colName}/${docId}` : `${colName}/${docId}`;
      const { _subcollections, ...fields } = docData;
      if (Object.keys(fields).length > 0) {
        yield { path: docPath, data: fields };
      }
      if (_subcollections) {
        yield* walkCollections(_subcollections, docPath);
      }
    }
  }
}

async function main() {
  await confirmLiveMode();

  console.log(`=== Restore Backup${IS_LIVE ? ' (LIVE)' : ''}${DRY_RUN ? ' [DRY RUN]' : ''} ===\n`);
  console.log('Loading backup file...');
  const rawData = JSON.parse(readFileSync(BACKUP_FILE, 'utf8'));

  const docs = [...walkCollections(rawData)];
  console.log(`Found ${docs.length} documents to import.`);

  const db = getDb();
  let success = 0;
  let errors = 0;

  for (const { path, data } of docs) {
    if (DRY_RUN) {
      success++;
      if (success % 50 === 0 || success <= 5) console.log(`  [preview] ${path}`);
      continue;
    }

    try {
      await db.doc(path).set(data);
      success++;
      if (success % 50 === 0) console.log(`  ...imported ${success} documents`);
    } catch (err) {
      console.error(`FAILED [${path}]: ${err.message}`);
      errors++;
    }
  }

  if (DRY_RUN) console.log(`\n[DRY RUN] Would import ${success} documents. No data was written.`);
  else console.log(`\nDone! ${success} imported, ${errors} errors.`);
  process.exit(errors > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('\nFailed:', err.message);
  process.exit(1);
});
