import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import readline from 'readline';

// Load your service account
import serviceAccount from './Downloads/raggooneropen-firebase-adminsdk-fbsvc-c150aadd5a.json' assert { type: 'json' };

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function restore() {
    console.log('🚀 Starting Restore to Emulator...');

    // Create a stream to read the fei backup file line-by-line
    const fileStream = fs.createReadStream('my-database-backup.json');
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    let count = 0;

    for await (const line of rl) {
        if (!line.trim()) continue;

        const row = JSON.parse(line);

        // Skip the metadata header line that fei creates
        if (row.metadata) continue;

        // fei saves the exact database path and the document data
        if (row.path && row.data) {
            console.log(`Restoring: ${row.path}`);
            await db.doc(row.path).set(row.data);
            count++;
        }
    }

    console.log(`✅ Restore complete! Successfully imported ${count} documents.`);
}

restore().catch(console.error);