<script setup lang="ts">
import { ref, computed, onMounted, inject, type Ref } from 'vue';
import LineChart from './analytics/LineChart.vue';
import { getUmaImagePath } from "../utils/umaData.ts";
import { TOURNAMENT_FORMATS } from "../utils/constants.ts";

import { useAnalyticsData } from '../composables/analytics/useAnalyticsData';
import { usePlayerRankings } from '../composables/analytics/usePlayerRankings';
import { useUmaStats } from '../composables/analytics/useUmaStats';
import { useDiagrams } from '../composables/analytics/useDiagrams';
import { TIER_CRITERIA, TOP5_CRITERIA, getWinningTeam } from '../utils/analyticsUtils';

// Inject Changelog functions from App.vue
const openChangelog = inject<() => void>('openChangelog')!;
const hasNewUpdates = inject<Ref<boolean>>('hasNewUpdates')!;

const activeTab = ref<'overview' | 'players' | 'umas' | 'tierlist' | 'tournaments' | 'diagrams'>('overview');
const playerSearchQuery = ref('');
const umaSearchQuery = ref('');

// 1. Data Layer
const {
  loading, players, seasons, minTournaments, tierCriterion,
  selectedSeasons, selectedFormats, selectedSurfaces, selectedDistanceTypes, selectedLocations, allTrackLocations,
  filteredTournaments, filteredParticipations, filteredRaces, overviewStats,
  loadData, forceRefreshAnalytics, toggleSeason, toggleFormat, toggleSurface, toggleDistanceType, toggleLocation
} = useAnalyticsData();

// 2. Player Rankings Layer
const {
  playerRankings, expandedPlayerTournaments, expandedPlayerUmas, topPlayers, playerTierList,
  playerSortKey, playerSortDesc, expandedPlayerId, expandedDetailTab,
  playerUmaSortKey, playerUmaSortDesc, playerTournamentSortKey, playerTournamentSortDesc,
  topPlayerCriterion,
  togglePlayerSort, togglePlayerExpand, togglePlayerUmaSort, togglePlayerTournamentSort, getStatValue
} = usePlayerRankings(players, filteredTournaments, filteredParticipations, filteredRaces, minTournaments, tierCriterion);

// 3. Uma Stats Layer
const {
  umaStats, expandedUmaTournaments, expandedUmaPlayers, topUmas, umaTierList,
  umaSortKey, umaSortDesc, expandedUmaName, expandedUmaDetailTab,
  umaPlayerSortKey, umaPlayerSortDesc, umaTournamentSortKey, umaTournamentSortDesc,
  topUmaCriterion,
  toggleUmaSort, toggleUmaExpand, toggleUmaPlayerSort, toggleUmaTournamentSort
} = useUmaStats(players, filteredTournaments, filteredParticipations, filteredRaces, minTournaments, tierCriterion);

// 4. Diagrams Layer
const {
  MAX_DIAGRAM_PLAYERS, MAX_DIAGRAM_UMAS, diagramSelectedPlayerIds, diagramSelectedUmaNames,
  diagramMode, diagramMetric, diagramSubject, diagramColorMap, diagramUmaColorMap,
  playerTimelineData, diagramAvailableUmas, umaTimelineData,
  toggleDiagramPlayer, toggleDiagramUma
} = useDiagrams(players, filteredTournaments, filteredRaces, playerRankings, activeTab);

onMounted(loadData);

const tournamentSortKey = ref('date');
const tournamentSortDesc = ref(true);
const toggleTournamentSort = (key: string) => {
  if (tournamentSortKey.value === key) {
    tournamentSortDesc.value = !tournamentSortDesc.value;
  } else {
    tournamentSortKey.value = key;
    tournamentSortDesc.value = true;
  }
};

const sortedTournaments = computed(() => {
  const mod = tournamentSortDesc.value ? -1 : 1;
  return [...filteredTournaments.value].sort((a, b) => {
    let valA: string | number, valB: string | number;
    switch (tournamentSortKey.value) {
      case 'name':
        valA = a.name.toLowerCase(); valB = b.name.toLowerCase(); break;
      case 'winners':
        valA = (tournamentWinnerNames.value.get(a.id)?.[0] ?? '').toLowerCase();
        valB = (tournamentWinnerNames.value.get(b.id)?.[0] ?? '').toLowerCase(); break;
      case 'players':
        valA = Object.keys(a.players).length; valB = Object.keys(b.players).length; break;
      default: // 'date'
        valA = new Date(a.createdAt).getTime(); valB = new Date(b.createdAt).getTime();
    }
    if (valA < valB) return -1 * mod;
    if (valA > valB) return 1 * mod;
    return 0;
  });
});

const tournamentWinnerNames = computed(() => {
  const map = new Map<string, string[]>();
  filteredTournaments.value.filter(t => t.status === 'completed').forEach(t => {
    const winningTeam = getWinningTeam(t);
    if (!winningTeam) return;
    const names: string[] = [];
    const captain = t.players[winningTeam.captainId];
    if (captain) names.push(captain.name);
    winningTeam.memberIds.forEach(id => {
      const player = t.players[id];
      if (player) names.push(player.name);
    });
    map.set(t.id, names);
  });
  return map;
});

