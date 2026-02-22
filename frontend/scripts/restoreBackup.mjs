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
import { confirmLiveMode, IS_LIVE, DRY_RUN, getDb, BASE_PATH } from './config.mjs';

const BACKUP_FILE = './live4-database-backup.json';

async function main() {
  await confirmLiveMode();

  console.log(`=== Restore Backup${IS_LIVE ? ' (LIVE)' : ''}${DRY_RUN ? ' [DRY RUN]' : ''} ===\n`);
  console.log('Loading backup file...');
  const rawData = JSON.parse(readFileSync(BACKUP_FILE, 'utf8'));

  const entries = Object.entries(rawData);
  console.log(`Found ${entries.length} documents to import.`);

  const db = getDb();
  let success = 0;
  let errors = 0;

  for (const [fullPath, data] of entries) {
    // Skip non-document entries (e.g. "metadata" key at the end of the export)
    if (!fullPath.includes('/')) continue;

    if (DRY_RUN) {
      success++;
      if (success % 50 === 0 || success <= 5) console.log(`  [preview] ${fullPath}`);
      continue;
    }

    try {
      await db.doc(fullPath).set(data);
      success++;
      if (success % 50 === 0) console.log(`  ...imported ${success} documents`);
    } catch (err) {
      console.error(`FAILED [${fullPath}]: ${err.message}`);
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
