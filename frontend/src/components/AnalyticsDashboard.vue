<script setup lang="ts">
import {ref, computed, onMounted, inject, type Ref} from 'vue';
import { collection, query, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import type {GlobalPlayer, TournamentParticipation, RaceDocument, Tournament, Season} from '../types';
import {compareTeams} from "../utils/utils.ts";

// Inject Changelog functions from App.vue
const openChangelog = inject<() => void>('openChangelog')!;
const hasNewUpdates = inject<Ref<boolean>>('hasNewUpdates')!;

const APP_ID = 'default-app';

const loading = ref(true);
const activeTab = ref<'overview' | 'players' | 'umas' | 'tournaments'>('overview');

// Data
const players = ref<GlobalPlayer[]>([]);
const participations = ref<TournamentParticipation[]>([]);
const races = ref<RaceDocument[]>([]);
const tournaments = ref<Tournament[]>([]);

// Filters
const searchQuery = ref('');
const minTournaments = ref(1);

const seasons = ref<Season[]>([]);
const selectedSeasons = ref<string[]>([]);

const toggleSeason = (seasonId: string) => {
  const index = selectedSeasons.value.indexOf(seasonId);
  if (index === -1) {
    selectedSeasons.value.push(seasonId); // Add
  } else {
    selectedSeasons.value.splice(index, 1); // Remove
  }
};

// --- SORTING STATE ---
const playerSortKey = ref('totalPoints');
const playerSortDesc = ref(true);

const umaSortKey = ref('dominance');
const umaSortDesc = ref(true);

// --- FILTERED DATA PIPELINES ---
// These ensure all downstream stats only look at the selected seasons!
const filteredTournaments = computed(() => {
  if (selectedSeasons.value.length === 0) return tournaments.value; // Empty = All Time
  return tournaments.value.filter(t => t.seasonId && selectedSeasons.value.includes(t.seasonId));
});

const validTournamentIds = computed(() => {
  return new Set(filteredTournaments.value.map(t => t.id));
});

const filteredParticipations = computed(() => {
  return participations.value.filter(p => validTournamentIds.value.has(p.tournamentId));
});

const filteredRaces = computed(() => {
  return races.value.filter(r => r.tournamentId && validTournamentIds.value.has(r.tournamentId));
});

const togglePlayerSort = (key: string) => {
  if (playerSortKey.value === key) {
    playerSortDesc.value = !playerSortDesc.value; // Toggle direction
  } else {
    playerSortKey.value = key;
    playerSortDesc.value = true; // New columns default to Descending
  }
};

const toggleUmaSort = (key: string) => {
  if (umaSortKey.value === key) {
    umaSortDesc.value = !umaSortDesc.value;
  } else {
    umaSortKey.value = key;
    umaSortDesc.value = true;
  }
};

// Overview Stats
const overviewStats = computed(() => {
  return {
    totalPlayers: players.value.length,
    totalTournaments: filteredTournaments.value.length,
    totalRaces: filteredRaces.value.length,
    totalParticipations: filteredParticipations.value.length,
    avgPlayersPerTournament: filteredTournaments.value.length > 0
        ? Math.round(filteredParticipations.value.length / tournaments.value.length * 10) / 10
        : 0,
    avgRacesPerTournament: filteredTournaments.value.length > 0
        ? Math.round(filteredRaces.value.length / filteredTournaments.value.length * 10) / 10
        : 0
  };
});

// Player Rankings
const playerRankings = computed(() => {
  const playerStats = new Map<string, {
    player: GlobalPlayer;
    tournaments: number;
    completedTournaments: number; // NEW: Track only finished tourneys
    tournamentWins: number;       // NEW: Tourney Wins
    tournamentWinRate: number;    // NEW: Tourney Win Rate
    races: number;
    totalPoints: number;
    avgPoints: number;
    wins: number;
    opponentsFaced: number;
    opponentsBeaten: number;
    dominance: number;
    winRate: number;
  }>();

  // 1. Build stats from participations
  filteredParticipations.value.forEach(p => {
    const player = players.value.find(pl => pl.id === p.playerId);
    if (!player) return;

    if (!playerStats.has(p.playerId)) {
      playerStats.set(p.playerId, {
        player,
        tournaments: 0,
        completedTournaments: 0,
        tournamentWins: 0,
        tournamentWinRate: 0,
        races: 0,
        totalPoints: 0,
        avgPoints: 0,
        wins: 0,
        opponentsFaced: 0,
        opponentsBeaten: 0,
        dominance: 0,
        winRate: 0,
      });
    }

    const stats = playerStats.get(p.playerId)!;
    stats.tournaments++;
    stats.totalPoints += p.totalPoints || 0;

    // Check if the tournament is actually completed
    const t = tournaments.value.find(tourney => tourney.id === p.tournamentId);
    if (t && t.status === 'completed') {
      stats.completedTournaments++;
    }
  });

  // 2. Count Tournament Wins (using compareTeams for proper tiebreaking)
  filteredTournaments.value.filter(t => t.status === 'completed').forEach(t => {
    if (!t.teams || t.teams.length === 0) return;

    // Sort finalist teams using compareTeams with isFinals=true
    const finalistTeams = t.teams.filter(team => team.inFinals);
    if (finalistTeams.length === 0) return;

    const sorted = [...finalistTeams].sort((a, b) => compareTeams(a, b, true, t, true));
    const winningTeam = sorted[0];
    if (!winningTeam) return;

    // Credit players via participations (which map teamId -> global playerId)
    filteredParticipations.value
        .filter(p => p.tournamentId === t.id && p.teamId === winningTeam.id)
        .forEach(p => {
          const stats = playerStats.get(p.playerId);
          if (stats) stats.tournamentWins++;
        });
  });

  // 3. Count races, wins, and dominance
  filteredRaces.value.forEach(race => {
    const playersInRace = Object.keys(race.placements).length;
    if (playersInRace <= 1) return;

    Object.entries(race.placements).forEach(([playerId, position]) => {
      const stats = playerStats.get(playerId);
      if (stats) {
        stats.races++;
        if (position === 1) stats.wins++;
        stats.opponentsFaced += (playersInRace - 1);
        stats.opponentsBeaten += (playersInRace - position);
      }
    });
  });

  // 4. Calculate averages and win rates
  playerStats.forEach(stats => {
    stats.avgPoints = stats.races > 0
        ? Math.round(stats.totalPoints / stats.races * 10) / 10
        : 0;
    stats.dominance = stats.opponentsFaced > 0
        ? Math.round((stats.opponentsBeaten / stats.opponentsFaced) * 100 * 10) / 10
        : 0;
    stats.winRate = stats.races > 0
        ? Math.round((stats.wins / stats.races) * 100 * 10) / 10
        : 0;

    // Calculate Tournament Win Rate (based ONLY on completed tournaments)
    stats.tournamentWinRate = stats.completedTournaments > 0
        ? Math.round((stats.tournamentWins / stats.completedTournaments) * 100 * 10) / 10
        : 0;
  });

  // 5. Filter and Sort
  return Array.from(playerStats.values())
      .filter(p => p.tournaments >= minTournaments.value)
      .sort((a, b) => {
        let valA: any = playerSortKey.value === 'name' ? a.player.name.toLowerCase() : (a as any)[playerSortKey.value];
        let valB: any = playerSortKey.value === 'name' ? b.player.name.toLowerCase() : (b as any)[playerSortKey.value];

        const modifier = playerSortDesc.value ? -1 : 1;
        if (valA < valB) return -1 * modifier;
        if (valA > valB) return 1 * modifier;
        return 0;
      });
});

// Uma Stats
const umaStats = computed(() => {
  const umaData = new Map<string, {
    name: string;
    timesPlayed: number;
    wins: number;
    totalPosition: number;
    winRate: number;
    avgPosition: number;
    opponentsFaced: number;
    opponentsBeaten: number;
    dominance: number;
    tournamentIds: Set<string>; // 👈 NEW: Track unique tournaments
    tournamentCount: number;    // 👈 NEW: Final count
  }>();

  filteredRaces.value.forEach(race => {
    const playersInRace = Object.keys(race.placements).length;
    if (playersInRace <= 1) return;

    Object.entries(race.umaMapping || {}).forEach(([playerId, uma]) => {
      if (!uma) return;

      if (!umaData.has(uma)) {
        umaData.set(uma, {
          name: uma,
          timesPlayed: 0,
          wins: 0,
          totalPosition: 0,
          winRate: 0,
          avgPosition: 0,
          opponentsFaced: 0,
          opponentsBeaten: 0,
          dominance: 0,
          tournamentIds: new Set<string>(),
          tournamentCount: 0
        });
      }

      const stats = umaData.get(uma)!;
      stats.timesPlayed++;

      // Track which tournament this race belonged to
      if (race.tournamentId) {
        stats.tournamentIds.add(race.tournamentId);
      }

      const position = race.placements[playerId];
      if (position) {
        stats.totalPosition += position;
        if (position === 1) stats.wins++;
        stats.opponentsFaced += (playersInRace - 1);
        stats.opponentsBeaten += (playersInRace - position);
      }
    });
  });

  // Calculate stats
  umaData.forEach(stats => {
    stats.tournamentCount = stats.tournamentIds.size; // Finalize the count
    stats.winRate = stats.timesPlayed > 0
        ? Math.round((stats.wins / stats.timesPlayed) * 100 * 10) / 10
        : 0;
    stats.avgPosition = stats.timesPlayed > 0
        ? Math.round((stats.totalPosition / stats.timesPlayed) * 10) / 10
        : 0;
    stats.dominance = stats.opponentsFaced > 0
        ? Math.round((stats.opponentsBeaten / stats.opponentsFaced) * 100 * 10) / 10
        : 0;
  });

  return Array.from(umaData.values())
      .filter(u => u.tournamentCount >= minTournaments.value)
      .sort((a, b) => {
        let valA: any = umaSortKey.value === 'name' ? a.name.toLowerCase() : (a as any)[umaSortKey.value];
        let valB: any = umaSortKey.value === 'name' ? b.name.toLowerCase() : (b as any)[umaSortKey.value];

        const modifier = umaSortDesc.value ? -1 : 1;
        if (valA < valB) return -1 * modifier;
        if (valA > valB) return 1 * modifier;
        return 0;
      });
});

// Top Umas by Win Rate
const topUmasByWinRate = computed(() => {
  // Since umaStats is already filtered by the slider, we just sort and slice!
  return [...umaStats.value]
      .sort((a, b) => b.winRate - a.winRate)
      .slice(0, 10);
});

// Fetch all data
onMounted(async () => {
  loading.value = true;

  try {
    // Fetch Seasons
    const seasonsSnap = await getDocs(
        query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'seasons'), orderBy('startDate', 'desc'))
    );
    seasons.value = seasonsSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Season));

    // Fetch Players
    const playersSnap = await getDocs(
        collection(db, 'artifacts', APP_ID, 'public', 'data', 'players')
    );
    players.value = playersSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as GlobalPlayer));

    // Fetch Participations
    const participationsSnap = await getDocs(
        collection(db, 'artifacts', APP_ID, 'public', 'data', 'participations')
    );
    participations.value = participationsSnap.docs.map(doc => doc.data() as TournamentParticipation);

    // Fetch Races
    const racesSnap = await getDocs(
        collection(db, 'artifacts', APP_ID, 'public', 'data', 'races')
    );
    races.value = racesSnap.docs.map(doc => doc.data() as RaceDocument);

    // Fetch Tournaments
    const tournamentsSnap = await getDocs(
        collection(db, 'artifacts', APP_ID, 'public', 'data', 'tournaments')
    );
    tournaments.value = tournamentsSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Tournament));

  } catch (e) {
    console.error('Failed to fetch analytics data:', e);
  } finally {
    loading.value = false;
  }
});

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
      <div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between relative">

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

    <!-- Header -->

    <main class="flex-grow max-w-7xl mx-auto p-4 md:p-6 w-full space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-black text-white uppercase tracking-wider">Analytics Dashboard</h1>
          <p class="text-slate-400 mt-1">Cross-tournament statistics and insights</p>
        </div>

        <div v-if="loading" class="flex items-center gap-2 text-slate-400">
          <i class="ph ph-circle-notch animate-spin"></i>
          Loading data...
        </div>
      </div>

      <div class="flex gap-2 border-b border-slate-700 mb-6">
      </div>

      <div class="bg-slate-800 border border-slate-700 rounded-xl p-5 mb-6 flex flex-col lg:flex-row gap-8 lg:items-center">

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
                :max="Math.max(1, tournaments.length)"
                class="w-full h-2 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all"
            />
            <div class="flex justify-between text-[10px] text-slate-500 font-bold mt-2 px-1">
              <span>1</span>
              <span>{{ Math.max(1, tournaments.length) }}</span>
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
      </div>

      <!-- Tabs -->
      <div class="flex gap-2 border-b border-slate-700">
        <button
            v-for="tab in [
            { id: 'overview', label: 'Overview', icon: 'ph-chart-line' },
            { id: 'players', label: 'Players', icon: 'ph-users' },
            { id: 'umas', label: 'Umas', icon: 'ph-horse' },
            { id: 'tournaments', label: 'Tournaments', icon: 'ph-trophy' }
          ]"
            :key="tab.id"
            @click="activeTab = tab.id as any"
            class="px-4 py-3 font-bold transition-all relative"
            :class="activeTab === tab.id
            ? 'text-indigo-400 border-b-2 border-indigo-400'
            : 'text-slate-400 hover:text-white'"
        >
          <i :class="tab.icon" class="mr-2"></i>
          {{ tab.label }}
        </button>
      </div>

      <!-- Overview Tab -->
      <div v-if="activeTab === 'overview'" class="space-y-6">

        <!-- Stats Grid -->
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

        <!-- Quick Rankings -->
        <div class="grid lg:grid-cols-2 gap-6">

          <!-- Top Players -->
          <div class="bg-slate-800 border border-slate-700 rounded-xl p-6">
            <h3 class="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <i class="ph-fill ph-trophy text-amber-400"></i>
              Top 5 Players by Total Points
            </h3>

            <div class="space-y-3">
              <div
                  v-for="(player, idx) in playerRankings.slice(0, 5)"
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
                  <div class="text-lg font-bold text-white">{{ player.totalPoints }}</div>
                  <div class="text-xs text-slate-400">pts</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Top Umas -->
          <div class="bg-slate-800 border border-slate-700 rounded-xl p-6">
            <h3 class="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <i class="ph-fill ph-horse text-indigo-400"></i>
              Top 5 Umas by Win Rate (min. 10 races)
            </h3>

            <div class="space-y-3">
              <div
                  v-for="(uma, idx) in topUmasByWinRate.slice(0, 5)"
                  :key="uma.name"
                  class="flex items-center gap-3 p-3 bg-slate-900 rounded-lg border border-slate-700"
              >
                <div class="text-2xl" :class="getRankColor(idx)">
                  {{ idx + 1 }}
                </div>

                <div class="flex-1 min-w-0">
                  <div class="font-bold text-white truncate">{{ uma.name }}</div>
                  <div class="text-xs text-slate-400">
                    {{ uma.timesPlayed }} races • {{ uma.wins }} wins
                  </div>
                </div>

                <div class="text-right">
                  <div class="text-lg font-bold text-emerald-400">{{ uma.winRate }}%</div>
                  <div class="text-xs text-slate-400">win rate</div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- Players Tab -->
      <div v-if="activeTab === 'players'" class="space-y-4">

        <!-- Search -->
        <input
            v-model="searchQuery"
            type="text"
            placeholder="Search players..."
            class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
        />

        <!-- Player List -->
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
                  { key: 'tournamentWinRate', label: 'T. Win %' },
                  { key: 'races', label: 'Races' },
                  { key: 'totalPoints', label: 'Total Pts' },
                  { key: 'avgPoints', label: 'Avg Pts' },
                  { key: 'dominance', label: 'Dominance' },
                  { key: 'wins', label: 'Race Wins' },
                  { key: 'winRate', label: 'Race Win %' },
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
              <tbody class="divide-y divide-slate-700">
                <tr
                    v-for="(player, idx) in playerRankings.filter(p =>
                      !searchQuery || p.player.name.toLowerCase().includes(searchQuery.toLowerCase())
                    )"
                    :key="player.player.id"
                    class="hover:bg-slate-700/50 transition-colors"
                >
                  <td class="px-4 py-3 text-sm" :class="getRankColor(idx)">
                    <i v-if="idx < 3" :class="getRankIcon(idx)"></i>
                    <span v-else>{{ idx + 1 }}</span>
                  </td>
                  <td class="px-4 py-3 text-sm font-bold text-white">{{ player.player.name }}</td>

                  <td class="px-4 py-3 text-sm text-right text-slate-300">{{ player.tournaments }}</td>
                  <td class="px-4 py-3 text-sm text-right font-bold text-amber-400">{{ player.tournamentWins }}</td>
                  <td class="px-4 py-3 text-sm text-right font-bold text-amber-400">{{ player.tournamentWinRate }}%</td>

                  <td class="px-4 py-3 text-sm text-right text-slate-300">{{ player.races }}</td>
                  <td class="px-4 py-3 text-sm text-right font-bold text-white">{{ player.totalPoints }}</td>
                  <td class="px-4 py-3 text-sm text-right text-indigo-400">{{ player.avgPoints }}</td>
                  <td class="px-4 py-3 text-sm text-right font-bold text-rose-400">{{ player.dominance }}%</td>
                  <td class="px-4 py-3 text-sm text-right text-emerald-400">{{ player.wins }}</td>
                  <td class="px-4 py-3 text-sm text-right font-bold text-emerald-400">{{ player.winRate }}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Umas Tab -->
      <div v-if="activeTab === 'umas'" class="space-y-4">

        <!-- Uma List -->
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
                    { key: 'timesPlayed', label: 'Times Played' },
                    { key: 'wins', label: 'Wins' },
                    { key: 'winRate', label: 'Win Rate' },
                    { key: 'dominance', label: 'Dominance' },
                    { key: 'avgPosition', label: 'Avg Position' }
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
              <tr
                  v-for="(uma, idx) in umaStats"
                  :key="uma.name"
                  class="hover:bg-slate-700/50 transition-colors"
              >
                <td class="px-4 py-3 text-sm text-slate-400">{{ idx + 1 }}</td>
                <td class="px-4 py-3 text-sm font-bold text-white">{{ uma.name }}</td>
                <td class="px-4 py-3 text-sm text-right text-slate-300">{{ uma.timesPlayed }}</td>
                <td class="px-4 py-3 text-sm text-right text-emerald-400">{{ uma.wins }}</td>
                <td class="px-4 py-3 text-sm text-right font-bold text-indigo-400">{{ uma.winRate }}%</td>
                <td class="px-4 py-3 text-sm text-right font-bold text-rose-400">{{ uma.dominance }}%</td>
                <td class="px-4 py-3 text-sm text-right text-amber-400">{{ uma.avgPosition }}</td>
              </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Tournaments Tab -->
      <div v-if="activeTab === 'tournaments'" class="space-y-4">
        <div class="bg-slate-800 border border-slate-700 rounded-xl p-6 text-center text-slate-400">
          <i class="ph ph-construction text-6xl mb-4"></i>
          <p>Tournament comparison view coming soon...</p>
        </div>
      </div>
    </main>

  </div>
</template>