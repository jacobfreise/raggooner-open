import { onSchedule } from "firebase-functions/v2/scheduler";
import {
  getFirestore,
  Firestore,
  Timestamp,
  GeoPoint,
  DocumentReference,
  CollectionReference,
} from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const RETENTION_DAYS = 14;

export const scheduledFirestoreBackup = onSchedule(
  {
    schedule: "0 2 * * *",
    timeZone: "UTC",
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async () => {
    const db = getFirestore();
    const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    await exportToJson(db, dateStr);
    await triggerNativeExport(dateStr);
    await cleanupOldBackups(dateStr);
  }
);

// --- JSON export ---

function serializeValue(value: unknown): unknown {
  if (value instanceof Timestamp) {
    return { _type: "Timestamp", value: value.toDate().toISOString() };
  }
  if (value instanceof GeoPoint) {
    return { _type: "GeoPoint", latitude: value.latitude, longitude: value.longitude };
  }
  if (value instanceof DocumentReference) {
    return { _type: "DocumentReference", path: value.path };
  }
  if (Array.isArray(value)) {
    return (value as unknown[]).map(serializeValue);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, serializeValue(v)])
    );
  }
  return value;
}

async function exportCollection(colRef: CollectionReference): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  const snapshot = await colRef.get();
  for (const doc of snapshot.docs) {
    const data: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(doc.data())) {
      data[key] = serializeValue(val);
    }
    const subcols = await doc.ref.listCollections();
    if (subcols.length > 0) {
      const subs: Record<string, unknown> = {};
      for (const sub of subcols) {
        subs[sub.id] = await exportCollection(sub);
      }
      data._subcollections = subs;
    }
    result[doc.id] = data;
  }
  return result;
}

async function exportToJson(db: Firestore, dateStr: string): Promise<void> {
  const bucket = getStorage().bucket();
  const collections = await db.listCollections();
  const allData: Record<string, unknown> = {};
  for (const col of collections) {
    allData[col.id] = await exportCollection(col);
  }

  const json = JSON.stringify(allData, null, 2);
  const filePath = `backups/json/firestore-backup-${dateStr}.json`;
  await bucket.file(filePath).save(json, { contentType: "application/json" });
  console.log(`JSON backup saved: ${filePath} (${json.length} bytes)`);
}

// --- Native Firestore export (async GCP operation — completes in the background) ---

async function getMetadataToken(): Promise<string> {
  const res = await fetch(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
    { headers: { "Metadata-Flavor": "Google" } }
  );
  if (!res.ok) throw new Error(`Metadata server responded ${res.status}`);
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

async function triggerNativeExport(dateStr: string): Promise<void> {
  const projectId = process.env.GCLOUD_PROJECT;
  if (!projectId) throw new Error("GCLOUD_PROJECT env var is not set");

  const bucketName = getStorage().bucket().name;
  const outputUriPrefix = `gs://${bucketName}/backups/native/${dateStr}`;
  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default):exportDocuments`;
  const token = await getMetadataToken();

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ outputUriPrefix }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Firestore native export failed [${res.status}]: ${body}`);
  }

  const op = await res.json() as { name: string };
  console.log(`Native Firestore export started — operation: ${op.name}, output: ${outputUriPrefix}`);
}

// --- 14-day retention cleanup ---

async function cleanupOldBackups(currentDateStr: string): Promise<void> {
  const bucket = getStorage().bucket();
  const cutoff = new Date(currentDateStr);
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

  // One JSON file per day
  const [jsonFiles] = await bucket.getFiles({ prefix: "backups/json/" });
  for (const file of jsonFiles) {
    const match = file.name.match(/firestore-backup-(\d{4}-\d{2}-\d{2})\.json$/);
    if (match && new Date(match[1]) < cutoff) {
      await file.delete();
      console.log(`Deleted expired JSON backup: ${file.name}`);
    }
  }

  // Native exports produce many files under a date-keyed prefix
  const [nativeFiles] = await bucket.getFiles({ prefix: "backups/native/" });
  for (const file of nativeFiles) {
    const match = file.name.match(/^backups\/native\/(\d{4}-\d{2}-\d{2})\//);
    if (match && new Date(match[1]) < cutoff) {
      await file.delete();
      console.log(`Deleted expired native export file: ${file.name}`);
    }
  }
}
