import { describe, it, expect, vi } from 'vitest'

vi.mock('firebase/firestore', () => ({ FieldValue: class {} }))

import { generateUmaDraftOrder, generateDraftStructure } from './draftUtils'
import type { Player, Tournament } from '../types'

const makePlayer = (id: string, isCaptain: boolean): Player => ({
    id, name: `Player ${id}`, isCaptain, uma: '',
})

const makeTournament = (override: Partial<Tournament> = {}): Tournament => ({
    id: 't1',
    name: 'Test',
    status: 'registration',
    stages: [],
    currentStageIndex: 0,
    playerIds: [],
    players: {},
    teams: [],
    races: {},
    createdAt: new Date().toISOString(),
    ...override,
})

describe('generateUmaDraftOrder', () => {
    it('builds a 3-round snake from the player draft order (3 teams)', () => {
        // Player draft snake order: A,B,C, C,B,A
        // Unique forward order: [A, B, C]
        // Reversed: [C, B, A]
        // Uma draft (reversed, forward, reversed): [C,B,A, A,B,C, C,B,A]
        const t = makeTournament({
            draft: { order: ['A', 'B', 'C', 'C', 'B', 'A'], currentIdx: 6 },
        })
        expect(generateUmaDraftOrder(t)).toEqual([
            'C', 'B', 'A',
            'A', 'B', 'C',
            'C', 'B', 'A',
        ])
    })

    it('builds a 3-round snake for 4 teams', () => {
        // Player draft snake: A,B,C,D, D,C,B,A
        // Forward: [A,B,C,D], Reversed: [D,C,B,A]
        // Uma draft: [D,C,B,A, A,B,C,D, D,C,B,A]
        const t = makeTournament({
            draft: { order: ['A', 'B', 'C', 'D', 'D', 'C', 'B', 'A'], currentIdx: 8 },
        })
        expect(generateUmaDraftOrder(t)).toEqual([
            'D', 'C', 'B', 'A',
            'A', 'B', 'C', 'D',
            'D', 'C', 'B', 'A',
        ])
    })

    it('returns empty array when draft order is missing', () => {
        const t = makeTournament()
        expect(generateUmaDraftOrder(t)).toEqual([])
    })
})

describe('generateDraftStructure', () => {
    it('creates one team per captain', () => {
        const captains = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].map(id => makePlayer(id, true))
        const t = makeTournament({
            players: Object.fromEntries(captains.map(p => [p.id, p])),
        })
        const { teams } = generateDraftStructure(t)
        expect(teams).toHaveLength(6)
    })

    it('generates a snake draft order (length = teams * 2)', () => {
        const captains = ['c1', 'c2', 'c3'].map(id => makePlayer(id, true))
        const t = makeTournament({
            players: Object.fromEntries(captains.map(p => [p.id, p])),
        })
        const { teams, draftOrder } = generateDraftStructure(t)
        expect(draftOrder).toHaveLength(teams.length * 2)
    })

    it('assigns group A for small tournaments (fewer than 6 teams)', () => {
        const captains = ['c1', 'c2', 'c3'].map(id => makePlayer(id, true))
        const t = makeTournament({
            players: Object.fromEntries(captains.map(p => [p.id, p])),
        })
        const { teams } = generateDraftStructure(t)
        const firstStageName = Object.keys(teams[0]!.stageGroups)[0]!
        expect(teams.every(t => t.stageGroups[firstStageName] === 'A')).toBe(true)
    })

    it('assigns groups A and B for 6-team tournament', () => {
        const captains = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].map(id => makePlayer(id, true))
        const t = makeTournament({
            players: Object.fromEntries(captains.map(p => [p.id, p])),
        })
        const { teams } = generateDraftStructure(t)
        const firstStageName = Object.keys(teams[0]!.stageGroups)[0]!
        const groups = new Set(teams.map(t => t.stageGroups[firstStageName]))
        expect(groups.has('A')).toBe(true)
        expect(groups.has('B')).toBe(true)
        expect(groups.has('C')).toBe(false)
    })

    it('assigns groups A, B, and C for 9-team tournament', () => {
        const captains = Array.from({ length: 9 }, (_, i) => makePlayer(`c${i}`, true))
        const t = makeTournament({
            players: Object.fromEntries(captains.map(p => [p.id, p])),
        })
        const { teams } = generateDraftStructure(t)
        const firstStageName = Object.keys(teams[0]!.stageGroups)[0]!
        const groups = new Set(teams.map(t => t.stageGroups[firstStageName]))
        expect(groups).toEqual(new Set(['A', 'B', 'C']))
    })

    it('each team captain is one of the tournament captains', () => {
        const captains = ['c1', 'c2', 'c3'].map(id => makePlayer(id, true))
        const t = makeTournament({
            players: Object.fromEntries(captains.map(p => [p.id, p])),
        })
        const captainIds = new Set(captains.map(c => c.id))
        const { teams } = generateDraftStructure(t)
        teams.forEach(team => expect(captainIds.has(team.captainId)).toBe(true))
    })
})
