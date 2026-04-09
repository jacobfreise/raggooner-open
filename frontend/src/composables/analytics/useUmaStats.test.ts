import { describe, it, expect, beforeEach } from 'vitest';
import { ref } from 'vue';
import { useUmaStats } from './useUmaStats';

const SMALL_STAGE = [
  { name: 'finals', label: 'Finals', groups: ['A'], racesRequired: 5, teamsAdvancingPerGroup: 0 },
];
const TWO_STAGE = [
  { name: 'groups', label: 'Group Stage', groups: ['A', 'B'], racesRequired: 5, teamsAdvancingPerGroup: 1 },
  { name: 'finals', label: 'Finals', groups: ['A'], racesRequired: 5, teamsAdvancingPerGroup: 0 },
];

const makeTeam = (id: string, captainId: string, group: string, inFinals: boolean, stageKey = 'groups') => ({
  id, captainId, memberIds: [],
  stageGroups: inFinals ? { [stageKey]: group, finals: 'A' } : { [stageKey]: group },
  qualifiedStages: inFinals ? [stageKey, 'finals'] : [stageKey],
  stagePoints: {},
});

describe('useUmaStats', () => {
  const players = ref([] as any);
  const filteredTournaments = ref([] as any);
  const filteredParticipations = ref([] as any);
  const filteredRaces = ref([] as any);
  const minTournaments = ref(1);
  const tierCriterion = ref('dominance' as any);

  beforeEach(() => {
    minTournaments.value = 1;
    tierCriterion.value = 'dominance';
    players.value = [
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
    ];
    filteredTournaments.value = [
      { id: 't1', name: 'T1', status: 'completed', createdAt: '2026-01-01', stages: SMALL_STAGE, currentStageIndex: 0, teams: [], bans: ['Hishi Akebono'] }
    ];
    filteredParticipations.value = [
      { playerId: 'p1', tournamentId: 't1', uma: 'Special Week', teamId: 'team1' },
      { playerId: 'p2', tournamentId: 't1', uma: 'Silence Suzuka', teamId: 'team2' },
    ];
    filteredRaces.value = [
      {
        tournamentId: 't1',
        placements: { p1: 1, p2: 2 },
        umaMapping: { p1: 'Special Week', p2: 'Silence Suzuka' }
      }
    ];
  });

  it('calculates uma stats correctly', () => {
    const { umaStats } = useUmaStats(
      players, filteredTournaments, filteredParticipations, filteredRaces, minTournaments, tierCriterion, ref('total' as any)
    );
    expect(umaStats.value.length).toBeGreaterThanOrEqual(2);
    const specialWeek = umaStats.value.find(u => u.name === 'Special Week');
    expect(specialWeek?.wins).toBe(1);
  });

  it('handles expanded uma details', () => {
    const { expandedUmaName, toggleUmaExpand, expandedUmaPlayers, expandedUmaTournaments } = useUmaStats(
      players, filteredTournaments, filteredParticipations, filteredRaces, minTournaments, tierCriterion, ref('total' as any)
    );
    toggleUmaExpand('Special Week');
    expect(expandedUmaName.value).toBe('Special Week');
    expect(expandedUmaPlayers.value).toHaveLength(1);
    expect(expandedUmaTournaments.value).toHaveLength(1);
  });

  it('calculates top umas correctly', () => {
    const { topUmas, topUmaCriterion } = useUmaStats(
      players, filteredTournaments, filteredParticipations, filteredRaces, minTournaments, tierCriterion, ref('total' as any)
    );
    topUmaCriterion.value = 'winRate';
    expect(topUmas.value[0].name).toBe('Special Week');
  });

  it('calculates ban rates correctly', () => {
    const { umaStats } = useUmaStats(
      players, filteredTournaments, filteredParticipations, filteredRaces, minTournaments, tierCriterion, ref('total' as any)
    );
    const akebono = umaStats.value.find(u => u.name === 'Hishi Akebono');
    expect(akebono?.bans).toBe(1);
  });

  it('calculates team wins for Umas correctly', () => {
    const teamTournaments = ref([
      {
        id: 't1', status: 'completed', createdAt: '2026-01-01',
        stages: SMALL_STAGE, currentStageIndex: 0,
        teams: [
          makeTeam('team1', 'p1', 'A', false, 'finals'),
          makeTeam('team2', 'p2', 'A', false, 'finals'),
        ],
        players: {
          p1: { id: 'p1', uma: 'Special Week' },
          p2: { id: 'p2', uma: 'Silence Suzuka' },
        },
        races: {
          'r1': { stage: 'finals', group: 'A', raceNumber: 1, placements: { p1: 1, p2: 2 } }
        }
      }
    ] as any);
    const teamRaces = ref([
      { tournamentId: 't1', placements: { p1: 1, p2: 2 }, umaMapping: { p1: 'Special Week', p2: 'Silence Suzuka' } }
    ] as any);
    const teamParts = ref([
      { playerId: 'p1', tournamentId: 't1', teamId: 'team1', uma: 'Special Week' },
      { playerId: 'p2', tournamentId: 't1', teamId: 'team2', uma: 'Silence Suzuka' }
    ] as any);

    const { umaStats } = useUmaStats(
      players, teamTournaments, teamParts, teamRaces, minTournaments, tierCriterion
    );
    const specialWeek = umaStats.value.find(u => u.name === 'Special Week');
    expect(specialWeek?.teamWins).toBe(1);
  });

  it('sorts Umas correctly', () => {
    const { umaStats, umaSortKey, umaSortDesc, toggleUmaSort } = useUmaStats(
      players, filteredTournaments, filteredParticipations, filteredRaces, minTournaments, tierCriterion, ref('total' as any)
    );
    umaSortKey.value = 'name';
    umaSortDesc.value = false; // Asc
    expect(umaStats.value[0].name).toBe('Hishi Akebono');
    toggleUmaSort('name');
    expect(umaStats.value[0].name).toBe('Special Week');
  });

  it('handles expanded view toggling and sorting', () => {
    const { expandedUmaName, toggleUmaExpand, expandedUmaPlayers, umaPlayerSortKey, toggleUmaPlayerSort } = useUmaStats(
      players, filteredTournaments, filteredParticipations, filteredRaces, minTournaments, tierCriterion, ref('total' as any)
    );
    toggleUmaExpand('Special Week');
    toggleUmaExpand('Silence Suzuka');
    umaPlayerSortKey.value = 'playerName';
    toggleUmaPlayerSort('playerName');
    expect(expandedUmaPlayers.value).toHaveLength(1);
  });

  it('handles tournaments with no bans', () => {
    const noBanTournaments = ref([
      { id: 't1', name: 'T1', status: 'completed', createdAt: '2026-01-01', stages: SMALL_STAGE, currentStageIndex: 0, teams: [] }
    ] as any);
    const { umaStats } = useUmaStats(
      players, noBanTournaments, filteredParticipations, filteredRaces, minTournaments, tierCriterion
    );
    expect(umaStats.value.find(u => u.name === 'Hishi Akebono')).toBeUndefined();
  });

  it('handles unknown Umas and release date logic', () => {
    const oldTournaments = ref([
      { id: 't_old', name: 'Old', status: 'completed', createdAt: '2020-01-01', stages: SMALL_STAGE, currentStageIndex: 0, teams: [] }
    ] as any);
    const oldRaces = ref([
      { tournamentId: 't_old', placements: { p1: 1, p2: 2 }, umaMapping: { p1: 'Unknown Uma', p2: 'Special Week' } }
    ] as any);
    const { umaStats } = useUmaStats(
      players, oldTournaments, filteredParticipations, oldRaces, minTournaments, tierCriterion
    );
    const specialWeek = umaStats.value.find(u => u.name === 'Special Week');
    expect(specialWeek?.availableTournaments).toBe(0);
  });

  it('sorts expanded Uma players and tournaments', () => {
    const multiUmaTourneys = ref([
      { id: 't1', name: 'T1', createdAt: '2026-01-01', status: 'completed', stages: SMALL_STAGE, currentStageIndex: 0, teams: [makeTeam('team1', 'p1', 'A', false, 'finals')], players: { p1: { id: 'p1', uma: 'Special Week' } }, races: {} },
      { id: 't2', name: 'T2', createdAt: '2026-02-01', status: 'completed', stages: SMALL_STAGE, currentStageIndex: 0, teams: [makeTeam('team2', 'p2', 'A', false, 'finals')], players: { p2: { id: 'p2', uma: 'Special Week' } }, races: {} }
    ] as any);
    const multiUmaRaces = ref([
      { tournamentId: 't1', placements: { p1: 2, p3: 1 }, umaMapping: { p1: 'Special Week' } },
      { tournamentId: 't2', placements: { p2: 1, p3: 2 }, umaMapping: { p2: 'Special Week' } }
    ] as any);
    const multiUmaParts = ref([
      { playerId: 'p1', tournamentId: 't1', teamId: 'team1', uma: 'Special Week' },
      { playerId: 'p2', tournamentId: 't2', teamId: 'team2', uma: 'Special Week' }
    ] as any);

    const { toggleUmaExpand, expandedUmaPlayers, toggleUmaPlayerSort, expandedUmaTournaments, toggleUmaTournamentSort, umaTournamentSortKey, umaTournamentSortDesc } = useUmaStats(
      players, multiUmaTourneys, multiUmaParts, multiUmaRaces, minTournaments, tierCriterion
    );

    toggleUmaExpand('Special Week');
    toggleUmaPlayerSort('playerName'); // desc: Bob vs Alice
    expect(expandedUmaPlayers.value[0].playerName).toBe('Bob');

    umaTournamentSortKey.value = 'tournamentName';
    umaTournamentSortDesc.value = true;
    expect(expandedUmaTournaments.value[0].tournamentId).toBe('t2');

    toggleUmaTournamentSort('tournamentName');
    expect(expandedUmaTournaments.value[0].tournamentId).toBe('t1');
  });

  it('accesses umaTierList computed', () => {
    const { umaTierList } = useUmaStats(
      players, filteredTournaments, filteredParticipations, filteredRaces, minTournaments, tierCriterion, ref('total' as any)
    );
    expect(Array.isArray(umaTierList.value)).toBe(true);
    for (const tier of umaTierList.value) {
      expect(tier).toHaveProperty('tier');
      expect(tier).toHaveProperty('entries');
    }
  });

  it('expandedUmaPlayers tracks group-stage races for multi-group tournament', () => {
    const multiGroupTournaments = ref([{
      id: 't1', name: 'T1', status: 'completed', createdAt: '2026-01-01',
      stages: TWO_STAGE, currentStageIndex: 0,
      teams: [
        makeTeam('team1', 'p1', 'A', false),
        makeTeam('team2', 'p2', 'B', false),
      ]
    }] as any);
    const multiGroupRaces = ref([{
      tournamentId: 't1', stage: 'groups', group: 'A', raceNumber: 1,
      placements: { p1: 1, p2: 2 }, umaMapping: { p1: 'Special Week', p2: 'Silence Suzuka' }
    }] as any);
    const multiGroupParts = ref([
      { playerId: 'p1', tournamentId: 't1', teamId: 'team1', uma: 'Special Week' }
    ] as any);
    const { toggleUmaExpand, expandedUmaPlayers } = useUmaStats(
      players, multiGroupTournaments, multiGroupParts, multiGroupRaces, minTournaments, tierCriterion, ref('total' as any)
    );
    toggleUmaExpand('Special Week');
    expect(expandedUmaPlayers.value).toHaveLength(1);
    expect(expandedUmaPlayers.value[0].groupRaces).toBe(1);
    expect(expandedUmaPlayers.value[0].groupWins).toBe(1);
  });

  it('expandedUmaTournaments covers no-groups finalsStatus path (line 363)', () => {
    // Single-group tournament. p1 is on team1 (NOT the winner) → finalsStatus='no-groups'
    // Must have a race so recalculateTournamentScores gives team2 more points than team1
    const singleGroupTournaments = ref([{
      id: 't1', name: 'T1', status: 'completed', createdAt: '2026-01-01',
      stages: SMALL_STAGE, currentStageIndex: 0,
      teams: [
        makeTeam('team1', 'p1', 'A', false, 'finals'),
        makeTeam('team2', 'p2', 'A', false, 'finals'),
      ],
      races: {
        'r1': { stage: 'finals', group: 'A', raceNumber: 1, placements: { p2: 1, p1: 2 } }
      },
      players: {
        p1: { id: 'p1', uma: 'Special Week' },
        p2: { id: 'p2', uma: 'Silence Suzuka' }
      }
    }] as any);
    const singleGroupParts = ref([
      { playerId: 'p1', tournamentId: 't1', teamId: 'team1', uma: 'Special Week' }
    ] as any);
    const { toggleUmaExpand, expandedUmaTournaments } = useUmaStats(
      players, singleGroupTournaments, singleGroupParts, filteredRaces, minTournaments, tierCriterion, ref('total' as any)
    );
    toggleUmaExpand('Special Week');
    expect(expandedUmaTournaments.value).toHaveLength(1);
    expect(expandedUmaTournaments.value[0].finalsStatus).toBe('no-groups');
  });

  it('expandedUmaTournaments covers wildcard player path (lines 366-368)', () => {
    // Player p1 is a wildcard (not on a team) in t1 → hits lines 366-368
    const wildcardTournaments = ref([{
      id: 't1', name: 'T1', status: 'completed', createdAt: '2026-01-01',
      stages: SMALL_STAGE, currentStageIndex: 0,
      teams: [makeTeam('team2', 'p2', 'A', false, 'finals')],
      wildcards: [{ playerId: 'p1', group: 'A', stage: 'finals', points: 10 }],
      races: {},
      players: {
        p1: { id: 'p1', uma: 'Special Week' },
        p2: { id: 'p2', uma: 'Silence Suzuka' }
      }
    }] as any);
    const wildcardParts = ref([
      { playerId: 'p1', tournamentId: 't1', teamId: undefined, uma: 'Special Week' }
    ] as any);
    const { toggleUmaExpand, expandedUmaTournaments } = useUmaStats(
      players, wildcardTournaments, wildcardParts, filteredRaces, minTournaments, tierCriterion, ref('total' as any)
    );
    toggleUmaExpand('Special Week');
    expect(expandedUmaTournaments.value).toHaveLength(1);
    expect(expandedUmaTournaments.value[0].isWildcard).toBe(true);
  });

  it('expandedUmaTournaments sort handles equal values (return 0 path, line 402)', () => {
    // Two players both with Special Week and equal stats → sort return 0
    const twoTournamentSameStats = ref([
      { id: 't1', name: 'T1', status: 'completed', createdAt: '2026-01-01', stages: SMALL_STAGE, currentStageIndex: 0, teams: [] },
      { id: 't2', name: 'T2', status: 'completed', createdAt: '2026-02-01', stages: SMALL_STAGE, currentStageIndex: 0, teams: [] },
    ] as any);
    const sameParts = ref([
      { playerId: 'p1', tournamentId: 't1', teamId: undefined, uma: 'Special Week' },
      { playerId: 'p2', tournamentId: 't2', teamId: undefined, uma: 'Special Week' },
    ] as any);
    const { toggleUmaExpand, expandedUmaTournaments, umaTournamentSortKey } = useUmaStats(
      players, twoTournamentSameStats, sameParts, ref([]), minTournaments, tierCriterion, ref('total' as any)
    );
    toggleUmaExpand('Special Week');
    umaTournamentSortKey.value = 'races'; // both have 0 races → equal → return 0
    expect(expandedUmaTournaments.value).toHaveLength(2);
  });

  it('expandedUmaTournaments covers finals finalsStatus and teamRank (lines 349-351)', () => {
    // Multi-group: p1 on team1 (qualifies for finals, not winner), team2 wins finals race
    const finalsTournaments = ref([{
      id: 't1', name: 'T1', status: 'completed', createdAt: '2026-01-01',
      stages: TWO_STAGE, currentStageIndex: 1,
      teams: [
        makeTeam('team1', 'p1', 'A', true),
        makeTeam('team2', 'p2', 'B', true),
      ],
      races: { 'r1': { stage: 'finals', group: 'A', raceNumber: 1, placements: { p2: 1, p1: 2 } } },
      players: {
        p1: { id: 'p1', uma: 'Special Week' },
        p2: { id: 'p2', uma: 'Silence Suzuka' }
      }
    }] as any);
    const finalsParts = ref([
      { playerId: 'p1', tournamentId: 't1', teamId: 'team1', uma: 'Special Week' }
    ] as any);
    const { toggleUmaExpand, expandedUmaTournaments } = useUmaStats(
      players, finalsTournaments, finalsParts, ref([]), minTournaments, tierCriterion, ref('total' as any)
    );
    toggleUmaExpand('Special Week');
    expect(expandedUmaTournaments.value[0].finalsStatus).toBe('finals');
    expect(expandedUmaTournaments.value[0].teamRank).toBe(2);
  });

  it('expandedUmaTournaments covers eliminated finalsStatus and teamRank (lines 353-355)', () => {
    // Multi-group: p1 on team1 (group A, not qualified for finals), team2 (group B, qualified)
    const elimTournaments = ref([{
      id: 't1', name: 'T1', status: 'completed', createdAt: '2026-01-01',
      stages: TWO_STAGE, currentStageIndex: 1,
      teams: [
        makeTeam('team1', 'p1', 'A', false),  // not in finals
        makeTeam('team2', 'p2', 'B', true),   // in finals
      ],
      races: { 'r1': { stage: 'finals', group: 'A', raceNumber: 1, placements: { p2: 1, p1: 2 } } },
      players: {
        p1: { id: 'p1', uma: 'Special Week' },
        p2: { id: 'p2', uma: 'Silence Suzuka' }
      }
    }] as any);
    const elimParts = ref([
      { playerId: 'p1', tournamentId: 't1', teamId: 'team1', uma: 'Special Week' }
    ] as any);
    const { toggleUmaExpand, expandedUmaTournaments } = useUmaStats(
      players, elimTournaments, elimParts, ref([]), minTournaments, tierCriterion, ref('total' as any)
    );
    toggleUmaExpand('Special Week');
    expect(expandedUmaTournaments.value[0].finalsStatus).toBe('eliminated');
    expect(expandedUmaTournaments.value[0].teamRank).toBe(1);
  });

  it('sort comparator handles equal values in expandedUmaPlayers (return 0 path)', () => {
    const twoTournaments = ref([
      { id: 't1', name: 'T1', status: 'completed', createdAt: '2026-01-01', stages: SMALL_STAGE, currentStageIndex: 0, teams: [] },
      { id: 't2', name: 'T2', status: 'completed', createdAt: '2026-02-01', stages: SMALL_STAGE, currentStageIndex: 0, teams: [] },
    ] as any);
    const twoParts = ref([
      { playerId: 'p1', tournamentId: 't1', uma: 'Special Week', teamId: 'team1' },
      { playerId: 'p2', tournamentId: 't2', uma: 'Special Week', teamId: 'team2' },
    ] as any);
    const twoRaces = ref([
      { tournamentId: 't1', placements: { p1: 1, p3: 2 }, umaMapping: { p1: 'Special Week' } },
      { tournamentId: 't2', placements: { p2: 1, p3: 2 }, umaMapping: { p2: 'Special Week' } },
    ] as any);
    const { toggleUmaExpand, expandedUmaPlayers, umaPlayerSortKey } = useUmaStats(
      players, twoTournaments, twoParts, twoRaces, minTournaments, tierCriterion, ref('total' as any)
    );
    toggleUmaExpand('Special Week');
    umaPlayerSortKey.value = 'races'; // both players have 1 race → equal → return 0
    expect(expandedUmaPlayers.value).toHaveLength(2);
  });
});
