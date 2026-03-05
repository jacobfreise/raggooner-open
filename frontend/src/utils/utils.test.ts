import { describe, it, expect, vi } from 'vitest'

vi.mock('firebase/firestore', () => ({ FieldValue: class {} }))

import {
    raceKey,
    compareTeams,
    recalculateTournamentScores,
    getPlayerName,
    getPlayerUma,
    migratePlayers,
    migrateRaces,
    getStatusColor,
    getPositionStyle,
    getRankColor,
    getPlayerAtPosition,
    getRaceTimestamp,
} from './utils'
import type { Player, Race, Team, Tournament } from '../types'

// --- Fixtures ---

const makePlayer = (id: string, name: string, isCaptain = false): Player => ({
    id, name, isCaptain, uma: `uma-${id}`,
})

const makeTeam = (id: string, captainId: string, override: Partial<Team> = {}): Team => ({
    id,
    captainId,
    memberIds: [],
    name: `Team ${id}`,
    points: 0,
    finalsPoints: 0,
    group: 'A',
    ...override,
})

const makeRace = (id: string, group: 'A' | 'B' | 'C', raceNumber: number, placements: Record<string, number>, stage: 'groups' | 'finals' = 'groups'): Race => ({
    id,
    stage,
    group,
    raceNumber,
    timestamp: new Date().toISOString(),
    placements,
})

const makeTournament = (override: Partial<Tournament> = {}): Tournament => ({
    id: 't1',
    name: 'Test Tournament',
    status: 'active',
    stage: 'groups',
    playerIds: [],
    players: {},
    teams: [],
    races: {},
    createdAt: new Date().toISOString(),
    ...override,
})

// --- Tests ---

describe('raceKey', () => {
    it('generates the correct key format', () => {
        expect(raceKey('groups', 'A', 1)).toBe('groups-A-1')
        expect(raceKey('finals', 'B', 3)).toBe('finals-B-3')
    })
})

describe('compareTeams', () => {
    it('sorts higher-points team first (returns negative when a > b)', () => {
        const t = makeTournament()
        const a = makeTeam('a', 'p1', { points: 100 })
        const b = makeTeam('b', 'p2', { points: 50 })
        expect(compareTeams(a, b, false, t)).toBeLessThan(0)
    })

    it('returns 0 when both teams are perfectly tied with no tiebreaker', () => {
        const t = makeTournament({ usePlacementTiebreaker: false })
        const a = makeTeam('a', 'p1', { points: 50 })
        const b = makeTeam('b', 'p2', { points: 50 })
        expect(compareTeams(a, b, false, t)).toBe(0)
    })

    it('uses finalsPoints when isFinals = true', () => {
        const t = makeTournament()
        const a = makeTeam('a', 'p1', { points: 0, finalsPoints: 100 })
        const b = makeTeam('b', 'p2', { points: 100, finalsPoints: 0 })
        // a has more finals points → a sorts first → result < 0
        expect(compareTeams(a, b, false, t, true)).toBeLessThan(0)
    })

    it('falls back to id comparison when useIdFallback = true and points are equal', () => {
        const t = makeTournament({ usePlacementTiebreaker: false })
        const a = makeTeam('a', 'p1', { points: 50 })
        const b = makeTeam('b', 'p2', { points: 50 })
        expect(compareTeams(a, b, true, t)).not.toBe(0)
    })

    it('uses placement countback: more 1st places sorts first', () => {
        const cap1 = 'p1', cap2 = 'p2'
        const team1 = makeTeam('t1', cap1, { group: 'A', points: 50 })
        const team2 = makeTeam('t2', cap2, { group: 'A', points: 50 })
        const t = makeTournament({
            teams: [team1, team2],
            races: {
                'groups-A-1': makeRace('r1', 'A', 1, { [cap1]: 1, [cap2]: 2 }),
            },
            usePlacementTiebreaker: true,
        })
        // team1 has a 1st, team2 has a 2nd → team1 sorts first → result < 0
        expect(compareTeams(team1, team2, false, t)).toBeLessThan(0)
    })
})

