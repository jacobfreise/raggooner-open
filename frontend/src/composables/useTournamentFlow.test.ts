import {describe, it, expect, vi, beforeEach, type Mock} from 'vitest'

// Hoist firebase mock before any imports
vi.mock('firebase/firestore', () => ({ FieldValue: class {} }))
vi.mock('../utils/draftUtils', () => ({
    generateDraftStructure: vi.fn().mockReturnValue({
        teams: [{ id: 'team-1' }, { id: 'team-2' }],
        draftOrder: ['team-1', 'team-2', 'team-2', 'team-1'],
    }),
    generateUmaDraftOrder: vi.fn().mockReturnValue(['team-2', 'team-1', 'team-1', 'team-2', 'team-2', 'team-1']),
}))

import { ref } from 'vue'
import { useTournamentFlow } from './useTournamentFlow'
import type {FirestoreUpdate, Tournament} from '../types'

const SMALL_PRESET = [
    { name: 'finals', label: 'Finals', groups: ['A'], racesRequired: 5, teamsAdvancingPerGroup: 0 },
]

const TWO_STAGE_PRESET = [
    { name: 'groups', label: 'Group Stage', groups: ['A', 'B'], racesRequired: 5, teamsAdvancingPerGroup: 1 },
    { name: 'finals', label: 'Finals', groups: ['A'], racesRequired: 5, teamsAdvancingPerGroup: 0 },
]

const makeTeam = (id: string, captainId: string) => ({
    id,
    captainId,
    memberIds: [],
    name: id,
    stagePoints: { finals: 0 },
    stageGroups: { finals: 'A' },
    qualifiedStages: ['finals'],
})

const makeTournament = (override: Partial<Tournament> = {}): Tournament => ({
    id: 't1',
    name: 'Test',
    status: 'registration',
    stages: SMALL_PRESET,
    currentStageIndex: 0,
    playerIds: [],
    players: {},
    teams: [makeTeam('team-1', 'p1')],
    races: {},
    createdAt: new Date().toISOString(),
    ...override,
})

describe('useTournamentFlow — uma-ban format', () => {
    let secureUpdate: Mock<(data: FirestoreUpdate<Tournament>) => Promise<void>>;

    beforeEach(() => {
        secureUpdate = vi.fn().mockResolvedValue(undefined)
    })

    it('track-selection → registration: sets status to registration', async () => {
        const tournament = ref(makeTournament({ format: 'uma-ban', status: 'track-selection' }))
        const { advancePhase } = useTournamentFlow(tournament, secureUpdate)

        await advancePhase()

        expect(secureUpdate).toHaveBeenCalledWith(expect.objectContaining({
            status: 'registration'
        }))
    })

    it('registration → draft: calls secureUpdate with draft status and structure', async () => {
        const tournament = ref(makeTournament({ format: 'uma-ban', status: 'registration' }))
        const { advancePhase } = useTournamentFlow(tournament, secureUpdate)

        await advancePhase()

        expect(secureUpdate).toHaveBeenCalledWith(expect.objectContaining({
            status: 'draft',
            draft: { order: ['team-1', 'team-2', 'team-2', 'team-1'], currentIdx: 0 },
        }))
    })

    it('draft → ban: sets status to ban and records banTimerStart', async () => {
        const tournament = ref(makeTournament({ format: 'uma-ban', status: 'draft' }))
        const { advancePhase } = useTournamentFlow(tournament, secureUpdate)

        await advancePhase()

        expect(secureUpdate).toHaveBeenCalledWith(expect.objectContaining({
            status: 'ban',
            banTimerStart: expect.any(String),
        }))
    })

    it('ban → active: sets status to active with small preset for small tournament', async () => {
        const tournament = ref(makeTournament({ format: 'uma-ban', status: 'ban', teams: [makeTeam('t1', 'p1')] }))
        const { advancePhase } = useTournamentFlow(tournament, secureUpdate)

        await advancePhase()

        expect(secureUpdate).toHaveBeenCalledWith(expect.objectContaining({
            status: 'active',
            stages: SMALL_PRESET,
            currentStageIndex: 0,
        }))
    })

    it('ban → active: sets stages for large tournament (≥ 6 teams)', async () => {
        const teams = Array.from({ length: 6 }, (_, i) => makeTeam(`t${i}`, `p${i}`))
        const tournament = ref(makeTournament({ format: 'uma-ban', status: 'ban', teams }))
        const { advancePhase } = useTournamentFlow(tournament, secureUpdate)

        await advancePhase()

        expect(secureUpdate).toHaveBeenCalledWith(expect.objectContaining({
            status: 'active',
            currentStageIndex: 0,
        }))
    })

    it('active → completed: sets status to completed', async () => {
        const tournament = ref(makeTournament({ format: 'uma-ban', status: 'active' }))
        const { advancePhase } = useTournamentFlow(tournament, secureUpdate, 'test-app')

        await advancePhase()

        expect(secureUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }))
    })
})

