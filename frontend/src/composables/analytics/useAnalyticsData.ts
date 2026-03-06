import { ref, computed } from 'vue';
import { collection, query, getDocs, orderBy, where, doc, setDoc, increment } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import type { GlobalPlayer, Tournament, Season } from '../../types';
import { migrateRaces, migratePlayers } from "../../utils/utils.ts";
import { getCached, setCache } from "../../utils/cache.ts";
import { deriveFromTournaments, type TierCriterion } from '../../utils/analyticsUtils';
import { TRACK_DICT } from '../../utils/trackData';

const APP_ID = 'default-app';
const CACHE_KEY = 'analytics';

const findTrackById = (trackId: string) =>
  Object.values(TRACK_DICT).find(t => t.id === trackId);

export function useAnalyticsData() {
  const loading = ref(true);

  // Raw Data
  const players = ref<GlobalPlayer[]>([]);
  const tournaments = ref<Tournament[]>([]);
  const seasons = ref<Season[]>([]);

  // Filters
  const minTournaments = ref(3);
  const tierCriterion = ref<TierCriterion>('dominance');
  const selectedSeasons = ref<string[]>(['season-2']);
  const selectedFormats = ref<string[]>([]);
  const selectedSurfaces = ref<string[]>([]);
  const selectedDistanceTypes = ref<string[]>([]);
  const selectedLocations = ref<string[]>([]);

  const allTrackLocations = computed(() =>
    [...new Set(Object.values(TRACK_DICT).map(t => t.location))].sort()
  );

  let fetchCount = 0;
  let readOps = 0;

  async function fetchOrCache<T extends any[]>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const cached = getCached<T>(`${CACHE_KEY}:${key}`);
    if (cached) return cached;

    fetchCount++;
    const data = await fetcher();
    readOps += Math.max(data.length, 1);
    setCache(`${CACHE_KEY}:${key}`, data);
    return data;
  }

  async function trackUsage(fetches: number, reads: number) {
    try {
      const uid = auth.currentUser?.uid || 'anonymous';
      const usageRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'usage', uid);
      await setDoc(usageRef, {
        requestCount: increment(fetches),
        readOps: increment(reads),
        lastAccess: new Date().toISOString(),
      }, { merge: true });
    } catch {
      // Best-effort tracking
    }
  }

  async function loadData() {
    loading.value = true;
    fetchCount = 0;
    readOps = 0;

    try {
      const col = (name: string) => collection(db, 'artifacts', APP_ID, 'public', 'data', name);

      const [s, p, t] = await Promise.all([
        fetchOrCache('seasons', async () => {
          const snap = await getDocs(query(col('seasons'), orderBy('startDate', 'desc')));
          return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Season));
        }),
        fetchOrCache('players', async () => {
          const snap = await getDocs(col('players'));
          return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as GlobalPlayer));
        }),
        fetchOrCache('tournaments', async () => {
          const snap = await getDocs(query(col('tournaments'), where('status', '==', 'completed')));
          return snap.docs.map(doc => {
            const data = { id: doc.id, ...doc.data() } as Tournament;
            data.races = migrateRaces(data.races);
            data.players = migratePlayers(data.players);
            if (!data.format) data.format = 'uma-ban';
            return data;
          });
        }),
      ]);

      seasons.value = s;
      players.value = p;
      tournaments.value = t;

      if (fetchCount > 0) trackUsage(fetchCount, readOps);
    } catch (e) {
      console.error('Failed to fetch analytics data:', e);
    } finally {
      loading.value = false;
    }
  }

  const forceRefreshAnalytics = async () => {
    localStorage.removeItem(`cache:${CACHE_KEY}:seasons`);
    localStorage.removeItem(`cache:${CACHE_KEY}:players`);
    localStorage.removeItem(`cache:${CACHE_KEY}:tournaments`);
    await loadData();
  };

  // --- FILTERING PIPELINE ---
  const filteredTournaments = computed(() => {
    return tournaments.value.filter(t => {
      const matchesSeason = selectedSeasons.value.length === 0 || (t.seasonId && selectedSeasons.value.includes(t.seasonId));
      const matchesFormat = selectedFormats.value.length === 0 || (t.format && selectedFormats.value.includes(t.format));
      const track = t.selectedTrack ? findTrackById(t.selectedTrack) : null;
      const matchesSurface = selectedSurfaces.value.length === 0 || (track && selectedSurfaces.value.includes(track.surface));
      const matchesDistanceType = selectedDistanceTypes.value.length === 0 || (track && selectedDistanceTypes.value.includes(track.distanceType));
      const matchesLocation = selectedLocations.value.length === 0 || (track && selectedLocations.value.includes(track.location));
      return matchesSeason && matchesFormat && matchesSurface && matchesDistanceType && matchesLocation;
    });
  });

  const validTournamentIds = computed(() => new Set(filteredTournaments.value.map(t => t.id)));

  const derived = computed(() => deriveFromTournaments(tournaments.value));

  const filteredParticipations = computed(() =>
    derived.value.derivedParticipations.filter(p => validTournamentIds.value.has(p.tournamentId))
  );

  const filteredRaces = computed(() =>
    derived.value.derivedRaces.filter(r => r.tournamentId && validTournamentIds.value.has(r.tournamentId))
  );

  const overviewStats = computed(() => {
    const uniquePlayerIds = new Set(filteredParticipations.value.map(p => p.playerId));
    const tCount = filteredTournaments.value.length;
    const pCount = filteredParticipations.value.length;
    const rCount = filteredRaces.value.length;
    
    return {
      totalPlayers: uniquePlayerIds.size,
      totalTournaments: tCount,
      totalRaces: rCount,
      totalParticipations: pCount,
      avgPlayersPerTournament: tCount > 0 ? Math.round((pCount / tCount) * 10) / 10 : 0,
      avgRacesPerTournament: tCount > 0 ? Math.round((rCount / tCount) * 10) / 10 : 0
    };
  });

  // Toggles
  const toggleSeason = (seasonId: string) => {
    const index = selectedSeasons.value.indexOf(seasonId);
    if (index === -1) selectedSeasons.value.push(seasonId);
    else selectedSeasons.value.splice(index, 1);
  };
  const toggleFormat = (formatId: string) => {
    const index = selectedFormats.value.indexOf(formatId);
    if (index === -1) selectedFormats.value.push(formatId);
    else selectedFormats.value.splice(index, 1);
  };
  const toggleSurface = (v: string) => {
    const index = selectedSurfaces.value.indexOf(v);
    if (index === -1) selectedSurfaces.value.push(v);
    else selectedSurfaces.value.splice(index, 1);
  };
  const toggleDistanceType = (v: string) => {
    const index = selectedDistanceTypes.value.indexOf(v);
    if (index === -1) selectedDistanceTypes.value.push(v);
    else selectedDistanceTypes.value.splice(index, 1);
  };
  const toggleLocation = (v: string) => {
    const index = selectedLocations.value.indexOf(v);
    if (index === -1) selectedLocations.value.push(v);
    else selectedLocations.value.splice(index, 1);
  };

  return {
    loading,
    players,
    tournaments,
    seasons,
    minTournaments,
    tierCriterion,
    
    selectedSeasons,
    selectedFormats,
    selectedSurfaces,
    selectedDistanceTypes,
    selectedLocations,
    allTrackLocations,
    
    filteredTournaments,
    filteredParticipations,
    filteredRaces,
    overviewStats,
    
    loadData,
    forceRefreshAnalytics,
    toggleSeason,
    toggleFormat,
    toggleSurface,
    toggleDistanceType,
    toggleLocation
  };
}