<script setup lang="ts">
import { toRef, ref, computed, onMounted } from 'vue';
import type {Tournament, FirestoreUpdate, Team} from '../types';
import { useUmaDraft } from '../composables/useUmaDraft';
import { useTournamentFlow } from '../composables/useTournamentFlow';
import { getPlayerName } from '../utils/utils';

const props = defineProps<{
  tournament: Tournament;
  isAdmin: boolean;
  secureUpdate: (data: FirestoreUpdate<Tournament> | Record<string, any>) => Promise<void>;
}>();

const tournamentRef = toRef(props, 'tournament');
const isAdminRef = toRef(props, 'isAdmin');

const {
  startUmaDraft,
  currentPicker,
  availableUmas,
  remainingPicks,
  isDraftComplete,
  pickUma,
  undoLastPick,
  startRandomUma,
  slotTranslateY,
  slotReel,
  showRandomModal
} = useUmaDraft(tournamentRef, props.secureUpdate, isAdminRef);

const { advancePhase, isAdvancing } = useTournamentFlow(tournamentRef, props.secureUpdate);

const umaSearch = ref('');

const filteredUmas = computed(() => {
  const query = umaSearch.value.toLowerCase();
  return availableUmas.value.filter(u => u.toLowerCase().includes(query));
});

onMounted(async () => {
  const draft = props.tournament.draft;

  // Check if any team has actually drafted an Uma yet
  const hasNoUmas = !props.tournament.teams.some(t => t.umaPool && t.umaPool.length > 0);

  // If there's no draft, OR the current draft is maxed out but no Umas exist
  // (meaning we're looking at the old player draft state), we must initialize.
  if (!draft || draft.order.length === 0 || (draft.currentIdx >= draft.order.length && hasNoUmas)) {
    if (props.isAdmin) {
      await startUmaDraft();
    }
  }
});

// Add this under your other computed properties (like filteredUmas)
const teamsInDraftOrder = computed(() => {
  const draftOrder = props.tournament.draft?.order;
  if (!draftOrder || draftOrder.length === 0) {
    return props.tournament.teams;
  }

  // Array.from(new Set(...)) keeps only the first occurrence of each team ID,
  // perfectly preserving the initial draft order.
  const uniqueTeamIds = Array.from(new Set(draftOrder));

  return uniqueTeamIds
      .map(id => props.tournament.teams.find(t => t.id === id))
      .filter((t): t is Team => t !== undefined);
});
</script>

