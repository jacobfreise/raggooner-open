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
const activeTab = ref<'overview' | 'players' | 'umas' | 'tierlist' | 'tournaments'>('overview');

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

const expandedPlayerId = ref<string | null>(null);

const togglePlayerExpand = (playerId: string) => {
  if (expandedPlayerId.value === playerId) {
    expandedPlayerId.value = null; // Close if already open
  } else {
    expandedPlayerId.value = playerId; // Open new row
  }
};

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
        ? Math.round(filteredParticipations.value.length / filteredTournaments.value.length * 10) / 10
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
    completedTournaments: number;
    tournamentWins: number;
    tournamentWinRate: number;
    races: number;
    totalPoints: number;
    avgPoints: number;
    wins: number;
    opponentsFaced: number;
    opponentsBeaten: number;
    dominance: number;
    winRate: number;
    // --- NEW: Detailed Tracking ---
    tournamentsRecord: { tId: string, tName: string, points: number }[];
    umas: Map<string, {
      tournamentIds: Set<string>, // Tracks unique tournaments
      racesPlayed: number,        // Tracks total races for math
      wins: number,
      totalPosition: number
    }>;
    bestTournament: { tId: string, tName: string, points: number } | null;
    mostPickedUmas: { name: string, count: number, wins: number, avgPosition: number }[];
    mostWinningUmas: { name: string, count: number, wins: number, winRate: number }[];
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
        tournamentsRecord: [],
        umas: new Map(),
        bestTournament: null,
        mostPickedUmas: [],
        mostWinningUmas: []
      });
    }

    const stats = playerStats.get(p.playerId)!;
    stats.tournaments++;
    stats.totalPoints += p.totalPoints || 0;

    const t = tournaments.value.find(tourney => tourney.id === p.tournamentId);
    if (t) {
      if (t.status === 'completed') stats.completedTournaments++;
      // Track tournament performance
      stats.tournamentsRecord.push({
        tId: t.id,
        tName: t.name,
        points: p.totalPoints || 0
      });
    }
  });

  // 2. Count Tournament Wins
  filteredTournaments.value.filter(t => t.status === 'completed').forEach(t => {
    if (!t.teams || t.teams.length === 0) return;
    const finalistTeams = t.teams.filter(team => team.inFinals);
    if (finalistTeams.length === 0) return;

    const sorted = [...finalistTeams].sort((a, b) => compareTeams(a, b, true, t, true));
    const winningTeam = sorted[0];
    if (!winningTeam) return;

    filteredParticipations.value
        .filter(p => p.tournamentId === t.id && p.teamId === winningTeam.id)
        .forEach(p => {
          const stats = playerStats.get(p.playerId);
          if (stats) stats.tournamentWins++;
        });
  });

  // 3. Count races, wins, dominance, and specific Uma usage
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

        // Track Uma specific to this player
        const umaName = race.umaMapping?.[playerId];
        if (umaName) {
          if (!stats.umas.has(umaName)) {
            stats.umas.set(umaName, {
              tournamentIds: new Set(),
              racesPlayed: 0,
              wins: 0,
              totalPosition: 0
            });
          }
          const umaStat = stats.umas.get(umaName)!;

          // Add the tournament ID to the set (Sets automatically prevent duplicates)
          if (race.tournamentId) {
            umaStat.tournamentIds.add(race.tournamentId);
          }

          umaStat.racesPlayed++;
          umaStat.totalPosition += position;
          if (position === 1) umaStat.wins++;
        }
      }
    });
  });

  // 4. Calculate averages and find "Bests"
  playerStats.forEach(stats => {
    stats.avgPoints = stats.races > 0 ? Math.round(stats.totalPoints / stats.races * 10) / 10 : 0;
    stats.dominance = stats.opponentsFaced > 0 ? Math.round((stats.opponentsBeaten / stats.opponentsFaced) * 100 * 10) / 10 : 0;
    stats.winRate = stats.races > 0 ? Math.round((stats.wins / stats.races) * 100 * 10) / 10 : 0;
    stats.tournamentWinRate = stats.completedTournaments > 0 ? Math.round((stats.tournamentWins / stats.completedTournaments) * 100 * 10) / 10 : 0;

    // Calculate Best Tournament
    if (stats.tournamentsRecord.length > 0) {
      stats.bestTournament = [...stats.tournamentsRecord].sort((a, b) => b.points - a.points)[0] || null;
    }

    // Calculate Most Picked and Most Winning Umas
    let maxTourneyPicks = 0;
    let maxWins = 0;

    stats.umas.forEach((val, key) => {
      const tourneyCount = val.tournamentIds.size;

      // --- MOST PICKED ---
      if (tourneyCount > maxTourneyPicks) {
        // New record: reset array
        maxTourneyPicks = tourneyCount;
        stats.mostPickedUmas = [{
          name: key,
          count: tourneyCount,
          wins: val.wins,
          avgPosition: val.racesPlayed > 0 ? Math.round((val.totalPosition / val.racesPlayed) * 10) / 10 : 0
        }];
      } else if (tourneyCount === maxTourneyPicks && tourneyCount > 0) {
        // Tie: add to array
        stats.mostPickedUmas.push({
          name: key,
          count: tourneyCount,
          wins: val.wins,
          avgPosition: val.racesPlayed > 0 ? Math.round((val.totalPosition / val.racesPlayed) * 10) / 10 : 0
        });
      }

      // --- MOST WINNING ---
      if (val.wins > maxWins) {
        // New record: reset array
        maxWins = val.wins;
        stats.mostWinningUmas = [{
          name: key,
          count: val.racesPlayed,
          wins: val.wins,
          winRate: val.racesPlayed > 0 ? Math.round((val.wins / val.racesPlayed) * 100) : 0
        }];
      } else if (val.wins === maxWins && maxWins > 0) {
        // Tie: add to array
        stats.mostWinningUmas.push({
          name: key,
          count: val.racesPlayed,
          wins: val.wins,
          winRate: val.racesPlayed > 0 ? Math.round((val.wins / val.racesPlayed) * 100) : 0
        });
      }
    });
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
// Uma Stats
const umaStats = computed(() => {
  const umaData = new Map<string, {
    name: string;
    timesPlayed: number;
    picks: number;
    wins: number;
    bans: number;
    totalPosition: number;
    winRate: number;
    banRate: number;
    pickRate: number;
    presence: number;
    avgPosition: number;
    opponentsFaced: number;
    opponentsBeaten: number;
    dominance: number;
    tournamentIds: Set<string>;
    presenceTournaments: Set<string>;
    pickInstances: Set<string>;
    tournamentCount: number;
    totalPicks: number;
  }>();

  // Helper to initialize a clean Uma object
  const initUma = (name: string) => ({
    name,
    timesPlayed: 0,
    picks: 0,
    wins: 0,
    bans: 0,
    totalPosition: 0,
    winRate: 0,
    banRate: 0,
    pickRate: 0,
    presence: 0,
    avgPosition: 0,
    opponentsFaced: 0,
    opponentsBeaten: 0,
    dominance: 0,
    tournamentIds: new Set<string>(),
    presenceTournaments: new Set<string>(),
    pickInstances: new Set<string>(),
    tournamentCount: 0,
    totalPicks: 0
  });

  // 1. Process Bans
  filteredTournaments.value.forEach(t => {
    if (t.bans) {
      t.bans.forEach(bannedUma => {
        if (!umaData.has(bannedUma)) {
          umaData.set(bannedUma, initUma(bannedUma));
        }
        const stats = umaData.get(bannedUma)!;
        stats.bans++;
        stats.presenceTournaments.add(t.id); // Track presence via ban
      });
    }
  });

  // 2. Process Races & Picks
  filteredRaces.value.forEach(race => {
    const playersInRace = Object.keys(race.placements).length;
    if (playersInRace <= 1) return;

    Object.entries(race.umaMapping || {}).forEach(([playerId, uma]) => {
      if (!uma) return;

      if (!umaData.has(uma)) {
        umaData.set(uma, initUma(uma));
      }

      const stats = umaData.get(uma)!;
      stats.timesPlayed++;

      if (race.tournamentId) {
        stats.tournamentIds.add(race.tournamentId);
        stats.presenceTournaments.add(race.tournamentId); // Track presence via play

        // A "Pick" is a unique combination of a Tournament and a Player
        stats.pickInstances.add(`${race.tournamentId}_${playerId}`);
        // A "Pick" is when an Uma has been picked at least once by a Player in a Tournament
        // stats.pickInstances.add(race.tournamentId);
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

  // 3. Calculate final percentages and averages
  const totalTournaments = filteredTournaments.value.length;

  let totalOverallPicks = 0;
  umaData.forEach(stats => {
    stats.tournamentCount = stats.presenceTournaments.size;
    stats.picks = stats.pickInstances.size;
    totalOverallPicks += stats.picks;
  });

  umaData.forEach(stats => {
    stats.totalPicks = totalOverallPicks
    stats.tournamentCount = stats.presenceTournaments.size; // Slider now filters by Presence!
    stats.picks = stats.pickInstances.size;

    stats.winRate = stats.timesPlayed > 0
        ? Math.round((stats.wins / stats.timesPlayed) * 100 * 10) / 10
        : 0;
    stats.avgPosition = stats.timesPlayed > 0
        ? Math.round((stats.totalPosition / stats.timesPlayed) * 10) / 10
        : 0;
    stats.dominance = stats.opponentsFaced > 0
        ? Math.round((stats.opponentsBeaten / stats.opponentsFaced) * 100 * 10) / 10
        : 0;

    stats.banRate = totalTournaments > 0
        ? Math.round((stats.bans / totalTournaments) * 100 * 10) / 10
        : 0;
    stats.pickRate = totalOverallPicks > 0
        ? Math.round((stats.picks / totalOverallPicks) * 100 * 10) / 10
        : 0;

    // Presence = (Picks + Bans) / Total Tournaments
    stats.presence = totalTournaments > 0
        ? Math.round((stats.presenceTournaments.size / totalTournaments) * 100 * 10) / 10
        : 0;
  });

  // 4. Sort and Filter
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

// Tier List
const TIERS = [
  { tier: 'S', min: 66, color: 'from-amber-500/20 to-amber-600/5', border: 'border-amber-500/50', text: 'text-amber-400', badge: 'bg-amber-500' },
  { tier: 'A', min: 50, color: 'from-emerald-500/20 to-emerald-600/5', border: 'border-emerald-500/50', text: 'text-emerald-400', badge: 'bg-emerald-500' },
  { tier: 'B', min: 30, color: 'from-blue-500/20 to-blue-600/5', border: 'border-blue-500/50', text: 'text-blue-400', badge: 'bg-blue-500' },
  { tier: 'C', min: 10, color: 'from-purple-500/20 to-purple-600/5', border: 'border-purple-500/50', text: 'text-purple-400', badge: 'bg-purple-500' },
  { tier: 'D', min: 3, color: 'from-orange-500/20 to-orange-600/5', border: 'border-orange-500/50', text: 'text-orange-400', badge: 'bg-orange-500' },
  { tier: 'F', min: 0, color: 'from-red-500/20 to-red-600/5', border: 'border-red-500/50', text: 'text-red-400', badge: 'bg-red-500' },
] as const;

const tierListMode = ref<'players' | 'umas'>('players');

function assignTier(dominance: number) {
  for (const t of TIERS) {
    if (dominance >= t.min) return t.tier;
  }
  return 'F';
}

const playerTierList = computed(() => {
  const tiers = new Map<string, typeof playerRankings.value>();
  for (const t of TIERS) tiers.set(t.tier, []);

  for (const p of playerRankings.value) {
    const tier = assignTier(p.dominance);
    tiers.get(tier)!.push(p);
  }

  // Sort within each tier by dominance descending
  for (const [, entries] of tiers) {
    entries.sort((a, b) => b.dominance - a.dominance);
  }

  return TIERS
    .map(t => ({ ...t, entries: tiers.get(t.tier)! }))
    .filter(t => t.entries.length > 0);
});

const umaTierList = computed(() => {
  const tiers = new Map<string, typeof umaStats.value>();
  for (const t of TIERS) tiers.set(t.tier, []);

  for (const u of umaStats.value) {
    const tier = assignTier(u.dominance);
    tiers.get(tier)!.push(u);
  }

  for (const [, entries] of tiers) {
    entries.sort((a, b) => b.dominance - a.dominance);
  }

  return TIERS
    .map(t => ({ ...t, entries: tiers.get(t.tier)! }))
    .filter(t => t.entries.length > 0);
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
            { id: 'tierlist', label: 'Tier List', icon: 'ph-ranking' },
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
              <tbody class="divide-y divide-slate-700 border-t border-slate-700">
                <template
                    v-for="(player, idx) in playerRankings.filter(p =>
                        !searchQuery || p.player.name.toLowerCase().includes(searchQuery.toLowerCase())
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
                    <td class="px-4 py-3 text-sm text-right font-bold text-white">{{ player.totalPoints }}</td>
                    <td class="px-4 py-3 text-sm text-right text-indigo-400">{{ player.avgPoints }}</td>
                    <td class="px-4 py-3 text-sm text-right font-bold text-rose-400">{{ player.dominance }}%</td>
                    <td class="px-4 py-3 text-sm text-right text-emerald-400">{{ player.wins }}</td>
                    <td class="px-4 py-3 text-sm text-right font-bold text-emerald-400">{{ player.winRate }}%</td>
                  </tr>

                  <tr v-if="expandedPlayerId === player.player.id" class="bg-slate-900/50">
                    <td colspan="11" class="p-0 border-b-2 border-indigo-500/30">
                      <div class="p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in-down">

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

                      </div>
                    </td>
                  </tr>
                </template>
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
                      { key: 'picks', label: 'Picks' },
                      { key: 'pickRate', label: 'Pick %' },
                      { key: 'bans', label: 'Bans' },
                      { key: 'banRate', label: 'Ban %' },
                      { key: 'presence', label: 'Presence %' },
                      { key: 'timesPlayed', label: 'Races' },
                      { key: 'wins', label: 'Race Wins' },
                      { key: 'winRate', label: 'Win Rate' },
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
                <tr
                    v-for="(uma, idx) in umaStats"
                    :key="uma.name"
                    class="hover:bg-slate-700/50 transition-colors"
                >
                  <td class="px-4 py-3 text-sm text-slate-400">{{ idx + 1 }}</td>
                  <td class="px-4 py-3 text-sm font-bold text-white">{{ uma.name }}</td>

                  <td class="px-4 py-3 text-sm text-right text-slate-300">{{ uma.picks }}/{{uma.totalPicks}}</td>
                  <td class="px-4 py-3 text-sm text-right text-blue-400">{{ uma.pickRate }}%</td>

                  <td class="px-4 py-3 text-sm text-right text-slate-300">{{ uma.bans }}/{{ filteredTournaments.length}} </td>
                  <td class="px-4 py-3 text-sm text-right text-rose-400">{{ uma.banRate }}%</td>

                  <td class="px-4 py-3 text-sm text-right font-bold text-amber-400">{{ uma.presence }}%</td>

                  <td class="px-4 py-3 text-sm text-right text-slate-400">{{ uma.timesPlayed }}</td>
                  <td class="px-4 py-3 text-sm text-right text-emerald-400">{{ uma.wins }}</td>
                  <td class="px-4 py-3 text-sm text-right font-bold text-emerald-400">{{ uma.winRate }}%</td>
                  <td class="px-4 py-3 text-sm text-right font-bold text-purple-400">{{ uma.dominance }}%</td>
                  <td class="px-4 py-3 text-sm text-right text-slate-400">{{ uma.avgPosition }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Tier List Tab -->
      <div v-if="activeTab === 'tierlist'" class="space-y-4">

        <!-- Toggle Players / Umas -->
        <div class="flex gap-2">
          <button
              @click="tierListMode = 'players'"
              class="px-4 py-2 rounded-lg font-bold text-sm transition-colors"
              :class="tierListMode === 'players'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'"
          >
            <i class="ph-fill ph-users mr-1"></i> Players
          </button>
          <button
              @click="tierListMode = 'umas'"
              class="px-4 py-2 rounded-lg font-bold text-sm transition-colors"
              :class="tierListMode === 'umas'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'"
          >
            <i class="ph-fill ph-horse mr-1"></i> Umas
          </button>
        </div>

        <!-- Player Tier List -->
        <div v-if="tierListMode === 'players'" class="space-y-3">
          <div
              v-for="tier in playerTierList"
              :key="tier.tier"
              class="rounded-xl border overflow-hidden"
              :class="tier.border"
          >
            <div class="flex items-stretch">
              <!-- Tier Badge -->
              <div
                  class="w-16 md:w-20 flex-shrink-0 flex items-center justify-center bg-gradient-to-r"
                  :class="tier.color"
              >
                <span class="text-3xl md:text-4xl font-black" :class="tier.text">{{ tier.tier }}</span>
              </div>

              <!-- Entries -->
              <div class="flex-1 flex flex-wrap gap-2 p-3 bg-slate-900/50">
                <div
                    v-for="p in tier.entries"
                    :key="p.player.id"
                    class="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 flex items-center gap-2 hover:border-slate-500 transition-colors"
                >
                  <span class="font-bold text-white text-sm">{{ p.player.name }}</span>
                  <span class="text-xs px-1.5 py-0.5 rounded font-bold" :class="tier.text + ' bg-slate-900'">{{ p.dominance }}%</span>
                </div>
              </div>
            </div>
          </div>

          <div v-if="playerTierList.length === 0" class="bg-slate-800 border border-slate-700 rounded-xl p-6 text-center text-slate-400">
            No players match the current filters.
          </div>
        </div>

        <!-- Uma Tier List -->
        <div v-if="tierListMode === 'umas'" class="space-y-3">
          <div
              v-for="tier in umaTierList"
              :key="tier.tier"
              class="rounded-xl border overflow-hidden"
              :class="tier.border"
          >
            <div class="flex items-stretch">
              <!-- Tier Badge -->
              <div
                  class="w-16 md:w-20 flex-shrink-0 flex items-center justify-center bg-gradient-to-r"
                  :class="tier.color"
              >
                <span class="text-3xl md:text-4xl font-black" :class="tier.text">{{ tier.tier }}</span>
              </div>

              <!-- Entries -->
              <div class="flex-1 flex flex-wrap gap-2 p-3 bg-slate-900/50">
                <div
                    v-for="u in tier.entries"
                    :key="u.name"
                    class="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 flex items-center gap-2 hover:border-slate-500 transition-colors"
                >
                  <span class="font-bold text-white text-sm">{{ u.name }}</span>
                  <span class="text-xs px-1.5 py-0.5 rounded font-bold" :class="tier.text + ' bg-slate-900'">{{ u.dominance }}%</span>
                </div>
              </div>
            </div>
          </div>

          <div v-if="umaTierList.length === 0" class="bg-slate-800 border border-slate-700 rounded-xl p-6 text-center text-slate-400">
            No umas match the current filters.
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