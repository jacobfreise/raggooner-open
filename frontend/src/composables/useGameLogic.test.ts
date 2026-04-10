import {describe, it, expect, vi, beforeEach, type Mock} from 'vitest';

vi.mock('firebase/firestore', () => ({
    FieldValue: class {},
    arrayRemove: vi.fn((val: string) => ({ _remove: val })),
    arrayUnion: vi.fn((val: string) => ({ _union: val })),
}));

import { ref } from 'vue';
import { useGameLogic } from './useGameLogic';
import type {Tournament, Player, Team, Race, FirestoreUpdate} from '../types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TWO_STAGE_PRESET = [
    { name: 'groups', label: 'Group Stage', groups: ['A', 'B'], racesRequired: 5, teamsAdvancingPerGroup: 1 },
    { name: 'finals', label: 'Finals', groups: ['A'], racesRequired: 5, teamsAdvancingPerGroup: 0 },
];
const SMALL_PRESET = [
    { name: 'finals', label: 'Finals', groups: ['A'], racesRequired: 5, teamsAdvancingPerGroup: 0 },
];

const makePlayer = (id: string, name: string, isCaptain = false): Player => ({
    id, name, isCaptain, uma: `uma-${id}`, totalPoints: 0,
});

const makeTeam = (
    id: string,
    captainId: string,
    group: 'A' | 'B' | 'C' = 'A',
    points = 0,
    overrides: Partial<Team> = {},
): Team => ({
    id, captainId, memberIds: [], name: `Team ${id}`,
    stagePoints: { groups: points },
    stageGroups: { groups: group },
    qualifiedStages: ['groups'],
    ...overrides,
});

// raceNumber defaults to 1; pass as 5th arg if needed
const makeRace = (
    id: string,
    placements: Record<string, number>,
    stage: string = 'groups',
    group: string = 'A',
    raceNumber = 1,
): Race => ({ id, placements, stage, group, raceNumber, timestamp: new Date().toISOString() });

const makeTournament = (override: Partial<Tournament> = {}): Tournament => ({
    id: 't1',
    name: 'Test',
    status: 'active',
    stages: TWO_STAGE_PRESET,
    currentStageIndex: 0,
    playerIds: [],
    players: {},
    teams: [],
    races: {},
    createdAt: new Date().toISOString(),
    ...override,
});

