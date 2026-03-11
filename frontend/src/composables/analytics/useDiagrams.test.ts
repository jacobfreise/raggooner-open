import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, nextTick } from 'vue';
import { useDiagrams } from './useDiagrams';

describe('useDiagrams', () => {
  const players = ref([
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
  ] as any);

  const filteredTournaments = ref([
    { id: 't1', name: 'T1', createdAt: '2024-01-01' },
    { id: 't2', name: 'T2', createdAt: '2024-02-01' },
  ] as any);

  const filteredRaces = ref([
    { tournamentId: 't1', placements: { p1: 1, p2: 2 }, umaMapping: { p1: 'Special Week', p2: 'Silence Suzuka' } },
    { tournamentId: 't2', placements: { p1: 2, p2: 1 }, umaMapping: { p1: 'Special Week', p2: 'Silence Suzuka' } },
  ] as any);

  const playerRankings = ref([
    { player: { id: 'p1', name: 'Alice' } },
    { player: { id: 'p2', name: 'Bob' } },
  ] as any);

  const activeTab = ref('analytics');

  beforeEach(() => {
    activeTab.value = 'analytics';
  });

  it('initializes with correct defaults', () => {
    const { diagramMode, diagramMetric, diagramSubject } = useDiagrams(
      players, filteredTournaments, filteredRaces, playerRankings, activeTab, ref('total' as any)
    );
    expect(diagramMode.value).toBe('per-tournament');
    expect(diagramMetric.value).toBe('dominance');
    expect(diagramSubject.value).toBe('players');
  });

  it('toggles selected players correctly', () => {
    const { diagramSelectedPlayerIds, toggleDiagramPlayer } = useDiagrams(
      players, filteredTournaments, filteredRaces, playerRankings, activeTab, ref('total' as any)
    );
    
    toggleDiagramPlayer('p1');
    expect(diagramSelectedPlayerIds.value).toContain('p1');
    
    toggleDiagramPlayer('p1');
    expect(diagramSelectedPlayerIds.value).not.toContain('p1');
  });

  it('calculates player timeline data correctly', () => {
    const { diagramSelectedPlayerIds, playerTimelineData } = useDiagrams(
      players, filteredTournaments, filteredRaces, playerRankings, activeTab, ref('total' as any)
    );
    
    diagramSelectedPlayerIds.value = ['p1'];
    expect(playerTimelineData.value.datasets).toHaveLength(1);
    expect(playerTimelineData.value.datasets[0].label).toBe('Alice');
    expect(playerTimelineData.value.xLabels).toHaveLength(2);
    expect(playerTimelineData.value.xLabels).toEqual(['T1', 'T2']);
    
    // Check points calculation (dominance)
    // T1: Alice 1st of 2 -> 100
    // T2: Alice 2nd of 2 -> 0
    expect(playerTimelineData.value.datasets[0].points).toEqual([100, 0]);
  });

  it('calculates uma timeline data correctly', () => {
    const { diagramSelectedUmaNames, umaTimelineData } = useDiagrams(
      players, filteredTournaments, filteredRaces, playerRankings, activeTab, ref('total' as any)
    );
    
    diagramSelectedUmaNames.value = ['Special Week'];
    expect(umaTimelineData.value.datasets).toHaveLength(1);
    expect(umaTimelineData.value.datasets[0].label).toBe('Special Week');
    expect(umaTimelineData.value.xLabels).toHaveLength(2);
    
    // T1: Special Week (Alice) 1st of 2 -> 100
    // T2: Special Week (Alice) 2nd of 2 -> 0
    expect(umaTimelineData.value.datasets[0].points).toEqual([100, 0]);
  });

  it('handles cumulative mode correctly', () => {
    const { diagramSelectedPlayerIds, diagramMode, playerTimelineData } = useDiagrams(
      players, filteredTournaments, filteredRaces, playerRankings, activeTab, ref('total' as any)
    );
    
    diagramSelectedPlayerIds.value = ['p1'];
    diagramMode.value = 'cumulative';
    
    // T1: 100% (1/1)
    // T2: (1+0) / (1+1) = 50%
    expect(playerTimelineData.value.datasets[0].points).toEqual([100, 50]);
  });

  it('handles avg-points metric correctly', () => {
    const { diagramSelectedPlayerIds, diagramMetric, playerTimelineData } = useDiagrams(
      players, filteredTournaments, filteredRaces, playerRankings, activeTab, ref('total' as any)
    );
    
    diagramSelectedPlayerIds.value = ['p1'];
    diagramMetric.value = 'avg-points';
    
    // psys[1] = 25
    // psys[2] = 18
    // T1: Alice 1st -> 25
    // T2: Alice 2nd -> 18
    expect(playerTimelineData.value.datasets[0].points).toEqual([25, 18]);
  });

  it('calculates diagramAvailableUmas correctly', () => {
    const { diagramAvailableUmas } = useDiagrams(
      players, filteredTournaments, filteredRaces, playerRankings, activeTab, ref('total' as any)
    );
    
    expect(diagramAvailableUmas.value).toEqual(['Silence Suzuka', 'Special Week']);
  });

  it('enforces player and uma selection limits', () => {
    const { diagramSelectedPlayerIds, toggleDiagramPlayer, diagramSelectedUmaNames, toggleDiagramUma, MAX_DIAGRAM_PLAYERS, MAX_DIAGRAM_UMAS } = useDiagrams(
      players, filteredTournaments, filteredRaces, playerRankings, activeTab, ref('total' as any)
    );
    
    for (let i = 0; i < MAX_DIAGRAM_PLAYERS + 2; i++) {
      toggleDiagramPlayer(`p${i}`);
    }
    expect(diagramSelectedPlayerIds.value.length).toBe(MAX_DIAGRAM_PLAYERS);

    for (let i = 0; i < MAX_DIAGRAM_UMAS + 2; i++) {
      toggleDiagramUma(`u${i}`);
    }
    expect(diagramSelectedUmaNames.value.length).toBe(MAX_DIAGRAM_UMAS);
  });

  it('handles umaTimelineData with avg-points metric', () => {
    const { diagramSelectedUmaNames, diagramMetric, umaTimelineData } = useDiagrams(
      players, filteredTournaments, filteredRaces, playerRankings, activeTab, ref('total' as any)
    );
    
    diagramSelectedUmaNames.value = ['Special Week'];
    diagramMetric.value = 'avg-points';
    
    // T1: Special Week (p1) 1st -> 25
    // T2: Special Week (p1) 2nd -> 18
    expect(umaTimelineData.value.datasets[0].points).toEqual([25, 18]);
  });

  it('auto-selects top 5 players when diagrams tab is opened', async () => {
    const { diagramSelectedPlayerIds } = useDiagrams(
      players, filteredTournaments, filteredRaces, playerRankings, activeTab, ref('total' as any)
    );
    
    diagramSelectedPlayerIds.value = [];
    activeTab.value = 'diagrams';
    await nextTick();
    expect(diagramSelectedPlayerIds.value).toHaveLength(2); // We only have 2 players in mock
  });

  it('handles missing race data in timeline', () => {
    const mixedRaces2 = ref([
      { tournamentId: 't1', placements: { p1: 1, p2: 2 }, umaMapping: { p1: 'Special Week', p2: 'Silence Suzuka' } },
      { tournamentId: 't2', placements: { p2: 1, p3: 2 }, umaMapping: { p2: 'Silence Suzuka', p3: 'Special Week' } }
    ] as any);
    
    const { playerTimelineData: ptd2, diagramSelectedPlayerIds: dsids2 } = useDiagrams(
      players, filteredTournaments, mixedRaces2, playerRankings, activeTab, ref('total' as any)
    );
    
    dsids2.value = ['p1', 'p2'];
    // p1: in T1, but NOT in T2 (as p1)
    // p2: in T1 and T2
    expect(ptd2.value.datasets.find(d => d.label === 'Alice')?.points).toEqual([100, null]);
    expect(ptd2.value.datasets.find(d => d.label === 'Bob')?.points).toEqual([0, 100]);
  });

  it('handles cumulative mode with missing race data', () => {
    const mixedRaces = ref([
      { tournamentId: 't1', placements: { p1: 1, p2: 2 }, umaMapping: { p1: 'Special Week', p2: 'Silence Suzuka' } },
      { tournamentId: 't2', placements: { p2: 1, p3: 2 }, umaMapping: { p2: 'Silence Suzuka', p3: 'Special Week' } }
    ] as any);
    
    const { playerTimelineData, diagramSelectedPlayerIds, diagramMode } = useDiagrams(
      players, filteredTournaments, mixedRaces, playerRankings, activeTab, ref('total' as any)
    );
    
    diagramSelectedPlayerIds.value = ['p1', 'p2'];
    diagramMode.value = 'cumulative';
    
    expect(playerTimelineData.value.datasets.find(d => d.label === 'Alice')?.points).toEqual([100, null]);
  });
});
