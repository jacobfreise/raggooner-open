<script setup lang="ts">
import { ref, toRef, computed } from 'vue';
import type { Tournament, FirestoreUpdate, GlobalPlayer, Season } from '../types';
import { useDraft } from '../composables/useDraft';
import { useTournamentFlow } from '../composables/useTournamentFlow';
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
  remainingPicks,
  isDraftComplete,
  showRandomModal,
  randomWheelRotation,
  randomCandidates,
  getRandomWheelGradient
} = useDraft(tournamentRef, props.secureUpdate, isAdminRef);

const { advancePhase, isAdvancing } = useTournamentFlow(tournamentRef, props.secureUpdate);

const sortedAvailablePlayers = computed(() => {
  return [...availablePlayers.value].sort((a, b) => {
    const domA = getDominance(a.id) ?? -1;
    const domB = getDominance(b.id) ?? -1;
    if (domA === domB) return a.name.localeCompare(b.name);
    return domB - domA;
  });
});

</script>

<template>
  <div>
    <div class="space-y-6">
      <!-- Draft in progress: order bar + player grid + sidebar -->
      <template v-if="!isDraftComplete">
        <!-- Header Bar -->
        <div class="sticky top-20 z-30 bg-slate-900/90 backdrop-blur-md p-4 rounded-xl border border-slate-700 shadow-xl flex flex-col sm:flex-row justify-between items-center gap-4">
          <div>
            <h2 class="text-3xl font-bold text-white flex items-center gap-3">
              <i class="ph-fill ph-users-three text-indigo-400"></i>
              Team Draft
            </h2>
            <p class="text-slate-400 text-sm">Captains are picking their team.</p>
          </div>

          <div class="flex items-center gap-4 w-full sm:w-auto">
            <button v-if="isAdmin && tournament.draft && tournament.draft.currentIdx > 0"
                    @click="undoLastPick"
                    class="text-slate-500 hover:text-white flex items-center gap-2 px-3 py-2 rounded hover:bg-slate-800 transition-colors">
              <i class="ph-bold ph-arrow-u-up-left"></i>
              <span class="hidden sm:inline">Undo</span>
            </button>

            <div class="text-right hidden sm:block">
              <div class="text-2xl font-mono font-bold text-indigo-400">
                {{ remainingPicks.length }}
              </div>
              <div class="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Remaining</div>
            </div>
          </div>
        </div>

        <!-- Draft Order Preview -->
        <div class="bg-slate-800 p-4 rounded-xl border border-indigo-500/30 flex flex-col md:flex-row items-center gap-4 shadow-lg shadow-indigo-900/10 overflow-hidden">
          <div class="flex-1 flex items-center gap-3 overflow-x-auto overflow-y-hidden hide-scrollbar">
            <span class="text-slate-400 uppercase text-xs font-bold tracking-wider shrink-0">Lineup:</span>

            <div v-for="(pick, idx) in remainingPicks" :key="pick.id"
                 class="flex items-center shrink-0 transition-all duration-300"
                 :class="pick.isCurrent ? 'scale-110 mx-3 opacity-100' : 'scale-90 opacity-50'">

              <span class="font-bold whitespace-nowrap tracking-wide"
                    :class="pick.isCurrent ? 'text-xl drop-shadow-md' : 'text-sm'"
                    :style="{ color: pick.color }">
                {{ pick.captainName }}
              </span>

              <i v-if="idx < remainingPicks.length - 1"
                 class="ph-bold ph-caret-right text-slate-600 ml-3"
                 :class="pick.isCurrent ? 'text-lg' : 'text-xs'"></i>
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
                      class="h-full w-full bg-slate-800 hover:bg-indigo-600 border border-slate-700 hover:border-indigo-400 p-3 rounded-xl transition-all text-left group relative overflow-hidden flex flex-col justify-between min-h-[80px] shadow-sm hover:shadow-indigo-500/20">

                <span class="relative z-10 font-bold text-slate-200 group-hover:text-white truncate w-full pr-4">
                  {{ player.name }}
                </span>

                <div v-if="getDominance(player.id) !== null"
                     class="relative z-10 mt-3 flex items-center gap-1.5 w-fit px-2 py-1 rounded-md bg-slate-900/60 group-hover:bg-indigo-900/40 border border-slate-700/50 group-hover:border-indigo-400/30 transition-colors">
                  <i class="ph-fill ph-sword text-indigo-400 group-hover:text-indigo-300 text-xs"></i>
                  <span class="text-xs font-bold text-slate-300 group-hover:text-white tracking-wide">
                    {{ getDominance(player.id)!.toFixed(1) }}%
                  </span>
                </div>

                <div class="absolute -bottom-2 -right-2 p-2 text-slate-700 group-hover:text-indigo-400 opacity-20 transition-colors">
                  <i class="ph-fill ph-steering-wheel text-5xl"></i>
                </div>
              </button>
            </div>
          </div>

          <div class="md:col-span-4 space-y-4">
            <h3 class="text-lg font-bold mb-3 text-slate-300">Squads</h3>
            <div v-for="team in tournament.teams" :key="team.id"
                 class="bg-slate-900 border rounded-lg p-4 transition-colors"
                 :class="currentDrafter?.id === team.id ? 'border-indigo-500 ring-1 ring-indigo-500/50' : 'border-slate-800'">
              <div class="flex justify-between items-center mb-2">
                <span class="font-bold text-white" :style="{ color: team.color }">{{ team.name }}</span>
                <i v-if="currentDrafter?.id === team.id" class="ph-fill ph-crosshair text-indigo-400 animate-pulse"></i>
              </div>
              <div class="space-y-2">
                <div class="flex items-center gap-2 text-sm text-amber-400">
                  <i class="ph-fill ph-crown"></i> {{ getPlayerName(tournament, team.captainId) }}
                </div>
                <div v-for="memberId in team.memberIds" :key="memberId" class="flex items-center gap-2 text-sm text-slate-300 ">
                  <i class="ph-fill ph-user"></i> {{ getPlayerName(tournament, memberId) }}
                </div>
                <div v-for="n in (2 - team.memberIds.length)" :key="n" class="flex items-center gap-2 text-sm text-slate-700  border-dashed border border-slate-800 p-1 rounded">
                  <span class="text-xs">Empty Slot</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Draft complete: full-width team overview + confirm button -->
      <template v-else>
        <div class="bg-slate-800/50 border border-emerald-500/30 rounded-xl p-6 text-center space-y-4">
          <div class="flex items-center justify-center gap-3">
            <i class="ph-fill ph-check-circle text-emerald-400 text-3xl"></i>
            <h3 class="text-2xl font-bold text-white">Draft Complete</h3>
          </div>
          <p class="text-slate-400">All players have been drafted. Review the squads below, then continue.</p>

          <div class="flex items-center justify-center gap-3">
            <button v-if="isAdmin"
                    @click="undoLastPick"
                    class="text-slate-500 hover:text-white flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-slate-700 transition-colors border border-slate-700">
              <i class="ph-bold ph-arrow-u-up-left"></i> Undo Last Pick
            </button>
            <button @click="advancePhase"
                    :disabled="!isAdmin || isAdvancing"
                    class="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-lg font-bold shadow-lg shadow-indigo-900/20 transition-all flex items-center gap-2">
              <template v-if="isAdvancing">
                <i class="ph ph-spinner animate-spin"></i> Advancing...
              </template>
              <template v-else>
                <span>Continue</span>
                <i class="ph-bold ph-arrow-right"></i>
              </template>
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div v-for="team in tournament.teams" :key="team.id"
               class="bg-slate-900 border border-slate-800 rounded-lg p-4">
            <div class="flex justify-between items-center mb-2">
              <span class="font-bold text-white" :style="{ color: team.color }">{{ team.name }}</span>
            </div>
            <div class="space-y-2">
              <div class="flex items-center gap-2 text-sm text-amber-400">
                <i class="ph-fill ph-crown"></i> {{ getPlayerName(tournament, team.captainId) }}
              </div>
              <div v-for="memberId in team.memberIds" :key="memberId" class="flex items-center gap-2 text-sm text-slate-300 ">
                <i class="ph-fill ph-user"></i> {{ getPlayerName(tournament, memberId) }}
              </div>
            </div>
          </div>
        </div>
      </template>
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
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
.hide-scrollbar {
  -ms-overflow-style: none; /* IE and Edge */
  scrollbar-width: none; /* Firefox */
}
</style>