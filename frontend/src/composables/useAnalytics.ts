// composables/useAnalytics.ts
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import type { RaceDocument, TournamentParticipation } from '../types';

export function useAnalytics(appId: string) {

    // Beispiel: Player Statistics
    const getPlayerStats = async (playerId: string, seasonId?: string) => {
        const participationsRef = collection(db, 'artifacts', appId, 'public', 'data', 'participations');

        let q = query(participationsRef, where('playerId', '==', playerId));
        if (seasonId) {
            q = query(q, where('seasonId', '==', seasonId));
        }

        const snap = await getDocs(q);
        const participations = snap.docs.map(doc => doc.data() as TournamentParticipation);

        const totalPoints = participations.reduce((sum, p) => sum + p.totalPoints, 0);
        const avgPoints = totalPoints / participations.length || 0;

        return {
            tournaments: participations.length,
            totalPoints,
            avgPoints,
            participations
        };
    };

    // Beispiel: Uma Win Rate
    const getUmaStats = async (umaName: string, seasonId?: string) => {
        const racesRef = collection(db, 'artifacts', appId, 'public', 'data', 'races');

        let q = query(racesRef);
        if (seasonId) {
            q = query(q, where('seasonId', '==', seasonId));
        }

        const snap = await getDocs(q);
        const allRaces = snap.docs.map(doc => doc.data() as RaceDocument);

        // Filter races where this uma was played
        const umaRaces = allRaces.filter(race =>
            Object.values(race.umaMapping).includes(umaName)
        );

        let wins = 0;
        let totalRaces = umaRaces.length;

        umaRaces.forEach(race => {
            // Find player who had this uma
            const playerId = Object.keys(race.umaMapping).find(
                pid => race.umaMapping[pid] === umaName
            );

            if (playerId && race.placements[playerId] === 1) {
                wins++;
            }
        });

        return {
            totalRaces,
            wins,
            winRate: totalRaces > 0 ? (wins / totalRaces) * 100 : 0,
            avgPosition: calculateAvgPosition(umaRaces, umaName)
        };
    };

    const calculateAvgPosition = (races: RaceDocument[], umaName: string): number => {
        let totalPosition = 0;
        let count = 0;

        races.forEach(race => {
            const playerId = Object.keys(race.umaMapping).find(
                pid => race.umaMapping[pid] === umaName
            );

            if (playerId && race.placements[playerId]) {
                totalPosition += race.placements[playerId];
                count++;
            }
        });

        return count > 0 ? totalPosition / count : 0;
    };

    return {
        getPlayerStats,
        getUmaStats
    };
}