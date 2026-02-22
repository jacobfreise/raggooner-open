import { doc, runTransaction, writeBatch, increment } from 'firebase/firestore';
import { db } from '../firebase';
import type { Tournament } from '../types';

/**
 * Atomically claims the right to sync player metadata by flipping
 * `metadataSynced` from false/undefined → true inside a Firestore transaction.
 *
 * If the flag was already true (another caller won the race), returns false
 * and does nothing. Otherwise, performs the batch increment and returns true.
 */
export async function claimAndSyncMetadata(
    tournament: Tournament,
    appId: string
): Promise<boolean> {
    const tournamentRef = doc(db, 'artifacts', appId, 'public', 'data', 'tournaments', tournament.id);

    const claimed = await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(tournamentRef);
        if (!snap.exists()) return false;

        const data = snap.data();
        if (data?.metadataSynced) return false;

        transaction.update(tournamentRef, { metadataSynced: true });
        return true;
    });

    if (!claimed) return false;

    // We won the race — perform the actual player metadata sync
    const batch = writeBatch(db);

    Object.values(tournament.players).forEach(player => {
        const playerRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', player.id);
        const allRaces = Object.values(tournament.races);
        const playerRaceCount = allRaces.filter(r =>
            Object.keys(r.placements).includes(player.id)
        ).length;

        let totalBeaten = 0;
        let totalFaced = 0;
        allRaces.forEach(race => {
            const position = race.placements[player.id];
            if (position == null) return;
            const playersInRace = Object.keys(race.placements).length;
            totalBeaten += playersInRace - position;
            totalFaced += playersInRace - 1;
        });

        const updateData: Record<string, any> = {
            'metadata.totalTournaments': increment(1),
            'metadata.totalRaces': increment(playerRaceCount),
            'metadata.lastPlayed': new Date().toISOString(),
            'metadata.opponentsFaced': increment(totalFaced),
            'metadata.opponentsBeaten': increment(totalBeaten),
        };

        if (tournament.seasonId) {
            updateData[`metadata.seasons.${tournament.seasonId}.opponentsFaced`] = increment(totalFaced);
            updateData[`metadata.seasons.${tournament.seasonId}.opponentsBeaten`] = increment(totalBeaten);
        }

        batch.update(playerRef, updateData);
    });

    await batch.commit();
    return true;
}

/**
 * Atomically claims the right to unsync player metadata by flipping
 * `metadataSynced` from true → false inside a Firestore transaction.
 *
 * If the flag was already false (another caller won the race), returns false
 * and does nothing. Otherwise, performs the batch decrement and returns true.
 */
export async function claimAndUnsyncMetadata(
    tournament: Tournament,
    appId: string
): Promise<boolean> {
    const tournamentRef = doc(db, 'artifacts', appId, 'public', 'data', 'tournaments', tournament.id);

    const claimed = await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(tournamentRef);
        if (!snap.exists()) return false;

        const data = snap.data();
        if (!data?.metadataSynced) return false;

        transaction.update(tournamentRef, { metadataSynced: false });
        return true;
    });

    if (!claimed) return false;

    // We won the race — perform the actual player metadata reversal
    const batch = writeBatch(db);

    Object.values(tournament.players).forEach(player => {
        const playerRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', player.id);
        const allRaces = Object.values(tournament.races);
        const playerRaceCount = allRaces.filter(r =>
            Object.keys(r.placements).includes(player.id)
        ).length;

        let totalBeaten = 0;
        let totalFaced = 0;
        allRaces.forEach(race => {
            const position = race.placements[player.id];
            if (position == null) return;
            const playersInRace = Object.keys(race.placements).length;
            totalBeaten += playersInRace - position;
            totalFaced += playersInRace - 1;
        });

        const updateData: Record<string, any> = {
            'metadata.totalTournaments': increment(-1),
            'metadata.totalRaces': increment(-playerRaceCount),
            'metadata.opponentsFaced': increment(-totalFaced),
            'metadata.opponentsBeaten': increment(-totalBeaten),
        };

        if (tournament.seasonId) {
            updateData[`metadata.seasons.${tournament.seasonId}.opponentsFaced`] = increment(-totalFaced);
            updateData[`metadata.seasons.${tournament.seasonId}.opponentsBeaten`] = increment(-totalBeaten);
        }

        batch.update(playerRef, updateData);
    });

    await batch.commit();
    return true;
}
