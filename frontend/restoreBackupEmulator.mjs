#!/usr/bin/env node

/**
 * Imports my-database-backup.json into the Firebase Firestore emulator
 * using the REST API directly. No Firebase SDK needed.
 *
 * Usage: node restoreBackup.mjs
 * Make sure the emulator is running first: firebase emulators:start
 */

import { readFileSync } from 'fs';

const EMULATOR_HOST = '127.0.0.1:8080';
const PROJECT_ID = 'raggooneropen';
const BACKUP_FILE = './my-database-backup.json';

// Convert a JS value to Firestore REST API "Value" format
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

// Convert a flat JS object to Firestore document fields
function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    fields[k] = toFirestoreValue(v);
  }
  return fields;
}

async function main() {
  console.log('Loading backup file...');
  const rawData = JSON.parse(readFileSync(BACKUP_FILE, 'utf8'));

  const entries = Object.entries(rawData);
  console.log(`Found ${entries.length} documents to import.`);

  let success = 0;
  let errors = 0;

  for (const [fullPath, data] of entries) {
    // Skip non-document entries (e.g. "metadata" key at the end of the export)
    if (!fullPath.includes('/')) continue;

    const documentPath = fullPath;
    const url = `http://${EMULATOR_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${documentPath}`;

    try {
      const resp = await fetch(url, {
        method: 'PATCH', // PATCH = create or overwrite
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer owner',  // Bypasses security rules on the emulator
        },
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

main();
