<script setup lang="ts">
import { ref, toRef, computed } from 'vue';
import type { Tournament, FirestoreUpdate, GlobalPlayer, Season } from '../types';
import { useDraft } from '../composables/useDraft';
import {getPlayerName} from "../utils/utils";

// 1. Define Props
const props = defineProps<{
  tournament: Tournament;
  isAdmin: boolean;
  secureUpdate: (data: FirestoreUpdate<Tournament> | Record<string, any>) => Promise<void>;
  globalPlayers: GlobalPlayer[];
  seasons: Season[];
}>();

// Season filter for dominance stat
const selectedSeasonId = ref<string>(props.tournament.seasonId || 'all');

const getDominance = (playerId: string): number | null => {
  const gp = props.globalPlayers.find(p => p.id === playerId);
  if (!gp) return null;

  let faced: number | undefined;
  let beaten: number | undefined;

  if (selectedSeasonId.value === 'all') {
    faced = gp.metadata.opponentsFaced;
    beaten = gp.metadata.opponentsBeaten;
  } else {
    const seasonData = gp.metadata.seasons?.[selectedSeasonId.value];
    if (!seasonData) return null;
    faced = seasonData.opponentsFaced;
    beaten = seasonData.opponentsBeaten;
  }

  if (!faced || faced === 0) return null;
  return ((beaten || 0) / faced) * 100;
};

// 2. Convert Prop to Ref for the Composable
// The composable expects a Ref<Tournament>, but props.tournament is a reactive object.
// toRef allows us to bridge that gap.
const tournamentRef = toRef(props, 'tournament');
const isAdminRef = toRef(props, 'isAdmin');

// 3. Initialize Composable
const {
  startRandomDraft,
  draftPlayer,
  undoLastPick,
  availablePlayers,
  currentDrafter,
  draftPreview,
  showRandomModal,
  randomWheelRotation,
  randomCandidates,
  getRandomWheelGradient
} = useDraft(tournamentRef, props.secureUpdate, isAdminRef);

const sortedAvailablePlayers = computed(() => {
  return [...availablePlayers.value].sort((a, b) => {
    const domA = getDominance(a.id) ?? -1;
    const domB = getDominance(b.id) ?? -1;
    return domB - domA;
  });
});

