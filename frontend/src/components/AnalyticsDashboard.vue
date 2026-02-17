<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import type { GlobalPlayer, TournamentParticipation, RaceDocument, Tournament } from '../types';

const APP_ID = 'default-app';

const loading = ref(true);
const activeTab = ref<'overview' | 'players' | 'umas' | 'tournaments'>('overview');

// Data
const players = ref<GlobalPlayer[]>([]);
const participations = ref<TournamentParticipation[]>([]);
const races = ref<RaceDocument[]>([]);
const tournaments = ref<Tournament[]>([]);

// Filters
const selectedSeason = ref<string | null>(null);
const searchQuery = ref('');

// Overview Stats
const overviewStats = computed(() => {
  return {
    totalPlayers: players.value.length,
    totalTournaments: tournaments.value.length,
    totalRaces: races.value.length,
    totalParticipations: participations.value.length,
    avgPlayersPerTournament: tournaments.value.length > 0
        ? Math.round(participations.value.length / tournaments.value.length)
        : 0,
    avgRacesPerTournament: tournaments.value.length > 0
        ? Math.round(races.value.length / tournaments.value.length)
        : 0
  };
});

// Player Rankings
const playerRankings = computed(() => {
  const playerStats = new Map<string, {
    player: GlobalPlayer;
    tournaments: number;
    races: number;
    totalPoints: number;
    avgPoints: number;
    wins: number;
  }>();

  // Build stats from participations
  participations.value.forEach(p => {
    const player = players.value.find(pl => pl.id === p.playerId);
    if (!player) return;

    if (!playerStats.has(p.playerId)) {
      playerStats.set(p.playerId, {
        player,
        tournaments: 0,
        races: 0,
        totalPoints: 0,
        avgPoints: 0,
        wins: 0
      });
    }

    const stats = playerStats.get(p.playerId)!;
    stats.tournaments++;
    stats.totalPoints += p.totalPoints || 0;
  });

  // Count races and wins
  races.value.forEach(race => {
    Object.entries(race.placements).forEach(([playerId, position]) => {
      const stats = playerStats.get(playerId);
      if (stats) {
        stats.races++;
        if (position === 1) stats.wins++;
      }
    });
  });

  // Calculate averages
  playerStats.forEach(stats => {
    stats.avgPoints = stats.tournaments > 0
        ? Math.round(stats.totalPoints / stats.tournaments * 10) / 10
        : 0;
  });

  return Array.from(playerStats.values())
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .slice(0, 50);
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
  }>();

  races.value.forEach(race => {
    Object.entries(race.umaMapping || {}).forEach(([playerId, uma]) => {
      if (!uma) return;

      if (!umaData.has(uma)) {
        umaData.set(uma, {
          name: uma,
          timesPlayed: 0,
          wins: 0,
          totalPosition: 0,
          winRate: 0,
          avgPosition: 0
        });
      }

      const stats = umaData.get(uma)!;
      stats.timesPlayed++;

      const position = race.placements[playerId];
      if (position) {
        stats.totalPosition += position;
        if (position === 1) stats.wins++;
      }
    });
  });

  // Calculate stats
  umaData.forEach(stats => {
    stats.winRate = stats.timesPlayed > 0
        ? Math.round((stats.wins / stats.timesPlayed) * 100 * 10) / 10
        : 0;
    stats.avgPosition = stats.timesPlayed > 0
        ? Math.round((stats.totalPosition / stats.timesPlayed) * 10) / 10
        : 0;
  });

  return Array.from(umaData.values())
      .filter(u => u.timesPlayed >= 5) // Minimum 5 races
      .sort((a, b) => b.timesPlayed - a.timesPlayed);
});

// Top Umas by Win Rate
const topUmasByWinRate = computed(() => {
  return [...umaStats.value]
      .filter(u => u.timesPlayed >= 10) // Minimum 10 races for ranking
      .sort((a, b) => b.winRate - a.winRate)
      .slice(0, 10);
});

// Fetch all data
onMounted(async () => {
  loading.value = true;

  try {
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
  <div class="max-w-7xl mx-auto p-6 space-y-6">

    <!-- Header -->
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
              <th class="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">#</th>
              <th class="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Player</th>
              <th class="px-4 py-3 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">Tournaments</th>
              <th class="px-4 py-3 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">Races</th>
              <th class="px-4 py-3 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">Total Pts</th>
              <th class="px-4 py-3 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">Avg Pts</th>
              <th class="px-4 py-3 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">Wins</th>
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
              <td class="px-4 py-3 text-sm text-right text-slate-300">{{ player.races }}</td>
              <td class="px-4 py-3 text-sm text-right font-bold text-white">{{ player.totalPoints }}</td>
              <td class="px-4 py-3 text-sm text-right text-indigo-400">{{ player.avgPoints }}</td>
              <td class="px-4 py-3 text-sm text-right text-emerald-400">{{ player.wins }}</td>
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
              <th class="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">#</th>
              <th class="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Uma</th>
              <th class="px-4 py-3 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">Times Played</th>
              <th class="px-4 py-3 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">Wins</th>
              <th class="px-4 py-3 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">Win Rate</th>
              <th class="px-4 py-3 text-right text-xs font-bold text-slate-400 uppercase tracking-wider">Avg Position</th>
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

  </div>
</template>