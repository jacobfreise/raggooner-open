import { writeBatch, doc } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import type { Tournament, Player, Team } from '../types';

// Mock data
const UMAS = ['Special Week', 'Silence Suzuka', 'Tokai Teio', 'Maruzensky', 'Fuji Kiseki', 'Oguri Cap', 'Gold Ship', 'Vodka', 'Daiwa Scarlet', 'Taiki Shuttle'];
const TEAM_NAMES = ['Carrot Chasers', 'Speedy Spuds', 'Derby Dashers', 'G1 Winners', 'Bite the Dust', 'Triple Crowners'];
const TEAM_COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

// Fallback points system if you don't pass one in
const MOCK_POINTS_SYSTEM: Record<number, number> = {
    1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2,
    10: 1, 11: 0, 12: 0, 13: 0, 14: 0, 15: 0, 16: 0, 17: 0, 18: 0
};

export const seedDatabase = async (db: any, auth: any, appId: string) => {
    try {
        console.log('🌱 Starting database seed...');

        // 1. Ensure Auth is ready
        if (!auth.currentUser) {
            console.log('🔒 Signing in anonymously...');
            await signInAnonymously(auth);
        }
        const userId = auth.currentUser!.uid;

        // 2. Prepare our 3 tournament configurations
        const configs = [
            { name: 'Seed: Small (9P, 3T)', pCount: 9, tCount: 3 },
            { name: 'Seed: Medium (12P, 4T)', pCount: 12, tCount: 4 },
            { name: 'Seed: Massive (18P, 6T)', pCount: 18, tCount: 6 },
            { name: 'Seed: Crazy (27P, 9T)', pCount: 27, tCount: 9 }
        ];

        const batch = writeBatch(db);
        const generatedPasswords: Record<string, string> = {};

        // 3. Loop through configurations
        for (const config of configs) {
            const id = Math.random().toString(36).substring(2, 8).toUpperCase();
            const password = Math.random().toString(36).substring(2, 6).toUpperCase();

            const players: Player[] = [];
            const teams: Team[] = [];
            const playersPerTeam = config.pCount / config.tCount;
            const groups: ('A' | 'B' | 'C')[] = ['A', 'A', 'A', 'B', 'B', 'B', 'C', 'C', 'C'];

            // Generate Players
            for (let i = 0; i < config.pCount; i++) {
                players.push({
                    id: `p_${Math.random().toString(36).substring(2, 9)}`,
                    name: `Player ${i + 1}`,
                    isCaptain: false,
                    uma: UMAS[Math.floor(Math.random() * UMAS.length)]!,
                    totalPoints: 0, groupPoints: 0, finalsPoints: 0
                });
            }

            // Generate Teams & Assign Players
            for (let i = 0; i < config.tCount; i++) {
                const teamPlayers = players.slice(i * playersPerTeam, (i + 1) * playersPerTeam);

                const captain = teamPlayers[0]!;
                captain.isCaptain = true; // Set captain status

                teams.push({
                    id: `t_${Math.random().toString(36).substring(2, 9)}`,
                    name: TEAM_NAMES[i % TEAM_NAMES.length]!,
                    captainId: captain.id,
                    memberIds: teamPlayers.slice(1).map(p => p.id),
                    points: 0, finalsPoints: 0,
                    group: config.tCount < 6 ? 'A' : groups[i % groups.length]!,
                    color: TEAM_COLORS[i % TEAM_COLORS.length],
                    inFinals: config.tCount < 6,
                    adjustments: []
                });
            }

            // Create the Tournament Object (NO password here!)
            const newTourney: Tournament = {
                id,
                name: config.name,
                status: 'active', // Set to active so you can test them immediately
                stage: config.tCount < 6 ? 'finals' : 'groups',
                players,
                playerIds: players.map(p => p.id),
                teams,
                races: [],
                wildcards: [],
                bans: [],
                isSecured: true,
                usePlacementTiebreaker: true,
                pointsSystem: { ...MOCK_POINTS_SYSTEM },
                createdAt: new Date().toISOString(),
            };

            // Define Document Refs
            const tournamentRef = doc(db, 'artifacts', appId, 'public', 'data', 'tournaments', id);
            const secretRef = doc(db, 'artifacts', appId, 'public', 'data', 'secrets', id);
            const adminRef = doc(db, 'artifacts', appId, 'public', 'data', 'admins', `${id}_${userId}`);

            // Add to Batch
            batch.set(tournamentRef, newTourney);
            batch.set(secretRef, { password: password });
            batch.set(adminRef, { tournamentId: id, userId: userId, password: password });

            // Save to localStorage so you are automatically Admin
            localStorage.setItem(`admin_pwd_${id}`, password);

            generatedPasswords[config.name] = `ID: ${id} | PWD: ${password}`;
        }

        // 4. Commit all 9 documents at once
        await batch.commit();

        console.log('🎉 Seeding complete! You are automatically an admin for all of these.');
        console.table(generatedPasswords);

    } catch (error) {
        console.error('❌ Error seeding database:', error);
    }
};