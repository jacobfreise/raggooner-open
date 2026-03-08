import { ref, computed, watch, type Ref } from 'vue';
import type { GlobalPlayer, Tournament } from '../../types';
import { POINTS_SYSTEM } from "../../utils/constants.ts";
import type { DerivedRace } from '../../utils/analyticsUtils';

export interface ChartDataset {
  label: string;
  color: string;
  points: (number | null)[];
  meta?: (string | null)[];
}

const CHART_COLORS: readonly string[] = [
  '#818cf8', '#34d399', '#f472b6', '#fb923c',
  '#60a5fa', '#a78bfa', '#facc15', '#2dd4bf',
];
const MAX_DIAGRAM_PLAYERS = 8;
const MAX_DIAGRAM_UMAS = 8;

export function useDiagrams(
  players: Ref<GlobalPlayer[]>,
  filteredTournaments: Ref<Tournament[]>,
  filteredRaces: Ref<DerivedRace[]>,
  playerRankings: Ref<any[]>,
  activeTab: Ref<string>
) {
  const diagramSelectedPlayerIds = ref<string[]>([]);
  const diagramSelectedUmaNames = ref<string[]>([]);
  const diagramMode = ref<'per-tournament' | 'cumulative'>('per-tournament');
  const diagramMetric = ref<'dominance' | 'avg-points'>('dominance');
  const diagramSubject = ref<'players' | 'umas'>('players');

  const toggleDiagramPlayer = (playerId: string) => {
    const idx = diagramSelectedPlayerIds.value.indexOf(playerId);
    if (idx !== -1) {
      diagramSelectedPlayerIds.value.splice(idx, 1);
    } else if (diagramSelectedPlayerIds.value.length < MAX_DIAGRAM_PLAYERS) {
      diagramSelectedPlayerIds.value.push(playerId);
    }
  };

  const toggleDiagramUma = (umaName: string) => {
    const idx = diagramSelectedUmaNames.value.indexOf(umaName);
    if (idx !== -1) {
      diagramSelectedUmaNames.value.splice(idx, 1);
    } else if (diagramSelectedUmaNames.value.length < MAX_DIAGRAM_UMAS) {
      diagramSelectedUmaNames.value.push(umaName);
    }
  };

  // Auto-select top 5 players when diagrams tab is first opened
  watch(activeTab, (tab) => {
    if (tab === 'diagrams' && diagramSelectedPlayerIds.value.length === 0) {
      diagramSelectedPlayerIds.value = playerRankings.value
        .slice(0, 5)
        .map(p => p.player.id);
    }
  });

  const diagramSortedTournaments = computed(() =>
    [...filteredTournaments.value].sort((a, b) =>
      new Date(a.playedAt ?? a.createdAt).getTime() - new Date(b.playedAt ?? b.createdAt).getTime()
    )
  );

  const tournamentPointSystemMap = computed(() => {
    const map = new Map<string, Record<number, number>>();
    filteredTournaments.value.forEach(t => {
      map.set(t.id, t.pointsSystem ?? POINTS_SYSTEM);
    });
    return map;
  });

  const diagramColorMap = computed(() => {
    const map = new Map<string, string>();
    diagramSelectedPlayerIds.value.forEach((id, i) => {
      map.set(id, CHART_COLORS[i % CHART_COLORS.length]!);
    });
    return map;
  });

  const diagramUmaColorMap = computed(() => {
    const map = new Map<string, string>();
    diagramSelectedUmaNames.value.forEach((name, i) => {
      map.set(name, CHART_COLORS[i % CHART_COLORS.length]!);
    });
    return map;
  });

  const playerTimelineData = computed((): { xLabels: string[]; datasets: ChartDataset[] } => {
    const selectedIds = diagramSelectedPlayerIds.value;
    const metric = diagramMetric.value;

    const sortedT = diagramSortedTournaments.value.filter(t =>
      selectedIds.some(playerId =>
        filteredRaces.value.some(r =>
          r.tournamentId === t.id && r.placements[playerId] !== undefined
        )
      )
    );
    const xLabels = sortedT.map(t => t.name);

    const datasets: ChartDataset[] = selectedIds.map(playerId => {
      const player = players.value.find(p => p.id === playerId);
      let cumFaced = 0, cumBeaten = 0;
      let cumPoints = 0, cumRaces = 0;

      const meta: (string | null)[] = [];
      const points: (number | null)[] = sortedT.map(t => {
        const psys = tournamentPointSystemMap.value.get(t.id) ?? POINTS_SYSTEM;
        const tRaces = filteredRaces.value.filter(r => r.tournamentId === t.id);
        const uma = tRaces.find(r => r.umaMapping[playerId])?.umaMapping[playerId] ?? null;
        meta.push(uma);

        if (metric === 'avg-points') {
          let totalPts = 0, raceCount = 0;
          tRaces.forEach(race => {
            const pos = race.placements[playerId];
            if (pos === undefined) return;
            totalPts += psys[pos] ?? 0;
            raceCount++;
          });
          if (diagramMode.value === 'cumulative') {
            if (raceCount === 0) return null;
            cumPoints += totalPts;
            cumRaces += raceCount;
            return Math.round((cumPoints / cumRaces) * 10) / 10;
          }
          return raceCount > 0 ? Math.round((totalPts / raceCount) * 10) / 10 : null;
        } else {
          let faced = 0, beaten = 0;
          tRaces.forEach(race => {
            const pos = race.placements[playerId];
            if (pos === undefined) return;
            const numPlayers = Object.keys(race.placements).length;
            if (numPlayers <= 1) return;
            faced += numPlayers - 1;
            beaten += numPlayers - pos;
          });
          if (diagramMode.value === 'cumulative') {
            if (faced === 0) return null;
            cumFaced += faced;
            cumBeaten += beaten;
            return Math.round((cumBeaten / cumFaced) * 1000) / 10;
          }
          return faced > 0 ? Math.round((beaten / faced) * 1000) / 10 : null;
        }
      });

      return {
        label: player?.name || playerId,
        color: diagramColorMap.value.get(playerId) ?? CHART_COLORS[0]!,
        points,
        meta,
      };
    });

    return { xLabels, datasets };
  });

  const diagramAvailableUmas = computed(() => {
    const umaSet = new Set<string>();
    filteredRaces.value.forEach(r => {
      Object.values(r.umaMapping).forEach(uma => uma && umaSet.add(uma));
    });
    return [...umaSet].sort();
  });

  const umaTimelineData = computed((): { xLabels: string[]; datasets: ChartDataset[] } => {
    const selectedNames = diagramSelectedUmaNames.value;
    const metric = diagramMetric.value;

    const sortedT = diagramSortedTournaments.value.filter(t =>
      selectedNames.some(umaName =>
        filteredRaces.value.some(r =>
          r.tournamentId === t.id && Object.values(r.umaMapping).includes(umaName)
        )
      )
    );
    const xLabels = sortedT.map(t => t.name);

    const datasets: ChartDataset[] = selectedNames.map(umaName => {
      let cumFaced = 0, cumBeaten = 0;
      let cumPoints = 0, cumRaces = 0;

      const points: (number | null)[] = sortedT.map(t => {
        const psys = tournamentPointSystemMap.value.get(t.id) ?? POINTS_SYSTEM;
        const tRaces = filteredRaces.value.filter(r => r.tournamentId === t.id);

        if (metric === 'avg-points') {
          let totalPts = 0, raceCount = 0;
          tRaces.forEach(race => {
            const playerId = Object.entries(race.umaMapping).find(([, uma]) => uma === umaName)?.[0];
            if (!playerId) return;
            const pos = race.placements[playerId];
            if (pos === undefined) return;
            totalPts += psys[pos] ?? 0;
            raceCount++;
          });
          if (diagramMode.value === 'cumulative') {
            if (raceCount === 0) return null;
            cumPoints += totalPts;
            cumRaces += raceCount;
            return Math.round((cumPoints / cumRaces) * 10) / 10;
          }
          return raceCount > 0 ? Math.round((totalPts / raceCount) * 10) / 10 : null;
        } else {
          let faced = 0, beaten = 0;
          tRaces.forEach(race => {
            const playerId = Object.entries(race.umaMapping).find(([, uma]) => uma === umaName)?.[0];
            if (!playerId) return;
            const pos = race.placements[playerId];
            if (pos === undefined) return;
            const numPlayers = Object.keys(race.placements).length;
            if (numPlayers <= 1) return;
            faced += numPlayers - 1;
            beaten += numPlayers - pos;
          });
          if (diagramMode.value === 'cumulative') {
            if (faced === 0) return null;
            cumFaced += faced;
            cumBeaten += beaten;
            return Math.round((cumBeaten / cumFaced) * 1000) / 10;
          }
          return faced > 0 ? Math.round((beaten / faced) * 1000) / 10 : null;
        }
      });

      return {
        label: umaName,
        color: diagramUmaColorMap.value.get(umaName) ?? CHART_COLORS[0]!,
        points,
      };
    });

    return { xLabels, datasets };
  });

  return {
    MAX_DIAGRAM_PLAYERS,
    MAX_DIAGRAM_UMAS,
    diagramSelectedPlayerIds,
    diagramSelectedUmaNames,
    diagramMode,
    diagramMetric,
    diagramSubject,
    diagramColorMap,
    diagramUmaColorMap,
    playerTimelineData,
    diagramAvailableUmas,
    umaTimelineData,
    
    toggleDiagramPlayer,
    toggleDiagramUma
  };
}