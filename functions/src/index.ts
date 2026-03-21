import { setGlobalOptions } from "firebase-functions";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

initializeApp();
const db = getFirestore();

setGlobalOptions({ maxInstances: 10 });

// ---------------------------------------------------------------------------
// syncTournamentMetadata
//
// Triggered on any tournament document update. Handles two transitions:
//
// Completion  (status → "completed"):
//   Atomically claims the sync right via a transaction that flips
//   metadataSynced false → true. Only the winner of that transaction
//   proceeds to batch-increment player stats. Any concurrent or retry
//   invocation finds metadataSynced already true and exits cleanly.
//
// Reopen  (status "completed" → anything else):
//   Atomically claims the unsync right via a transaction that flips
//   metadataSynced true → false. Importantly the transaction also checks
//   that the tournament is no longer completed, so a sync invocation that
//   races ahead and sets metadataSynced=true after the unsync transaction
//   reads it cannot cause a double-increment — the unsync claim will
//   succeed before the sync claim can, or vice-versa, never both.
// ---------------------------------------------------------------------------
export const syncTournamentMetadata = onDocumentUpdated(
  "artifacts/{appId}/public/data/tournaments/{tournamentId}",
  async (event) => {
    const before = event.data?.before.data();
    const after  = event.data?.after.data();
    if (!before || !after) return;

    const { appId } = event.params;
    const tournamentRef = event.data!.after.ref;

    if (before.status === after.status) return;

    // ---- SYNC on completion ------------------------------------------------
    if (after.status === "completed" && before.status !== "completed") {
      const claimed = await db.runTransaction(async (tx) => {
        const snap = await tx.get(tournamentRef);
        if (snap.data()?.metadataSynced) return false;
        tx.update(tournamentRef, { metadataSynced: true });
        return true;
      });

      if (!claimed) {
        logger.info("Sync already claimed, skipping.", { tournamentId: tournamentRef.id });
        return;
      }

      logger.info("Syncing player metadata.", { tournamentId: tournamentRef.id });
      await batchUpdatePlayers(db, appId, after, 1);
      return;
    }

    // ---- UNSYNC on reopen --------------------------------------------------
    if (before.status === "completed" && after.status !== "completed") {
      const claimed = await db.runTransaction(async (tx) => {
        const snap = await tx.get(tournamentRef);
        const data = snap.data();
        // Guard 1: nothing was ever synced — nothing to undo.
        if (!data?.metadataSynced) return false;
        // Guard 2: tournament was re-completed between the reopen write and now.
        // Let the sync invocation handle it; we should not unsync.
        if (data?.status === "completed") return false;
        tx.update(tournamentRef, { metadataSynced: false });
        return true;
      });

      if (!claimed) {
        logger.info("Unsync already claimed or not needed, skipping.", { tournamentId: tournamentRef.id });
        return;
      }

      logger.info("Unsyncing player metadata.", { tournamentId: tournamentRef.id });
      // Use `after` — races/players are unchanged between completion and reopen.
      await batchUpdatePlayers(db, appId, after, -1);
    }
  }
);

// ---------------------------------------------------------------------------
// Batch-increments (direction=1) or decrements (direction=-1) every
// participant's aggregate stats in their GlobalPlayer document.
// The metadataSynced flag is flipped inside the transaction above BEFORE
// this runs, so any retry of the function will be rejected by the claim
// check and never reach here a second time.
// ---------------------------------------------------------------------------
async function batchUpdatePlayers(
  db: FirebaseFirestore.Firestore,
  appId: string,
  tournament: FirebaseFirestore.DocumentData,
  direction: 1 | -1
): Promise<void> {
  const players = Object.values(tournament.players ?? {}) as any[];
  const races   = Object.values(tournament.races   ?? {}) as any[];

  const batch = db.batch();

  for (const player of players) {
    const playerRef = db.doc(`artifacts/${appId}/public/data/players/${player.id}`);

    let totalFaced  = 0;
    let totalBeaten = 0;
    let raceCount   = 0;

    for (const race of races) {
      const position = race.placements?.[player.id];
      if (position == null) continue;
      const playersInRace = Object.keys(race.placements).length;
      if (playersInRace <= 1) continue;
      raceCount++;
      totalFaced  += playersInRace - 1;
      totalBeaten += playersInRace - position;
    }

    const update: Record<string, any> = {
      "metadata.totalTournaments": FieldValue.increment(direction),
      "metadata.totalRaces":       FieldValue.increment(direction * raceCount),
      "metadata.opponentsFaced":   FieldValue.increment(direction * totalFaced),
      "metadata.opponentsBeaten":  FieldValue.increment(direction * totalBeaten),
    };

    if (direction === 1) {
      update["metadata.lastPlayed"] = new Date().toISOString();
    }

    if (tournament.seasonId) {
      const s = tournament.seasonId;
      update[`metadata.seasons.${s}.opponentsFaced`]  = FieldValue.increment(direction * totalFaced);
      update[`metadata.seasons.${s}.opponentsBeaten`] = FieldValue.increment(direction * totalBeaten);
    }

    batch.update(playerRef, update);
  }

  await batch.commit();
}