describe('recalculateTournamentScores', () => {
    it('assigns correct points based on default point system', () => {
        const cap1 = 'p1', cap2 = 'p2'
        const team1 = makeTeam('t1', cap1, { group: 'A' })
        const team2 = makeTeam('t2', cap2, { group: 'A' })
        const t = makeTournament({
            teams: [team1, team2],
            players: {
                [cap1]: makePlayer(cap1, 'Alice', true),
                [cap2]: makePlayer(cap2, 'Bob', true),
            },
            races: {
                'groups-A-1': makeRace('r1', 'A', 1, { [cap1]: 1, [cap2]: 2 }),
            },
        })

        const { teams } = recalculateTournamentScores(t)
        expect(teams.find(t => t.id === 't1')!.points).toBe(25) // 1st place
        expect(teams.find(t => t.id === 't2')!.points).toBe(18) // 2nd place
    })

    it('separates group and finals points', () => {
        const cap1 = 'p1'
        const team1 = makeTeam('t1', cap1, { group: 'A' })
        const t = makeTournament({
            teams: [team1],
            players: { [cap1]: makePlayer(cap1, 'Alice', true) },
            races: {
                'groups-A-1': makeRace('r1', 'A', 1, { [cap1]: 1 }, 'groups'),
                'finals-A-1': makeRace('r2', 'A', 1, { [cap1]: 2 }, 'finals'),
            },
        })

        const { teams } = recalculateTournamentScores(t)
        const t1 = teams.find(t => t.id === 't1')!
        expect(t1.points).toBe(25)      // groups: 1st = 25
        expect(t1.finalsPoints).toBe(18) // finals: 2nd = 18
    })

    it('applies point adjustments (penalties/bonuses)', () => {
        const cap1 = 'p1'
        const team1 = makeTeam('t1', cap1, {
            group: 'A',
            adjustments: [{ id: 'adj1', amount: -10, reason: 'Penalty', stage: 'groups' }],
        })
        const t = makeTournament({
            teams: [team1],
            players: { [cap1]: makePlayer(cap1, 'Alice', true) },
            races: {
                'groups-A-1': makeRace('r1', 'A', 1, { [cap1]: 1 }),
            },
        })

        const { teams } = recalculateTournamentScores(t)
        expect(teams.find(t => t.id === 't1')!.points).toBe(15) // 25 - 10
    })

    it('tallies player-level totalPoints', () => {
        const cap1 = 'p1'
        const team1 = makeTeam('t1', cap1, { group: 'A' })
        const t = makeTournament({
            teams: [team1],
            players: { [cap1]: makePlayer(cap1, 'Alice', true) },
            races: {
                'groups-A-1': makeRace('r1', 'A', 1, { [cap1]: 1 }),
                'groups-A-2': makeRace('r2', 'A', 2, { [cap1]: 3 }),
            },
        })

        const { players } = recalculateTournamentScores(t)
        expect(players[cap1]!.totalPoints).toBe(25 + 15) // 1st + 3rd
    })
})

describe('getPlayerName', () => {
    it('returns the player name', () => {
        const t = makeTournament({ players: { p1: makePlayer('p1', 'Alice') } })
        expect(getPlayerName(t, 'p1')).toBe('Alice')
    })

    it("returns 'Unknown' for a missing player id", () => {
        const t = makeTournament()
        expect(getPlayerName(t, 'nonexistent')).toBe('Unknown')
    })
})

describe('getPlayerUma', () => {
    it('returns the player uma', () => {
        const t = makeTournament({ players: { p1: makePlayer('p1', 'Alice') } })
        expect(getPlayerUma(t, 'p1')).toBe('uma-p1')
    })

    it("returns '' for a missing player", () => {
        const t = makeTournament()
        expect(getPlayerUma(t, 'missing')).toBe('')
    })
})

