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

    it('returns empty results if no one qualifies', () => {
        const tournament: Tournament = {
            ...baseTournament,
            races: {}
        };

        const { activeStats } = useHallOfFame(ref(tournament));
        expect(activeStats.value).toEqual([]);
    });
});