describe('useTournamentFlow — uma-draft format', () => {
    let secureUpdate: Mock<(data: FirestoreUpdate<Tournament>) => Promise<void>>;

    beforeEach(() => {
        secureUpdate = vi.fn().mockResolvedValue(undefined)
    })

    it('track-selection → registration: sets status to registration', async () => {
        const tournament = ref(makeTournament({ format: 'uma-draft', status: 'track-selection' }))
        const { advancePhase } = useTournamentFlow(tournament, secureUpdate)

        await advancePhase()

        expect(secureUpdate).toHaveBeenCalledWith(expect.objectContaining({
            status: 'registration'
        }))
    })

    it('ban → pick: transitions to pick phase with uma draft order', async () => {
        const tournament = ref(makeTournament({
            format: 'uma-draft',
            status: 'ban',
            draft: { order: ['team-1', 'team-2', 'team-2', 'team-1'], currentIdx: 4 },
        }))
        const { advancePhase } = useTournamentFlow(tournament, secureUpdate)

        await advancePhase()

        expect(secureUpdate).toHaveBeenCalledWith(expect.objectContaining({
            status: 'pick',
            draft: expect.objectContaining({ currentIdx: 0 }),
        }))
    })

    it('registration → draft: calls secureUpdate with draft status and structure', async () => {
        const tournament = ref(makeTournament({ format: 'uma-draft', status: 'registration' }))
        const { advancePhase } = useTournamentFlow(tournament, secureUpdate)

        await advancePhase()

        expect(secureUpdate).toHaveBeenCalledWith(expect.objectContaining({
            status: 'draft',
            draft: { order: ['team-1', 'team-2', 'team-2', 'team-1'], currentIdx: 0 },
        }))
    })

    it('draft → ban: sets status to ban and records banTimerStart', async () => {
        const tournament = ref(makeTournament({ format: 'uma-draft', status: 'draft' }))
        const { advancePhase } = useTournamentFlow(tournament, secureUpdate)

        await advancePhase()

        expect(secureUpdate).toHaveBeenCalledWith(expect.objectContaining({
            status: 'ban',
            banTimerStart: expect.any(String),
        }))
    })

    it('pick → active: transitions to active', async () => {
        const tournament = ref(makeTournament({ format: 'uma-draft', status: 'pick' }))
        const { advancePhase } = useTournamentFlow(tournament, secureUpdate)

        await advancePhase()

        expect(secureUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' }))
    })

    it('pick → active: sets stages and currentStageIndex for small tournament', async () => {
        const tournament = ref(makeTournament({ format: 'uma-draft', status: 'pick' }))
        const { advancePhase } = useTournamentFlow(tournament, secureUpdate)

        await advancePhase()

        expect(secureUpdate).toHaveBeenCalledWith(expect.objectContaining({
            stages: SMALL_PRESET,
            currentStageIndex: 0,
        }))
    })

    it('active → completed: sets status to completed', async () => {
        const tournament = ref(makeTournament({ format: 'uma-draft', status: 'active' }))
        const { advancePhase } = useTournamentFlow(tournament, secureUpdate)

        await advancePhase()

        expect(secureUpdate).toHaveBeenCalledWith(expect.objectContaining({
            status: 'completed',
            completedAt: expect.any(String),
        }))
    })
})

describe('useTournamentFlow — guards', () => {
    it('isAdvancing prevents concurrent advance calls', async () => {
        let resolveFirst!: () => void
        const slowUpdate = vi.fn().mockImplementation(
            () => new Promise<void>(res => { resolveFirst = res })
        )
        const tournament = ref(makeTournament({ format: 'uma-ban', status: 'draft' }))
        const { advancePhase } = useTournamentFlow(tournament, slowUpdate)

        const first = advancePhase() // starts, doesn't resolve yet
        await advancePhase()         // should return early (isAdvancing = true)

        expect(slowUpdate).toHaveBeenCalledTimes(1)
        resolveFirst()
        await first
    })

    it('does nothing when tournament is null', async () => {
        const secureUpdate = vi.fn()
        const tournament = ref<Tournament | null>(null)
        const { advancePhase } = useTournamentFlow(tournament, secureUpdate)

        await advancePhase()

        expect(secureUpdate).not.toHaveBeenCalled()
    })

    it('reopenTournament reverts completed → active', async () => {
        const secureUpdate = vi.fn().mockResolvedValue(undefined)
        const tournament = ref(makeTournament({ status: 'completed' }))
        const { reopenTournament } = useTournamentFlow(tournament, secureUpdate)

        await reopenTournament()

        expect(secureUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' }))
    })

    it('reopenTournament does nothing when status is not completed', async () => {
        const secureUpdate = vi.fn()
        const tournament = ref(makeTournament({ status: 'active' }))
        const { reopenTournament } = useTournamentFlow(tournament, secureUpdate)

        await reopenTournament()

        expect(secureUpdate).not.toHaveBeenCalled()
    })

    it('reopenTournament handles secureUpdate errors gracefully', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        const alertMock = vi.fn()
        vi.stubGlobal('alert', alertMock)
        const failingUpdate = vi.fn().mockRejectedValueOnce(new Error('network'))
        const tournament = ref(makeTournament({ status: 'completed' }))
        const { reopenTournament } = useTournamentFlow(tournament, failingUpdate)

        await reopenTournament()

        expect(consoleError).toHaveBeenCalled()
        expect(alertMock).toHaveBeenCalled()
        consoleError.mockRestore()
        vi.unstubAllGlobals()
    })

    it('reopenTournament does nothing when tournament is null', async () => {
        const secureUpdate = vi.fn()
        const tournament = ref<Tournament | null>(null)
        const { reopenTournament } = useTournamentFlow(tournament, secureUpdate)

        await reopenTournament()

        expect(secureUpdate).not.toHaveBeenCalled()
    })
})