</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-3xl font-bold text-white">Team Draft</h2>
        <p class="text-slate-400">Captains are picking their team</p>
      </div>
      <div class="text-right">
        <div class="text-sm text-slate-400">Remaining Pool</div>
        <div class="text-2xl font-mono font-bold">{{ availablePlayers.length }}</div>
      </div>
    </div>
    <div class="bg-slate-800 p-4 rounded-xl border border-indigo-500/30 flex flex-col md:flex-row items-center justify-between gap-4 shadow-lg shadow-indigo-900/10">
      <div class="flex items-center gap-3">
        <span class="text-slate-400 uppercase text-xs font-bold tracking-wider">Current Pick:</span>
        <div class="flex items-center gap-2">
          <span class="text-amber-400 font-bold text-xl heading">{{ currentDrafter?.name }}</span>
          <span class="text-slate-500 text-sm">({{ currentDrafter?.teamName }})</span>
        </div>
      </div>

      <div class="flex items-center gap-4">
        <button @click="undoLastPick"
                :disabled="!isAdmin || (tournament.draft?.currentIdx || 0) === 0"
                class="flex items-center gap-2 px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed text-slate-200 text-sm font-bold transition-colors border border-slate-600">
          <i class="ph-bold ph-arrow-u-up-left"></i> Undo
        </button>

        <div class="flex gap-1">
          <div v-for="idx in draftPreview.length" :key="idx"
               class="w-3 h-3 rounded-full transition-all"
               :class="(idx - 1) === 0 ? 'bg-amber-500 scale-125' : 'bg-slate-700'">
          </div>
        </div>
      </div>
    </div>
    <div class="grid md:grid-cols-12 gap-6">
      <div class="md:col-span-8">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-lg font-bold text-slate-300">Available Players</h3>
          <select v-model="selectedSeasonId"
                  class="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-indigo-500">
            <option value="all">All Time</option>
            <option v-for="season in seasons" :key="season.id" :value="season.id">{{ season.name }}</option>
          </select>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 auto-rows-fr">
          <button @click="startRandomDraft"
                  :disabled="!isAdmin"
                  class="bg-gradient-to-br from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 p-4 rounded-lg shadow-lg border-2 border-amber-300 flex items-center justify-between group relative overflow-hidden transition-all transform hover:scale-[1.02]">

            <div class="relative z-10 text-left">
              <div class="font-black text-amber-900 text-lg uppercase tracking-wider">Random</div>
              <div class="text-amber-900/80 text-xs font-bold">I'm feeling lucky</div>
            </div>

            <div class="relative z-10 text-amber-900 p-2 bg-white/20 rounded-full">
              <i class="ph-bold ph-dice-five text-3xl group-hover:rotate-180 transition-transform duration-500"></i>
            </div>

            <div class="absolute inset-0 bg-white/20 -skew-x-12 -translate-x-full shine-effect"></div>
          </button>
          <button v-for="player in sortedAvailablePlayers" :key="player.id"
                  @click="draftPlayer(player)"
                  :disabled="!isAdmin"
                  class="h-full w-full bg-slate-800 hover:bg-indigo-600 border border-slate-700 hover:border-indigo-400 p-4 rounded-lg transition-all text-left group relative overflow-hidden flex flex-col justify-center">
            <span class="relative z-10 font-medium group-hover:text-white">{{ player.name }}</span>
            <span v-if="getDominance(player.id) !== null" class="relative z-10 text-xs text-slate-500 group-hover:text-slate-300">
              {{ getDominance(player.id)!.toFixed(1) }}% dom
            </span>
            <div class="absolute bottom-0 right-0 p-2 text-slate-700 group-hover:text-indigo-400 opacity-20">
              <i class="ph-fill ph-steering-wheel text-4xl"></i>
            </div>
          </button>
        </div>
      </div>

      <div class="md:col-span-4 space-y-4">
        <h3 class="text-lg font-bold mb-3 text-slate-300">Squads</h3>
        <div v-for="team in tournament.teams" :key="team.id"
             class="bg-slate-900 border rounded-lg p-4 transition-colors"
             :class="currentDrafter?.id === team.captainId ? 'border-amber-500 ring-1 ring-amber-500/50' : 'border-slate-800'">
          <div class="flex justify-between items-center mb-2">
            <span class="font-bold text-white" :style="{ color: team.color }">{{ team.name }}</span>
            <i v-if="currentDrafter?.id === team.captainId" class="ph-fill ph-pencil-simple text-amber-500 animate-pulse"></i>
          </div>
          <div class="space-y-2">
            <div class="flex items-center gap-2 text-sm text-amber-400">
              <i class="ph-fill ph-crown"></i> {{ getPlayerName(tournament, team.captainId) }}
            </div>
            <div v-for="memberId in team.memberIds" :key="memberId" class="flex items-center gap-2 text-sm text-slate-300 ml-2">
              <i class="ph-fill ph-user"></i> {{ getPlayerName(tournament, memberId) }}
            </div>
            <div v-for="n in (2 - team.memberIds.length)" :key="n" class="flex items-center gap-2 text-sm text-slate-700 ml-2 border-dashed border border-slate-800 p-1 rounded">
              <span class="text-xs">Empty Slot</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div v-if="showRandomModal" class="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md">

    <h2 class="text-3xl font-bold text-white mb-8 animate-pulse text-center">
      <span class="text-amber-400">Fate</span> is deciding...
    </h2>

    <div class="relative">
      <div class="absolute -top-8 left-1/2 -translate-x-1/2 z-20 drop-shadow-xl filter">
        <i class="ph-fill ph-caret-down text-6xl text-white"></i>
      </div>

      <div class="w-80 h-80 sm:w-96 sm:h-96 rounded-full border-8 border-slate-800 shadow-[0_0_60px_rgba(245,158,11,0.3)] relative overflow-hidden transition-transform duration-[4000ms] ease-[cubic-bezier(0.25,1,0.5,1)]"
           :style="{
          background: getRandomWheelGradient,
          transform: `rotate(${randomWheelRotation}deg)`
        }">
        <div v-for="(player, idx) in randomCandidates" :key="player.id"
             class="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-[50%] origin-bottom flex justify-center pt-8"
             :style="{ transform: `rotate(${(idx * (360/randomCandidates.length)) + (360/randomCandidates.length/2)}deg)` }">

          <div class="text-white font-black text-xs uppercase drop-shadow-md px-1 py-2 rounded bg-black/20 backdrop-blur-sm truncate max-h-[120px] whitespace-nowrap">
            {{ player.name }}
          </div>
        </div>
      </div>

      <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-slate-800 rounded-full border-4 border-slate-600 z-10 shadow-lg flex items-center justify-center">
        <div class="w-12 h-12 bg-amber-500 rounded-full animate-pulse"></div>
      </div>
    </div>

    <p class="text-slate-500 mt-8 font-mono text-xs">
      Choosing from {{ availablePlayers.length }} Players
    </p>
  </div>
</template>

<style scoped>
/* Move draft-specific styles here if any (like .animate-shine) */
@keyframes shine {
  0% { transform: translateX(-150%) skewX(-12deg); }
  100% { transform: translateX(150%) skewX(-12deg); }
}
.group:hover .shine-effect {
  animation: shine 1s ease-in-out infinite;
}
</style>