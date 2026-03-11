import { describe, it, expect, beforeEach } from 'vitest';
import { ref } from 'vue';
import { useUmaStats } from './useUmaStats';

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
      { id: 't1', name: 'T1', status: 'completed', createdAt: '2026-01-01', bans: ['Hishi Akebono'] }
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
        teams: [
          { id: 'team1', captainId: 'p1', memberIds: [], inFinals: true },
          { id: 'team2', captainId: 'p2', memberIds: [], inFinals: true }
        ],
        players: { p1: { id: 'p1', uma: 'Special Week' }, p2: { id: 'p2', uma: 'Silence Suzuka' } },
        races: {}
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
      { id: 't1', name: 'T1', status: 'completed', createdAt: '2026-01-01' }
    ] as any);
    const { umaStats } = useUmaStats(
      players, noBanTournaments, filteredParticipations, filteredRaces, minTournaments, tierCriterion
    );
    expect(umaStats.value.find(u => u.name === 'Hishi Akebono')).toBeUndefined();
  });

  it('handles unknown Umas and release date logic', () => {
    const oldTournaments = ref([
      { id: 't_old', name: 'Old', status: 'completed', createdAt: '2020-01-01' } 
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
      { id: 't1', name: 'T1', createdAt: '2026-01-01', status: 'completed', teams: [{ id: 'team1', captainId: 'p1', memberIds: [], inFinals: true }], players: { p1: { id: 'p1', uma: 'Special Week' } }, races: {} },
      { id: 't2', name: 'T2', createdAt: '2026-02-01', status: 'completed', teams: [{ id: 'team2', captainId: 'p2', memberIds: [], inFinals: true }], players: { p2: { id: 'p2', uma: 'Special Week' } }, races: {} }
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
});
