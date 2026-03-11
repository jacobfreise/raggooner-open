import { describe, it, expect, beforeEach } from 'vitest';
import { ref, nextTick } from 'vue';
import { usePlayerRankings } from './usePlayerRankings';

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
        teams: [
          { id: 'team1', captainId: 'p1', memberIds: [], inFinals: true, group: 'A' },
          { id: 'team2', captainId: 'p2', memberIds: [], inFinals: false, group: 'A' }
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
      { id: 't1', status: 'completed', teams: [], players: { p1: { id: 'p1' }, p2: { id: 'p2' } }, races: {} },
      { id: 't2', status: 'completed', teams: [], players: { p1: { id: 'p1' }, p2: { id: 'p2' } }, races: {} }
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
        id: 't_winner', name: 'Winner', status: 'completed', teams: [
          { id: 'team_alice', captainId: 'p1', memberIds: [], inFinals: true, group: 'A' },
          { id: 'team_bob', captainId: 'p2', memberIds: [], inFinals: true, group: 'B' }
        ], races: {}, players: { p1: { id: 'p1' }, p2: { id: 'p2' } }
      },
      {
        id: 't_eliminated', name: 'Eliminated', status: 'completed', teams: [
          { id: 'team_alice2', captainId: 'p1', memberIds: [], inFinals: false, group: 'A' },
          { id: 'team_charlie', captainId: 'p3', memberIds: [], inFinals: true, group: 'B' }
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
      { id: 't1', name: 'T1', createdAt: '2024-01-01', status: 'completed', teams: [{ id: 'team1', captainId: 'p1', memberIds: [], group: 'A' }], races: {}, players: { p1: { id: 'p1' } } },
      { id: 't2', name: 'T2', createdAt: '2024-02-01', status: 'completed', teams: [{ id: 'team2', captainId: 'p1', memberIds: [], group: 'A' }], races: {}, players: { p1: { id: 'p1' } } }
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
});
