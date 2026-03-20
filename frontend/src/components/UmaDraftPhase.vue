<script setup lang="ts">
import { toRef, ref, computed, onMounted, onUnmounted } from 'vue';
import type {Tournament, FirestoreUpdate, Team} from '../types';
import { useUmaDraft } from '../composables/useUmaDraft';
import { useTournamentFlow } from '../composables/useTournamentFlow';
import { voicelineVolume, playLocalSfx } from '../composables/useVoicelines';
import { getPlayerName } from '../utils/utils';
import { UMA_DICT } from '../utils/umaData';
import { TRACK_DICT } from '../utils/trackData';
import UmaCard from './UmaCard.vue';
import SlotReel from './shared/SlotReel.vue';

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
  allUmas,
  umaOwnerMap,
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
const selectedAptitude = ref('');

const GRADE_ORDER = ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;

function getAptitudeGrade(umaName: string, aptKey: string): string {
  const data = UMA_DICT[umaName];
  if (!data) return '?';
  const { surface, distance, style } = data.aptitudes;
  
  if (aptKey in surface) return surface[aptKey as keyof typeof surface];
  if (aptKey in distance) return distance[aptKey as keyof typeof distance];
  if (aptKey in style) return style[aptKey as keyof typeof style];
  return '?';
}

const filteredUmas = computed(() => {
  const query = umaSearch.value.toLowerCase();
  let list = allUmas.value.filter(u => u.toLowerCase().includes(query));

  if (selectedAptitude.value) {
    const key = selectedAptitude.value;
    list = [...list].sort((a, b) => {
      const gA = GRADE_ORDER.indexOf(getAptitudeGrade(a, key) as any);
      const gB = GRADE_ORDER.indexOf(getAptitudeGrade(b, key) as any);
      const idxA = gA === -1 ? GRADE_ORDER.length : gA;
      const idxB = gB === -1 ? GRADE_ORDER.length : gB;
      if (idxA !== idxB) return idxA - idxB;
      return a.localeCompare(b);
    });
  }

  return list;
});

const selectedTrackData = computed(() => {
  if (!props.tournament.selectedTrack) return null;
  return TRACK_DICT[props.tournament.selectedTrack] || null;
});

