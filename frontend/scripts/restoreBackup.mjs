#!/usr/bin/env node

/**
 * Imports my-database-backup.json into Firestore.
 * Works against both the emulator (default) and live database (--live flag).
 *
 * Usage:
 *   node scripts/restoreBackup.mjs                        # emulator (default)
 *   node scripts/restoreBackup.mjs --live --token <TOKEN>  # live database
 */

import { readFileSync } from 'fs';
import { confirmLiveMode, IS_LIVE, HEADERS, toFirestoreFields, rawDocUrl } from './config.mjs';

const BACKUP_FILE = './my-database-backup.json';

async function main() {
  await confirmLiveMode();

  console.log(`=== Restore Backup${IS_LIVE ? ' (LIVE)' : ''} ===\n`);
  console.log('Loading backup file...');
  const rawData = JSON.parse(readFileSync(BACKUP_FILE, 'utf8'));

  const entries = Object.entries(rawData);
  console.log(`Found ${entries.length} documents to import.`);

  let success = 0;
  let errors = 0;

  for (const [fullPath, data] of entries) {
    // Skip non-document entries (e.g. "metadata" key at the end of the export)
    if (!fullPath.includes('/')) continue;

    const url = rawDocUrl(fullPath);

    try {
      const resp = await fetch(url, {
        method: 'PATCH',
        headers: HEADERS,
        body: JSON.stringify({ fields: toFirestoreFields(data) }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error(`FAILED [${fullPath}]: ${resp.status} ${errText.slice(0, 200)}`);
        errors++;
      } else {
        success++;
        if (success % 50 === 0) console.log(`  ...imported ${success} documents`);
      }
    } catch (err) {
      console.error(`FAILED [${fullPath}]: ${err.message}`);
      errors++;
    }
  }

  console.log(`\nDone! ${success} imported, ${errors} errors.`);
  process.exit(errors > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('\nFailed:', err.message);
  process.exit(1);
});
