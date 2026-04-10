import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';

vi.mock('../utils/umaData', () => ({
    UMA_DICT: {
        'Special Week': { id: 'special-week' },
        'Silence Suzuka': { id: 'silence-suzuka' }
    }
}));

import { useUmaDraft } from './useUmaDraft';
import type { Tournament } from '../types';

describe('useUmaDraft', () => {
    const makeTournament = (override: Partial<Tournament> = {}): Tournament => ({
        id: 't1',
        name: 'Test',
        status: 'draft',
        stage: 'groups',
        playerIds: [],
        players: {},
        teams: [
            { id: 'team1', name: 'Team 1', captainId: 'p1', memberIds: [], points: 0, finalsPoints: 0, group: 'A', color: '#ff0000' },
            { id: 'team2', name: 'Team 2', captainId: 'p2', memberIds: [], points: 0, finalsPoints: 0, group: 'A', color: '#00ff00' }
        ],
        races: {},
        createdAt: new Date().toISOString(),
        draft: {
            order: ['team1', 'team2', 'team2', 'team1'],
            currentIdx: 0
        },
        ...override
    });

    const secureUpdate = vi.fn();
    const isAdmin = ref(true);

    beforeEach(() => {
        secureUpdate.mockClear();
        isAdmin.value = true;
    });

    it('identifies the current picker correctly', () => {
        const tournament = ref(makeTournament());
        const { currentPicker } = useUmaDraft(tournament, secureUpdate, isAdmin);

        expect(currentPicker.value?.id).toBe('team1');

        tournament.value.draft!.currentIdx = 1;
        expect(currentPicker.value?.id).toBe('team2');
    });

    it('picks an uma correctly', async () => {
        const tournament = ref(makeTournament());
        const { pickUma } = useUmaDraft(tournament, secureUpdate, isAdmin);

        await pickUma('Special Week');

        expect(secureUpdate).toHaveBeenCalledWith(expect.objectContaining({
            'draft.currentIdx': 1,
            teams: expect.arrayContaining([
                expect.objectContaining({
                    id: 'team1',
                    umaPool: ['Special Week']
                })
            ])
        }));
    });

    it('undoes the last pick correctly', async () => {
        const tournament = ref(makeTournament({
            teams: [
                { id: 'team1', name: 'Team 1', captainId: 'p1', memberIds: [], points: 0, finalsPoints: 0, group: 'A', umaPool: ['Special Week'] },
                { id: 'team2', name: 'Team 2', captainId: 'p2', memberIds: [], points: 0, finalsPoints: 0, group: 'A' }
            ],
            draft: {
                order: ['team1', 'team2'],
                currentIdx: 1
            }
        }));
        const { undoLastPick } = useUmaDraft(tournament, secureUpdate, isAdmin);

        await undoLastPick();

        expect(secureUpdate).toHaveBeenCalledWith(expect.objectContaining({
            'draft.currentIdx': 0,
            teams: expect.arrayContaining([
                expect.objectContaining({
                    id: 'team1',
                    umaPool: []
                })
            ])
        }));
    });

    it('does not pick if not admin', async () => {
        isAdmin.value = false;
        const tournament = ref(makeTournament());
        const { pickUma } = useUmaDraft(tournament, secureUpdate, isAdmin);

        await pickUma('Special Week');
        expect(secureUpdate).not.toHaveBeenCalled();
    });

    it('starts uma draft and sets order', async () => {
        const tournament = ref(makeTournament());
        const { startUmaDraft } = useUmaDraft(tournament, secureUpdate, isAdmin);

        await startUmaDraft();

        expect(secureUpdate).toHaveBeenCalledWith(expect.objectContaining({
            draft: expect.objectContaining({
                order: expect.any(Array),
                currentIdx: 0
            })
        }));
    });

    describe('computed: availableUmas', () => {
        it('filters out umas already owned by current team', () => {
            // team1 has already picked Special Week; team1 is the current picker (idx=0)
            const tournament = ref(makeTournament({
                teams: [
                    { id: 'team1', name: 'Team 1', captainId: 'p1', memberIds: [], points: 0, finalsPoints: 0, group: 'A', color: '#ff0000', umaPool: ['Special Week'] },
                    { id: 'team2', name: 'Team 2', captainId: 'p2', memberIds: [], points: 0, finalsPoints: 0, group: 'A', color: '#00ff00' }
                ]
            }));
            const { availableUmas } = useUmaDraft(tournament, secureUpdate, isAdmin);

            expect(availableUmas.value).not.toContain('Special Week');
            expect(availableUmas.value).toContain('Silence Suzuka');
        });
    });

    describe('actions: startRandomUma', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        it('picks a random uma and opens modal', async () => {
            const tournament = ref(makeTournament());
            const { startRandomUma, showRandomModal, slotReel } = useUmaDraft(tournament, secureUpdate, isAdmin);

            startRandomUma();

            expect(showRandomModal.value).toBe(true);
            expect(slotReel.value.length).toBeGreaterThan(40);

            // Advance for reel animation + pick wait (4500ms)
            await vi.advanceTimersByTimeAsync(5000);

            expect(showRandomModal.value).toBe(false);
            expect(secureUpdate).toHaveBeenCalled();
        });

        it('does nothing if no candidates or not admin', () => {
            isAdmin.value = false;
            const tournament = ref(makeTournament());
            const { startRandomUma, showRandomModal } = useUmaDraft(tournament, secureUpdate, isAdmin);

            startRandomUma();
            expect(showRandomModal.value).toBe(false);
        });
    });

    describe('computed: remainingPicks', () => {
        it('returns empty array when no draft', () => {
            const tournament = ref(makeTournament({ draft: undefined }));
            const { remainingPicks } = useUmaDraft(tournament, secureUpdate, isAdmin);
            expect(remainingPicks.value).toEqual([]);
        });

        it('returns picks from currentIdx onward with correct shape', () => {
            const tournament = ref(makeTournament({
                draft: { order: ['team1', 'team2', 'team2', 'team1'], currentIdx: 1 }
            }));
            const { remainingPicks } = useUmaDraft(tournament, secureUpdate, isAdmin);

            expect(remainingPicks.value).toHaveLength(3);
            expect(remainingPicks.value[0]).toMatchObject({
                teamName: 'Team 2',
                color: '#00ff00',
                isCurrent: true,
            });
            expect(remainingPicks.value[1]?.isCurrent).toBe(false);
        });

        it('falls back to Unknown and default color for missing team', () => {
            const tournament = ref(makeTournament({
                draft: { order: ['ghost-team'], currentIdx: 0 }
            }));
            const { remainingPicks } = useUmaDraft(tournament, secureUpdate, isAdmin);

            expect(remainingPicks.value[0]).toMatchObject({
                teamName: 'Unknown',
                color: '#94a3b8',
            });
        });
    });

    describe('computed: isDraftComplete', () => {
        it('returns false when no draft', () => {
            const tournament = ref(makeTournament({ draft: undefined }));
            const { isDraftComplete } = useUmaDraft(tournament, secureUpdate, isAdmin);
            expect(isDraftComplete.value).toBe(false);
        });

        it('returns false when currentIdx < order.length', () => {
            const tournament = ref(makeTournament({
                draft: { order: ['team1', 'team2'], currentIdx: 1 }
            }));
            const { isDraftComplete } = useUmaDraft(tournament, secureUpdate, isAdmin);
            expect(isDraftComplete.value).toBe(false);
        });

        it('returns true when currentIdx >= order.length', () => {
            const tournament = ref(makeTournament({
                draft: { order: ['team1', 'team2'], currentIdx: 2 }
            }));
            const { isDraftComplete } = useUmaDraft(tournament, secureUpdate, isAdmin);
            expect(isDraftComplete.value).toBe(true);
        });
    });

    describe('error cases', () => {
        it('pickUma does nothing if team not found', async () => {
            const tournament = ref(makeTournament({
                draft: { order: ['nonexistent'], currentIdx: 0 }
            }));
            isAdmin.value = true;
            const { pickUma } = useUmaDraft(tournament, secureUpdate, isAdmin);
            await pickUma('Special Week');
            expect(secureUpdate).not.toHaveBeenCalled();
        });

        it('undoLastPick does nothing if team not found or no pool', async () => {
            const tournament = ref(makeTournament({
                draft: { order: ['nonexistent'], currentIdx: 1 }
            }));
            isAdmin.value = true;
            const { undoLastPick } = useUmaDraft(tournament, secureUpdate, isAdmin);
            await undoLastPick();
            expect(secureUpdate).not.toHaveBeenCalled();
        });
    });
});