const ordinal = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? 'th'}`;
};

const getRankColor = (index: number) => {
  if (index === 0) return 'text-yellow-400';
  if (index === 1) return 'text-slate-300';
  if (index === 2) return 'text-amber-600';
  return 'text-slate-400';
};

const getRankIcon = (index: number) => {
  if (index === 0) return 'ph-fill ph-crown';
  if (index === 1) return 'ph-fill ph-medal';
  if (index === 2) return 'ph-fill ph-medal';
  return 'ph-fill ph-user-circle';
};
</script>
<template>
  <div class="w-full flex flex-col min-h-full">

    <header class="border-b border-slate-700 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
      <div class="max-w-[1800px] w-full mx-auto px-4 md:px-8 h-16 flex items-center justify-between relative">

        <router-link to="/" class="flex items-center gap-2 text-indigo-500 hover:text-indigo-400 transition-colors z-10">
          <i class="ph-fill ph-flag-checkered text-3xl"></i>
          <span class="text-2xl font-bold text-white heading tracking-widest hidden sm:block">Raccoon Open</span>
          <span class="text-2xl font-bold text-white heading tracking-widest sm:hidden">RO</span>
        </router-link>

        <div class="flex items-center gap-4 z-10">
          <button @click="openChangelog" class="relative text-slate-400 hover:text-white transition-colors">
            <i class="ph-bold ph-bell text-xl"></i>
            <span v-if="hasNewUpdates" class="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-slate-900 animate-pulse"></span>
          </button>
        </div>

      </div>
    </header>

    <main class="flex-grow max-w-[1800px] mx-auto px-4 md:px-8 xl:px-12 py-6 w-full space-y-6">

      <div class="w-full mt-4 mb-12 animate-fade-in">

        <div class="w-full border-b border-slate-800 pb-12 mb-12">

          <div class="max-w-3xl mx-auto grid grid-cols-2 md:grid-cols-2 gap-4">

            <router-link to="/" class="group bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-center gap-3 hover:border-indigo-500 hover:bg-slate-750 transition-colors cursor-pointer">
              <i class="ph-fill ph-flag-checkered text-2xl text-indigo-400 group-hover:text-indigo-300"></i>
              <div>
                <div class="text-sm font-bold text-white uppercase tracking-widest group-hover:text-indigo-100">Play</div>
                <div class="text-[10px] text-slate-400">Tournaments</div>
              </div>
            </router-link>

            <router-link to="/analytics" class="group bg-indigo-600 border border-indigo-500 rounded-xl p-4 flex items-center gap-3 hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-500/20 cursor-default pointer-events-none">
              <i class="ph-fill ph-chart-line-up text-2xl text-white"></i>
              <div>
                <div class="text-sm font-bold text-white uppercase tracking-widest">Analytics</div>
                <div class="text-[10px] text-indigo-200">Global Stats</div>
              </div>
            </router-link>

          </div>
        </div>
      </div>


      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-black text-white uppercase tracking-wider">Analytics Dashboard</h1>
          <p class="text-slate-400 mt-1">Cross-tournament statistics and insights</p>
        </div>

        <div class="flex items-center gap-3">
          <div v-if="loading" class="flex items-center gap-2 text-slate-400">
            <i class="ph ph-circle-notch animate-spin"></i>
            Loading data...
          </div>
          <button
              v-else
              @click="forceRefreshAnalytics"
              class="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
              title="Refresh analytics data"
          >
            <i class="ph ph-arrows-clockwise"></i>
            Refresh
          </button>
        </div>
      </div>

      <div class="flex gap-2 border-b border-slate-700 mb-6">
      </div>

      <div class="bg-slate-800 border border-slate-700 rounded-xl p-5 mb-6 flex flex-col lg:flex-row flex-wrap gap-8 lg:items-center">
        <div class="flex items-center gap-6 flex-1 max-w-xl">
          <div class="flex flex-col min-w-[120px]">
            <label class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
              Min. Tourneys
            </label>
            <div class="text-2xl font-black text-white">
              {{ minTournaments }} <span class="text-xs text-slate-500 font-medium">played</span>
            </div>
          </div>

          <div class="flex-1">
            <input
                v-model.number="minTournaments"
                type="range"
                min="1"
                :max="20"
                class="w-full h-2 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all"
            />
            <div class="flex justify-between text-[10px] text-slate-500 font-bold mt-2 px-1">
              <span>1</span>
              <span>{{ 20 }}</span>
            </div>
          </div>
        </div>

        <div class="hidden lg:block w-px h-16 bg-slate-700"></div>
        <div class="lg:hidden w-full h-px bg-slate-700"></div>

        <div class="flex flex-col flex-1">
          <label class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
            Filter by Season
          </label>
          <div class="flex flex-wrap gap-2">

            <button
                @click="selectedSeasons = []"
                class="px-3 py-1.5 text-xs font-bold rounded-full transition-colors border"
                :class="selectedSeasons.length === 0
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'">
              All Time
            </button>

            <button
                v-for="season in seasons"
                :key="season.id"
                @click="toggleSeason(season.id)"
                class="px-3 py-1.5 text-xs font-bold rounded-full transition-colors border"
                :class="selectedSeasons.includes(season.id)
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'">
              {{ season.name }}
            </button>

          </div>
        </div>

        <div class="hidden lg:block w-px h-16 bg-slate-700"></div>
        <div class="lg:hidden w-full h-px bg-slate-700"></div>

        <div class="flex flex-col flex-1 min-w-[200px]">
          <label class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
            Filter by Format
          </label>
          <div class="flex flex-wrap gap-2">

            <button
                @click="selectedFormats = []"
                class="px-3 py-1.5 text-xs font-bold rounded-full transition-colors border"
                :class="selectedFormats.length === 0
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'">
              All Formats
            </button>

            <button
                v-for="(format, id) in TOURNAMENT_FORMATS"
                :key="id"
                @click="toggleFormat(id as string)"
                class="px-3 py-1.5 text-xs font-bold rounded-full transition-colors border"
                :class="selectedFormats.includes(id as string)
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'">
              {{ format.name }}
            </button>

          </div>
        </div>

        <div class="hidden lg:block w-px h-16 bg-slate-700"></div>
        <div class="lg:hidden w-full h-px bg-slate-700"></div>

        <div class="flex flex-col flex-1 min-w-[200px]">
          <label class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
            Surface
          </label>
          <div class="flex flex-wrap gap-2">
            <button
                @click="selectedSurfaces = []"
                class="px-3 py-1.5 text-xs font-bold rounded-full transition-colors border"
                :class="selectedSurfaces.length === 0
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'">
              All
            </button>
            <button
                v-for="s in ['Turf', 'Dirt']"
                :key="s"
                @click="toggleSurface(s)"
                class="px-3 py-1.5 text-xs font-bold rounded-full transition-colors border"
                :class="selectedSurfaces.includes(s)
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'">
              {{ s }}
            </button>
          </div>
        </div>

        <div class="hidden lg:block w-px h-16 bg-slate-700"></div>
        <div class="lg:hidden w-full h-px bg-slate-700"></div>

        <div class="flex flex-col flex-1 min-w-[200px]">
          <label class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
            Distance
          </label>
          <div class="flex flex-wrap gap-2">
            <button
                @click="selectedDistanceTypes = []"
                class="px-3 py-1.5 text-xs font-bold rounded-full transition-colors border"
                :class="selectedDistanceTypes.length === 0
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'">
              All
            </button>
            <button
                v-for="d in ['Sprint', 'Mile', 'Medium', 'Long']"
                :key="d"
                @click="toggleDistanceType(d)"
                class="px-3 py-1.5 text-xs font-bold rounded-full transition-colors border"
                :class="selectedDistanceTypes.includes(d)
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'">
              {{ d }}
            </button>
          </div>
        </div>

        <div class="hidden lg:block w-px h-16 bg-slate-700"></div>
        <div class="lg:hidden w-full h-px bg-slate-700"></div>

        <div class="flex flex-col flex-1 min-w-[200px]">
          <label class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
            Location
          </label>
          <div class="flex flex-wrap gap-2">
            <button
                @click="selectedLocations = []"
                class="px-3 py-1.5 text-xs font-bold rounded-full transition-colors border"
                :class="selectedLocations.length === 0
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'">
              All
            </button>
            <button
                v-for="loc in allTrackLocations"
                :key="loc"
                @click="toggleLocation(loc)"
                class="px-3 py-1.5 text-xs font-bold rounded-full transition-colors border"
                :class="selectedLocations.includes(loc)
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'">
              {{ loc }}
            </button>
          </div>
        </div>
      </div>

      <div class="flex justify-center gap-2 border-b border-slate-700 overflow-x-auto hide-scrollbar">
        <button
            v-for="tab in [
            { id: 'overview', label: 'Overview', icon: 'ph-chart-line' },
            { id: 'tierlist', label: 'Tier List', icon: 'ph-ranking' },
            { id: 'players', label: 'Players', icon: 'ph-users' },
            { id: 'umas', label: 'Umas', icon: 'ph-horse' },
            { id: 'tournaments', label: 'Tournaments', icon: 'ph-trophy' },
            { id: 'diagrams', label: 'Diagrams', icon: 'ph-trend-up' }
          ]"
            :key="tab.id"
            @click="activeTab = tab.id as any"
            class="px-4 py-3 font-bold transition-all relative whitespace-nowrap shrink-0"
            :class="activeTab === tab.id
            ? 'text-indigo-400 border-b-2 border-indigo-400'
            : 'text-slate-400 hover:text-white'"
        >
          <i :class="tab.icon" class="mr-2"></i>
          {{ tab.label }}
        </button>
      </div>

      <div v-if="activeTab === 'overview'" class="space-y-6">

        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div class="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <div class="text-3xl font-black text-white">{{ overviewStats.totalPlayers }}</div>
            <div class="text-xs text-slate-400 uppercase tracking-wider mt-1">Players</div>
          </div>

          <div class="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <div class="text-3xl font-black text-indigo-400">{{ overviewStats.totalTournaments }}</div>
            <div class="text-xs text-slate-400 uppercase tracking-wider mt-1">Tournaments</div>
          </div>

          <div class="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <div class="text-3xl font-black text-emerald-400">{{ overviewStats.totalRaces }}</div>
            <div class="text-xs text-slate-400 uppercase tracking-wider mt-1">Races</div>
          </div>

          <div class="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <div class="text-3xl font-black text-amber-400">{{ overviewStats.totalParticipations }}</div>
            <div class="text-xs text-slate-400 uppercase tracking-wider mt-1">Participations</div>
          </div>

          <div class="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <div class="text-3xl font-black text-purple-400">{{ overviewStats.avgPlayersPerTournament }}</div>
            <div class="text-xs text-slate-400 uppercase tracking-wider mt-1">Avg Players</div>
          </div>

          <div class="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <div class="text-3xl font-black text-cyan-400">{{ overviewStats.avgRacesPerTournament }}</div>
            <div class="text-xs text-slate-400 uppercase tracking-wider mt-1">Avg Races</div>
          </div>
        </div>

        <div class="grid lg:grid-cols-2 gap-6">

          <div class="bg-slate-800 border border-slate-700 rounded-xl p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-xl font-bold text-white flex items-center gap-2">
                <i class="ph-fill ph-trophy text-amber-400"></i>
                Top 5 Players
              </h3>
              <select
                  v-model="topPlayerCriterion"
                  class="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-slate-300 focus:outline-none focus:border-indigo-500"
              >
                <option v-for="(cfg, key) in TOP5_CRITERIA" :key="key" :value="key">{{ cfg.label }}</option>
              </select>
            </div>

            <div class="space-y-3">
              <div
                  v-for="(player, idx) in topPlayers"
                  :key="player.player.id"
                  class="flex items-center gap-3 p-3 bg-slate-900 rounded-lg border border-slate-700"
              >
                <div class="text-2xl" :class="getRankColor(idx)">
                  <i :class="getRankIcon(idx)"></i>
                </div>

                <div class="flex-1 min-w-0">
                  <div class="font-bold text-white truncate">{{ player.player.name }}</div>
                  <div class="text-xs text-slate-400">
                    {{ player.tournaments }} tournaments • {{ player.races }} races
                  </div>
                </div>

                <div class="text-right">
                  <div class="text-lg font-bold text-white">{{ (player as any)[TOP5_CRITERIA[topPlayerCriterion].playerKey] }}{{ TOP5_CRITERIA[topPlayerCriterion].suffix }}</div>
                  <div class="text-xs text-slate-400">{{ TOP5_CRITERIA[topPlayerCriterion].label.toLowerCase() }}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="bg-slate-800 border border-slate-700 rounded-xl p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-xl font-bold text-white flex items-center gap-2">
                <i class="ph-fill ph-horse text-indigo-400"></i>
                Top 5 Umas
              </h3>
              <select
                  v-model="topUmaCriterion"
                  class="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-slate-300 focus:outline-none focus:border-indigo-500"
              >
                <option v-for="(cfg, key) in TOP5_CRITERIA" :key="key" :value="key">{{ cfg.label }}</option>
              </select>
            </div>

            <div class="space-y-3">
              <div
                  v-for="(uma, idx) in topUmas"
                  :key="uma.name"
                  class="flex items-center gap-3 p-3 bg-slate-900 rounded-lg border border-slate-700"
              >
                <div class="text-2xl" :class="getRankColor(idx)">
                  {{ idx + 1 }}
                </div>

                <img :src="getUmaImagePath(uma.name)" :alt="uma.name" class="w-10 h-10 rounded-full object-cover shrink-0 bg-slate-700" />

                <div class="flex-1 min-w-0">
                  <div class="font-bold text-white truncate">{{ uma.name }}</div>
                  <div class="text-xs text-slate-400">
                    {{ uma.picks }} picks • {{ uma.timesPlayed }} races
                  </div>
                </div>

                <div class="text-right">
                  <div class="text-lg font-bold text-emerald-400">{{ (uma as any)[TOP5_CRITERIA[topUmaCriterion].umaKey] }}{{ TOP5_CRITERIA[topUmaCriterion].suffix }}</div>
                  <div class="text-xs text-slate-400">{{ TOP5_CRITERIA[topUmaCriterion].label.toLowerCase() }}</div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      <div v-if="activeTab === 'players'" class="space-y-4">

        <input
            v-model="playerSearchQuery"
            type="text"
            placeholder="Search players..."
            class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
        />

        <div class="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-slate-900 border-b border-slate-700">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider w-12">#</th>

                <th @click="togglePlayerSort('name')" class="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors group select-none">
                  <div class="flex items-center gap-1">
                    Player
                    <i v-if="playerSortKey === 'name'" class="ph-bold" :class="playerSortDesc ? 'ph-caret-down' : 'ph-caret-up'"></i>
                    <i v-else class="ph-bold ph-caret-down opacity-0 group-hover:opacity-50"></i>
                  </div>
                </th>

                <th v-for="col in [
                  { key: 'tournaments', label: 'Tourneys' },
                  { key: 'tournamentWins', label: 'T. Wins' },
                  { key: 'tournamentWinRate', label: 'T. Win Rate' },
                  { key: 'races', label: 'Races' },
                  { key: 'wins', label: 'Race Wins' },
                  { key: 'winRate', label: 'Win Rate' },
                  { key: 'totalPoints', label: 'Total Pts' },
                  { key: 'avgPoints', label: 'Avg Pts' },
                  { key: 'dominance', label: 'Dominance' },
                  { key: 'avgPosition', label: 'Avg Pos.' },
                ]"
                    :key="col.key"
                    @click="togglePlayerSort(col.key)"
                    class="px-4 py-3 text-right text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors group select-none whitespace-nowrap">
                  <div class="flex items-center justify-end gap-1">
                    {{ col.label }}
                    <i v-if="playerSortKey === col.key" class="ph-bold text-indigo-400" :class="playerSortDesc ? 'ph-caret-down' : 'ph-caret-up'"></i>
                    <i v-else class="ph-bold ph-caret-down opacity-0 group-hover:opacity-50"></i>
                  </div>
                </th>
              </tr>
              </thead>
              <tbody class="divide-y divide-slate-700 border-t border-slate-700">
              <template
                  v-for="(player, idx) in playerRankings.filter(p =>
                        !playerSearchQuery || p.player.name.toLowerCase().includes(playerSearchQuery.toLowerCase())
                      )"
                  :key="player.player.id"
              >
                <tr
                    @click="togglePlayerExpand(player.player.id)"
                    class="hover:bg-slate-700/50 transition-colors cursor-pointer group"
                    :class="{'bg-slate-800/80': expandedPlayerId === player.player.id}"
                >
                  <td class="px-4 py-3 text-sm" :class="getRankColor(idx)">
                    <i v-if="idx < 3" :class="getRankIcon(idx)"></i>
                    <span v-else>{{ idx + 1 }}</span>
                  </td>
                  <td class="px-4 py-3 text-sm font-bold text-white flex items-center gap-2">
                    <i class="ph-bold text-slate-500 group-hover:text-indigo-400 transition-transform duration-200"
                       :class="expandedPlayerId === player.player.id ? 'ph-caret-down text-indigo-400' : 'ph-caret-right'"></i>
                    {{ player.player.name }}
                  </td>

                  <td class="px-4 py-3 text-sm text-right text-slate-300">{{ player.tournaments }}</td>
                  <td class="px-4 py-3 text-sm text-right font-bold text-amber-400">{{ player.tournamentWins }}</td>
                  <td class="px-4 py-3 text-sm text-right font-bold text-amber-400">{{ player.tournamentWinRate }}%</td>

                  <td class="px-4 py-3 text-sm text-right text-slate-300">{{ player.races }}</td>
                  <td class="px-4 py-3 text-sm text-right text-emerald-400">{{ player.wins }}</td>
                  <td class="px-4 py-3 text-sm text-right font-bold text-emerald-400">{{ player.winRate }}%</td>
                  <td class="px-4 py-3 text-sm text-right font-bold text-white">{{ player.totalPoints }}</td>
                  <td class="px-4 py-3 text-sm text-right text-indigo-400">{{ player.avgPoints }}</td>
                  <td class="px-4 py-3 text-sm text-right font-bold text-rose-400">{{ player.dominance }}%</td>
                  <td class="px-4 py-3 text-sm text-right font-bold text-slate-400">{{ player.avgPosition }}</td>
                </tr>

                <tr v-if="expandedPlayerId === player.player.id" class="bg-slate-900/50">
                  <td colspan="11" class="p-0 border-b-2 border-indigo-500/30">
                    <div class="p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 animate-fade-in-down">

                      <div class="bg-slate-800 border border-slate-700 rounded-lg p-4">
                        <div class="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
                          <i class="ph-fill ph-trophy text-amber-400"></i> Best Tournament
                        </div>
                        <div v-if="player.bestTournament">
                          <div class="font-bold text-white truncate" :title="player.bestTournament.tName">
                            {{ player.bestTournament.tName }}
                          </div>
                          <div class="text-2xl font-black text-indigo-400 mt-1">
                            {{ player.bestTournament.points }} <span class="text-xs text-slate-500 font-medium">pts</span>
                          </div>
                          <router-link :to="'/t/' + player.bestTournament.tId" class="text-xs text-indigo-400 hover:text-indigo-300 mt-2 inline-flex items-center gap-1">
                            View Results <i class="ph-bold ph-arrow-right"></i>
                          </router-link>
                        </div>
                        <div v-else class="text-slate-500 text-sm italic">No data yet</div>
                      </div>

                      <div class="bg-slate-800 border border-slate-700 rounded-lg p-4">
                        <div class="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
                          <i class="ph-fill ph-horse text-purple-400"></i> Most Picked Uma
                        </div>
                        <div v-if="player.mostPickedUmas.length > 0">
                          <div class="font-bold text-white break-words text-sm" :title="player.mostPickedUmas.map(u => u.name).join(', ')">
                            {{ player.mostPickedUmas.map(u => u.name).join(', ') }}
                          </div>
                          <div class="flex items-end gap-3 mt-1">
                            <div class="text-2xl font-black text-purple-400">
                              {{ player.mostPickedUmas[0]!.count }} <span class="text-xs text-slate-500 font-medium">picks</span>
                            </div>
                          </div>
                          <div class="text-xs text-slate-400 mt-2 break-words">
                            Avg. Placement: <span class="font-bold text-white">{{ player.mostPickedUmas.map(u => u.avgPosition).join(' / ') }}</span>
                          </div>
                        </div>
                        <div v-else class="text-slate-500 text-sm italic">No data yet</div>
                      </div>

                      <div class="bg-slate-800 border border-slate-700 rounded-lg p-4">
                        <div class="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
                          <i class="ph-fill ph-medal text-emerald-400"></i> Best Performing Uma
                        </div>
                        <div v-if="player.mostWinningUmas.length > 0">
                          <div class="font-bold text-white truncate text-sm" :title="player.mostWinningUmas.map(u => u.name).join(', ')">
                            {{ player.mostWinningUmas.map(u => u.name).join(', ') }}
                          </div>
                          <div class="flex items-end gap-3 mt-1">
                            <div class="text-2xl font-black text-emerald-400">
                              {{ player.mostWinningUmas[0]!.wins }} <span class="text-xs text-slate-500 font-medium">wins</span>
                            </div>
                          </div>
                          <div class="text-xs text-slate-400 mt-2 truncate">
                            Win Rate: <span class="font-bold text-white">{{ player.mostWinningUmas.map(u => u.winRate + '%').join(' / ') }}</span>
                          </div>
                        </div>
                        <div v-else class="text-slate-500 text-sm italic">No wins recorded yet</div>
                      </div>

                      <div class="bg-slate-800 border border-slate-700 rounded-lg p-4">
                        <div class="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
                          <i class="ph-fill ph-trend-up text-blue-400"></i> Career Averages
                        </div>
                        <div class="space-y-2 mt-2">
                          <div class="flex justify-between items-center text-sm">
                            <span class="text-slate-400">Pts / Tournament</span>
                            <span class="font-bold text-white">
                                  {{ player.tournaments > 0 ? Math.round(player.totalPoints / player.tournaments) : 0 }}
                                </span>
                          </div>
                          <div class="flex justify-between items-center text-sm">
                            <span class="text-slate-400">Opponents Beaten</span>
                            <span class="font-bold text-white">
                                  {{ player.opponentsBeaten }} <span class="text-xs text-slate-500">/ {{ player.opponentsFaced }}</span>
                                </span>
                          </div>
                        </div>
                      </div>

                      <div class="col-span-full bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
                        <div class="px-4 py-3 border-b border-slate-700 flex items-center gap-3">
                          <button
                              @click="expandedDetailTab = 'tournaments'"
                              class="px-3 py-1.5 text-xs font-bold rounded-full transition-colors border flex items-center gap-1.5"
                              :class="expandedDetailTab === 'tournaments'
                                  ? 'bg-indigo-600 border-indigo-500 text-white'
                                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'"
                          >
                            <i class="ph-fill ph-trophy"></i>
                            Tournaments
                            <span class="opacity-60">({{ expandedPlayerTournaments.length }})</span>
                          </button>
                          <button
                              @click="expandedDetailTab = 'umas'"
                              class="px-3 py-1.5 text-xs font-bold rounded-full transition-colors border flex items-center gap-1.5"
                              :class="expandedDetailTab === 'umas'
                                  ? 'bg-indigo-600 border-indigo-500 text-white'
                                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'"
                          >
                            <i class="ph-fill ph-horse"></i>
                            Umas
                            <span class="opacity-60">({{ expandedPlayerUmas.length }})</span>
                          </button>
                        </div>

                        <div v-if="expandedDetailTab === 'tournaments'" class="overflow-x-auto">
                          <table class="w-full">
                            <thead class="bg-slate-900 border-b border-slate-700">
                            <tr>
                              <th class="px-3 py-2 text-left text-xs font-bold text-slate-400 uppercase tracking-wider w-8">#</th>
                              <th @click="togglePlayerTournamentSort('tournamentName')" class="px-3 py-2 text-left text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors group select-none">
                                <div class="flex items-center gap-1">
                                  Tournament
                                  <i v-if="playerTournamentSortKey === 'tournamentName'" class="ph-bold" :class="playerTournamentSortDesc ? 'ph-caret-down' : 'ph-caret-up'"></i>
                                  <i v-else class="ph-bold ph-caret-down opacity-0 group-hover:opacity-50"></i>
                                </div>
                              </th>
                              <th v-for="col in [
                                    { key: 'uma', label: 'Uma' },
                                    { key: 'finalsStatus', label: 'Perf.' },
                                    { key: 'races', label: 'Races' },
                                    { key: 'wins', label: 'Wins' },
                                    { key: 'winRate', label: 'Win %' },
                                    { key: 'totalPoints', label: 'Points' },
                                    { key: 'avgPoints', label: 'Avg Pts' },
                                    { key: 'dominance', label: 'Dominance' },
                                    { key: 'avgPosition', label: 'Avg Pos' },
                                  ]"
                                  :key="col.key"
                                  @click="togglePlayerTournamentSort(col.key)"
                                  class="px-3 py-2 text-left text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors group select-none whitespace-nowrap"
                              >
                                <div class="flex items-center justify-start gap-1">
                                  {{ col.label }}
                                  <i v-if="playerTournamentSortKey === col.key" class="ph-bold text-indigo-400" :class="playerTournamentSortDesc ? 'ph-caret-down' : 'ph-caret-up'"></i>
                                  <i v-else class="ph-bold ph-caret-down opacity-0 group-hover:opacity-50"></i>
                                </div>
                              </th>
                              <th class="px-3 py-2 w-8"></th>
                            </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-700">
                            <tr v-for="(t, tIdx) in expandedPlayerTournaments" :key="t.rowKey" class="hover:bg-slate-700/50 transition-colors">
                              <td class="px-3 py-2 text-xs text-slate-500">{{ tIdx + 1 }}</td>
                              <td class="px-3 py-2 text-sm font-bold text-white">
                                {{ t.tournamentName }}
                                <span v-if="t.status === 'active'" class="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold uppercase">Live</span>
                              </td>
                              <td class="px-3 py-2 text-sm text-left text-slate-300">
                                <div class="flex items-center justify-start gap-1.5">
                                  <img :src="getUmaImagePath(t.uma)" :alt="t.uma" class="w-5 h-5 rounded-full object-cover shrink-0 bg-slate-700" />
                                  {{ t.uma }}
                                </div>
                              </td>
                              <td class="px-3 py-2 text-sm text-right">
                                <div class="flex items-center justify-end gap-1 flex-wrap">
                                  <span v-if="t.isWildcard" class="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-bold uppercase">WC {{ t.wildcardGroup }}</span>
                                  <span v-if="t.finalsStatus === 'winner'" class="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-bold uppercase">Winner</span>
                                  <span v-else-if="t.finalsStatus === 'finals'" class="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-bold uppercase">{{ t.teamRank ? ordinal(t.teamRank) + ' Finals' : 'Finals' }}</span>
                                  <span v-else-if="t.finalsStatus === 'eliminated'" class="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 font-bold uppercase">{{ t.teamRank ? ordinal(t.teamRank) + ' Grps' : 'Out' }}</span>
                                  <span v-else-if="t.finalsStatus === 'no-groups'" class="text-[10px] px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-400 font-bold uppercase">{{ t.teamRank ? ordinal(t.teamRank) : '-' }}</span>
                                  <span v-else-if="!t.isWildcard" class="text-slate-600">-</span>
                                </div>
                              </td>
                              <td class="px-3 py-2 text-sm text-right text-slate-400">{{ t.races }}</td>
                              <td class="px-3 py-2 text-sm text-right text-emerald-400">{{ t.wins }}</td>
                              <td class="px-3 py-2 text-sm text-right font-bold text-emerald-400">{{ t.winRate }}%</td>
                              <td class="px-3 py-2 text-sm text-right font-bold text-white">{{ t.totalPoints }}</td>
                              <td class="px-3 py-2 text-sm text-right text-indigo-400">{{ t.avgPoints }}</td>
                              <td class="px-3 py-2 text-sm text-right font-bold text-purple-400">{{ t.dominance }}%</td>
                              <td class="px-3 py-2 text-sm text-right text-slate-400">{{ t.avgPosition }}</td>
                              <td class="px-3 py-2 text-right">
                                <router-link :to="'/t/' + t.tournamentId" class="text-indigo-400 hover:text-indigo-300 transition-colors">
                                  <i class="ph-bold ph-arrow-right"></i>
                                </router-link>
                              </td>
                            </tr>
                            </tbody>
                          </table>
                          <div v-if="expandedPlayerTournaments.length === 0" class="px-4 py-6 text-center text-slate-500 text-sm">No tournament data</div>
                        </div>

                        <div v-if="expandedDetailTab === 'umas'" class="overflow-x-auto">
                          <table class="w-full">
                            <thead class="bg-slate-900 border-b border-slate-700">
                            <tr>
                              <th class="px-3 py-2 text-left text-xs font-bold text-slate-400 uppercase tracking-wider w-8">#</th>
                              <th @click="togglePlayerUmaSort('name')" class="px-3 py-2 text-left text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors group select-none">
                                <div class="flex items-center gap-1">
                                  Uma
                                  <i v-if="playerUmaSortKey === 'name'" class="ph-bold" :class="playerUmaSortDesc ? 'ph-caret-down' : 'ph-caret-up'"></i>
                                  <i v-else class="ph-bold ph-caret-down opacity-0 group-hover:opacity-50"></i>
                                </div>
                              </th>
                              <th v-for="col in [
                                    { key: 'picks', label: 'Picks' },
                                    { key: 'racesPlayed', label: 'Races' },
                                    { key: 'wins', label: 'Wins' },
                                    { key: 'winRate', label: 'Win %' },
                                    { key: 'avgPoints', label: 'Avg Pts' },
                                    { key: 'dominance', label: 'Dominance' },
                                    { key: 'avgPosition', label: 'Avg Pos' },
                                  ]"
                                  :key="col.key"
                                  @click="togglePlayerUmaSort(col.key)"
                                  class="px-3 py-2 text-right text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors group select-none whitespace-nowrap"
                              >
                                <div class="flex items-center justify-end gap-1">
                                  {{ col.label }}
                                  <i v-if="playerUmaSortKey === col.key" class="ph-bold text-indigo-400" :class="playerUmaSortDesc ? 'ph-caret-down' : 'ph-caret-up'"></i>
                                  <i v-else class="ph-bold ph-caret-down opacity-0 group-hover:opacity-50"></i>
                                </div>
                              </th>
                            </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-700">
                            <tr v-for="(uma, uIdx) in expandedPlayerUmas" :key="uma.name" class="hover:bg-slate-700/50 transition-colors">
                              <td class="px-3 py-2 text-xs text-slate-500">{{ uIdx + 1 }}</td>
                              <td class="px-3 py-2 text-sm font-bold text-white">
                                <div class="flex items-center gap-1.5">
                                  <img :src="getUmaImagePath(uma.name)" :alt="uma.name" class="w-5 h-5 rounded-full object-cover shrink-0 bg-slate-700" />
                                  {{ uma.name }}
                                </div>
                              </td>
                              <td class="px-3 py-2 text-sm text-right text-slate-300">{{ uma.picks }}</td>
                              <td class="px-3 py-2 text-sm text-right text-slate-400">{{ uma.racesPlayed }}</td>
                              <td class="px-3 py-2 text-sm text-right text-emerald-400">{{ uma.wins }}</td>
                              <td class="px-3 py-2 text-sm text-right font-bold text-emerald-400">{{ uma.winRate }}%</td>
                              <td class="px-3 py-2 text-sm text-right text-indigo-400">{{ uma.avgPoints }}</td>
                              <td class="px-3 py-2 text-sm text-right font-bold text-purple-400">{{ uma.dominance }}%</td>
                              <td class="px-3 py-2 text-sm text-right text-slate-400">{{ uma.avgPosition }}</td>
                            </tr>
                            </tbody>
                          </table>
                          <div v-if="expandedPlayerUmas.length === 0" class="px-4 py-6 text-center text-slate-500 text-sm">No uma data</div>
                        </div>
                      </div>

                    </div>
                  </td>
                </tr>
              </template>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div v-if="activeTab === 'umas'" class="space-y-4">

        <input
            v-model="umaSearchQuery"
            type="text"
            placeholder="Search umas..."
            class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
        />

        <div class="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-slate-900 border-b border-slate-700">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider w-12">#</th>

                <th @click="toggleUmaSort('name')" class="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors group select-none">
                  <div class="flex items-center gap-1">
                    Uma
                    <i v-if="umaSortKey === 'name'" class="ph-bold" :class="umaSortDesc ? 'ph-caret-down' : 'ph-caret-up'"></i>
                    <i v-else class="ph-bold ph-caret-down opacity-0 group-hover:opacity-50"></i>
                  </div>
                </th>

                <th v-for="col in [
                      { key: 'tournamentsPicked', label: 'T. Picks' },
                      { key: 'picks', label: 'Picks' },
                      { key: 'pickRate', label: 'Pick %' },
                      { key: 'bans', label: 'Bans' },
                      { key: 'banRate', label: 'Ban %' },
                      { key: 'tournamentCount', label: 'Presence' },
                      { key: 'presence', label: 'Presence %' },
                      { key: 'timesPlayed', label: 'Races' },
                      { key: 'wins', label: 'Race Wins' },
                      { key: 'winRate', label: 'Win Rate' },
                      { key: 'avgPoints', label: 'Avg Pts' },
                      { key: 'dominance', label: 'Dominance' },
                      { key: 'avgPosition', label: 'Avg Pos' }
                    ]"
                    :key="col.key"
                    @click="toggleUmaSort(col.key)"
                    class="px-4 py-3 text-right text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors group select-none">
                  <div class="flex items-center justify-end gap-1">
                    {{ col.label }}
                    <i v-if="umaSortKey === col.key" class="ph-bold text-indigo-400" :class="umaSortDesc ? 'ph-caret-down' : 'ph-caret-up'"></i>
                    <i v-else class="ph-bold ph-caret-down opacity-0 group-hover:opacity-50"></i>
                  </div>
                </th>
              </tr>
              </thead>
              <tbody class="divide-y divide-slate-700">
              <template
                  v-for="(uma, idx) in umaStats.filter(u => !umaSearchQuery || u.name.toLowerCase().includes(umaSearchQuery.toLowerCase()))"
                  :key="uma.name"
              >
                <tr
                    @click="toggleUmaExpand(uma.name)"
                    class="hover:bg-slate-700/50 transition-colors cursor-pointer group"
                    :class="{'bg-slate-800/80': expandedUmaName === uma.name}"
                >
                  <td class="px-4 py-3 text-sm text-slate-400">{{ idx + 1 }}</td>
                  <td class="px-4 py-3 text-sm font-bold text-white">
                    <div class="flex items-center gap-2">
                      <i class="ph-bold text-slate-500 group-hover:text-indigo-400 transition-transform duration-200"
                         :class="expandedUmaName === uma.name ? 'ph-caret-down text-indigo-400' : 'ph-caret-right'"></i>
                      <img :src="getUmaImagePath(uma.name)" :alt="uma.name" class="w-6 h-6 rounded-full object-cover shrink-0 bg-slate-700" />
                      {{ uma.name }}
                    </div>
                  </td>

                  <td class="px-4 py-3 text-sm text-right text-slate-300">{{ uma.tournamentsPicked }}/{{ uma.availableTournaments }}</td>
                  <td class="px-4 py-3 text-sm text-right text-slate-300">{{ uma.picks }}/{{uma.totalPicks}}</td>
                  <td class="px-4 py-3 text-sm text-right text-blue-400">{{ uma.pickRate }}%</td>

                  <td class="px-4 py-3 text-sm text-right text-slate-300">{{ uma.bans }}/{{ uma.availableTournaments }} </td>
                  <td class="px-4 py-3 text-sm text-right text-rose-400">{{ uma.banRate }}%</td>

                  <td class="px-4 py-3 text-sm text-right text-slate-300">{{ uma.tournamentCount }}/{{ uma.availableTournaments }}</td>
                  <td class="px-4 py-3 text-sm text-right font-bold text-amber-400">{{ uma.presence }}%</td>

                  <td class="px-4 py-3 text-sm text-right text-slate-400">{{ uma.timesPlayed }}</td>
                  <td class="px-4 py-3 text-sm text-right text-emerald-400">{{ uma.wins }}</td>
                  <td class="px-4 py-3 text-sm text-right font-bold text-emerald-400">{{ uma.winRate }}%</td>
                  <td class="px-4 py-3 text-sm text-right text-indigo-400">{{ uma.avgPoints }}</td>
                  <td class="px-4 py-3 text-sm text-right font-bold text-purple-400">{{ uma.dominance }}%</td>
                  <td class="px-4 py-3 text-sm text-right text-slate-400">{{ uma.avgPosition }}</td>
                </tr>

                <tr v-if="expandedUmaName === uma.name">
                  <td :colspan="14" class="p-0">
                    <div class="bg-slate-900/50 border-t border-slate-700 p-4">
                      <div class="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
                        <div class="px-4 py-3 border-b border-slate-700 flex items-center gap-3">
                          <button
                              @click="expandedUmaDetailTab = 'tournaments'"
                              class="px-3 py-1.5 text-xs font-bold rounded-full transition-colors border flex items-center gap-1.5"
                              :class="expandedUmaDetailTab === 'tournaments'
                                  ? 'bg-indigo-600 border-indigo-500 text-white'
                                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'"
                          >
                            <i class="ph-fill ph-trophy"></i>
                            Appearances
                            <span class="opacity-60">({{ expandedUmaTournaments.length }})</span>
                          </button>
                          <button
                              @click="expandedUmaDetailTab = 'players'"
                              class="px-3 py-1.5 text-xs font-bold rounded-full transition-colors border flex items-center gap-1.5"
                              :class="expandedUmaDetailTab === 'players'
                                  ? 'bg-indigo-600 border-indigo-500 text-white'
                                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'"
                          >
                            <i class="ph-fill ph-users"></i>
                            Players
                            <span class="opacity-60">({{ expandedUmaPlayers.length }})</span>
                          </button>
                        </div>

                        <div v-if="expandedUmaDetailTab === 'tournaments'" class="overflow-x-auto">
                          <table class="w-full">
                            <thead class="bg-slate-900 border-b border-slate-700">
                            <tr>
                              <th class="px-3 py-2 text-left text-xs font-bold text-slate-400 uppercase tracking-wider w-8">#</th>
                              <th v-for="col in [
                                    { key: 'tournamentName', label: 'Tournament' },
                                    { key: 'playerName', label: 'Player' },
                                    { key: 'races', label: 'Races' },
                                    { key: 'wins', label: 'Wins' },
                                    { key: 'winRate', label: 'Win %' },
                                    { key: 'totalPoints', label: 'Points' },
                                    { key: 'avgPoints', label: 'Avg Pts' },
                                    { key: 'dominance', label: 'Dominance' },
                                    { key: 'avgPosition', label: 'Avg Pos' },
                                  ]"
                                  :key="col.key"
                                  @click="toggleUmaTournamentSort(col.key)"
                                  class="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors group select-none whitespace-nowrap"
                                  :class="col.key === 'tournamentName' || col.key === 'playerName' ? 'text-left' : 'text-right'"
                              >
                                <div class="flex items-center gap-1" :class="col.key === 'tournamentName' || col.key === 'playerName' ? '' : 'justify-end'">
                                  {{ col.label }}
                                  <i v-if="umaTournamentSortKey === col.key" class="ph-bold text-indigo-400" :class="umaTournamentSortDesc ? 'ph-caret-down' : 'ph-caret-up'"></i>
                                  <i v-else class="ph-bold ph-caret-down opacity-0 group-hover:opacity-50"></i>
                                </div>
                              </th>
                              <th class="px-3 py-2 w-8"></th>
                            </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-700">
                            <tr v-for="(row, rIdx) in expandedUmaTournaments" :key="row.tournamentId + '_' + row.playerId" class="hover:bg-slate-700/50 transition-colors">
                              <td class="px-3 py-2 text-xs text-slate-500">{{ rIdx + 1 }}</td>
                              <td class="px-3 py-2 text-sm font-bold text-white">{{ row.tournamentName }}</td>
                              <td class="px-3 py-2 text-sm text-slate-300">{{ row.playerName }}</td>
                              <td class="px-3 py-2 text-sm text-right text-slate-400">{{ row.races }}</td>
                              <td class="px-3 py-2 text-sm text-right text-emerald-400">{{ row.wins }}</td>
                              <td class="px-3 py-2 text-sm text-right font-bold text-emerald-400">{{ row.winRate }}%</td>
                              <td class="px-3 py-2 text-sm text-right font-bold text-white">{{ row.totalPoints }}</td>
                              <td class="px-3 py-2 text-sm text-right text-indigo-400">{{ row.avgPoints }}</td>
                              <td class="px-3 py-2 text-sm text-right font-bold text-purple-400">{{ row.dominance }}%</td>
                              <td class="px-3 py-2 text-sm text-right text-slate-400">{{ row.avgPosition }}</td>
                              <td class="px-3 py-2 text-right">
                                <router-link :to="'/t/' + row.tournamentId" class="text-indigo-400 hover:text-indigo-300 transition-colors">
                                  <i class="ph-bold ph-arrow-right"></i>
                                </router-link>
                              </td>
                            </tr>
                            </tbody>
                          </table>
                          <div v-if="expandedUmaTournaments.length === 0" class="px-4 py-6 text-center text-slate-500 text-sm">No tournament data</div>
                        </div>

                        <div v-if="expandedUmaDetailTab === 'players'" class="overflow-x-auto">
                          <table class="w-full">
                            <thead class="bg-slate-900 border-b border-slate-700">
                            <tr>
                              <th class="px-3 py-2 text-left text-xs font-bold text-slate-400 uppercase tracking-wider w-8">#</th>
                              <th v-for="col in [
                                    { key: 'playerName', label: 'Player' },
                                    { key: 'tournaments', label: 'Picks' },
                                    { key: 'racesPlayed', label: 'Races' },
                                    { key: 'wins', label: 'Wins' },
                                    { key: 'winRate', label: 'Win %' },
                                    { key: 'totalPoints', label: 'Points' },
                                    { key: 'avgPoints', label: 'Avg Pts' },
                                    { key: 'dominance', label: 'Dominance' },
                                    { key: 'avgPosition', label: 'Avg Pos' },
                                  ]"
                                  :key="col.key"
                                  @click="toggleUmaPlayerSort(col.key)"
                                  class="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors group select-none whitespace-nowrap"
                                  :class="col.key === 'playerName' ? 'text-left' : 'text-right'"
                              >
                                <div class="flex items-center gap-1" :class="col.key === 'playerName' ? '' : 'justify-end'">
                                  {{ col.label }}
                                  <i v-if="umaPlayerSortKey === col.key" class="ph-bold text-indigo-400" :class="umaPlayerSortDesc ? 'ph-caret-down' : 'ph-caret-up'"></i>
                                  <i v-else class="ph-bold ph-caret-down opacity-0 group-hover:opacity-50"></i>
                                </div>
                              </th>
                            </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-700">
                            <tr v-for="(row, rIdx) in expandedUmaPlayers" :key="row.playerId" class="hover:bg-slate-700/50 transition-colors">
                              <td class="px-3 py-2 text-xs text-slate-500">{{ rIdx + 1 }}</td>
                              <td class="px-3 py-2 text-sm font-bold text-white">{{ row.playerName }}</td>
                              <td class="px-3 py-2 text-sm text-right text-slate-300">{{ row.tournaments }}</td>
                              <td class="px-3 py-2 text-sm text-right text-slate-400">{{ row.racesPlayed }}</td>
                              <td class="px-3 py-2 text-sm text-right text-emerald-400">{{ row.wins }}</td>
                              <td class="px-3 py-2 text-sm text-right font-bold text-emerald-400">{{ row.winRate }}%</td>
                              <td class="px-3 py-2 text-sm text-right font-bold text-white">{{ row.totalPoints }}</td>
                              <td class="px-3 py-2 text-sm text-right text-indigo-400">{{ row.avgPoints }}</td>
                              <td class="px-3 py-2 text-sm text-right font-bold text-purple-400">{{ row.dominance }}%</td>
                              <td class="px-3 py-2 text-sm text-right text-slate-400">{{ row.avgPosition }}</td>
                            </tr>
                            </tbody>
                          </table>
                          <div v-if="expandedUmaPlayers.length === 0" class="px-4 py-6 text-center text-slate-500 text-sm">No player data</div>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              </template>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div v-if="activeTab === 'tierlist'" class="space-y-4">

        <div class="flex justify-center gap-2 flex-wrap">
          <button
              v-for="(config, key) in TIER_CRITERIA"
              :key="key"
              @click="tierCriterion = key"
              class="px-3 py-1.5 text-xs font-bold rounded-full transition-colors border flex items-center gap-1.5"
              :class="tierCriterion === key
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'"
          >
            <i :class="config.icon"></i>
            {{ config.label }}
          </button>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <div>
            <h3 class="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <i class="ph-fill ph-users text-indigo-400"></i> Players
            </h3>
            <div class="space-y-3">
              <div
                  v-for="tier in playerTierList"
                  :key="tier.tier"
                  class="rounded-xl border overflow-hidden"
                  :class="tier.border"
              >
                <div class="flex items-stretch">
                  <div
                      class="w-12 md:w-16 flex-shrink-0 flex items-center justify-center bg-gradient-to-r"
                      :class="tier.color"
                  >
                    <span class="text-2xl md:text-3xl font-black" :class="tier.text">{{ tier.tier }}</span>
                  </div>
                  <div class="flex-1 flex flex-wrap gap-2 p-3 bg-slate-900/50">
                    <div
                        v-for="p in tier.entries"
                        :key="p.player.id"
                        class="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 flex items-center gap-2 hover:border-slate-500 transition-colors"
                    >
                      <span class="font-bold text-white text-sm">{{ p.player.name }}</span>
                      <span class="text-xs px-1.5 py-0.5 rounded font-bold" :class="tier.text + ' bg-slate-900'">{{ getStatValue(p, tierCriterion) }}{{ TIER_CRITERIA[tierCriterion].suffix }}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div v-if="playerTierList.length === 0" class="bg-slate-800 border border-slate-700 rounded-xl p-6 text-center text-slate-400">
                No players match the current filters.
              </div>
            </div>
          </div>

          <div>
            <h3 class="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <i class="ph-fill ph-horse text-indigo-400"></i> Umas
            </h3>
            <div class="space-y-3">
              <div
                  v-for="tier in umaTierList"
                  :key="tier.tier"
                  class="rounded-xl border overflow-hidden"
                  :class="tier.border"
              >
                <div class="flex items-stretch">
                  <div
                      class="w-12 md:w-16 flex-shrink-0 flex items-center justify-center bg-gradient-to-r"
                      :class="tier.color"
                  >
                    <span class="text-2xl md:text-3xl font-black" :class="tier.text">{{ tier.tier }}</span>
                  </div>
                  <div class="flex-1 flex flex-wrap gap-2 p-3 bg-slate-900/50">
                    <div
                        v-for="u in tier.entries"
                        :key="u.name"
                        class="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 flex items-center gap-2 hover:border-slate-500 transition-colors"
                    >
                      <img :src="getUmaImagePath(u.name)" :alt="u.name" class="w-6 h-6 rounded-full object-cover shrink-0 bg-slate-700" />
                      <span class="font-bold text-white text-sm">{{ u.name }}</span>
                      <span class="text-xs px-1.5 py-0.5 rounded font-bold" :class="tier.text + ' bg-slate-900'">{{ getStatValue(u, tierCriterion) }}{{ TIER_CRITERIA[tierCriterion].suffix }}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div v-if="umaTierList.length === 0" class="bg-slate-800 border border-slate-700 rounded-xl p-6 text-center text-slate-400">
                No umas match the current filters.
              </div>
            </div>
          </div>

        </div>
      </div>

      <div v-if="activeTab === 'tournaments'" class="space-y-4">
        <div class="bg-slate-800 border border-slate-700 rounded-xl p-6 text-center text-slate-400">
          <i class="ph ph-construction text-6xl mb-4"></i>
          <p>Tournament comparison view coming soon...</p>
        </div>
        <div class="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-700 bg-slate-900 flex justify-between items-center">
            <h3 class="font-bold text-white uppercase tracking-wider text-sm">Tournament Archive</h3>
            <span class="text-xs text-slate-500 font-mono">{{ filteredTournaments.length }} Events</span>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-slate-900 border-b border-slate-700">
              <tr>
                <th v-for="col in [
                  { key: 'date',    label: 'Date',     align: 'left'  },
                  { key: 'name',    label: 'Name',     align: 'left'  },
                  { key: 'winners', label: 'Winner(s)', align: 'left' },
                  { key: 'players', label: 'Players',  align: 'right' },
                ]" :key="col.key"
                    @click="toggleTournamentSort(col.key)"
                    class="px-4 py-2 text-xs font-bold text-slate-400 uppercase cursor-pointer hover:text-white transition-colors group select-none"
                    :class="col.align === 'right' ? 'text-right' : 'text-left'">
                  <div class="flex items-center gap-1" :class="col.align === 'right' ? 'justify-end' : ''">
                    {{ col.label }}
                    <i v-if="tournamentSortKey === col.key" class="ph-bold text-indigo-400" :class="tournamentSortDesc ? 'ph-caret-down' : 'ph-caret-up'"></i>
                    <i v-else class="ph-bold ph-caret-down opacity-0 group-hover:opacity-50"></i>
                  </div>
                </th>
              </tr>
              </thead>
              <tbody class="divide-y divide-slate-700">
              <tr v-for="t in sortedTournaments" :key="t.id" class="hover:bg-slate-750 transition-colors">
                <td class="px-4 py-3 text-sm text-slate-400 font-mono">
                  {{ new Date(t.createdAt).toLocaleDateString() }}
                </td>
                <td class="px-4 py-3 text-sm font-bold text-white">
                  <router-link :to="'/t/' + t.id" class="hover:text-indigo-400 transition-colors">
                    {{ t.name }}
                  </router-link>
                </td>
                <td class="px-4 py-3 text-sm text-amber-400 font-medium">
                  {{ tournamentWinnerNames.get(t.id)?.join(', ') || '—' }}
                </td>
                <td class="px-4 py-3 text-sm text-right text-slate-300">
                  {{ Object.keys(t.players).length }}
                </td>
              </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- ==================== DIAGRAMS TAB ==================== -->
      <div v-if="activeTab === 'diagrams'" class="space-y-4">

        <!-- Disclaimer -->
        <div class="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-amber-300 text-sm">
          <i class="ph-bold ph-warning shrink-0 mt-0.5 text-base"></i>
          <span>This is a new feature currently in development — data shown may contain errors.</span>
        </div>

        <!-- Shared controls: subject + metric + mode -->
        <div class="bg-slate-800 border border-slate-700 rounded-xl p-3 flex flex-wrap gap-3 items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-xs text-slate-400 font-bold uppercase tracking-wider">View</span>
            <div class="flex rounded-lg bg-slate-900 p-1 gap-1">
              <button
                @click="diagramSubject = 'players'"
                class="px-3 py-1.5 text-xs font-bold rounded transition-all"
                :class="diagramSubject === 'players' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'"
              >Players</button>
              <button
                @click="diagramSubject = 'umas'"
                class="px-3 py-1.5 text-xs font-bold rounded transition-all"
                :class="diagramSubject === 'umas' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'"
              >Umas</button>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-slate-400 font-bold uppercase tracking-wider">Metric</span>
            <div class="flex rounded-lg bg-slate-900 p-1 gap-1">
              <button
                @click="diagramMetric = 'dominance'"
                class="px-3 py-1.5 text-xs font-bold rounded transition-all"
                :class="diagramMetric === 'dominance' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'"
              >Dominance</button>
              <button
                @click="diagramMetric = 'avg-points'"
                class="px-3 py-1.5 text-xs font-bold rounded transition-all"
                :class="diagramMetric === 'avg-points' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'"
              >Avg Points</button>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-slate-400 font-bold uppercase tracking-wider">Mode</span>
            <div class="flex rounded-lg bg-slate-900 p-1 gap-1">
              <button
                @click="diagramMode = 'per-tournament'"
                class="px-3 py-1.5 text-xs font-bold rounded transition-all"
                :class="diagramMode === 'per-tournament' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'"
              >Per Tournament</button>
              <button
                @click="diagramMode = 'cumulative'"
                class="px-3 py-1.5 text-xs font-bold rounded transition-all"
                :class="diagramMode === 'cumulative' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'"
              >Cumulative</button>
            </div>
          </div>
        </div>

        <!-- Player Timeline Chart -->
        <div v-if="diagramSubject === 'players'" class="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
          <div class="p-4 border-b border-slate-700">
            <h3 class="font-bold text-white">
              Player {{ diagramMetric === 'dominance' ? 'Dominance' : 'Avg Points' }} Timeline
            </h3>
            <p class="text-xs text-slate-500 mt-0.5">
              {{ diagramMetric === 'dominance'
                ? 'Opponents beaten ÷ opponents faced, per tournament'
                : 'Average points scored per race, per tournament' }}
            </p>
          </div>

          <div class="p-4">
            <div v-if="diagramSelectedPlayerIds.length === 0"
                 class="py-16 text-center text-slate-500 space-y-2">
              <i class="ph ph-users text-5xl block"></i>
              <p>Select players below to plot their stats over time.</p>
            </div>
            <LineChart
              v-else
              :datasets="playerTimelineData.datasets"
              :x-labels="playerTimelineData.xLabels"
              :y-max="diagramMetric === 'dominance' ? 100 : undefined"
              :y-unit="diagramMetric === 'dominance' ? '%' : ''"
              :y-label="diagramMetric === 'dominance' ? 'Dominance (%)' : 'Avg Points'"
            />
          </div>
        </div>

        <!-- Player Selector -->
        <div v-if="diagramSubject === 'players'" class="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
            <h4 class="font-bold text-sm text-white">Select Players</h4>
            <div class="flex items-center gap-3">
              <span class="text-xs text-slate-500">{{ diagramSelectedPlayerIds.length }} / {{ MAX_DIAGRAM_PLAYERS }} selected</span>
              <button
                v-if="diagramSelectedPlayerIds.length > 0"
                @click="diagramSelectedPlayerIds = []"
                class="text-xs text-slate-500 hover:text-rose-400 transition-colors"
              >Clear all</button>
            </div>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-1.5 p-3 max-h-64 overflow-y-auto custom-scrollbar">
            <button
              v-for="p in [...playerRankings].sort((a,b) => a.player.name.localeCompare(b.player.name))"
              :key="p.player.id"
              @click="toggleDiagramPlayer(p.player.id)"
              class="flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left transition-all"
              :class="diagramSelectedPlayerIds.includes(p.player.id)
                ? 'border-indigo-500/60 bg-indigo-600/15'
                : diagramSelectedPlayerIds.length >= MAX_DIAGRAM_PLAYERS
                  ? 'border-slate-800 text-slate-600 cursor-not-allowed opacity-50'
                  : 'border-slate-700 hover:border-slate-500 text-slate-300'"
              :disabled="!diagramSelectedPlayerIds.includes(p.player.id) && diagramSelectedPlayerIds.length >= MAX_DIAGRAM_PLAYERS"
            >
              <div
                class="w-2.5 h-2.5 rounded-full shrink-0 transition-colors"
                :style="{ backgroundColor: diagramSelectedPlayerIds.includes(p.player.id) ? diagramColorMap.get(p.player.id) : undefined }"
                :class="!diagramSelectedPlayerIds.includes(p.player.id) ? 'bg-slate-700' : ''"
              ></div>
              <span class="truncate text-xs font-medium">{{ p.player.name }}</span>
              <span class="text-[10px] text-slate-500 font-mono ml-auto shrink-0">{{ p.dominance }}%</span>
            </button>
          </div>
        </div>

        <!-- Uma Timeline Chart -->
        <div v-if="diagramSubject === 'umas'" class="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
          <div class="p-4 border-b border-slate-700">
            <h3 class="font-bold text-white">
              Uma {{ diagramMetric === 'dominance' ? 'Dominance' : 'Avg Points' }} Timeline
            </h3>
            <p class="text-xs text-slate-500 mt-0.5">
              {{ diagramMetric === 'dominance'
                ? 'Opponents beaten ÷ opponents faced per uma, per tournament'
                : 'Average points scored per race per uma, per tournament' }}
            </p>
          </div>

          <div class="p-4">
            <div v-if="diagramSelectedUmaNames.length === 0"
                 class="py-16 text-center text-slate-500 space-y-2">
              <i class="ph ph-horse text-5xl block"></i>
              <p>Select Umas below to plot their stats over time.</p>
            </div>
            <LineChart
              v-else
              :datasets="umaTimelineData.datasets"
              :x-labels="umaTimelineData.xLabels"
              :y-max="diagramMetric === 'dominance' ? 100 : undefined"
              :y-unit="diagramMetric === 'dominance' ? '%' : ''"
              :y-label="diagramMetric === 'dominance' ? 'Dominance (%)' : 'Avg Points'"
            />
          </div>
        </div>

        <!-- Uma Selector -->
        <div v-if="diagramSubject === 'umas'" class="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
            <h4 class="font-bold text-sm text-white">Select Umas</h4>
            <div class="flex items-center gap-3">
              <span class="text-xs text-slate-500">{{ diagramSelectedUmaNames.length }} / {{ MAX_DIAGRAM_UMAS }} selected</span>
              <button
                v-if="diagramSelectedUmaNames.length > 0"
                @click="diagramSelectedUmaNames = []"
                class="text-xs text-slate-500 hover:text-rose-400 transition-colors"
              >Clear all</button>
            </div>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-1.5 p-3 max-h-64 overflow-y-auto custom-scrollbar">
            <button
              v-for="umaName in diagramAvailableUmas"
              :key="umaName"
              @click="toggleDiagramUma(umaName)"
              class="flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left transition-all"
              :class="diagramSelectedUmaNames.includes(umaName)
                ? 'border-indigo-500/60 bg-indigo-600/15'
                : diagramSelectedUmaNames.length >= MAX_DIAGRAM_UMAS
                  ? 'border-slate-800 text-slate-600 cursor-not-allowed opacity-50'
                  : 'border-slate-700 hover:border-slate-500 text-slate-300'"
              :disabled="!diagramSelectedUmaNames.includes(umaName) && diagramSelectedUmaNames.length >= MAX_DIAGRAM_UMAS"
            >
              <div
                class="w-2.5 h-2.5 rounded-full shrink-0 transition-colors"
                :style="{ backgroundColor: diagramSelectedUmaNames.includes(umaName) ? diagramUmaColorMap.get(umaName) : undefined }"
                :class="!diagramSelectedUmaNames.includes(umaName) ? 'bg-slate-700' : ''"
              ></div>
              <img :src="getUmaImagePath(umaName)" :alt="umaName" class="w-4 h-4 rounded-full object-cover shrink-0 bg-slate-700" />
              <span class="truncate text-xs font-medium">{{ umaName }}</span>
            </button>
          </div>
        </div>

      </div>
      <!-- ==================== END DIAGRAMS TAB ==================== -->

    </main>

  </div>
</template>

<style scoped>
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>