<template>
  <div class="space-y-6">
    <!-- Draft in progress -->
    <template v-if="!isDraftComplete">
      <!-- Header Bar -->
      <div class="sticky top-20 z-30 bg-slate-900/90 backdrop-blur-md p-4 rounded-xl border border-slate-700 shadow-xl flex flex-col sm:flex-row justify-between items-center gap-4">
        <div>
          <h2 class="text-3xl font-bold text-white flex items-center gap-3">
            <i class="ph-fill ph-horse text-indigo-400"></i>
            Uma Draft
          </h2>
          <p class="text-slate-400 text-sm">Teams draft their Uma pool in snake order.</p>
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
          <span class="text-slate-400 uppercase text-xs font-bold tracking-wider shrink-0">Order:</span>

          <div v-for="(pick, idx) in remainingPicks" :key="pick.id"
               class="flex items-center shrink-0 transition-all duration-300"
               :class="pick.isCurrent ? 'scale-110 mx-3 opacity-100' : 'scale-90 opacity-50'">

            <span class="font-bold whitespace-nowrap tracking-wide"
                  :class="pick.isCurrent ? 'text-xl drop-shadow-md' : 'text-sm'"
                  :style="{ color: pick.color }">
              {{ pick.teamName }}
            </span>

            <i v-if="idx < remainingPicks.length - 1"
               class="ph-bold ph-caret-right text-slate-600 ml-3"
               :class="pick.isCurrent ? 'text-lg' : 'text-xs'"></i>
          </div>
        </div>
      </div>

      <!-- Search -->
      <div class="relative">
        <i class="ph-bold ph-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-xl"></i>
        <input v-model="umaSearch"
               type="text"
               placeholder="Search Umas..."
               class="w-full bg-slate-800 border border-slate-700 rounded-xl py-4 pl-12 pr-4 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-sm">
      </div>

      <!-- Main Grid -->
      <div class="grid md:grid-cols-12 gap-6">
        <!-- Uma Grid -->
        <div class="md:col-span-8">
          <div v-if="filteredUmas.length === 0" class="text-center py-12 text-slate-500">
            No Umas found matching "{{ umaSearch }}"
          </div>
          <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <button @click="startRandomUma"
                    :disabled="!isAdmin"
                    class="col-span-2 sm:col-span-1 bg-gradient-to-br from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 p-4 rounded-lg shadow-lg border-2 border-indigo-400 flex items-center justify-between group relative overflow-hidden transition-all transform hover:scale-[1.02]">
              <div class="relative z-10 text-left">
                <div class="font-black text-white text-lg uppercase tracking-wider">Random</div>
                <div class="text-indigo-100/80 text-xs font-bold">Spin the slot</div>
              </div>
              <div class="relative z-10 text-white p-2 bg-black/20 rounded-full">
                <i class="ph-bold ph-dice-five text-3xl group-hover:rotate-180 transition-transform duration-500"></i>
              </div>
              <div class="absolute inset-0 bg-white/20 -skew-x-12 -translate-x-full shine-effect"></div>
            </button>

            <button v-for="uma in filteredUmas" :key="uma"
                    @click="pickUma(uma)"
                    :disabled="!isAdmin"
                    class="relative group p-4 rounded-lg border-2 text-left transition-all duration-200 overflow-hidden bg-slate-800 border-slate-700 hover:border-indigo-400 hover:bg-slate-750">
              <div class="flex justify-between items-start relative z-10">
                <span class="font-medium text-sm pr-2 text-slate-200 group-hover:text-white">{{ uma }}</span>
                <div class="w-5 h-5 rounded flex items-center justify-center shrink-0 transition-colors bg-slate-700 text-slate-500 group-hover:bg-indigo-500 group-hover:text-white">
                  <i class="ph-bold ph-plus"></i>
                </div>
              </div>
            </button>
          </div>
        </div>

        <!-- Teams Sidebar -->
        <div class="md:col-span-4 space-y-4">
          <h3 class="text-lg font-bold mb-3 text-slate-300">Teams & Pool</h3>
          <div v-for="team in teamsInDraftOrder" :key="team.id"
               class="bg-slate-900 border rounded-lg p-4 transition-colors"
               :class="currentPicker?.id === team.id ? 'border-indigo-500 ring-1 ring-indigo-500/50' : 'border-slate-800'">
            <div class="flex justify-between items-center mb-2">
              <span class="font-bold text-white" :style="{ color: team.color }">{{ team.name }}</span>
              <i v-if="currentPicker?.id === team.id" class="ph-fill ph-crosshair text-indigo-400 animate-pulse"></i>
            </div>
            <div class="space-y-2">
              <div class="flex items-center gap-2 text-sm text-amber-400">
                <i class="ph-fill ph-crown"></i> {{ getPlayerName(tournament, team.captainId) }}
              </div>
              <div v-for="memberId in team.memberIds" :key="memberId" class="flex items-center gap-2 text-sm text-slate-300 ">
                <i class="ph-fill ph-user"></i> {{ getPlayerName(tournament, memberId) }}
              </div>

              <div class="mt-3 pt-3 border-t border-slate-800">
                <div class="text-[10px] uppercase text-slate-500 font-bold tracking-wider mb-2">Uma Pool</div>
                <div v-for="uma in team.umaPool" :key="uma" class="flex items-center gap-2 text-sm text-indigo-300 ">
                  <i class="ph-fill ph-horse"></i> {{ uma }}
                </div>
                <div v-for="n in (3 - (team.umaPool?.length || 0))" :key="n" class="flex items-center gap-2 text-sm text-slate-700  border-dashed border border-slate-800 p-1 rounded">
                  <span class="text-xs">Empty Slot</span>
                </div>
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
          <h3 class="text-2xl font-bold text-white">Uma Draft Complete</h3>
        </div>
        <p class="text-slate-400">All umas have been drafted. Review the pools below, then start the tournament.</p>

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
              <span>Start Tournament</span>
              <i class="ph-bold ph-arrow-right"></i>
            </template>
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div v-for="team in teamsInDraftOrder" :key="team.id"
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

            <div v-if="team.umaPool && team.umaPool.length > 0" class="mt-3 pt-3 border-t border-slate-800">
              <div class="text-[10px] uppercase text-slate-500 font-bold tracking-wider mb-2">Uma Pool</div>
              <div v-for="uma in team.umaPool" :key="uma" class="flex items-center gap-2 text-sm text-indigo-300 ">
                <i class="ph-fill ph-horse"></i> {{ uma }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <div v-if="showRandomModal" class="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md">
      <h2 class="text-3xl font-bold text-white mb-8 animate-pulse text-center">
        Drafting <span class="text-indigo-400">Uma</span>...
      </h2>

      <div class="relative w-80 h-[240px] bg-slate-900 border-4 border-slate-700 rounded-xl overflow-hidden shadow-[0_0_50px_rgba(99,102,241,0.3)]">

        <div class="absolute top-[80px] left-0 w-full h-[80px] border-y-2 border-indigo-500 bg-indigo-500/20 z-20 shadow-[inset_0_0_20px_rgba(99,102,241,0.5)] pointer-events-none"></div>

        <div class="w-full flex flex-col transition-transform duration-[4000ms] ease-[cubic-bezier(0.15,0.85,0.15,1)]"
             :style="{ transform: `translateY(${slotTranslateY}px)` }">
          <div v-for="(uma, idx) in slotReel" :key="idx"
               class="h-[80px] flex items-center justify-center text-xl font-black text-white uppercase tracking-widest text-center px-4 shrink-0">
            {{ uma }}
          </div>
        </div>

        <div class="absolute top-0 left-0 w-full h-[80px] bg-gradient-to-b from-slate-950 to-transparent z-10 pointer-events-none"></div>
        <div class="absolute bottom-0 left-0 w-full h-[80px] bg-gradient-to-t from-slate-950 to-transparent z-10 pointer-events-none"></div>
      </div>
    </div>
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
@keyframes shine {
  0% { transform: translateX(-150%) skewX(-12deg); }
  100% { transform: translateX(150%) skewX(-12deg); }
}
.group:hover .shine-effect {
  animation: shine 1s ease-in-out infinite;
}
</style>