describe('migratePlayers', () => {
    it('converts an array of players to a keyed map', () => {
        const players = [makePlayer('p1', 'Alice'), makePlayer('p2', 'Bob')]
        const result = migratePlayers(players)
        expect(result['p1']!.name).toBe('Alice')
        expect(result['p2']!.name).toBe('Bob')
    })

    it('passes through an existing map unchanged', () => {
        const players = { p1: makePlayer('p1', 'Alice') }
        expect(migratePlayers(players)).toEqual(players)
    })

    it('returns empty map for null/undefined input', () => {
        expect(migratePlayers(null)).toEqual({})
    })
})

describe('migrateRaces', () => {
    it('converts a race array to a keyed map using raceKey', () => {
        const race = makeRace('r1', 'A', 1, { p1: 1 })
        const result = migrateRaces([race])
        expect(result['groups-A-1']).toEqual(race)
    })

    it('passes through an existing map unchanged', () => {
        const races = { 'groups-A-1': makeRace('r1', 'A', 1, { p1: 1 }) }
        expect(migrateRaces(races)).toEqual(races)
    })
})

describe('UI Helpers', () => {
    describe('getStatusColor', () => {
        it('returns correct classes for statuses', () => {
            expect(getStatusColor('registration')).toContain('text-green-300')
            expect(getStatusColor('active')).toContain('text-indigo-300')
            expect(getStatusColor('draft')).toContain('text-yellow-300')
            expect(getStatusColor('track-selection')).toContain('text-cyan-300')
            expect(getStatusColor('unknown')).toContain('text-slate-400')
        })
    })

    describe('getPositionStyle', () => {
        it('returns correct classes for positions', () => {
            expect(getPositionStyle(1)).toContain('text-amber-500')
            expect(getPositionStyle(2)).toContain('text-slate-300')
            expect(getPositionStyle(3)).toContain('text-orange-600')
            expect(getPositionStyle(4)).toContain('text-slate-400')
            expect(getPositionStyle(0)).toContain('text-slate-600')
        })

        it('applies finals ring', () => {
            expect(getPositionStyle(1, 'finals')).toContain('ring-2')
        })
    })

    describe('getRankColor', () => {
        it('returns correct border colors', () => {
            expect(getRankColor(0)).toBe('border-amber-400')
            expect(getRankColor(1)).toBe('border-slate-400')
            expect(getRankColor(2)).toBe('border-orange-700')
            expect(getRankColor(3)).toBe('border-slate-700')
        })
    })

    describe('getPlayerAtPosition', () => {
        it('returns the player ID at a given position', () => {
            const t = makeTournament({
                races: {
                    'groups-A-1': makeRace('r1', 'A', 1, { 'p1': 1, 'p2': 2 })
                }
            })
            expect(getPlayerAtPosition('A', 1, 1, t, 'groups')).toBe('p1')
            expect(getPlayerAtPosition('A', 1, 2, t, 'groups')).toBe('p2')
            expect(getPlayerAtPosition('A', 1, 3, t, 'groups')).toBe('')
        })

        it('returns empty string if race is not found', () => {
            expect(getPlayerAtPosition('A', 1, 1, null, 'groups')).toBe('')
        })
    })

    describe('getRaceTimestamp', () => {
        it('returns formatted time', () => {
            const timestamp = new Date('2024-01-01T12:00:00Z').toISOString()
            const t = makeTournament({
                races: {
                    'groups-A-1': { ...makeRace('r1', 'A', 1, {}), timestamp }
                }
            })
            const result = getRaceTimestamp('A', 1, t, 'groups')
            expect(result).not.toBe('Not Started')
        })

        it('returns Not Started if race missing', () => {
            expect(getRaceTimestamp('A', 1, null, 'groups')).toBe('Not Started')
        })
    })
})
