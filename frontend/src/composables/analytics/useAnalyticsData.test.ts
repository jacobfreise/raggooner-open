import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Firebase
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  getDocs: vi.fn(),
  orderBy: vi.fn(),
  where: vi.fn(),
  doc: vi.fn(),
  setDoc: vi.fn(),
  increment: vi.fn(),
}));

vi.mock('../../firebase', () => ({
  db: {},
  auth: {
    currentUser: { uid: 'test-user' },
  },
}));

vi.mock('../../utils/cache', () => ({
  getCached: vi.fn(),
  setCache: vi.fn(),
}));

import { useAnalyticsData } from './useAnalyticsData';
import { getDocs } from 'firebase/firestore';
import { getCached } from '../../utils/cache';

describe('useAnalyticsData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('initializes with default values', () => {
    const { loading, minTournaments, selectedSeasons } = useAnalyticsData();
    expect(loading.value).toBe(true);
    expect(minTournaments.value).toBe(3);
    expect(selectedSeasons.value).toEqual(['season-3']);
  });

  it('loads data and updates state', async () => {
    const mockSeasons = [{ id: 's1', name: 'Season 1' }];
    const mockPlayers = [{ id: 'p1', name: 'Player 1' }];
    const mockTournaments = [
      { id: 't1', status: 'completed', seasonId: 's1', races: {}, players: {}, teams: [] }
    ];

    (getDocs as any)
      .mockResolvedValueOnce({ docs: mockSeasons.map(s => ({ id: s.id, data: () => s })) })
      .mockResolvedValueOnce({ docs: mockPlayers.map(p => ({ id: p.id, data: () => p })) })
      .mockResolvedValueOnce({ docs: mockTournaments.map(t => ({ id: t.id, data: () => t })) });

    const { loadData, seasons, players, tournaments, loading } = useAnalyticsData();
    
    await loadData();

    expect(seasons.value).toHaveLength(1);
    expect(players.value).toHaveLength(1);
    expect(tournaments.value).toHaveLength(1);
    expect(loading.value).toBe(false);
  });

  it('uses cached data if available', async () => {
    const mockCachedSeasons = [{ id: 'cached-s1', name: 'Cached Season' }];
    (getCached as any).mockImplementation((key: string) => {
      if (key.includes('seasons')) return mockCachedSeasons;
      return null;
    });

    (getDocs as any)
      .mockResolvedValueOnce({ docs: [] }) // players
      .mockResolvedValueOnce({ docs: [] }); // tournaments

    const { loadData, seasons } = useAnalyticsData();
    await loadData();

    expect(seasons.value).toEqual(mockCachedSeasons);
    expect(getDocs).toHaveBeenCalledTimes(2); // seasons should be skipped
  });

  it('filters tournaments correctly', () => {
    const { tournaments, selectedSeasons, filteredTournaments } = useAnalyticsData();
    
    tournaments.value = [
      { id: 't1', seasonId: 'season-1', status: 'completed', races: {}, players: {}, teams: [] } as any,
      { id: 't2', seasonId: 'season-2', status: 'completed', races: {}, players: {}, teams: [] } as any,
    ];
    
    selectedSeasons.value = ['season-1'];
    expect(filteredTournaments.value).toHaveLength(1);
    expect(filteredTournaments.value[0].id).toBe('t1');

    selectedSeasons.value = [];
    expect(filteredTournaments.value).toHaveLength(2);
  });

  it('filters tournaments by surface and distance type', () => {
    const { tournaments, selectedSurfaces, selectedDistanceTypes, filteredTournaments, selectedSeasons } = useAnalyticsData();
    selectedSeasons.value = [];
    
    tournaments.value = [
      { id: 't1', selectedTrack: 'tokyo-1600-turf-left', teams: [] } as any, // Turf, Mile
      { id: 't2', selectedTrack: 'tokyo-2100-dirt-left', teams: [] } as any, // Dirt, Medium
      { id: 't3', selectedTrack: 'unknown-track', teams: [] } as any,
    ];
    
    selectedSurfaces.value = ['Turf'];
    expect(filteredTournaments.value).toHaveLength(1);
    expect(filteredTournaments.value[0].id).toBe('t1');

    selectedSurfaces.value = [];
    selectedDistanceTypes.value = ['Medium'];
    expect(filteredTournaments.value).toHaveLength(1);
    expect(filteredTournaments.value[0].id).toBe('t2');
  });

  it('filters tournaments by location', () => {
    const { tournaments, selectedLocations, filteredTournaments, selectedSeasons } = useAnalyticsData();
    selectedSeasons.value = [];
    
    tournaments.value = [
      { id: 't1', selectedTrack: 'tokyo-1600-turf-left', teams: [] } as any, // Tokyo
      { id: 't2', selectedTrack: 'nakayama-1200-turf-right', teams: [] } as any, // Nakayama
    ];
    
    selectedLocations.value = ['Tokyo'];
    expect(filteredTournaments.value).toHaveLength(1);
    expect(filteredTournaments.value[0].id).toBe('t1');
  });

  it('overviewStats correctly calculates stats', () => {
    const { tournaments, overviewStats, selectedSeasons } = useAnalyticsData();

    selectedSeasons.value = [];
    tournaments.value = [
      {
        id: 't1', teams: [], races: { r1: { stage: 'group', group: 'A', raceNumber: 1, placements: { p1: 2, p2: 1 } } },
        players: { p1: { id: 'p1' }, p2: { id: 'p2' } },
      } as any,
      {
        id: 't2', teams: [], races: { r1: { stage: 'group', group: 'A', raceNumber: 1, placements: { p1: 1 } } },
        players: { p1: { id: 'p1' } },
      } as any,
    ];

    expect(overviewStats.value.totalPlayers).toBe(2);
    expect(overviewStats.value.totalTournaments).toBe(2);
    expect(overviewStats.value.totalParticipations).toBe(3);
    expect(overviewStats.value.avgPlayersPerTournament).toBe(1.5);
  });

  it('toggles filters correctly', () => {
    const { selectedSeasons, toggleSeason, selectedFormats, toggleFormat } = useAnalyticsData();
    
    selectedSeasons.value = ['s1'];
    toggleSeason('s2');
    expect(selectedSeasons.value).toEqual(['s1', 's2']);
    toggleSeason('s1');
    expect(selectedSeasons.value).toEqual(['s2']);

    selectedFormats.value = ['f1'];
    toggleFormat('f2');
    expect(selectedFormats.value).toEqual(['f1', 'f2']);
    toggleFormat('f1');
    expect(selectedFormats.value).toEqual(['f2']);
  });

  it('forceRefreshAnalytics clears cache and reloads', async () => {
    const { forceRefreshAnalytics, loading } = useAnalyticsData();
    
    // Mock successful fetch
    (getDocs as any).mockResolvedValue({ docs: [] });

    await forceRefreshAnalytics();
    
    expect(loading.value).toBe(false);
  });

  it('toggles surfaces and distance types', () => {
    const { selectedSurfaces, toggleSurface, selectedDistanceTypes, toggleDistanceType, selectedLocations, toggleLocation } = useAnalyticsData();
    
    toggleSurface('Turf');
    expect(selectedSurfaces.value).toContain('Turf');
    toggleSurface('Turf');
    expect(selectedSurfaces.value).not.toContain('Turf');

    toggleDistanceType('Mile');
    expect(selectedDistanceTypes.value).toContain('Mile');
    toggleDistanceType('Mile');
    expect(selectedDistanceTypes.value).not.toContain('Mile');

    toggleLocation('Tokyo');
    expect(selectedLocations.value).toContain('Tokyo');
    toggleLocation('Tokyo');
    expect(selectedLocations.value).not.toContain('Tokyo');
  });

  it('handles fetch failure correctly', async () => {
    (getDocs as any).mockRejectedValue(new Error('Fetch failed'));
    const { loadData, loading } = useAnalyticsData();
    
    await loadData();
    expect(loading.value).toBe(false);
  });

  it('provides all track locations', () => {
    const { allTrackLocations } = useAnalyticsData();
    expect(allTrackLocations.value).toContain('Tokyo');
    expect(allTrackLocations.value).toContain('Nakayama');
  });
});
