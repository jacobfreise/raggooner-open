import {describe, it, expect, vi, beforeEach, type Mock} from 'vitest'

vi.mock('firebase/firestore', () => ({ FieldValue: class {} }))

import { ref } from 'vue'
import { usePlayerDraft } from './usePlayerDraft'
import type {FirestoreUpdate, Player, Team, Tournament} from '../types'

// --- Fixtures ---

const makePlayer = (id: string, isCaptain: boolean, extra: Partial<Player> = {}): Player => ({
    id, name: `Player ${id}`, isCaptain, uma: `uma-${id}`, ...extra,
})

const makeTeam = (id: string, captainId: string, memberIds: string[] = []): Team => ({
    id,
    captainId,
    memberIds,
    name: `Team ${id}`,
    points: 0,
    finalsPoints: 0,
    group: 'A',
})

const makeTournament = (override: Partial<Tournament> = {}): Tournament => ({
    id: 't1',
    name: 'Test',
    status: 'draft',
    stage: 'groups',
    playerIds: [],
    players: {},
    teams: [],
    races: {},
    createdAt: new Date().toISOString(),
    ...override,
})

describe('usePlayerDraft — computed: availablePlayers', () => {
    it('excludes captains from the available pool', () => {
        const captain = makePlayer('c1', true)
        const member = makePlayer('m1', false)
        const tournament = ref(makeTournament({
            players: { c1: captain, m1: member },
            teams: [makeTeam('t1', 'c1')],
        }))
        const { availablePlayers } = usePlayerDraft(tournament, vi.fn(), ref(false))

        expect(availablePlayers.value).toHaveLength(1)
        expect(availablePlayers.value[0]!.id).toBe('m1')
    })

    it('excludes already-drafted players', () => {
        const players = {
            c1: makePlayer('c1', true),
            m1: makePlayer('m1', false),
            m2: makePlayer('m2', false),
        }
        // m1 is already assigned to team t1
        const tournament = ref(makeTournament({
            players,
            teams: [makeTeam('t1', 'c1', ['m1'])],
        }))
        const { availablePlayers } = usePlayerDraft(tournament, vi.fn(), ref(false))

        expect(availablePlayers.value).toHaveLength(1)
        expect(availablePlayers.value[0]!.id).toBe('m2')
    })

    it('returns all non-captain players when no one is drafted yet', () => {
        const players = {
            c1: makePlayer('c1', true),
            m1: makePlayer('m1', false),
            m2: makePlayer('m2', false),
            m3: makePlayer('m3', false),
        }
        const tournament = ref(makeTournament({
            players,
            teams: [makeTeam('t1', 'c1')],
        }))
        const { availablePlayers } = usePlayerDraft(tournament, vi.fn(), ref(false))

        expect(availablePlayers.value).toHaveLength(3)
    })
})

describe('usePlayerDraft — computed: remainingPicks', () => {
    it('returns picks from currentIdx onward', () => {
        const tournament = ref(makeTournament({
            players: { c1: makePlayer('c1', true), c2: makePlayer('c2', true) },
            teams: [makeTeam('t1', 'c1'), makeTeam('t2', 'c2')],
            draft: { order: ['t1', 't2', 't2', 't1'], currentIdx: 1 },
        }))
        const { remainingPicks } = usePlayerDraft(tournament, vi.fn(), ref(false))

        // From idx 1: ['t2', 't2', 't1'] → 3 entries
        expect(remainingPicks.value).toHaveLength(3)
    })

    it('marks the first remaining pick as isCurrent', () => {
        const tournament = ref(makeTournament({
            players: { c1: makePlayer('c1', true), c2: makePlayer('c2', true) },
            teams: [makeTeam('t1', 'c1'), makeTeam('t2', 'c2')],
            draft: { order: ['t1', 't2', 't2', 't1'], currentIdx: 0 },
        }))
        const { remainingPicks } = usePlayerDraft(tournament, vi.fn(), ref(false))

        expect(remainingPicks.value[0]!.isCurrent).toBe(true)
        expect(remainingPicks.value[1]!.isCurrent).toBe(false)
    })
})

describe('usePlayerDraft — computed: isDraftComplete', () => {
    it('is false when there are picks remaining', () => {
        const tournament = ref(makeTournament({
            draft: { order: ['t1', 't2'], currentIdx: 1 },
        }))
        const { isDraftComplete } = usePlayerDraft(tournament, vi.fn(), ref(false))
        expect(isDraftComplete.value).toBe(false)
    })

    it('is true when currentIdx reaches the end of the order', () => {
        const tournament = ref(makeTournament({
            draft: { order: ['t1', 't2'], currentIdx: 2 },
        }))
        const { isDraftComplete } = usePlayerDraft(tournament, vi.fn(), ref(false))
        expect(isDraftComplete.value).toBe(true)
    })
})

describe('usePlayerDraft — action: draftPlayer', () => {
    let secureUpdate: Mock<(data: FirestoreUpdate<Tournament>) => Promise<void>>;

    beforeEach(() => {
        secureUpdate = vi.fn().mockResolvedValue(undefined)
    })

    it('adds player to the current team and advances the index', async () => {
        const player = makePlayer('m1', false)
        const team = makeTeam('t1', 'c1')
        const tournament = ref(makeTournament({
            players: { c1: makePlayer('c1', true), m1: player },
            teams: [team],
            draft: { order: ['t1'], currentIdx: 0 },
        }))
        const { draftPlayer } = usePlayerDraft(tournament, secureUpdate, ref(false))

        await draftPlayer(player)

        expect(secureUpdate).toHaveBeenCalledWith(expect.objectContaining({
            'draft.currentIdx': 1,
        }))
        const call = secureUpdate.mock.calls[0]![0] as any
        expect(call.teams[0].memberIds).toContain('m1')
    })

    it('does nothing when draft is missing', async () => {
        const player = makePlayer('m1', false)
        const tournament = ref(makeTournament({ players: { m1: player }, teams: [] }))
        const { draftPlayer } = usePlayerDraft(tournament, secureUpdate, ref(false))

        await draftPlayer(player)

        expect(secureUpdate).not.toHaveBeenCalled()
    })
})