// Convenience: a 3-player base tournament used by many tests
makePlayer('p1', 'Player 1');
makePlayer('p2', 'Player 2');
makePlayer('p3', 'Player 3');
const baseTeams = [
    makeTeam('t1', 'p1'),
    makeTeam('t2', 'p2'),
    makeTeam('t3', 'p3'),
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useGameLogic', () => {
    let secureUpdate: Mock<(data: FirestoreUpdate<Tournament>) => Promise<void>>;

    beforeEach(() => {
        vi.clearAllMocks();
        secureUpdate = vi.fn().mockResolvedValue(undefined);
    });

    // ── Scoring helpers ──────────────────────────────────────────────────────

    describe('Point Calculations', () => {
        it('calculates round points correctly', () => {
            const tournament = ref(makeTournament({
                races: { r1: makeRace('r1', { p1: 1, p2: 2, p3: 3 }) },
            }));
            const { getRoundPoints } = useGameLogic(tournament, secureUpdate);
            expect(getRoundPoints('p1')).toBe(25);
            expect(getRoundPoints('p2')).toBe(18);
        });

        it('calculates total points correctly across stages', () => {
            const tournament = ref(makeTournament({
                races: {
                    r1: makeRace('r1', { p1: 1 }, 'groups'),
                    r2: makeRace('r2', { p1: 2 }, 'finals'),
                },
            }));
            const { getTotalPoints } = useGameLogic(tournament, secureUpdate);
            expect(getTotalPoints('p1')).toBe(25 + 18);
        });

        it('getRaceCount counts only races for the current view stage and specified group', () => {
            const tournament = ref(makeTournament({
                currentStageIndex: 0,
                races: {
                    'groups-A-1': makeRace('ga1', {}, 'groups', 'A'),
                    'groups-A-2': makeRace('ga2', {}, 'groups', 'A'),
                    'groups-B-1': makeRace('gb1', {}, 'groups', 'B'),
                    'finals-A-1': makeRace('fa1', {}, 'finals', 'A'), // excluded (different stage)
                },
            }));
            const { getRaceCount } = useGameLogic(tournament, secureUpdate);
            expect(getRaceCount('A')).toBe(2);
            expect(getRaceCount('B')).toBe(1);
            expect(getRaceCount('C')).toBe(0);
        });

        it('maps standard positions to correct points (1st=25, 2nd=18, 3rd=15, out-of-range=0)', () => {
            // getPointsForPos is internal; verify via getTotalPoints
            const races = {
                r1: makeRace('r1', { p1: 1 }),  // 25 pts
                r2: makeRace('r2', { p2: 2 }),  // 18 pts
                r3: makeRace('r3', { p3: 3 }),  // 15 pts
            };
            const { getTotalPoints } = useGameLogic(ref(makeTournament({ races })), secureUpdate);
            expect(getTotalPoints('p1')).toBe(25);
            expect(getTotalPoints('p2')).toBe(18);
            expect(getTotalPoints('p3')).toBe(15);
            expect(getTotalPoints('unknown')).toBe(0);
        });

        it('getRoundPoints filters to current view stage only', () => {
            const tournament = ref(makeTournament({
                currentStageIndex: 0,
                races: {
                    r_group: makeRace('r_group', { p1: 1 }, 'groups'),
                    r_final: makeRace('r_final', { p1: 1 }, 'finals'), // not counted in groups view
                },
            }));
            const { getRoundPoints } = useGameLogic(tournament, secureUpdate);
            expect(getRoundPoints('p1')).toBe(25); // only group race counted
        });

        it('getGroupWildcards returns wildcards for the specified group sorted by round points', () => {
            const tournament = ref(makeTournament({
                currentStageIndex: 0,
                players: {
                    w1: makePlayer('w1', 'Wild 1'),
                    w2: makePlayer('w2', 'Wild 2'),
                },
                wildcards: [
                    { playerId: 'w1', stage: 'groups', group: 'A' },
                    { playerId: 'w2', stage: 'groups', group: 'A' },
                    { playerId: 'w1', stage: 'groups', group: 'B' }, // different group, excluded
                ],
                races: {
                    r1: makeRace('r1', { w1: 2, w2: 1 }, 'groups'),
                },
            }));
            const { getGroupWildcards } = useGameLogic(tournament, secureUpdate);
            const result = getGroupWildcards('A');
            expect(result).toHaveLength(2);
            // w2 got 1st (25 pts) → sorted first
            expect(result[0]!.id).toBe('w2');
            expect(result[1]!.id).toBe('w1');
        });
    });

    // ── Sorted computeds ─────────────────────────────────────────────────────

    describe('Team Sorting', () => {
        it('sorts teams by points', () => {
            const tournament = ref(makeTournament({
                teams: [
                    makeTeam('t1', 'p1', 'A', 10),
                    makeTeam('t2', 'p2', 'A', 20),
                ],
            }));
            const { sortedTeamsA } = useGameLogic(tournament, secureUpdate);
            expect(sortedTeamsA.value[0]?.id).toBe('t2');
        });

        it('sortedTeamsB filters group B only', () => {
            const teams = [
                makeTeam('a1', 'c1', 'A', 50), makeTeam('a2', 'c2', 'A', 40),
                makeTeam('b1', 'c3', 'B', 30), makeTeam('b2', 'c4', 'B', 20),
                makeTeam('c1', 'c5', 'C', 10),
            ];
            const { sortedTeamsB } = useGameLogic(ref(makeTournament({ teams })), secureUpdate);
            expect(sortedTeamsB.value.map(t => t.id)).toEqual(['b1', 'b2']);
        });

        it('sortedTeamsC filters group C only', () => {
            const teams = [
                makeTeam('a1', 'c1', 'A', 50),
                makeTeam('c1', 'c2', 'C', 30), makeTeam('c2', 'c3', 'C', 20),
            ];
            const { sortedTeamsC } = useGameLogic(ref(makeTournament({ teams })), secureUpdate);
            expect(sortedTeamsC.value.map(t => t.id)).toEqual(['c1', 'c2']);
        });

        it('sortedFinalsTeams returns only inFinals teams sorted by finalsPoints', () => {
            const teams = [
                makeTeam('t1', 'c1', 'A', 0, { stagePoints: { groups: 0, finals: 50 }, stageGroups: { groups: 'A', finals: 'A' }, qualifiedStages: ['groups', 'finals'] }),
                makeTeam('t2', 'c2', 'A', 0, { stagePoints: { groups: 0 }, stageGroups: { groups: 'A' }, qualifiedStages: ['groups'] }),
                makeTeam('t3', 'c3', 'A', 0, { stagePoints: { groups: 0, finals: 30 }, stageGroups: { groups: 'A', finals: 'A' }, qualifiedStages: ['groups', 'finals'] }),
            ];
            const { sortedFinalsTeams } = useGameLogic(ref(makeTournament({ teams, stages: TWO_STAGE_PRESET, currentStageIndex: 1 })), secureUpdate);
            expect(sortedFinalsTeams.value.map(t => t.id)).toEqual(['t1', 't3']);
        });

        it('sortedRaces orders races newest-first by timestamp', () => {
            const older = makeRace('r1', {});
            const newer = { ...makeRace('r2', {}), timestamp: new Date(Date.now() + 10000).toISOString() };
            const tournament = ref(makeTournament({ races: { r1: older, r2: newer } }));
            const { sortedRaces } = useGameLogic(tournament, secureUpdate);
            expect(sortedRaces.value[0]!.id).toBe('r2');
        });

        it('sortedPlayers orders by total points descending', () => {
            const players = {
                p1: makePlayer('p1', 'Alice'),
                p2: makePlayer('p2', 'Bob'),
            };
            const tournament = ref(makeTournament({
                players,
                races: {
                    r1: makeRace('r1', { p1: 1, p2: 3 }),
                },
            }));
            const { sortedPlayers } = useGameLogic(tournament, secureUpdate);
            expect(sortedPlayers.value[0]!.id).toBe('p1'); // 25 pts
            expect(sortedPlayers.value[1]!.id).toBe('p2'); // 15 pts
        });
    });

    // ── Progression gates ────────────────────────────────────────────────────

    describe('Progression Logic', () => {
        it('identifies safe and tied teams for 9-team (3 groups) scenario', () => {
            const pts = [50, 50, 0, 100, 0, 0, 100, 0, 0];
            const grp = (i: number) => i < 3 ? 'A' as const : i < 6 ? 'B' as const : 'C' as const;
            const teams = Array.from({ length: 9 }, (_, i) =>
                makeTeam(`t${i}`, `p${i}`, grp(i), pts[i]!)
            );
            const preset9 = [
                { name: 'groups', label: 'Group Stage', groups: ['A', 'B', 'C'], racesRequired: 5, teamsAdvancingPerGroup: 1 },
                { name: 'finals', label: 'Finals', groups: ['A'], racesRequired: 5, teamsAdvancingPerGroup: 0 },
            ];
            const { projectedProgression } = useGameLogic(ref(makeTournament({ teams, stages: preset9 })), secureUpdate);
            expect(projectedProgression.value.tied.map(t => t.id)).toContain('t0');
            expect(projectedProgression.value.tied.map(t => t.id)).toContain('t1');
            expect(projectedProgression.value.safe).toContain('t3');
            expect(projectedProgression.value.safe).toContain('t6');
            expect(projectedProgression.value.needed).toBe(1);
        });

        it('identifies safe teams for 8-team (2 groups, top 2) scenario', () => {
            const pts = [100, 80, 60, 0, 0, 0, 0, 0];
            const grp = (i: number) => i < 4 ? 'A' as const : 'B' as const;
            const teams = Array.from({ length: 8 }, (_, i) =>
                makeTeam(`t${i}`, `p${i}`, grp(i), pts[i]!)
            );
            const preset8 = [
                { name: 'groups', label: 'Group Stage', groups: ['A', 'B'], racesRequired: 5, teamsAdvancingPerGroup: 2 },
                { name: 'finals', label: 'Finals', groups: ['A'], racesRequired: 5, teamsAdvancingPerGroup: 0 },
            ];
            const { projectedProgression } = useGameLogic(ref(makeTournament({ teams, stages: preset8 })), secureUpdate);
            expect(projectedProgression.value.safe).toContain('t0');
            expect(projectedProgression.value.safe).toContain('t1');
        });

        it('handles complex 6-team wildcard tie scenario', () => {
            const teams = [
                makeTeam('tA1', 'pA1', 'A', 100),
                makeTeam('tA2', 'pA2', 'A', 50),
                makeTeam('tA3', 'pA3', 'A', 20),
                makeTeam('tB1', 'pB1', 'B', 100),
                makeTeam('tB2', 'pB2', 'B', 50),
                makeTeam('tB3', 'pB3', 'B', 20),
            ];
            const { projectedProgression } = useGameLogic(ref(makeTournament({ teams })), secureUpdate);
            expect(projectedProgression.value.safe).toContain('tA1');
            expect(projectedProgression.value.safe).toContain('tB1');
            expect(projectedProgression.value.tied.map(t => t.id)).toContain('tA2');
            expect(projectedProgression.value.tied.map(t => t.id)).toContain('tB2');
            expect(projectedProgression.value.needed).toBe(1);
        });

        it('canAdvanceToFinals is true when enough races are played in all groups', () => {
            const teams = Array.from({ length: 9 }, (_, i) =>
                makeTeam(`t${i}`, `p${i}`, i % 3 === 0 ? 'A' : i % 3 === 1 ? 'B' : 'C')
            );
            const races = {
                ...Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`ga${i}`, makeRace(`ga${i}`, {}, 'groups', 'A')])),
                ...Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`gb${i}`, makeRace(`gb${i}`, {}, 'groups', 'B')])),
                ...Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`gc${i}`, makeRace(`gc${i}`, {}, 'groups', 'C')])),
            };
            const preset9 = [
                { name: 'groups', label: 'Group Stage', groups: ['A', 'B', 'C'], racesRequired: 5, teamsAdvancingPerGroup: 1 },
                { name: 'finals', label: 'Finals', groups: ['A'], racesRequired: 5, teamsAdvancingPerGroup: 0 },
            ];
            const { canAdvanceToFinals } = useGameLogic(ref(makeTournament({ teams, races, stages: preset9 })), secureUpdate);
            expect(canAdvanceToFinals.value).toBe(true);
        });

        it('canAdvanceToFinals is false when already in finals stage', () => {
            const { canAdvanceToFinals } = useGameLogic(ref(makeTournament({ stages: TWO_STAGE_PRESET, currentStageIndex: 1 })), secureUpdate);
            expect(canAdvanceToFinals.value).toBe(false);
        });

        it('canAdvanceToFinals is false when not enough races in a group', () => {
            const teams = [
                makeTeam('a1', 'c1', 'A'), makeTeam('a2', 'c2', 'A'), makeTeam('a3', 'c3', 'A'),
                makeTeam('b1', 'c4', 'B'), makeTeam('b2', 'c5', 'B'), makeTeam('b3', 'c6', 'B'),
            ];
            const races = {
                ...Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`ga${i}`, makeRace(`ga${i}`, {}, 'groups', 'A')])),
                // Only 4 in group B (need 5)
                ...Object.fromEntries(Array.from({ length: 4 }, (_, i) => [`gb${i}`, makeRace(`gb${i}`, {}, 'groups', 'B')])),
            };
            const { canAdvanceToFinals } = useGameLogic(ref(makeTournament({ teams, races })), secureUpdate);
            expect(canAdvanceToFinals.value).toBe(false);
        });

        it('canEndTournament is true when enough finals races are played', () => {
            const races = Object.fromEntries(
                Array.from({ length: 5 }, (_, i) => [`f${i}`, makeRace(`f${i}`, {}, 'finals')])
            );
            const { canEndTournament } = useGameLogic(ref(makeTournament({ races, stages: TWO_STAGE_PRESET, currentStageIndex: 1 })), secureUpdate);
            expect(canEndTournament.value).toBe(true);
        });

        it('canEndTournament is false when fewer than 5 finals races', () => {
            const races = { f1: makeRace('f1', {}, 'finals') };
            const { canEndTournament } = useGameLogic(ref(makeTournament({ races, stages: TWO_STAGE_PRESET, currentStageIndex: 1 })), secureUpdate);
            expect(canEndTournament.value).toBe(false);
        });

        it('canShowFinals is true only when stage is finals', () => {
            const { canShowFinals: showGroups } = useGameLogic(ref(makeTournament({ stages: TWO_STAGE_PRESET, currentStageIndex: 0 })), secureUpdate);
            expect(showGroups.value).toBeFalsy();

            const { canShowFinals: showFinals } = useGameLogic(ref(makeTournament({ stages: TWO_STAGE_PRESET, currentStageIndex: 1 })), secureUpdate);
            expect(showFinals.value).toBeTruthy();
        });
    });

    // ── Advancing teams (via isAdvancing helper & projectedProgression) ────────

    describe('advancingTeamIds (via isAdvancing helper)', () => {
        it('9 teams: top 1 from each group advances, others do not', () => {
            const teams = [
                makeTeam('a1', 'c0', 'A', 50), makeTeam('a2', 'c1', 'A', 30), makeTeam('a3', 'c2', 'A', 10),
                makeTeam('b1', 'c3', 'B', 45), makeTeam('b2', 'c4', 'B', 25), makeTeam('b3', 'c5', 'B', 5),
                makeTeam('c1', 'c6', 'C', 40), makeTeam('c2', 'c7', 'C', 20), makeTeam('c3', 'c8', 'C', 15),
            ];
            const preset9 = [
                { name: 'groups', label: 'Group Stage', groups: ['A', 'B', 'C'], racesRequired: 5, teamsAdvancingPerGroup: 1 },
                { name: 'finals', label: 'Finals', groups: ['A'], racesRequired: 5, teamsAdvancingPerGroup: 0 },
            ];
            const { isAdvancing } = useGameLogic(ref(makeTournament({ teams, stages: preset9, usePlacementTiebreaker: false })), secureUpdate);
            expect(isAdvancing('a1')).toBe(true);
            expect(isAdvancing('b1')).toBe(true);
            expect(isAdvancing('c1')).toBe(true);
            expect(isAdvancing('a2')).toBe(false);
            expect(isAdvancing('b2')).toBe(false);
        });

        it('8 teams: top 2 from each group advance, others do not', () => {
            const teams = [
                makeTeam('a1', 'c0', 'A', 100), makeTeam('a2', 'c1', 'A', 80),
                makeTeam('a3', 'c2', 'A', 60), makeTeam('a4', 'c3', 'A', 40),
                makeTeam('b1', 'c4', 'B', 90), makeTeam('b2', 'c5', 'B', 70),
                makeTeam('b3', 'c6', 'B', 50), makeTeam('b4', 'c7', 'B', 30),
            ];
            const preset8 = [
                { name: 'groups', label: 'Group Stage', groups: ['A', 'B'], racesRequired: 5, teamsAdvancingPerGroup: 2 },
                { name: 'finals', label: 'Finals', groups: ['A'], racesRequired: 5, teamsAdvancingPerGroup: 0 },
            ];
            const { isAdvancing } = useGameLogic(ref(makeTournament({ teams, stages: preset8, usePlacementTiebreaker: false })), secureUpdate);
            expect(isAdvancing('a1')).toBe(true);
            expect(isAdvancing('a2')).toBe(true);
            expect(isAdvancing('b1')).toBe(true);
            expect(isAdvancing('b2')).toBe(true);
            expect(isAdvancing('a3')).toBe(false);
        });

        it('6 teams: top 1 per group + best runner-up advance', () => {
            const teams = [
                makeTeam('a1', 'c0', 'A', 80), makeTeam('a2', 'c1', 'A', 40), makeTeam('a3', 'c2', 'A', 10),
                makeTeam('b1', 'c3', 'B', 70), makeTeam('b2', 'c4', 'B', 60), makeTeam('b3', 'c5', 'B', 5),
            ];
            const { isAdvancing } = useGameLogic(ref(makeTournament({ teams, usePlacementTiebreaker: false })), secureUpdate);
            expect(isAdvancing('a1')).toBe(true);
            expect(isAdvancing('b1')).toBe(true);
            expect(isAdvancing('b2')).toBe(true);  // b2 (60) beats a2 (40) as wildcard
            expect(isAdvancing('a2')).toBe(false);
        });

        it('isAdvancing returns false for a team with 0 points even if structurally advancing', () => {
            // A single small-tournament team with no races played
            const teams = [makeTeam('t1', 'c0', 'A', 0)];
            const { isAdvancing } = useGameLogic(ref(makeTournament({ teams })), secureUpdate);
            expect(isAdvancing('t1')).toBe(false);
        });
    });

    // ── Progression status ───────────────────────────────────────────────────

    describe('getProgressionStatus', () => {
        it("returns 'none' for a team with 0 points", () => {
            const teams = [makeTeam('t1', 'c1', 'A', 0)];
            const { getProgressionStatus } = useGameLogic(ref(makeTournament({ teams })), secureUpdate);
            expect(getProgressionStatus('t1')).toBe('none');
        });

        it("returns 'safe' for a clearly advancing team with points", () => {
            const teams = [
                makeTeam('a1', 'c0', 'A', 80), makeTeam('a2', 'c1', 'A', 40), makeTeam('a3', 'c2', 'A', 10),
                makeTeam('b1', 'c3', 'B', 70), makeTeam('b2', 'c4', 'B', 30), makeTeam('b3', 'c5', 'B', 5),
            ];
            const { getProgressionStatus } = useGameLogic(ref(makeTournament({ teams, usePlacementTiebreaker: false })), secureUpdate);
            expect(getProgressionStatus('a1')).toBe('safe');
        });

        it("returns 'tied' for a team in the tie set", () => {
            const teams = [
                makeTeam('tA1', 'pA1', 'A', 100),
                makeTeam('tA2', 'pA2', 'A', 50),
                makeTeam('tA3', 'pA3', 'A', 20),
                makeTeam('tB1', 'pB1', 'B', 100),
                makeTeam('tB2', 'pB2', 'B', 50),
                makeTeam('tB3', 'pB3', 'B', 20),
            ];
            const { getProgressionStatus } = useGameLogic(ref(makeTournament({ teams })), secureUpdate);
            expect(getProgressionStatus('tA2')).toBe('tied');
        });
    });

    // ── Tiebreaker flow ──────────────────────────────────────────────────────

    describe('Tiebreaker Flow', () => {
        it('advanceToFinals finalizes directly when no teams are tied', async () => {
            const teams = [
                makeTeam('a1', 'c0', 'A', 80), makeTeam('a2', 'c1', 'A', 60), makeTeam('a3', 'c2', 'A', 10),
                makeTeam('b1', 'c3', 'B', 70), makeTeam('b2', 'c4', 'B', 40), makeTeam('b3', 'c5', 'B', 5),
            ];
            const { advanceToFinals } = useGameLogic(ref(makeTournament({ teams, usePlacementTiebreaker: false })), secureUpdate);
            await advanceToFinals();
            expect(secureUpdate).toHaveBeenCalledWith(expect.objectContaining({ currentStageIndex: 1 }));
        });

        it('advanceToFinals opens tiebreaker modal when runners-up are tied', async () => {
            // Runners-up a2 and b2 both have 30 pts → tie at wildcard cutoff
            const teams = [
                makeTeam('a1', 'c0', 'A', 80), makeTeam('a2', 'c1', 'A', 30), makeTeam('a3', 'c2', 'A', 10),
                makeTeam('b1', 'c3', 'B', 70), makeTeam('b2', 'c4', 'B', 30), makeTeam('b3', 'c5', 'B', 10),
            ];
            const { advanceToFinals, showTieBreakerModal } = useGameLogic(
                ref(makeTournament({ teams, usePlacementTiebreaker: false })), secureUpdate
            );
            await advanceToFinals();
            expect(showTieBreakerModal.value).toBe(true);
            expect(secureUpdate).not.toHaveBeenCalled();
        });

        it('finalizeFinals marks correct teams with qualifiedStages and advances stage', async () => {
            const teams = [
                makeTeam('t1', 'c1', 'A'), makeTeam('t2', 'c2', 'A'), makeTeam('t3', 'c3', 'A'),
            ];
            const { showTieBreakerModal, guaranteedIds, tiebreakersNeeded, confirmTiebreakerSelection } =
                useGameLogic(ref(makeTournament({ teams, usePlacementTiebreaker: false })), secureUpdate);

            // Manually populate state as if tiebreaker was resolved
            guaranteedIds.value = ['t1', 't2'];
            tiebreakersNeeded.value = 0;
            showTieBreakerModal.value = true;

            await confirmTiebreakerSelection();

            const call = secureUpdate.mock.calls[0]![0] as any;
            expect(call.currentStageIndex).toBe(1);
            const finalTeams: Team[] = call.teams;
            expect(finalTeams.find(t => t.id === 't1')!.qualifiedStages).toContain('finals');
            expect(finalTeams.find(t => t.id === 't2')!.qualifiedStages).toContain('finals');
            expect(finalTeams.find(t => t.id === 't3')!.qualifiedStages).not.toContain('finals');
        });

        it('confirmTiebreakerSelection does nothing when tiebreakersNeeded > 0', async () => {
            const { tiebreakersNeeded, confirmTiebreakerSelection } =
                useGameLogic(ref(makeTournament({ teams: [makeTeam('t1', 'c1')] })), secureUpdate);
            tiebreakersNeeded.value = 1;
            await confirmTiebreakerSelection();
            expect(secureUpdate).not.toHaveBeenCalled();
        });

        it('resolveManually toggles a team into/out of guaranteedIds', () => {
            const team = makeTeam('t1', 'c1');
            const { resolveManually, guaranteedIds } = useGameLogic(ref(makeTournament()), secureUpdate);
            resolveManually(team);
            expect(guaranteedIds.value).toContain('t1');
            resolveManually(team); // toggle off
            expect(guaranteedIds.value).not.toContain('t1');
        });

        it('cancelTieBreaker closes modal and resets all tiebreaker state', () => {
            const { cancelTieBreaker, showTieBreakerModal, tiedTeams, guaranteedIds, tiebreakersNeeded } =
                useGameLogic(ref(makeTournament()), secureUpdate);
            showTieBreakerModal.value = true;
            tiedTeams.value = [makeTeam('t1', 'c1')];
            guaranteedIds.value = ['t1'];
            tiebreakersNeeded.value = 1;

            cancelTieBreaker();

            expect(showTieBreakerModal.value).toBe(false);
            expect(tiedTeams.value).toHaveLength(0);
            expect(guaranteedIds.value).toHaveLength(0);
            expect(tiebreakersNeeded.value).toBe(0);
        });
    });

    // ── Race display helpers ──────────────────────────────────────────────────

    describe('Race Display', () => {
        it('getRaceResults returns placements sorted by position ascending', () => {
            const players = {
                p1: makePlayer('p1', 'Alice'),
                p2: makePlayer('p2', 'Bob'),
                p3: makePlayer('p3', 'Carol'),
            };
            const race = makeRace('r1', { p1: 2, p2: 1, p3: 3 });
            const { getRaceResults } = useGameLogic(ref(makeTournament({ players, races: { r1: race } })), secureUpdate);
            const results = getRaceResults(race);
            expect(results[0]!.playerId).toBe('p2'); // 1st
            expect(results[1]!.playerId).toBe('p1'); // 2nd
            expect(results[2]!.playerId).toBe('p3'); // 3rd
        });

        it('getRaceResultsForPlayer returns races in stage order (groups before finals) then by raceNumber', () => {
            const pid = 'p1';
            const races = {
                'finals-A-1': { ...makeRace('f1', { [pid]: 2 }, 'finals', 'A', 1) },
                'groups-A-1': { ...makeRace('g1', { [pid]: 1 }, 'groups', 'A', 1) },
                'groups-A-2': { ...makeRace('g2', { [pid]: 3 }, 'groups', 'A', 2) },
            };
            const { getRaceResultsForPlayer } = useGameLogic(ref(makeTournament({ races })), secureUpdate);
            const results = getRaceResultsForPlayer(pid);
            expect(results).toHaveLength(3);
            expect(results[0]!.stage).toBe('groups');
            expect(results[0]!.raceNumber).toBe(1);
            expect(results[1]!.stage).toBe('groups');
            expect(results[1]!.raceNumber).toBe(2);
            expect(results[2]!.stage).toBe('finals');
        });

        it('getRaceResultsForPlayer calculates points per race correctly', () => {
            const pid = 'p1';
            const races = { r1: makeRace('r1', { [pid]: 1 }) };
            const { getRaceResultsForPlayer } = useGameLogic(ref(makeTournament({ races })), secureUpdate);
            expect(getRaceResultsForPlayer(pid)[0]!.points).toBe(25);
        });

        it('activeStagePlayers returns captain + members for the requested group (6-team tournament filters by group)', () => {
            // Need >= 6 teams so the group filter activates
            const teams = [
                { ...makeTeam('a1', 'c1', 'A', 50), memberIds: ['m1', 'm2'] },
                { ...makeTeam('a2', 'c3', 'A', 30), memberIds: [] },
                { ...makeTeam('a3', 'c5', 'A', 10), memberIds: [] },
                { ...makeTeam('b1', 'c2', 'B', 40), memberIds: ['m3'] },
                { ...makeTeam('b2', 'c4', 'B', 20), memberIds: [] },
                { ...makeTeam('b3', 'c6', 'B', 5), memberIds: [] },
            ];
            const players = {
                c1: makePlayer('c1', 'Cap A', true),
                m1: makePlayer('m1', 'M1'),
                m2: makePlayer('m2', 'M2'),
                c2: makePlayer('c2', 'Cap B', true),
                m3: makePlayer('m3', 'M3'),
                c3: makePlayer('c3', 'Cap A2', true), c4: makePlayer('c4', 'Cap B2', true),
                c5: makePlayer('c5', 'Cap A3', true), c6: makePlayer('c6', 'Cap B3', true),
            };
            const { activeStagePlayers } = useGameLogic(ref(makeTournament({ teams, players })), secureUpdate);
            const ids = activeStagePlayers('A').map(p => p.id);
            expect(ids).toContain('c1');
            expect(ids).toContain('m1');
            expect(ids).toContain('m2');
            expect(ids).not.toContain('c2');
            expect(ids).not.toContain('m3');
        });

        it('activeStagePlayers with Finals returns only qualified team members', () => {
            const teams = [
                { ...makeTeam('t1', 'c1', 'A', 0), stagePoints: { groups: 0, finals: 50 }, stageGroups: { groups: 'A', finals: 'A' }, qualifiedStages: ['groups', 'finals'], memberIds: ['m1'] },
                { ...makeTeam('t2', 'c2', 'A', 0), stagePoints: { groups: 0 }, stageGroups: { groups: 'A' }, qualifiedStages: ['groups'], memberIds: ['m2'] },
            ];
            const players = {
                c1: makePlayer('c1', 'Cap A', true), m1: makePlayer('m1', 'M1'),
                c2: makePlayer('c2', 'Cap B', true), m2: makePlayer('m2', 'M2'),
            };
            const tournament = ref(makeTournament({ teams, players, stages: TWO_STAGE_PRESET, currentStageIndex: 1 }));
            const { activeStagePlayers } = useGameLogic(tournament, secureUpdate);
            const ids = activeStagePlayers('Finals').map(p => p.id);
            expect(ids).toContain('c1');
            expect(ids).toContain('m1');
            expect(ids).not.toContain('c2');
            expect(ids).not.toContain('m2');
        });
    });

    // ── Ban logic ─────────────────────────────────────────────────────────────

    describe('Ban Logic', () => {
        it('isBanned returns true for a banned uma and false otherwise', () => {
            const { isBanned } = useGameLogic(ref(makeTournament({ bans: ['Spe-Week'] })), secureUpdate);
            expect(isBanned('Spe-Week')).toBe(true);
            expect(isBanned('other')).toBe(false);
        });

        it('isBanned returns false when bans list is absent', () => {
            const { isBanned } = useGameLogic(ref(makeTournament()), secureUpdate);
            expect(isBanned('anything')).toBe(false);
        });

        it('toggles ban correctly', async () => {
            const tournament = ref(makeTournament({ bans: [] }));
            const { toggleBan } = useGameLogic(tournament, secureUpdate);
            await toggleBan('Special Week');
            expect(secureUpdate).toHaveBeenCalledWith(expect.objectContaining({ bans: expect.anything() }));
        });

        it('toggleBan calls arrayRemove when uma is already banned', async () => {
            const { arrayRemove } = await import('firebase/firestore');
            const { toggleBan } = useGameLogic(ref(makeTournament({ bans: ['uma-X'] })), secureUpdate);
            await toggleBan('uma-X');
            expect(arrayRemove).toHaveBeenCalledWith('uma-X');
        });

        it('toggleBan calls arrayUnion when uma is not banned', async () => {
            const { arrayUnion } = await import('firebase/firestore');
            const { toggleBan } = useGameLogic(ref(makeTournament({ bans: [] })), secureUpdate);
            await toggleBan('uma-new');
            expect(arrayUnion).toHaveBeenCalledWith('uma-new');
        });
    });

    // ── Adjustments ───────────────────────────────────────────────────────────

    describe('Adjustment Logic', () => {
        it('adds team adjustment', async () => {
            const tournament = ref(makeTournament({ teams: [...baseTeams] }));
            const { addTeamAdjustment } = useGameLogic(tournament, secureUpdate);
            await addTeamAdjustment('t1', -10, 'Late penalty');
            expect(secureUpdate).toHaveBeenCalledWith(expect.objectContaining({
                teams: expect.arrayContaining([
                    expect.objectContaining({
                        id: 't1',
                        adjustments: expect.arrayContaining([
                            expect.objectContaining({ amount: -10, reason: 'Late penalty' }),
                        ]),
                    }),
                ]),
            }));
        });

        it('removeTeamAdjustment removes the adjustment by id, preserving others', async () => {
            const teams: Team[] = [
                {
                    ...makeTeam('t1', 'c1'),
                    adjustments: [
                        { id: 'adj1', amount: -10, reason: 'Penalty', stage: 'groups' },
                        { id: 'adj2', amount: 5, reason: 'Bonus', stage: 'groups' },
                    ],
                },
            ];
            const { removeTeamAdjustment } = useGameLogic(ref(makeTournament({ teams })), secureUpdate);
            await removeTeamAdjustment('t1', 'adj1');
            const call = secureUpdate.mock.calls[0]![0] as any;
            const updated = call.teams.find((t: Team) => t.id === 't1');
            expect(updated.adjustments).toHaveLength(1);
            expect(updated.adjustments[0].id).toBe('adj2');
        });

        it('removeTeamAdjustment passes through teams that do not match (return t branch)', async () => {
            const teams: Team[] = [
                {
                    ...makeTeam('t1', 'c1'),
                    adjustments: [{ id: 'adj1', amount: -10, reason: 'Penalty', stage: 'groups' }],
                },
                makeTeam('t2', 'c2'), // no adjustments — hits return t
            ];
            const { removeTeamAdjustment } = useGameLogic(ref(makeTournament({ teams })), secureUpdate);
            await removeTeamAdjustment('t1', 'adj1');
            const call = secureUpdate.mock.calls[0]![0] as any;
            expect(call.teams).toHaveLength(2);
        });

        it('addTeamAdjustment logs error when secureUpdate throws', async () => {
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
            secureUpdate.mockRejectedValueOnce(new Error('network'));
            const tournament = ref(makeTournament({ teams: [...baseTeams] }));
            const { addTeamAdjustment } = useGameLogic(tournament, secureUpdate);
            await addTeamAdjustment('t1', -5, 'Late');
            expect(consoleError).toHaveBeenCalled();
            consoleError.mockRestore();
        });

        it('removeTeamAdjustment logs error when secureUpdate throws', async () => {
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
            secureUpdate.mockRejectedValueOnce(new Error('network'));
            const teams: Team[] = [{
                ...makeTeam('t1', 'c1'),
                adjustments: [{ id: 'adj1', amount: -10, reason: 'Penalty', stage: 'groups' }],
            }];
            const { removeTeamAdjustment } = useGameLogic(ref(makeTournament({ teams })), secureUpdate);
            await removeTeamAdjustment('t1', 'adj1');
            expect(consoleError).toHaveBeenCalled();
            consoleError.mockRestore();
        });
    });

    // ── Tap-to-rank ────────────────────────────────────────────────────────────

    describe('Tap-to-Rank', () => {
        it('handleTapToRank assigns sequential ranks', () => {
            const { handleTapToRank, entryMap } = useGameLogic(ref(makeTournament()), secureUpdate);
            handleTapToRank('p1');
            handleTapToRank('p2');
            expect(entryMap.value[1]).toBe('p1');
            expect(entryMap.value[2]).toBe('p2');
        });

        it('handleTapToRank removes a player when tapped again (toggle off)', () => {
            const { handleTapToRank, entryMap } = useGameLogic(ref(makeTournament()), secureUpdate);
            handleTapToRank('p1');
            handleTapToRank('p1'); // toggle off
            expect(Object.values(entryMap.value)).not.toContain('p1');
        });

        it('toggleEditRace opens editing and pre-populates entryMap from existing race', () => {
            const races = { 'groups-A-1': makeRace('r1', { p1: 1, p2: 2 }) };
            const { toggleEditRace, editingRaceKey, entryMap } = useGameLogic(ref(makeTournament({ races })), secureUpdate);
            toggleEditRace('groups', 'A', 1);
            expect(editingRaceKey.value).toBe('groups-A-1');
            expect(entryMap.value[1]).toBe('p1');
            expect(entryMap.value[2]).toBe('p2');
        });

        it('toggleEditRace closes when called again for the same race', () => {
            const races = { 'groups-A-1': makeRace('r1', {}) };
            const { toggleEditRace, editingRaceKey } = useGameLogic(ref(makeTournament({ races })), secureUpdate);
            toggleEditRace('groups', 'A', 1);
            toggleEditRace('groups', 'A', 1); // toggle off
            expect(editingRaceKey.value).toBeNull();
        });
    });

    // ── Race placement actions ────────────────────────────────────────────────

    describe('Race Placement Actions', () => {
        it('updateRacePlacement creates a new race entry and recalculates scores', async () => {
            const teams = [makeTeam('t1', 'p1', 'A'), makeTeam('t2', 'p2', 'A')];
            const players = { p1: makePlayer('p1', 'A', true), p2: makePlayer('p2', 'B', true) };
            const { updateRacePlacement } = useGameLogic(ref(makeTournament({ teams, players })), secureUpdate);

            await updateRacePlacement('A', 1, 1, 'p1');

            const call = secureUpdate.mock.calls[0]![0] as any;
            expect(call['races.groups-A-1']).toBeDefined();
            expect(call['races.groups-A-1'].placements['p1']).toBe(1);
            expect(call.teams).toBeDefined();
        });

        it('updateRacePlacement displaces an existing player at the target position', async () => {
            const teams = [makeTeam('t1', 'p1', 'A'), makeTeam('t2', 'p2', 'A')];
            const players = { p1: makePlayer('p1', 'A', true), p2: makePlayer('p2', 'B', true) };
            // p2 currently holds position 1
            const races = { 'groups-A-1': makeRace('r1', { p2: 1 }) };
            const { updateRacePlacement } = useGameLogic(ref(makeTournament({ teams, players, races })), secureUpdate);

            await updateRacePlacement('A', 1, 1, 'p1'); // p1 takes position 1

            const call = secureUpdate.mock.calls[0]![0] as any;
            const placements = call['races.groups-A-1'].placements;
            expect(placements['p1']).toBe(1);
            expect(placements['p2']).toBeUndefined(); // displaced
        });

        it('saveTapResults saves entryMap as race placements and clears entryMap', async () => {
            const teams = [makeTeam('t1', 'p1', 'A'), makeTeam('t2', 'p2', 'A')];
            const players = { p1: makePlayer('p1', 'A', true), p2: makePlayer('p2', 'B', true) };
            const { handleTapToRank, saveTapResults, entryMap } =
                useGameLogic(ref(makeTournament({ teams, players })), secureUpdate);

            handleTapToRank('p1');
            handleTapToRank('p2');

            await saveTapResults('A', 1);

            const call = secureUpdate.mock.calls[0]![0] as any;
            expect(call['races.groups-A-1'].placements['p1']).toBe(1);
            expect(call['races.groups-A-1'].placements['p2']).toBe(2);
            expect(Object.keys(entryMap.value)).toHaveLength(0);
        });

        it('updateRacePlacement logs error when secureUpdate throws', async () => {
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
            secureUpdate.mockRejectedValueOnce(new Error('network'));
            const teams = [makeTeam('t1', 'p1', 'A')];
            const players = { p1: makePlayer('p1', 'A', true) };
            const { updateRacePlacement } = useGameLogic(ref(makeTournament({ teams, players })), secureUpdate);
            await updateRacePlacement('A', 1, 1, 'p1');
            expect(consoleError).toHaveBeenCalled();
            consoleError.mockRestore();
        });

        it('saveTapResults logs error and restores state when secureUpdate throws', async () => {
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
            vi.stubGlobal('alert', vi.fn());
            secureUpdate.mockRejectedValueOnce(new Error('network'));
            const teams = [makeTeam('t1', 'p1', 'A')];
            const players = { p1: makePlayer('p1', 'A', true) };
            const { handleTapToRank, saveTapResults, entryMap } =
                useGameLogic(ref(makeTournament({ teams, players })), secureUpdate);
            handleTapToRank('p1');
            await saveTapResults('A', 1);
            expect(consoleError).toHaveBeenCalled();
            expect(window.alert).toHaveBeenCalled();
            expect(entryMap.value[1]).toBe('p1'); // entryMap restored
            consoleError.mockRestore();
            vi.unstubAllGlobals();
        });
    });

    // ── Winning teams & visual rank ───────────────────────────────────────────

    describe('Winning Teams & Visual Rank', () => {
        it('winningTeams returns only the single top team when there is a clear leader', () => {
            const teams = [
                makeTeam('t1', 'c1', 'A', 0, { stagePoints: { groups: 0, finals: 100 }, stageGroups: { groups: 'A', finals: 'A' }, qualifiedStages: ['groups', 'finals'] }),
                makeTeam('t2', 'c2', 'A', 0, { stagePoints: { groups: 0, finals: 50 }, stageGroups: { groups: 'A', finals: 'A' }, qualifiedStages: ['groups', 'finals'] }),
            ];
            const { winningTeams } = useGameLogic(ref(makeTournament({ teams, stages: TWO_STAGE_PRESET, currentStageIndex: 1, usePlacementTiebreaker: false })), secureUpdate);
            expect(winningTeams.value).toHaveLength(1);
            expect(winningTeams.value[0]!.id).toBe('t1');
        });

        it('winningTeams returns all teams tied at the top', () => {
            const teams = [
                makeTeam('t1', 'c1', 'A', 0, { stagePoints: { groups: 0, finals: 100 }, stageGroups: { groups: 'A', finals: 'A' }, qualifiedStages: ['groups', 'finals'] }),
                makeTeam('t2', 'c2', 'A', 0, { stagePoints: { groups: 0, finals: 100 }, stageGroups: { groups: 'A', finals: 'A' }, qualifiedStages: ['groups', 'finals'] }),
                makeTeam('t3', 'c3', 'A', 0, { stagePoints: { groups: 0, finals: 50 }, stageGroups: { groups: 'A', finals: 'A' }, qualifiedStages: ['groups', 'finals'] }),
            ];
            const { winningTeams } = useGameLogic(ref(makeTournament({ teams, stages: TWO_STAGE_PRESET, currentStageIndex: 1, usePlacementTiebreaker: false })), secureUpdate);
            expect(winningTeams.value).toHaveLength(2);
            const ids = winningTeams.value.map(t => t.id);
            expect(ids).toContain('t1');
            expect(ids).toContain('t2');
        });

        it('getVisualRankIndex returns 0 for index 0', () => {
            const teams = [makeTeam('t1', 'c1', 'A', 100)];
            const { getVisualRankIndex } = useGameLogic(ref(makeTournament({ teams })), secureUpdate);
            expect(getVisualRankIndex(0, teams)).toBe(0);
        });

        it('getVisualRankIndex returns the same rank as previous when teams are tied', () => {
            const teams = [
                makeTeam('t1', 'c1', 'A', 50),
                makeTeam('t2', 'c2', 'A', 50), // tied with t1
                makeTeam('t3', 'c3', 'A', 10), // not tied
            ];
            const { getVisualRankIndex } = useGameLogic(ref(makeTournament({ teams, usePlacementTiebreaker: false })), secureUpdate);
            expect(getVisualRankIndex(1, teams)).toBe(0); // tied → inherits rank 0
            expect(getVisualRankIndex(2, teams)).toBe(2); // not tied → rank 2
        });
    });

    // ── Null-tournament early-return guards ───────────────────────────────────

    describe('Null tournament guards', () => {
        it('all exported functions/computeds return early/default when tournament is null', async () => {
            const nullTournament = ref<any>(null);
            const {
                getRaceCount, getRoundPoints, getTotalPoints, getGroupWildcards,
                sortedPlayers, sortedTeamsA, sortedTeamsB, sortedTeamsC, sortedFinalsTeams,
                sortedRaces, canAdvanceToFinals, canEndTournament,
                projectedProgression, activeStagePlayers, toggleBan, addTeamAdjustment,
                removeTeamAdjustment, winningTeams, toggleEditRace, updateRacePlacement, saveTapResults
            } = useGameLogic(nullTournament, secureUpdate);

            expect(getRaceCount('A')).toBe(0);
            expect(getRoundPoints('p1')).toBe(0);
            expect(getTotalPoints('p1')).toBe(0);
            expect(getGroupWildcards('A')).toEqual([]);
            expect(sortedPlayers.value).toEqual([]);
            expect(sortedTeamsA.value).toEqual([]);
            expect(sortedTeamsB.value).toEqual([]);
            expect(sortedTeamsC.value).toEqual([]);
            expect(sortedFinalsTeams.value).toEqual([]);
            expect(sortedRaces.value).toEqual([]);
            expect(canAdvanceToFinals.value).toBe(false);
            expect(canEndTournament.value).toBe(false);
            expect(projectedProgression.value).toEqual({ tied: [], safe: [], needed: 0 });
            expect(winningTeams.value).toEqual([]);
            expect(activeStagePlayers('A')).toEqual([]);
            await toggleBan('uma');
            await addTeamAdjustment('t1', 0, 'r');
            await removeTeamAdjustment('t1', 'id');
            toggleEditRace('groups', 'A', 1);
            await updateRacePlacement('A', 1, 1, 'p1');
            await saveTapResults('A', 1);
            expect(secureUpdate).not.toHaveBeenCalled();
        });
    });

    // ── canAdvanceToFinals for small tournaments ──────────────────────────────

    describe('canAdvanceToFinals small tournament', () => {
        it('returns false when team count is less than 6 (line 130)', () => {
            const { canAdvanceToFinals } = useGameLogic(
                ref(makeTournament({ teams: baseTeams, stage: 'groups' })), secureUpdate
            );
            expect(canAdvanceToFinals.value).toBe(false);
        });
    });

    // ── activeStagePlayers small tournament + wildcards ───────────────────────

    describe('activeStagePlayers wildcards and small tournament', () => {
        it('uses all-teams sort for small tournament and includes wildcards (lines 519, 531-533)', () => {
            const teams = [
                makeTeam('t1', 'c1', 'A', 50),
                makeTeam('t2', 'c2', 'A', 30),
            ];
            const players = {
                c1: makePlayer('c1', 'Cap 1', true),
                c2: makePlayer('c2', 'Cap 2', true),
                wc1: makePlayer('wc1', 'Wildcard 1'),
            };
            const wildcards = [{ playerId: 'wc1', group: 'A', stage: 'groups', points: 10 }] as any;
            const { activeStagePlayers } = useGameLogic(
                ref(makeTournament({ teams, players, wildcards })), secureUpdate
            );
            const ids = activeStagePlayers('A').map((p: any) => p.id);
            expect(ids).toContain('c1');
            expect(ids).toContain('c2');
            expect(ids).toContain('wc1');
        });
    });

    // ── saveTapResults saving guard ───────────────────────────────────────────

    describe('saveTapResults saving guard', () => {
        it('returns early when saving is already in progress (line 759)', async () => {
            const teams = [makeTeam('t1', 'p1', 'A', 0)];
            const players = { p1: makePlayer('p1', 'Player 1') };
            const fastUpdate = vi.fn().mockResolvedValue(undefined);
            const { updateRacePlacement, saveTapResults } = useGameLogic(
                ref(makeTournament({ teams, players })), fastUpdate
            );

            // Start updateRacePlacement without awaiting (sets saving.value = true synchronously before first await)
            const pendingUpdate = updateRacePlacement('A', 1, 1, 'p1');

            // saveTapResults should find saving.value === true and return early (line 759)
            await saveTapResults('A', 1);
            expect(fastUpdate).toHaveBeenCalledTimes(1); // only from updateRacePlacement

            // Let the pending update complete to restore saving.value = false
            await pendingUpdate;
        });
    });

    // ── projectedProgression 6-team tie scenarios ─────────────────────────────

    describe('projectedProgression 6-team tie scenarios', () => {
        it('covers group B top tie (lines 307-317) and safer-team path in TIE BOUNDARY (lines 344-348)', () => {
            // Group A: clear winner (tA1=100), runner tA2=25, third tA3=0
            // Group B: all-tie at 0pts → top tie detected (lines 307-317)
            // wildCardPool gets tA2(25) + tB1/tB2/tB3(0)
            // At TIE BOUNDARY, tA2 is safer than the tied group B teams (lines 344-348)
            const teams = [
                makeTeam('tA1', 'pA1', 'A', 100),
                makeTeam('tA2', 'pA2', 'A', 25),
                makeTeam('tA3', 'pA3', 'A', 0),
                makeTeam('tB1', 'pB1', 'B', 0),
                makeTeam('tB2', 'pB2', 'B', 0),
                makeTeam('tB3', 'pB3', 'B', 0),
            ];
            const { projectedProgression } = useGameLogic(ref(makeTournament({ teams })), secureUpdate);
            const result = projectedProgression.value;
            expect(result.safe).toContain('tA1'); // group A winner
            expect(result.safe).toContain('tA2'); // safer than tie boundary → promoted to safe
            expect(result.tied.map((t: any) => t.id)).toContain('tB1');
            expect(result.tied.map((t: any) => t.id)).toContain('tB2');
            expect(result.needed).toBe(1);
        });

        it('covers group A top tie (lines 280-290) and CLEAR BOUNDARY with delete (lines 357-365)', () => {
            // Group A: tA1 and tA2 tied at 50pts → lines 280-290 covered
            // Group B: clear winner tB1=100, runner tB2=30
            // wildCardPool = [tA1(50), tA2(50), tB2(30)]
            // slotsAvailable = 1 (from group A tie) + 1 (wildcard) = 2
            // Sorted pool: [tA1(50), tA2(50), tB2(30)]
            // lastQualifier=tA2(50), firstLoser=tB2(30) → CLEAR BOUNDARY
            // Loop runs with tA1/tA2 in tiedSet → delete from tiedSet (line 360 body)
            const teams = [
                makeTeam('tA1', 'pA1', 'A', 50),
                makeTeam('tA2', 'pA2', 'A', 50),
                makeTeam('tA3', 'pA3', 'A', 0),
                makeTeam('tB1', 'pB1', 'B', 100),
                makeTeam('tB2', 'pB2', 'B', 30),
                makeTeam('tB3', 'pB3', 'B', 0),
            ];
            const { projectedProgression } = useGameLogic(ref(makeTournament({ teams })), secureUpdate);
            const result = projectedProgression.value;
            expect(result.safe).toContain('tA1');
            expect(result.safe).toContain('tA2');
            expect(result.safe).toContain('tB1');
            expect(result.tied).toHaveLength(0); // clear boundary → no ties
            expect(result.needed).toBe(0);
        });
    });
});
