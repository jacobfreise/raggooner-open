import { describe, it, expect } from 'vitest';
import { generateDiscordReport } from './exportUtils';
import type { Tournament, Player, Team, Race } from '../types';

describe('exportUtils', () => {
    const makePlayer = (id: string, name: string, uma: string): Player => ({
        id, name, isCaptain: false, uma, totalPoints: 0, groupPoints: 0, finalsPoints: 0
    });

    const makeTeam = (id: string, name: string, captainId: string, group: 'A' | 'B' | 'C' = 'A'): Team => ({
        id, name, captainId, memberIds: [], points: 0, finalsPoints: 0, group
    });

    const makeRace = (id: string, placements: Record<string, number>, stage: 'groups' | 'finals' = 'groups', group: 'A' | 'B' | 'C' = 'A'): Race => ({
        id, placements, stage, group, raceNumber: 1, timestamp: new Date().toISOString()
    });

    const tournament: Tournament = {
        id: 't1',
        name: 'Test Cup',
        status: 'active',
        stage: 'groups',
        playerIds: ['p1', 'p2'],
        players: {
            p1: makePlayer('p1', 'Alice', 'Special Week'),
            p2: makePlayer('p2', 'Bob', 'Silence Suzuka'),
        },
        teams: [
            { ...makeTeam('t1', 'Team Alice', 'p1', 'A'), points: 25 },
            { ...makeTeam('t2', 'Team Bob', 'p2', 'A'), points: 18 }
        ],
        races: {
            'groups-A-1': makeRace('r1', { p1: 1, p2: 2 }, 'groups', 'A')
        },
        createdAt: new Date().toISOString()
    };

    it('generates a basic Discord report', () => {
        const report = generateDiscordReport(tournament);
        
        expect(report).toContain('🏆 TEST CUP');
        expect(report).toContain('Team Alice');
        expect(report).toContain('Alice (Special Week)');
        expect(report).toContain('Team Bob');
        expect(report).toContain('Bob (Silence Suzuka)');
        expect(report).toContain('Race Winners');
    });

    it('includes bans in the report', () => {
        const tWithBans = {
            ...tournament,
            bans: ['Gold Ship', 'Gold Ship', 'Rice Shower']
        };
        const report = generateDiscordReport(tWithBans);
        
        expect(report).toContain('🚫 **Bans:** Gold Ship(×2), Rice Shower');
    });

    it('handles finals in the report', () => {
        const tWithFinals: Tournament = {
            ...tournament,
            races: {
                ...tournament.races,
                'finals-A-1': makeRace('rf', { p1: 1, p2: 2 }, 'finals', 'A')
            },
            teams: tournament.teams.map(t => ({ ...t, inFinals: true, finalsPoints: t.id === 't1' ? 25 : 18 }))
        };
        const report = generateDiscordReport(tWithFinals);
        
        expect(report).toContain('🏁 Finals');
        expect(report).toContain('Team Alice');
    });
});