describe('usePlayerDraft — action: undoLastPick', () => {
    let secureUpdate: Mock<(data: FirestoreUpdate<Tournament>) => Promise<void>>;

    beforeEach(() => {
        secureUpdate = vi.fn().mockResolvedValue(undefined)
    })

    it('removes the last member and decrements the index', async () => {
        const team = makeTeam('t1', 'c1', ['m1', 'm2'])
        const tournament = ref(makeTournament({
            teams: [team],
            draft: { order: ['t1', 't1'], currentIdx: 2 },
        }))
        const { undoLastPick } = usePlayerDraft(tournament, secureUpdate, ref(true))

        await undoLastPick()

        const call = secureUpdate.mock.calls[0]![0] as any
        expect(call.teams[0].memberIds).toEqual(['m1'])
        expect(call['draft.currentIdx']).toBe(1)
    })

    it('does nothing when not admin', async () => {
        const team = makeTeam('t1', 'c1', ['m1'])
        const tournament = ref(makeTournament({
            teams: [team],
            draft: { order: ['t1'], currentIdx: 1 },
        }))
        const { undoLastPick } = usePlayerDraft(tournament, secureUpdate, ref(false))

        await undoLastPick()

        expect(secureUpdate).not.toHaveBeenCalled()
    })

    it('does nothing when currentIdx is already 0', async () => {
        const team = makeTeam('t1', 'c1', [])
        const tournament = ref(makeTournament({
            teams: [team],
            draft: { order: ['t1'], currentIdx: 0 },
        }))
        const { undoLastPick } = usePlayerDraft(tournament, secureUpdate, ref(true))

        await undoLastPick()

        expect(secureUpdate).not.toHaveBeenCalled()
    })
})

describe('usePlayerDraft — computed: currentDrafter', () => {
    it('returns the correct team and captain name', () => {
        const tournament = ref(makeTournament({
            players: { p1: makePlayer('p1', true, { name: 'Alice' }) },
            teams: [makeTeam('t1', 'p1')],
            draft: { order: ['t1'], currentIdx: 0 },
        }))
        const { currentDrafter } = usePlayerDraft(tournament, vi.fn(), ref(false))

        expect(currentDrafter.value?.id).toBe('t1')
        expect(currentDrafter.value?.name).toBe('Alice')
        expect(currentDrafter.value?.teamName).toBe('Team t1')
    })

    it('returns null if draft info is missing', () => {
        const tournament = ref(makeTournament())
        const { currentDrafter } = usePlayerDraft(tournament, vi.fn(), ref(false))
        expect(currentDrafter.value).toBeNull()
    })
})

describe('usePlayerDraft — computed: getRandomWheelGradient', () => {
    it('returns empty string if no candidates', () => {
        const tournament = ref(makeTournament())
        const { getRandomWheelGradient, randomCandidates } = usePlayerDraft(tournament, vi.fn(), ref(false))
        randomCandidates.value = []
        expect(getRandomWheelGradient.value).toBe('')
    })

    it('returns a conic-gradient string for candidates', () => {
        const tournament = ref(makeTournament())
        const { getRandomWheelGradient, randomCandidates } = usePlayerDraft(tournament, vi.fn(), ref(false))
        randomCandidates.value = [makePlayer('p1', false), makePlayer('p2', false)]
        expect(getRandomWheelGradient.value).toContain('conic-gradient')
        expect(getRandomWheelGradient.value).toContain('0%')
        expect(getRandomWheelGradient.value).toContain('100%')
    })
})

describe('usePlayerDraft — random wheel actions', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    it('startRandomDraft picks a winner and opens modal', async () => {
        const secureUpdate = vi.fn().mockResolvedValue(undefined)
        const players = {
            m1: makePlayer('m1', false),
            m2: makePlayer('m2', false),
            c1: makePlayer('c1', true)
        }
        const tournament = ref(makeTournament({
            players,
            teams: [makeTeam('t1', 'c1')],
            draft: { order: ['t1'], currentIdx: 0 }
        }))
        const { startRandomDraft, showRandomModal, randomCandidates } = usePlayerDraft(tournament, secureUpdate, ref(true))

        startRandomDraft()

        expect(showRandomModal.value).toBe(true)
        expect(randomCandidates.value.length).toBeGreaterThan(0)

        // Advance timer for the spin result (5000ms + 300ms buffer)
        await vi.advanceTimersByTimeAsync(5500)
        
        expect(showRandomModal.value).toBe(false)
        expect(secureUpdate).toHaveBeenCalled()
    })

    it('startRandomDraft handles more than 12 candidates with decoys', async () => {
        const secureUpdate = vi.fn().mockResolvedValue(undefined)
        const players: Record<string, Player> = {}
        for (let i = 1; i <= 15; i++) {
            players[`m${i}`] = makePlayer(`m${i}`, false)
        }
        players.c1 = makePlayer('c1', true)
        
        const tournament = ref(makeTournament({
            players,
            teams: [makeTeam('t1', 'c1')],
            draft: { order: ['t1'], currentIdx: 0 }
        }))
        const { startRandomDraft, randomCandidates } = usePlayerDraft(tournament, secureUpdate, ref(true))

        startRandomDraft()

        expect(randomCandidates.value.length).toBe(12) // Decoy logic caps it at 12
    })
})
