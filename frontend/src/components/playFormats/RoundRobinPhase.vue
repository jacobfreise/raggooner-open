<script setup lang="ts">
import { computed } from 'vue';
import type { Tournament, FirestoreUpdate, GlobalPlayer } from '../../types';
import { compareTeams } from '../../utils/utils';
import RaceCard from './race/RaceCard.vue';

const props = defineProps<{
  tournamentProp: Tournament;
  isAdmin: boolean;
  appId: string;
  secureUpdate: (data: FirestoreUpdate<Tournament> | Record<string, any>) => Promise<void>;
  globalPlayers: GlobalPlayer[];
}>();

const tData = computed(() => props.tournamentProp);

// 1. Generate the 3v3v3 Matchups dynamically
const roundRobinRaces = computed(() => {
  const teams = tData.value.teams;
  const races = [];
  const n = teams.length;
  let raceNumber = 1;

  // Combination logic for exactly 3 teams per race
  for (let i = 0; i < n - 2; i++) {
    for (let j = i + 1; j < n - 1; j++) {
      for (let k = j + 1; k < n; k++) {
        const raceTeams = [teams[i]!, teams[j]!, teams[k]!];
        races.push({
          raceNumber: raceNumber++,
          teams: raceTeams,
          activePlayers: raceTeams.flatMap(t => [t.captainId, ...t.memberIds])
        });
      }
    }
  }
  return races;
});

// 2. Global Leaderboard (No A/B/C separation)
const globalLeaderboard = computed(() => {
  return [...tData.value.teams].sort((a, b) => compareTeams(a, b, true, tData.value, false));
});
</script>

<template>
  <div class="space-y-8 animate-fade-in text-white">

    <div class="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-xl">
      <h3 class="text-xl font-black uppercase tracking-widest mb-4 text-indigo-400">
        Round Robin Standings
      </h3>

      <div class="space-y-2">
        <div v-for="(team, index) in globalLeaderboard" :key="team.id"
             class="flex items-center justify-between bg-slate-900 p-3 rounded-lg border border-slate-700">
          <div class="flex items-center gap-4">
            <span class="text-xl font-bold text-slate-500 w-6 text-center">{{ index + 1 }}</span>
            <div class="w-4 h-4 rounded-full" :style="{ backgroundColor: team.color }"></div>
            <span class="font-bold text-lg">{{ team.name }}</span>
          </div>
          <div class="text-2xl font-black text-white tabular-nums">
            {{ team.points }} <span class="text-xs text-slate-500">pts</span>
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div v-for="race in roundRobinRaces" :key="race.raceNumber" class="relative">

        <RaceCard
            :group="''"
            stage="round-robin"
            :race-number="race.raceNumber"
            :tournament-prop="tData"
            :is-admin="isAdmin"
            :secure-update="secureUpdate"
            :global-players="globalPlayers"
            :active-players="race.activePlayers"
        />

        <div class="absolute -top-3 left-4 bg-slate-900 border border-slate-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2 shadow-md">
          <span class="text-slate-500">Matchup:</span>
          <span v-for="(team, idx) in race.teams" :key="team!.id" :style="{ color: team!.color }">
            {{ team!.name }} <span v-if="idx < 2" class="text-slate-600">vs</span>
          </span>
        </div>

      </div>
    </div>

  </div>
</template>