const umaToTeamMap = computed(() => {
  const map = new Map<string, Team>();
  props.tournament.teams.forEach(t => {
    t.umaPool?.forEach(uma => {
      map.set(uma, t);
    });
  });
  return map;
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

const isBanned = (uma: string) => {
  return props.tournament.bans?.includes(uma) ?? false;
};

// --- DRAFT TIMERS ---
const now = ref(Date.now());
let timerInterval: number | null = null;

onMounted(() => {
  timerInterval = window.setInterval(() => {
    now.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  if (timerInterval) clearInterval(timerInterval);
});

const formatTimer = (seconds: number) => {
  if (seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

const phaseElapsed = computed(() => {
  if (!props.tournament.draftPhaseTimerStart) return 0;
  return Math.floor((now.value - new Date(props.tournament.draftPhaseTimerStart).getTime()) / 1000);
});

const sinceLastPick = computed(() => {
  if (!props.tournament.draftLastPickTime) return 0;
  return Math.floor((now.value - new Date(props.tournament.draftLastPickTime).getTime()) / 1000);
});
</script>

<template>
  <div class="space-y-6">
    <!-- Draft in progress -->
    <template v-if="!isDraftComplete">
      <!-- Header Bar -->
      <div class="sticky top-20 z-30 flex flex-col shadow-xl rounded-xl overflow-hidden border border-slate-700 bg-slate-900/95 backdrop-blur-md transition-all">

        <div class="p-4 flex flex-col sm:flex-row justify-between items-center gap-4">
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

            <div class="flex items-center gap-1.5 text-slate-500">
              <i class="ph-bold text-lg shrink-0"
                 :class="voicelineVolume === 0 ? 'ph-speaker-x' : voicelineVolume < 0.5 ? 'ph-speaker-low' : 'ph-speaker-high'"></i>
              <input type="range" min="0" max="1" step="0.05" v-model.number="voicelineVolume"
                     class="w-20 accent-indigo-500 cursor-pointer" />
            </div>

            <div v-if="tournament.draftPhaseTimerStart" class="hidden sm:flex items-center gap-4">
              <div class="text-right">
                <div class="text-2xl font-mono font-bold text-slate-400 tabular-nums">
                  {{ formatTimer(phaseElapsed) }}
                </div>
                <div class="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Phase</div>
              </div>
              <div class="w-px h-8 bg-slate-700"></div>
              <div class="text-right">
                <div class="text-2xl font-mono font-bold tabular-nums"
                     :class="sinceLastPick >= 120 ? 'text-red-400' : sinceLastPick >= 60 ? 'text-amber-400' : 'text-slate-400'">
                  {{ formatTimer(sinceLastPick) }}
                </div>
                <div class="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Since Pick</div>
              </div>
              <div class="w-px h-8 bg-slate-700"></div>
            </div>

            <div class="text-right hidden sm:block">
              <div class="text-2xl font-mono font-bold text-indigo-400">
                {{ remainingPicks.length }}
              </div>
              <div class="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Remaining</div>
            </div>
          </div>
        </div>

        <div class="bg-slate-800/50 px-4 py-3 flex flex-col md:flex-row items-center gap-4 border-t border-slate-700/50 shadow-inner">
          <div class="flex-1 flex items-center gap-3 overflow-x-auto overflow-y-hidden hide-scrollbar w-full">
            <span class="text-slate-400 uppercase text-xs font-bold tracking-wider shrink-0">Draft Order:</span>

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

      </div>

      <!-- Search + Aptitude Filter -->
      <div class="flex gap-3">
        <div class="relative flex-1">
          <i class="ph-bold ph-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-xl"></i>
          <input v-model="umaSearch"
                 type="text"
                 placeholder="Search Umas..."
                 class="w-full bg-slate-800 border border-slate-700 rounded-xl py-4 pl-12 pr-4 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-sm">
        </div>
        <select v-model="selectedAptitude"
                class="bg-slate-800 border border-slate-700 rounded-xl py-4 px-4 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-sm cursor-pointer">
          <option value="">No Sort</option>
          <optgroup label="Surface">
            <option value="turf">Turf</option>
            <option value="dirt">Dirt</option>
          </optgroup>
          <optgroup label="Distance">
            <option value="sprint">Sprint</option>
            <option value="mile">Mile</option>
            <option value="medium">Medium</option>
            <option value="long">Long</option>
          </optgroup>
          <optgroup label="Style">
            <option value="frontRunner">Front Runner</option>
            <option value="paceChaser">Pace Chaser</option>
            <option value="lateSurger">Late Surger</option>
            <option value="endCloser">End Closer</option>
          </optgroup>
        </select>
      </div>

      <!-- Main Grid -->
      <div class="grid md:grid-cols-12 gap-6">
        <!-- Uma Grid -->
        <div class="md:col-span-8">
          <div v-if="filteredUmas.length === 0" class="text-center py-12 text-slate-500">
            No Umas found matching "{{ umaSearch }}"
          </div>
          <div v-else class="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            <button @click="startRandomUma"
                    @mouseenter="isAdmin && playLocalSfx('/assets/sound-effects/sfx-button-hover.mp3')"
                    :disabled="!isAdmin"
                    class="col-span-2 sm:col-span-2 bg-gradient-to-br from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 p-4 rounded-lg shadow-lg border-2 border-indigo-400 flex items-center justify-between group relative overflow-hidden transition-all transform hover:scale-[1.02]">
              <div class="relative z-10 text-left">
                <div class="font-black text-white text-lg uppercase tracking-wider">Random</div>
                <div class="text-indigo-100/80 text-xs font-bold">Spin the slot</div>
              </div>
              <div class="relative z-10 text-white p-2 bg-black/20 rounded-full">
                <i class="ph-bold ph-dice-five text-3xl group-hover:rotate-180 transition-transform duration-500"></i>
              </div>
              <div class="absolute inset-0 bg-white/20 -skew-x-12 -translate-x-full shine-effect"></div>
            </button>

            <UmaCard v-for="uma in filteredUmas" :key="uma"
                     :uma-name="uma"
                     :is-banned="isBanned(uma)"
                     :owner-team="umaToTeamMap.get(uma)"
                     :highlight-aptitude="selectedAptitude"
                     :disabled="!isAdmin || umaOwnerMap.has(uma) || isBanned(uma)"
                     action-type="pick"
                     :surface-aptitude="selectedTrackData?.surface"
                     :distance-aptitude="selectedTrackData?.distanceType"
                     @click="!umaOwnerMap.has(uma) && !isBanned(uma) && pickUma(uma)"
                     @mouseenter="isAdmin && !umaOwnerMap.has(uma) && !isBanned(uma) && playLocalSfx('/assets/sound-effects/sfx-button-hover.mp3')" />
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

      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 mt-8">
        <div v-for="team in teamsInDraftOrder" :key="team.id"
             class="relative bg-slate-800/80 backdrop-blur-sm border-t-4 border-b border-x border-slate-700 rounded-xl p-5 transition-all duration-300 hover:-translate-y-1"
             :style="{
               borderTopColor: team.color,
               boxShadow: `0 10px 25px -5px ${team.color}20`
             }">

          <div class="flex justify-between items-center mb-4 pb-3 border-b border-slate-700/50">
            <h4 class="text-xl font-black tracking-wide drop-shadow-sm" :style="{ color: team.color }">
              {{ team.name }}
            </h4>
            <div class="text-[10px] font-bold text-slate-400 bg-slate-900/80 px-2 py-1 rounded border border-slate-700 uppercase tracking-wider">
              {{ team.memberIds.length + 1 }} Players
            </div>
          </div>

          <div class="space-y-2 mb-5">
            <div class="flex items-center gap-3 bg-gradient-to-r from-amber-500/10 to-transparent border-l-2 border-amber-500 px-3 py-2 rounded-r-lg">
              <i class="ph-fill ph-crown text-amber-400 text-lg drop-shadow-[0_0_5px_rgba(251,191,36,0.5)]"></i>
              <span class="text-sm font-bold text-amber-100">{{ getPlayerName(tournament, team.captainId) }}</span>
            </div>

            <div v-if="team.memberIds.length > 0" class="grid grid-cols-2 gap-2 mt-2">
              <div v-for="memberId in team.memberIds" :key="memberId"
                   class="flex items-center gap-2 bg-slate-900/50 px-3 py-1.5 rounded-lg border border-slate-700/30">
                <i class="ph-fill ph-user text-slate-500"></i>
                <span class="text-sm font-medium text-slate-300 truncate">{{ getPlayerName(tournament, memberId) }}</span>
              </div>
            </div>
          </div>

          <div class="bg-slate-900/80 rounded-lg p-4 border border-slate-700/50">
            <div class="text-[10px] uppercase text-slate-500 font-bold tracking-wider mb-3 flex items-center justify-between">
              <span>Drafted Umas</span>
              <i class="ph-fill ph-check-circle text-emerald-500/70 text-sm"></i>
            </div>

            <div v-if="team.umaPool && team.umaPool.length > 0" class="flex flex-wrap gap-2">
              <div v-for="uma in team.umaPool" :key="uma"
                   class="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded border shadow-sm"
                   :style="{
                     backgroundColor: team.color + '15',
                     borderColor: team.color + '40',
                     color: '#ffffff'
                   }">
                <i class="ph-fill ph-horse" :style="{ color: team.color }"></i>
                <span class="drop-shadow-md">{{ uma }}</span>
              </div>
            </div>

            <div v-else class="text-xs text-slate-600 italic flex items-center gap-2">
              <i class="ph ph-warning-circle"></i> No Umas Drafted
            </div>
          </div>

        </div>
      </div>

    </template>

    <SlotReel :visible="showRandomModal" :items="slotReel" :translate-y="slotTranslateY" label="Drafting" highlight="Uma" />
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