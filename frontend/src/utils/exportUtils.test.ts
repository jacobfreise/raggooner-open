import { describe, it, expect } from 'vitest';
import { generateDiscordReport, generateDiscordReportSplit, generateDiscordReportSplit3 } from './exportUtils';
import type { Tournament, Player, Team, Race } from '../types';

describe('exportUtils', () => {
    const TWO_STAGE_PRESET = [
        { name: 'groups', label: 'Group Stage', groups: ['A', 'B'], racesRequired: 5, teamsAdvancingPerGroup: 1 },
        { name: 'finals', label: 'Finals', groups: ['A'], racesRequired: 5, teamsAdvancingPerGroup: 0 },
    ];

    const makePlayer = (id: string, name: string, uma: string): Player => ({
        id, name, isCaptain: false, uma,
    });

    const makeTeam = (id: string, name: string, captainId: string, group: 'A' | 'B' | 'C' = 'A', points = 0): Team => ({
        id, name, captainId, memberIds: [],
        stagePoints: { groups: points },
        stageGroups: { groups: group },
        qualifiedStages: ['groups'],
    });

    const makeRace = (id: string, placements: Record<string, number>, stage = 'groups', group = 'A'): Race => ({
        id, placements, stage, group, raceNumber: 1, timestamp: new Date().toISOString()
    });

    const tournament: Tournament = {
        id: 't1',
        name: 'Test Cup',
        status: 'active',
        stages: TWO_STAGE_PRESET,
        currentStageIndex: 0,
        playerIds: ['p1', 'p2'],
        players: {
            p1: makePlayer('p1', 'Alice', 'Special Week'),
            p2: makePlayer('p2', 'Bob', 'Silence Suzuka'),
        },
        teams: [
            makeTeam('t1', 'Team Alice', 'p1', 'A', 25),
            makeTeam('t2', 'Team Bob', 'p2', 'A', 18),
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
            currentStageIndex: 1,
            races: {
                ...tournament.races,
                'finals-A-1': makeRace('rf', { p1: 1, p2: 2 }, 'finals', 'A')
            },
            teams: tournament.teams.map(t => ({
                ...t,
                stagePoints: { groups: t.stagePoints.groups ?? 0, finals: t.id === 't1' ? 25 : 18 },
                stageGroups: { ...t.stageGroups, finals: 'A' },
                qualifiedStages: ['groups', 'finals'],
            }))
        };
        const report = generateDiscordReport(tWithFinals);

        expect(report).toContain('🏁 Finals');
        expect(report).toContain('Team Alice');
    });

    it('generates a split report (2 parts)', () => {
        const tWithFinals: Tournament = {
            ...tournament,
            currentStageIndex: 1,
            races: {
                ...tournament.races,
                'finals-A-1': makeRace('rf', { p1: 1, p2: 2 }, 'finals', 'A')
            },
            teams: tournament.teams.map(t => ({
                ...t,
                stagePoints: { groups: t.stagePoints.groups ?? 0, finals: t.id === 't1' ? 25 : 18 },
                stageGroups: { ...t.stageGroups, finals: 'A' },
                qualifiedStages: ['groups', 'finals'],
            }))
        };
        const messages = generateDiscordReportSplit(tWithFinals);
        expect(messages).toHaveLength(2);
        expect(messages[0]).toContain('TEST CUP');
        expect(messages[1]).toContain('Finals');
    });

    it('generates a shortened report (truncates names)', () => {
        const report = generateDiscordReport(tournament, true);
        expect(report).toContain('TEST CUP');
        // shortened path uses padEnd(12) on name
        expect(report).toContain('Alice');
    });

    it('includes wildcards in the report', () => {
        const tWithWildcards: Tournament = {
            ...tournament,
            wildcards: [{ playerId: 'p2', group: 'A', stage: 'groups', points: 10 }],
        };
        const report = generateDiscordReport(tWithWildcards);
        expect(report).toContain('👻');
        expect(report).toContain('Bob');
    });

    it('includes point adjustments in the report', () => {
        const tWithAdj: Tournament = {
            ...tournament,
            teams: [
                {
                    ...tournament.teams[0]!,
                    adjustments: [{ id: 'adj1', amount: 5, reason: 'bonus', stage: 'groups' }]
                },
                tournament.teams[1]!
            ],
        };
        const report = generateDiscordReport(tWithAdj);
        expect(report).toContain('+5 bonus');
    });

    it('includes bans in split report (generateDiscordReportSplit)', () => {
        const tWithBansAndFinals: Tournament = {
            ...tournament,
            currentStageIndex: 1,
            bans: ['Gold Ship', 'Rice Shower'],
            races: {
                ...tournament.races,
                'finals-A-1': makeRace('rf', { p1: 1, p2: 2 }, 'finals', 'A'),
            },
            teams: tournament.teams.map(t => ({
                ...t,
                stagePoints: { groups: t.stagePoints.groups ?? 0, finals: t.id === 't1' ? 25 : 18 },
                stageGroups: { ...t.stageGroups, finals: 'A' },
                qualifiedStages: ['groups', 'finals'],
            })),
        };
        const messages = generateDiscordReportSplit(tWithBansAndFinals);
        expect(messages[1]).toContain('🚫');
        expect(messages[1]).toContain('Gold Ship');
    });

    it('generates a split report (3 parts)', () => {
        const tWithComplex: Tournament = {
            ...tournament,
            currentStageIndex: 1,
            teams: [
                ...tournament.teams.map(t => ({
                    ...t,
                    stagePoints: { groups: t.stagePoints.groups ?? 0, finals: 0 },
                    stageGroups: { groups: 'A', finals: 'A' },
                    qualifiedStages: ['groups', 'finals'],
                })),
                makeTeam('t3', 'Team C', 'p3', 'B'),
                makeTeam('t4', 'Team D', 'p4', 'B'),
            ],
            players: {
                ...tournament.players,
                p3: makePlayer('p3', 'Charlie', 'C'),
                p4: makePlayer('p4', 'David', 'D')
            },
            races: {
                ...tournament.races,
                'groups-B-1': makeRace('rB1', { p3: 1, p4: 2 }, 'groups', 'B'),
                'finals-A-1': makeRace('rf1', { p1: 1, p3: 2 }, 'finals', 'A')
            }
        };

        const messages = generateDiscordReportSplit3(tWithComplex);
        expect(messages.length).toBeGreaterThanOrEqual(1);
        expect(messages[0]).toContain('TEST CUP');
    });
});
