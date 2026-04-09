import { describe, it, expect, beforeEach } from 'vitest';
import { ref } from 'vue';
import { usePlayerRankings } from './usePlayerRankings';

// Standard stage presets for tests
const TWO_STAGE = [
  { name: 'groups', label: 'Group Stage', groups: ['A', 'B'], racesRequired: 5, teamsAdvancingPerGroup: 1 },
  { name: 'finals', label: 'Finals', groups: ['A'], racesRequired: 5, teamsAdvancingPerGroup: 0 },
];
const SMALL_STAGE = [
  { name: 'finals', label: 'Finals', groups: ['A'], racesRequired: 5, teamsAdvancingPerGroup: 0 },
];

const makeTeam = (id: string, captainId: string, group: string, inFinals: boolean) => ({
  id, captainId, memberIds: [],
  stageGroups: inFinals
    ? { groups: group, finals: 'A' }
    : { groups: group },
  qualifiedStages: inFinals ? ['groups', 'finals'] : ['groups'],
  stagePoints: {},
});

describe('usePlayerRankings', () => {
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
      { id: 'p1', name: 'Alice', metadata: {} },
      { id: 'p2', name: 'Bob', metadata: {} },
    ];
    filteredTournaments.value = [
      {
        id: 't1',
        name: 'T1',
        status: 'completed',
        createdAt: '2024-01-01',
        stages: TWO_STAGE,
        currentStageIndex: 1,
        teams: [
          makeTeam('team1', 'p1', 'A', true),
          makeTeam('team2', 'p2', 'A', false),
        ],
        races: {
          'groups-A-1': { stage: 'groups', group: 'A', raceNumber: 1, placements: { p1: 1, p2: 2 } }
        },
        players: { p1: { id: 'p1' }, p2: { id: 'p2' } }
      }
    ];
    filteredParticipations.value = [
      { playerId: 'p1', tournamentId: 't1', totalPoints: 100, teamId: 'team1' },
      { playerId: 'p2', tournamentId: 't1', totalPoints: 50, teamId: 'team2' },
    ];
    filteredRaces.value = [
      {
        tournamentId: 't1',
        placements: { p1: 1, p2: 2 },
        umaMapping: { p1: 'Special Week', p2: 'Silence Suzuka' }
      }
    ];
  });

  it('calculates player rankings correctly', () => {
    const { playerRankings } = usePlayerRankings(
      players, filteredTournaments, filteredParticipations, filteredRaces, minTournaments, tierCriterion, ref('total' as any)
    );

    expect(playerRankings.value).toHaveLength(2);
    const alice = playerRankings.value.find(p => p.player.id === 'p1');
    expect(alice?.totalPoints).toBe(100);
    expect(alice?.wins).toBe(1);
  });

  it('filters by minTournaments', () => {
    minTournaments.value = 2;
    const { playerRankings } = usePlayerRankings(
      players, filteredTournaments, filteredParticipations, filteredRaces, minTournaments, tierCriterion, ref('total' as any)
    );
    expect(playerRankings.value).toHaveLength(0);
  });

  it('handles expanded player details', () => {
    const { expandedPlayerId, togglePlayerExpand, expandedPlayerUmas, expandedPlayerTournaments } = usePlayerRankings(
      players, filteredTournaments, filteredParticipations, filteredRaces, minTournaments, tierCriterion, ref('total' as any)
    );

    togglePlayerExpand('p1');
    expect(expandedPlayerId.value).toBe('p1');
    expect(expandedPlayerUmas.value).toHaveLength(1);
    expect(expandedPlayerTournaments.value).toHaveLength(1);
  });

  it('assigns tiers correctly', () => {
    const { playerTierList } = usePlayerRankings(
      players, filteredTournaments, filteredParticipations, filteredRaces, minTournaments, tierCriterion, ref('total' as any)
    );
    const sTier = playerTierList.value.find(t => t.tier === 'S');
    expect(sTier?.entries).toContainEqual(expect.objectContaining({ player: expect.objectContaining({ id: 'p1' }) }));
  });

  it('sorts players correctly', () => {
    const { playerRankings, playerSortKey, playerSortDesc, togglePlayerSort } = usePlayerRankings(
      players, filteredTournaments, filteredParticipations, filteredRaces, minTournaments, tierCriterion, ref('total' as any)
    );

    playerSortKey.value = 'totalPoints';
    playerSortDesc.value = true;
    expect(playerRankings.value[0].player.id).toBe('p1');

    togglePlayerSort('totalPoints');
    expect(playerRankings.value[0].player.id).toBe('p2');
  });

  it('handles topPlayerCriterion correctly', () => {
    const { topPlayers, topPlayerCriterion } = usePlayerRankings(
      players, filteredTournaments, filteredParticipations, filteredRaces, minTournaments, tierCriterion, ref('total' as any)
    );
    topPlayerCriterion.value = 'totalPoints';
    expect(topPlayers.value[0].player.id).toBe('p1');
  });

  it('sorts by name correctly', () => {
    const { playerRankings, playerSortKey, playerSortDesc, togglePlayerSort } = usePlayerRankings(
      players, filteredTournaments, filteredParticipations, filteredRaces, minTournaments, tierCriterion, ref('total' as any)
    );
    playerSortKey.value = 'name';
    playerSortDesc.value = false;
    expect(playerRankings.value[0].player.name).toBe('Alice');
    togglePlayerSort('name');
    expect(playerRankings.value[0].player.name).toBe('Bob');
  });

  it('toggles detail tabs correctly', () => {
    const { expandedDetailTab, togglePlayerExpand, expandedPlayerId } = usePlayerRankings(
      players, filteredTournaments, filteredParticipations, filteredRaces, minTournaments, tierCriterion, ref('total' as any)
    );
    togglePlayerExpand('p1');
    expandedDetailTab.value = 'umas';
    togglePlayerExpand('p1');
    expect(expandedPlayerId.value).toBeNull();
  });

  it('handles multiple Umas with same stats correctly', () => {
    const multiPlayers = ref([{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' }] as any);
    const multiUmaRaces = ref([
      { tournamentId: 't1', placements: { p1: 1, p2: 2 }, umaMapping: { p1: 'Special Week', p2: 'Silence Suzuka' } },
      { tournamentId: 't2', placements: { p1: 1, p2: 2 }, umaMapping: { p1: 'Silence Suzuka', p2: 'Special Week' } }
    ] as any);
    const multiUmaParts = ref([
      { playerId: 'p1', tournamentId: 't1', totalPoints: 100 },
      { playerId: 'p1', tournamentId: 't2', totalPoints: 100 }
    ] as any);
    const multiUmaTourneys = ref([
      { id: 't1', status: 'completed', stages: SMALL_STAGE, currentStageIndex: 0, teams: [], players: { p1: { id: 'p1' }, p2: { id: 'p2' } }, races: {} },
      { id: 't2', status: 'completed', stages: SMALL_STAGE, currentStageIndex: 0, teams: [], players: { p1: { id: 'p1' }, p2: { id: 'p2' } }, races: {} }
    ] as any);

    const { playerRankings } = usePlayerRankings(
      multiPlayers, multiUmaTourneys, multiUmaParts, multiUmaRaces, minTournaments, tierCriterion
    );
    const alice = playerRankings.value.find(p => p.player.id === 'p1');
    expect(alice?.mostPickedUmas).toHaveLength(2);
  });

  it('calculates complex tournament standings in expanded view', () => {
    const complexPlayers = ref([{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' }, { id: 'p3', name: 'Charlie' }] as any);
    const complexTournaments = ref([
      {
        id: 't_winner', name: 'Winner', status: 'completed',
        stages: TWO_STAGE, currentStageIndex: 1,
        teams: [
          makeTeam('team_alice', 'p1', 'A', true),
          makeTeam('team_bob', 'p2', 'B', true),
        ], races: {}, players: { p1: { id: 'p1' }, p2: { id: 'p2' } }
      },
      {
        id: 't_eliminated', name: 'Eliminated', status: 'completed',
        stages: TWO_STAGE, currentStageIndex: 1,
        teams: [
          makeTeam('team_alice2', 'p1', 'A', false),
          makeTeam('team_charlie', 'p3', 'B', true),
        ], races: {}, players: { p1: { id: 'p1' }, p3: { id: 'p3' } }
      }
    ] as any);
    const complexParts = ref([
      { playerId: 'p1', tournamentId: 't_winner', teamId: 'team_alice' },
      { playerId: 'p1', tournamentId: 't_eliminated', teamId: 'team_alice2' }
    ] as any);

    const { togglePlayerExpand, expandedPlayerTournaments } = usePlayerRankings(
      complexPlayers, complexTournaments, complexParts, filteredRaces, minTournaments, tierCriterion
    );
    togglePlayerExpand('p1');
    const rows = expandedPlayerTournaments.value;
    expect(rows.find(r => r.tournamentId === 't_winner')?.finalsStatus).toBe('winner');
    expect(rows.find(r => r.tournamentId === 't_eliminated')?.finalsStatus).toBe('eliminated');
  });

  it('sorts expanded player tournaments by points', () => {
    const sortTournaments = ref([
      { id: 't1', name: 'T1', createdAt: '2024-01-01', status: 'completed', stages: SMALL_STAGE, currentStageIndex: 0, teams: [{ id: 'team1', captainId: 'p1', memberIds: [], stageGroups: { finals: 'A' }, qualifiedStages: ['finals'], stagePoints: {} }], races: {}, players: { p1: { id: 'p1' } } },
      { id: 't2', name: 'T2', createdAt: '2024-02-01', status: 'completed', stages: SMALL_STAGE, currentStageIndex: 0, teams: [{ id: 'team2', captainId: 'p1', memberIds: [], stageGroups: { finals: 'A' }, qualifiedStages: ['finals'], stagePoints: {} }], races: {}, players: { p1: { id: 'p1' } } }
    ] as any);
    const sortParts = ref([
      { playerId: 'p1', tournamentId: 't1', totalPoints: 50, teamId: 'team1' },
      { playerId: 'p1', tournamentId: 't2', totalPoints: 100, teamId: 'team2' }
    ] as any);
    const sortRaces = ref([
      { tournamentId: 't1', placements: { p1: 2, p2: 1 }, umaMapping: { p1: 'Special Week' } },
      { tournamentId: 't2', placements: { p1: 1, p2: 2 }, umaMapping: { p1: 'Special Week' } }
    ] as any);

    const { togglePlayerExpand, expandedPlayerTournaments, togglePlayerTournamentSort, playerTournamentSortKey, playerTournamentSortDesc } = usePlayerRankings(
      players, sortTournaments, sortParts, sortRaces, minTournaments, tierCriterion
    );

    togglePlayerExpand('p1');
    playerTournamentSortKey.value = 'totalPoints';
    playerTournamentSortDesc.value = true;

    const res = expandedPlayerTournaments.value;

    // T2 has 1st place (25 pts), T1 has 2nd place (18 pts). T2 first.
    expect(res[0].tournamentId).toBe('t2');

    togglePlayerTournamentSort('totalPoints');
    expect(expandedPlayerTournaments.value[0].tournamentId).toBe('t1');
  });

  it('handles player with no team and no wildcards (hasGroups=false path)', () => {
    const noTeamTournaments = ref([{
      id: 't1', name: 'T1', status: 'completed', createdAt: '2024-01-01',
      stages: SMALL_STAGE, currentStageIndex: 0,
      teams: [], races: {}, players: { p1: { id: 'p1' } }
    }] as any);
    const noTeamParts = ref([
      { playerId: 'p1', tournamentId: 't1', totalPoints: 50, teamId: undefined }
    ] as any);

    const { togglePlayerExpand, expandedPlayerTournaments } = usePlayerRankings(
      players, noTeamTournaments, noTeamParts, filteredRaces, minTournaments, tierCriterion
    );
    togglePlayerExpand('p1');
    const rows = expandedPlayerTournaments.value;
    expect(rows).toHaveLength(1);
    expect(rows[0].finalsStatus).toBe('-');
  });

  it('handles player with no team and no wildcards (hasGroups=true path, covers lines 521-522)', () => {
    // Multi-group tournament so hasGroups=true, but p1 has no team → hits lines 521-522
    const multiGroupNoTeam = ref([{
      id: 't1', name: 'T1', status: 'completed', createdAt: '2024-01-01',
      stages: TWO_STAGE, currentStageIndex: 0,
      teams: [
        makeTeam('team1', 'p2', 'A', false),
        makeTeam('team2', 'p3', 'B', false),
      ],
      races: {}, players: { p1: { id: 'p1' }, p2: { id: 'p2' }, p3: { id: 'p3' } }
    }] as any);
    const noTeamParts2 = ref([
      { playerId: 'p1', tournamentId: 't1', totalPoints: 50, teamId: undefined }
    ] as any);

    const { togglePlayerExpand, expandedPlayerTournaments } = usePlayerRankings(
      players, multiGroupNoTeam, noTeamParts2, filteredRaces, minTournaments, tierCriterion
    );
    togglePlayerExpand('p1');
    const rows = expandedPlayerTournaments.value;
    expect(rows).toHaveLength(1);
    expect(rows[0].finalsStatus).toBe('-');
  });

  it('accesses expandedPlayerRaces computed and exercises all sort branches', () => {
    // Two races for p1 to trigger sort comparisons
    const multiRaceTournaments = ref([
      { id: 't1', name: 'B Tournament', status: 'completed', createdAt: '2024-01-01', stages: SMALL_STAGE, currentStageIndex: 0, teams: [], races: {}, players: { p1: { id: 'p1' }, p2: { id: 'p2' } } },
      { id: 't2', name: 'A Tournament', status: 'completed', createdAt: '2024-02-01', stages: SMALL_STAGE, currentStageIndex: 0, teams: [], races: {}, players: { p1: { id: 'p1' }, p2: { id: 'p2' } } },
    ] as any);
    const multiRaceParts = ref([
      { playerId: 'p1', tournamentId: 't1', totalPoints: 25, teamId: 'team1' },
      { playerId: 'p1', tournamentId: 't2', totalPoints: 18, teamId: 'team2' },
    ] as any);
    const multiRaces = ref([
      { tournamentId: 't1', stage: 'finals', group: 'A', raceNumber: 1, placements: { p1: 1, p2: 2 }, umaMapping: { p1: 'Special Week', p2: 'Silence Suzuka' } },
      { tournamentId: 't2', stage: 'finals', group: 'A', raceNumber: 1, placements: { p1: 2, p2: 1 }, umaMapping: { p1: 'Silence Suzuka', p2: 'Special Week' } },
    ] as any);

    const { togglePlayerExpand, expandedPlayerRaces, togglePlayerRaceSort } = usePlayerRankings(
      players, multiRaceTournaments, multiRaceParts, multiRaces, minTournaments, tierCriterion, ref('total' as any)
    );
    togglePlayerExpand('p1');
    expect(expandedPlayerRaces.value).toHaveLength(2);

    // Sort by string key (tournamentName) → hits string branch (lines 579-580)
    togglePlayerRaceSort('tournamentName');
    expect(expandedPlayerRaces.value[0].tournamentName).toBe('B Tournament'); // desc: Z first

    // Sort by numeric key (points, valA > valB path)
    togglePlayerRaceSort('points'); // desc first
    expect(expandedPlayerRaces.value[0].points).toBe(25);

    // Flip to asc (valA < valB → -1)
    togglePlayerRaceSort('points');
    expect(expandedPlayerRaces.value[0].points).toBe(18);

    // Sort by stage (string key, 'finals' vs 'groups')
    togglePlayerRaceSort('stage');
    expect(expandedPlayerRaces.value.length).toBe(2);
  });

  it('expandedPlayerTournaments and expandedPlayerRaces return [] when no player expanded (lines 394, 544)', () => {
    const { expandedPlayerTournaments, expandedPlayerRaces } = usePlayerRankings(
      players, filteredTournaments, filteredParticipations, filteredRaces, minTournaments, tierCriterion, ref('total' as any)
    );
    expect(expandedPlayerTournaments.value).toEqual([]);
    expect(expandedPlayerRaces.value).toEqual([]);
  });

  it('covers group race stats in playerRankings and expandedPlayerUmas (lines 221-226, 253-258, 353-357, 368-369, 381-387)', () => {
    const twoUmaTournaments = ref([{
      id: 't1', name: 'T1', status: 'completed', createdAt: '2024-01-01',
      stages: TWO_STAGE, currentStageIndex: 0,
      teams: [
        makeTeam('team1', 'p1', 'A', false),
        makeTeam('team2', 'p2', 'B', false),
      ],
      players: { p1: { id: 'p1' }, p2: { id: 'p2' } },
      races: {}
    }] as any);
    const twoUmaParts = ref([
      { playerId: 'p1', tournamentId: 't1', totalPoints: 25, teamId: 'team1' }
    ] as any);
    const twoUmaRaces = ref([
      // Groups-stage race in multi-group tournament → isFinalsRace=false → covers lines 221-226, 253-258
      { tournamentId: 't1', stage: 'groups', group: 'A', raceNumber: 1, placements: { p1: 1, p2: 2 }, umaMapping: { p1: 'Special Week', p2: 'Silence Suzuka' } },
      // Second UMA for p1 (Silence Suzuka) in groups race
      { tournamentId: 't1', stage: 'groups', group: 'A', raceNumber: 2, placements: { p1: 2, p2: 1 }, umaMapping: { p1: 'Silence Suzuka', p2: 'Special Week' } },
      // 1-player race → covers line 353 in expandedPlayerUmas
      { tournamentId: 't1', stage: 'groups', group: 'A', raceNumber: 3, placements: { p1: 1 }, umaMapping: { p1: 'Special Week' } },
      // 2-player race where p1 NOT in placements → covers line 355
      { tournamentId: 't1', stage: 'groups', group: 'B', raceNumber: 1, placements: { p2: 1, p3: 2 }, umaMapping: { p2: 'Silence Suzuka' } },
      // p1 in placements but no umaMapping entry → covers line 357
      { tournamentId: 't1', stage: 'groups', group: 'A', raceNumber: 4, placements: { p1: 2, p2: 1 }, umaMapping: { p2: 'Special Week' } },
    ] as any);

    const { playerRankings, togglePlayerExpand, expandedPlayerUmas, playerUmaSortKey } = usePlayerRankings(
      players, twoUmaTournaments, twoUmaParts, twoUmaRaces, minTournaments, tierCriterion, ref('total' as any)
    );

    // Verify group race stats in playerRankings (races 1, 2, and 5 all count as groups races)
    const alice = playerRankings.value.find(p => p.player.id === 'p1');
    expect(alice?.groupRaces).toBe(3);
    expect(alice?.groupWins).toBe(1);

    // Access expandedPlayerUmas (covers lines 368-369 for group dominance stats)
    togglePlayerExpand('p1');
    expect(expandedPlayerUmas.value).toHaveLength(2);

    // Sort with 2 UMAs (covers lines 381-387)
    playerUmaSortKey.value = 'racesPlayed';
    expect(expandedPlayerUmas.value).toHaveLength(2);
  });

  it('wildcard path in expandedPlayerTournaments (lines 511-514)', () => {
    const wildcardTournament = ref([{
      id: 't1', name: 'T1', status: 'completed', createdAt: '2024-01-01',
      stages: TWO_STAGE, currentStageIndex: 0,
      teams: [makeTeam('team2', 'p2', 'A', false)],
      wildcards: [{ playerId: 'p1', group: 'A', stage: 'groups', points: 10 }],
      races: {},
      players: { p1: { id: 'p1' }, p2: { id: 'p2' } }
    }] as any);
    const wildcardPart = ref([
      { playerId: 'p1', tournamentId: 't1', totalPoints: 10, teamId: undefined }
    ] as any);

    const { togglePlayerExpand, expandedPlayerTournaments } = usePlayerRankings(
      players, wildcardTournament, wildcardPart, ref([]), minTournaments, tierCriterion, ref('total' as any)
    );
    togglePlayerExpand('p1');
    expect(expandedPlayerTournaments.value).toHaveLength(1);
    expect(expandedPlayerTournaments.value[0].isWildcard).toBe(true);
  });

  it('expandedPlayerRaces sort returns 0 for equal values and covers race guards (lines 551, 553, 587)', () => {
    const eqTournaments = ref([
      { id: 't1', name: 'T1', status: 'completed', createdAt: '2024-01-01', stages: SMALL_STAGE, currentStageIndex: 0, teams: [], races: {}, players: { p1: { id: 'p1' } } },
      { id: 't2', name: 'T2', status: 'completed', createdAt: '2024-02-01', stages: SMALL_STAGE, currentStageIndex: 0, teams: [], races: {}, players: { p1: { id: 'p1' } } },
    ] as any);
    const eqParts = ref([
      { playerId: 'p1', tournamentId: 't1', totalPoints: 18, teamId: 'team1' },
      { playerId: 'p1', tournamentId: 't2', totalPoints: 18, teamId: 'team2' },
    ] as any);
    const eqRaces = ref([
      { tournamentId: 't1', stage: 'finals', group: 'A', raceNumber: 1, placements: { p1: 2, p2: 1 }, umaMapping: { p1: 'Special Week' } },
      { tournamentId: 't2', stage: 'finals', group: 'A', raceNumber: 1, placements: { p1: 2, p2: 1 }, umaMapping: { p1: 'Special Week' } },
      // p1 not in placements → covers line 551
      { tournamentId: 't1', stage: 'finals', group: 'A', raceNumber: 2, placements: { p2: 1, p3: 2 }, umaMapping: { p2: 'Silence Suzuka' } },
      // 1-player race → covers line 553
      { tournamentId: 't1', stage: 'finals', group: 'A', raceNumber: 3, placements: { p1: 1 }, umaMapping: { p1: 'Special Week' } },
    ] as any);

    const { togglePlayerExpand, expandedPlayerRaces, playerRaceSortKey } = usePlayerRankings(
      players, eqTournaments, eqParts, eqRaces, minTournaments, tierCriterion, ref('total' as any)
    );
    togglePlayerExpand('p1');
    playerRaceSortKey.value = 'points';
    // Both races have points=18 → sort returns 0 for the comparison (line 587)
    expect(expandedPlayerRaces.value).toHaveLength(2);
  });
});
