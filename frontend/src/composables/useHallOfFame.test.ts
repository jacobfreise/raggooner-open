import { describe, it, expect } from 'vitest';
import { ref } from 'vue';
import { useHallOfFame } from './useHallOfFame';
import type { Tournament, Player, Team, Race } from '../types';

describe('useHallOfFame', () => {
    const makePlayer = (id: string, name: string): Player => ({
        id, name, isCaptain: false, uma: 'uma', totalPoints: 0
    });

    const makeTeam = (id: string, name: string, captainId: string, memberIds: string[] = []): Team => ({
        id, name, captainId, memberIds, points: 0, finalsPoints: 0, group: 'A'
    });

    const makeRace = (id: string, placements: Record<string, number>, stage: 'groups' | 'finals' = 'groups', raceNumber: number = 1): Race => ({
        id, placements, stage, group: 'A', raceNumber, timestamp: new Date().toISOString()
    });

    const baseTournament: Tournament = {
        id: 't1',
        name: 'Test',
        status: 'completed',
        stage: 'finals',
        playerIds: ['p1', 'p2', 'p3'],
        players: {
            p1: makePlayer('p1', 'Player 1'),
            p2: makePlayer('p2', 'Player 2'),
            p3: makePlayer('p3', 'Player 3'),
        },
        teams: [
            { ...makeTeam('t1', 'Team 1', 'p1', ['p2', 'p3']), inFinals: true }
        ],
        races: {},
        createdAt: new Date().toISOString()
    };

    it('calculates MVP correctly', () => {
        const tournament = {
            ...baseTournament,
            players: {
                p1: { ...baseTournament.players.p1!, totalPoints: 100 },
                p2: { ...baseTournament.players.p2!, totalPoints: 50 },
                p3: { ...baseTournament.players.p3!, totalPoints: 50 },
            },
            races: {
                r1: makeRace('r1', { p1: 1, p2: 2, p3: 3 }),
                r2: makeRace('r2', { p1: 1, p2: 2, p3: 3 }),
                r3: makeRace('r3', { p1: 1, p2: 2, p3: 3 }),
            }
        };

        const { activeStats } = useHallOfFame(ref(tournament));
        const mvp = activeStats.value.find(s => s.id === 'mvp');
        
        expect(mvp).toBeDefined();
        expect(mvp?.results[0]?.winner.id).toBe('p1');
        expect(mvp?.results[0]?.value).toBe(100);
    });

    it('calculates Flawless Victory correctly', () => {
        const tournament: Tournament = {
            ...baseTournament,
            races: {
                r1: makeRace('r1', { p1: 1, p2: 2, p3: 3 }),
                r2: makeRace('r2', { p1: 1, p2: 2, p3: 3 }),
                r3: makeRace('r3', { p1: 1, p2: 2, p3: 3 }),
            }
        };

        const { activeStats } = useHallOfFame(ref(tournament));
        const flawless = activeStats.value.find(s => s.id === 'flawless_victory');
        
        expect(flawless).toBeDefined();
        expect(flawless?.results[0]?.winner.id).toBe('t1');
    });

    it('calculates The Anchor correctly', () => {
        const tournament: Tournament = {
            ...baseTournament,
            races: {
                r1: makeRace('r1', { p1: 1, p2: 2, p3: 12 }),
                r2: makeRace('r2', { p1: 1, p2: 2, p3: 12 }),
                r3: makeRace('r3', { p1: 1, p2: 2, p3: 12 }),
            }
        };

        const { activeStats } = useHallOfFame(ref(tournament));
        const anchor = activeStats.value.find(s => s.id === 'the_anchor');
        
        expect(anchor).toBeDefined();
        expect(anchor?.results[0]?.winner.id).toBe('p3');
        expect(anchor?.results[0]?.value).toBe(3);
    });

    it('calculates The Clutcher correctly', () => {
        const tournament: Tournament = {
            ...baseTournament,
            races: {
                r1: makeRace('r1', { p1: 8 }, 'groups', 1),
                r2: makeRace('r2', { p1: 8 }, 'groups', 2),
                r3: makeRace('r3', { p1: 1 }, 'finals', 1),
                r4: makeRace('r4', { p1: 1 }, 'finals', 2),
            }
        };

        const { activeStats } = useHallOfFame(ref(tournament));
        const clutcher = activeStats.value.find(s => s.id === 'clutcher');
        
        expect(clutcher).toBeDefined();
        expect(clutcher?.results[0]?.winner.id).toBe('p1');
        // Group Avg: 8, Finals Avg: 1, Improvement: 7.0
        expect(clutcher?.results[0]?.value).toBe('+7.0');
    });

    it('calculates The YOYO correctly', () => {
        const tournament: Tournament = {
            ...baseTournament,
            races: {
                // p1 moves between 1 (Top) and 12 (Bottom)
                // We add other players to ensure field size is 12
                r1: makeRace('r1', { p1: 1, p2: 2, p3: 3, x1: 4, x2: 5, x3: 6, x4: 7, x5: 8, x6: 9, x7: 10, x8: 11, x9: 12 }), 
                r2: makeRace('r2', { p1: 12, p2: 1, p3: 2, x1: 3, x2: 4, x3: 5, x4: 6, x5: 7, x6: 8, x7: 9, x8: 10, x9: 11 }),
                r3: makeRace('r3', { p1: 1, p2: 2, p3: 3, x1: 4, x2: 5, x3: 6, x4: 7, x5: 8, x6: 9, x7: 10, x8: 11, x9: 12 }),
                r4: makeRace('r4', { p1: 12, p2: 1, p3: 2, x1: 3, x2: 4, x3: 5, x4: 6, x5: 7, x6: 8, x7: 9, x8: 10, x9: 11 }),
            }
        };

        const { activeStats } = useHallOfFame(ref(tournament));
        const yoyo = activeStats.value.find(s => s.id === 'the_yoyo');
        
        expect(yoyo).toBeDefined();
        expect(yoyo?.results[0]?.winner.id).toBe('p1');
        expect(yoyo?.results[0]?.value).toBe(3); // 3 whiplashes: 1->12, 12->1, 1->12
    });

    it('calculates Comeback Kings correctly', () => {
        const tournament: Tournament = {
            ...baseTournament,
            teams: [
                { ...makeTeam('t1', 'Team 1', 'p1'), inFinals: true },
                { ...makeTeam('t2', 'Team 2', 'p2'), inFinals: true }
            ],
            races: {
                // p2 (Team 2) leading by 40 points before last 2 races
                r1: makeRace('r1', { p2: 1, p1: 12 }, 'finals', 1), // p2: 25, p1: 0
                r2: makeRace('r2', { p2: 1, p1: 12 }, 'finals', 2), // p2: 50, p1: 0
                r3: makeRace('r3', { p1: 1, p2: 12 }, 'finals', 3), // p1: 25, p2: 50
                r4: makeRace('r4', { p1: 1, p2: 12 }, 'finals', 4), // p1: 50, p2: 50
                // Wait, if they are tied at the end, who wins? 
                // Comeback Kings looks at the eventual winner. 
                // Let's make p1 win by 1 point at the end.
            }
        };
        // Adding more points to p1 to ensure they win
        tournament.teams[0]!.finalsPoints = 51;
        tournament.teams[1]!.finalsPoints = 50;

        const { activeStats } = useHallOfFame(ref(tournament));
        const comeback = activeStats.value.find(s => s.id === 'comeback_kings');
        
        expect(comeback).toBeDefined();
        expect(comeback?.results[0]?.winner.id).toBe('t1');
    });

    it('calculates One-Two Punch correctly', () => {
        const tournament: Tournament = {
            ...baseTournament,
            races: {
                r1: makeRace('r1', { p1: 1, p2: 2, p3: 3 }),
                r2: makeRace('r2', { p1: 1, p2: 2, p3: 3 }),
            }
        };
        // p1 and p2 are in Team 1
        const { activeStats } = useHallOfFame(ref(tournament));
        const punch = activeStats.value.find(s => s.id === 'one_two_punch');
        
        expect(punch).toBeDefined();
        expect(punch?.results[0]?.winner.id).toBe('t1');
        expect(punch?.results[0]?.value).toBe('2x');
    });

    it('returns empty results if no one qualifies', () => {
        const tournament: Tournament = {
            ...baseTournament,
            races: {}
        };

        const { activeStats } = useHallOfFame(ref(tournament));
        expect(activeStats.value).toEqual([]);
    });
});
