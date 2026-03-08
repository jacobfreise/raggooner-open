<script setup lang="ts">
import {computed, ref, toRef, onMounted, onUnmounted} from 'vue';
import { getUmaImagePath } from '../../utils/umaData';
import type { Tournament, FirestoreUpdate, Team } from '../../types.ts';
import { useGameLogic } from '../../composables/useGameLogic.ts';
import { useTournamentFlow } from '../../composables/useTournamentFlow.ts';
import { useRoster } from '../../composables/useRoster.ts';
import {
  getRankColor,
  getPlayerName,
} from '../../utils/utils.ts';
import HallOfFame from "../HallOfFame.vue";
import DiscordExportPreview from "../DiscordExportPreview.vue";
import PlayerSelector from "../PlayerSelector.vue";
import type {GlobalPlayer} from "../../types.ts";
import RaceInputs from "../race/RaceInputs.vue";
import PlayerStatsBoard from "../PlayerStatsBoard.vue";

const props = withDefaults(defineProps<{
  tournamentProp: Tournament;
  isAdmin: boolean;
  appId?: string;
  secureUpdate: (data: FirestoreUpdate<Tournament> | Record<string, any>) => Promise<void>;
  globalPlayers: GlobalPlayer[];
  addGlobalPlayer: (player: GlobalPlayer) => void;
}>(), {
  appId: 'default-app'
});

// Create Refs for composables
const tournament = toRef(props, 'tournamentProp');
const isAdminRef = toRef(props, 'isAdmin');

const showAdjustmentModal = ref(false);
const activeTeamId = ref('');
const activeTeamName = ref('');
const selectedTeamId = ref('');
const adjAmount = ref(0);
const adjReason = ref('');

const isDev = import.meta.env.DEV;

// Initialize Game Logic locally
// This keeps 'currentView' (Groups vs Finals) state inside this component
const {
  currentView,
  sortedTeamsA,
  sortedTeamsB,
  sortedTeamsC,
  sortedFinalsTeams,
  sortedRaces,
  canAdvanceToFinals,
  canEndTournament,
  canShowFinals,
  getRaceResults,
  getGroupWildcards,
  advanceToFinals,
  getRoundPoints,
  getRaceCount,
  showTieBreakerModal,
  tiedTeams,
  tiebreakersNeeded,
  guaranteedIds,
  winningTeams,
  resolveManually,
  getVisualRankIndex,
  getProgressionStatus,
  addTeamAdjustment,
  removeTeamAdjustment,
  confirmTiebreakerSelection,
  cancelTieBreaker
} = useGameLogic(tournament, props.secureUpdate);

// Initialize Tournament Flow (for phase transitions)
const {
  advancePhase: endTournament,
  reopenTournament,
  isAdvancing: isEndingTournament
} = useTournamentFlow(tournament, props.secureUpdate, props.appId);

// Initialize Roster (for visual helpers like colors/names)
const {
  showUmaModal,
  getPlayerColor,
  submitUmaForPlayer,
  closeUmaModal,
  getUmaList,
  showWildcardModal,
  openWildcardModal,
  wildcardTargetGroup,
  addWildcard,
} = useRoster(tournament, props.secureUpdate, isAdminRef);

// Handle wildcard player selection from PlayerSelector
const handleWildcardSelect = (globalPlayer: GlobalPlayer) => {
  addWildcard(globalPlayer);
};

// IDs to exclude from wildcard selector (already in this tournament)
const tournamentPlayerIds = computed(() => {
  return Object.keys(props.tournamentProp.players || {});
});

const showBans = ref(false);
const showUmaPools = ref(false);

// --- ACTIVE PHASE TIMER ---
const now = ref(Date.now());
let timerInterval: number | null = null;
const timerCollapsed = computed(() => !!props.tournamentProp.activeTimerStopped);

onMounted(async () => {
  // Tick every second for UI updates
  timerInterval = window.setInterval(() => {
    now.value = Date.now();
  }, 1000);

  // Fallback: auto-start timer for tournaments that entered active phase
  // before this feature existed (no activeTimerStart field yet)
  if (!props.tournamentProp.activeTimerStart && props.tournamentProp.status === 'active' && props.isAdmin) {
    await props.secureUpdate({ activeTimerStart: new Date().toISOString(), activeTimerStopped: false });
  }
});

onUnmounted(() => {
  if (timerInterval) clearInterval(timerInterval);
});

const activeElapsedSeconds = computed(() => {
  const t = props.tournamentProp;
  if (!t.activeTimerStart) return 0;
  // When stopped, show the frozen elapsed value
  if (t.activeTimerStopped && t.activeTimerElapsed != null) {
    return t.activeTimerElapsed;
  }
  const start = new Date(t.activeTimerStart).getTime();
  const elapsed = Math.floor((now.value - start) / 1000);
  return elapsed < 0 ? 0 : elapsed;
});

const activeFormattedTime = computed(() => {
  const total = activeElapsedSeconds.value;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60).toString().padStart(2, '0');
  const s = (total % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
});

const stopActiveTimer = async () => {
  const elapsed = activeElapsedSeconds.value;
  await props.secureUpdate({ activeTimerStopped: true, activeTimerElapsed: elapsed });
};

const resumeActiveTimer = async () => {
  const elapsed = props.tournamentProp.activeTimerElapsed || 0;
  const newStart = new Date(Date.now() - elapsed * 1000).toISOString();
  await props.secureUpdate({ activeTimerStopped: false, activeTimerStart: newStart, activeTimerElapsed: null });
};

const resetActiveTimer = async () => {
  await props.secureUpdate({ activeTimerStart: new Date().toISOString(), activeTimerStopped: false, activeTimerElapsed: null });
};

// Helper for 'shouldShowGroup' since it relies on local 'currentView'
const shouldShowGroup = (group: string) => {
  if(currentView.value === 'finals') return false;

  const teamCount = props.tournamentProp.teams.length;
  if(teamCount < 6) return group === 'A';
  if(teamCount === 9) return ['A', 'B', 'C'].includes(group);
  return ['A', 'B'].includes(group);
};

const getRelevantAdjustments = (team: Team, stage: 'groups' | 'finals') => {
  return team.adjustments?.filter(adj => adj.stage === stage) || [];
};

const openAdjustmentModal = (team: Team) => {
  selectedTeamId.value = team.id;
  activeTeamId.value = team.id;
  activeTeamName.value = team.name;
  adjAmount.value = 0;
  adjReason.value = '';
  showAdjustmentModal.value = true;
};

const submitAdjustment = async () => {
  console.debug(selectedTeamId.value + ' ' + adjAmount.value);
  if (!selectedTeamId.value || adjAmount.value === 0) return;

  await addTeamAdjustment(selectedTeamId.value, adjAmount.value, adjReason.value);

  showAdjustmentModal.value = false;
};

const sortedTeamsForModal = computed(() => {
  if (!props.tournamentProp?.teams) return [];
  return [...props.tournamentProp.teams].sort((a, b) => {
    if (a.group !== b.group) return a.group.localeCompare(b.group);
    return a.name.localeCompare(b.name);
  });
});
</script>

<template>
  <div class="space-y-6">

    <!--    BAN DISPLAY-->
    <div v-if="tournament.bans && tournament.bans.length > 0" class="mb-8">
      <div class="bg-red-900/10 border border-red-500/20 rounded-xl overflow-hidden transition-all duration-300"
           :class="showBans ? 'shadow-lg shadow-red-900/10' : ''">

        <button @click="showBans = !showBans"
                class="w-full px-4 py-3 flex items-center justify-between hover:bg-red-500/5 transition-colors group">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center border border-red-500/20 group-hover:bg-red-500/20 transition-colors">
              <i class="ph-bold ph-prohibit text-lg"></i>
            </div>
            <div class="text-left">
              <span class="block text-red-200 font-bold uppercase tracking-wider text-sm">Banned List</span>
              <span class="text-xs text-red-400/70">{{ tournament.bans?.length }} characters restricted</span>
            </div>
          </div>
          <i class="ph-bold ph-caret-down text-red-400 transition-transform duration-300"
             :class="showBans ? 'rotate-180' : ''"></i>
        </button>

        <div v-show="showBans" class="border-t border-red-500/10 bg-red-950/20 p-6 relative overflow-hidden">
          <!-- Background decorative stripes -->
          <div class="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PHBhdGggZD0iTTAgNDBMNDAgME0tMTAgMTBMMTAgLTEwTTMwIDUwTDUwIDMwIiBzdHJva2U9IiNmZjAwMDAiIHN0cm9rZS13aWR0aD0iNSIvPjwvc3ZnPg==')]"></div>

          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4 relative z-10">
            <div v-for="uma in tournament.bans" :key="uma"
                 class="group/uma flex flex-col items-center gap-2 p-3 bg-slate-900/60 border border-red-500/20 rounded-xl hover:border-red-500/50 hover:bg-red-950/30 transition-all duration-500 hover:-translate-y-1 hover:shadow-lg hover:shadow-red-900/20">
              <div class="relative">
                <div class="w-16 h-16 rounded-2xl overflow-hidden border-2 border-red-500/20 group-hover/uma:border-red-500/50 transition-colors shadow-inner bg-slate-800">
                  <img :src="getUmaImagePath(uma)" :alt="uma"
                       class="w-full h-full object-cover grayscale brightness-75 group-hover/uma:grayscale-0 group-hover/uma:brightness-100 transition-all duration-700" />
                </div>
                <!-- Banned Badge -->
                <div class="absolute -top-2 -right-2 w-6 h-6 bg-red-600 rounded-full flex items-center justify-center border-2 border-slate-900 shadow-lg animate-pulse">
                  <i class="ph-fill ph-prohibit text-white text-[10px]"></i>
                </div>
              </div>
              <span class="text-[10px] font-black uppercase tracking-tighter text-red-400 group-hover/uma:text-red-200 transition-colors text-center leading-normal w-full px-1">
                {{ uma }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

<!--    ACTIVE PHASE TIMER -->
    <div v-if="tournament.activeTimerStart && tournament.status === 'active'">
      <!-- Collapsed state: minimal pill -->
      <div v-if="timerCollapsed" class="flex justify-center mb-4">
        <button @click="isAdminRef && resumeActiveTimer()"
                class="flex items-center gap-2 px-4 py-1.5 bg-slate-800/60 border border-slate-700/50 rounded-full transition-all group"
                :class="isAdminRef
                  ? 'text-slate-400 hover:text-white hover:border-slate-500 cursor-pointer'
                  : 'text-slate-500 cursor-default'"
                :disabled="!isAdminRef">
          <i class="ph-bold ph-timer text-sm"></i>
          <span class="font-mono text-sm tabular-nums">{{ activeFormattedTime }}</span>
          <i v-if="isAdminRef" class="ph-bold ph-arrow-square-out text-xs opacity-0 group-hover:opacity-100 transition-opacity"></i>
        </button>
      </div>

      <!-- Expanded state: full timer display -->
      <div v-else class="text-center relative group mb-8">
        <div class="text-xs font-bold uppercase tracking-[0.3em] text-slate-600 mb-2">Career Timer</div>
        <div class="text-7xl md:text-8xl font-black font-mono tracking-widest tabular-nums leading-none transition-colors duration-500 text-slate-500">
          {{ activeFormattedTime }}
        </div>

        <!-- Admin controls -->
        <div v-if="isAdminRef" class="flex justify-center gap-2 mt-2 transition-all opacity-0 group-hover:opacity-100">
          <button @click="stopActiveTimer"
                  title="Stop & collapse timer"
                  class="p-2 text-slate-600 hover:text-amber-400 hover:scale-110 transition-all">
            <i class="ph-bold ph-stop-circle text-2xl"></i>
          </button>
          <button @click="resetActiveTimer"
                  title="Reset timer"
                  class="p-2 text-slate-600 hover:text-red-400 hover:scale-110 transition-all">
            <i class="ph-bold ph-arrow-counter-clockwise text-2xl"></i>
          </button>
        </div>
      </div>
    </div>

<!--    OVERVIEW AND PLAYER / SETTINGS BUTTONS -->
    <div class="flex flex-col md:flex-row items-center md:items-end border-b border-slate-700 mb-8 gap-4 md:gap-0">

      <div class="flex-1 pb-3 w-full md:w-auto text-center md:text-left">
        <h2 class="text-3xl font-bold text-white">
          Tournament Overview
        </h2>
      </div>

      <div v-if="tournament.teams.length >= 6" class="flex gap-2 justify-center">
        <button @click="currentView = 'groups'"
                class="pb-3 px-4 md:px-6 text-sm font-bold uppercase tracking-widest border-b-2 transition-all -mb-[1px]"
                :class="currentView === 'groups' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-300'">
          Group Stage
        </button>
        <button @click="currentView = 'finals'"
                :disabled="!canShowFinals"
                class="pb-3 px-4 md:px-6 text-sm font-bold uppercase tracking-widest border-b-2 transition-all disabled:opacity-30 disabled:cursor-not-allowed -mb-[1px]"
                :class="currentView === 'finals' ? 'border-amber-500 text-amber-500' : 'border-transparent text-slate-500 hover:text-slate-300'">
          Grand Finals
        </button>
      </div>

      <div class="flex-1 pb-3 flex justify-center md:justify-end w-full md:w-auto gap-2 shrink-0">
        <!-- Banned List Toggle -->
<!--        <button v-if="tournament.bans && tournament.bans.length > 0"-->
<!--                @click="showBans = true"-->
<!--                class="relative group/ban px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all flex items-center gap-2"-->
<!--                title="View Banned Umas">-->
<!--          <i class="ph-bold ph-prohibit text-lg"></i>-->
<!--          <span class="text-xs font-bold uppercase tracking-wider hidden sm:inline">Bans</span>-->
<!--          <span class="bg-red-500 text-white text-[10px] px-1.5 rounded-full font-mono">{{ tournament.bans.length }}</span>-->
<!--        </button>-->

        <button v-if="isAdminRef" @click="showUmaModal = true"
                class="text-slate-500 hover:text-indigo-400 px-2 transition-colors">
          <i class="ph-bold ph-gear text-xl"></i>
        </button>
      </div>

    </div>

    <div v-if="currentView === 'groups' && tournament.teams.length >= 6"
         class="mb-6 bg-indigo-900/20 border border-indigo-500/20 p-3 rounded-lg flex items-center gap-3 text-sm text-indigo-200">
      <i class="ph-fill ph-info text-indigo-400"></i>
      <span>
        <span v-if="tournament.teams.length === 9">Winners of groups A, B, and C advance automatically.</span>
        <span v-else>Winners of A & B, plus the highest scoring runner-up advance.</span>
      </span>
    </div>

<!--    TEAM POINTS DISPLAYS-->
    <div :class="tournament?.teams.length === 9 && currentView === 'groups' ? 'grid md:grid-cols-3 gap-8' : 'grid md:grid-cols-2 gap-8'">

      <div v-if="shouldShowGroup('A')">
        <div class="flex items-center justify-between mb-4 group">
          <div class="flex items-center gap-3">
            <h3 @click="openWildcardModal('A')"
                class="text-xl font-bold text-indigo-400 heading tracking-wide transition-colors"
                :class="isAdminRef ? 'cursor-pointer hover:text-white hover:underline decoration-dashed decoration-indigo-500/50 underline-offset-4' : ''">
              {{ tournament?.teams.length >= 6 ? 'Group A' : 'Standings' }}
              <i v-if="isAdminRef" class="ph-bold ph-plus-circle inline-block text-sm opacity-0 group-hover:opacity-100 transition-opacity ml-1"></i>
            </h3>
          </div>
          <span class="text-xs font-mono bg-slate-800 px-2 py-1 rounded text-slate-400">{{ getRaceCount('A') }} / 5 Races</span>
        </div>

        <div class="space-y-3">
          <div v-for="(team, idx) in sortedTeamsA" :key="team.id"
               class="bg-slate-800 rounded-lg p-4 border-l-4 flex justify-between items-center transition-all duration-300 relative hover:z-30"
               :class="[
              getRankColor(idx),
              getProgressionStatus(team.id) === 'safe'
                  ? 'ring-2 ring-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)] z-10'
                  : (getProgressionStatus(team.id) === 'tied'
                      ? 'ring-2 ring-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.2)] z-10'
                      : 'opacity-80 hover:opacity-100')
           ]">

            <div class="absolute inset-0 overflow-hidden rounded-lg pointer-events-none">
              <div v-if="getProgressionStatus(team.id) === 'safe'" class="absolute -right-1 -top-2 text-emerald-500/10 font-black text-6xl select-none">Q</div>
              <div v-else-if="getProgressionStatus(team.id) === 'tied'" class="absolute -right-1 -top-2 text-amber-500/10 font-black text-6xl select-none rotate-12">?</div>
            </div>

            <div class="relative z-10 flex-1 min-w-0 mr-3">
              <div>
                <span class="font-bold text-lg text-white" :style="{ color: team.color }">{{ team.name }}</span>
              </div>
              <div class="flex flex-col sm:flex-row gap-1.5 mt-2">
                <div v-for="pid in [team.captainId, ...team.memberIds].sort((a,b) => getRoundPoints(b) - getRoundPoints(a))"
                     :key="pid"
                     class="flex items-center gap-1.5 bg-slate-900/80 rounded-md px-2 py-1.5 min-w-0 flex-1 overflow-hidden">
                  <img v-if="tournament.players[pid]?.uma"
                       :src="getUmaImagePath(tournament.players[pid]!.uma)"
                       :alt="tournament.players[pid]!.uma"
                       class="w-6 h-6 rounded-full object-cover shrink-0 bg-slate-700" />
                  <i v-else class="ph-fill ph-horse text-base shrink-0 text-slate-500"></i>
                  <div class="flex flex-col min-w-0 flex-1 overflow-hidden">
                    <span class="text-[11px] font-semibold truncate leading-tight" :style="{ color: team.color }">
                      {{ tournament.players[pid]?.name || pid }}
                    </span>
                    <span class="text-[10px] text-slate-500 truncate leading-tight">
                      {{ tournament.players[pid]?.uma || '—' }}
                    </span>
                  </div>
                  <span class="text-xs font-bold tabular-nums shrink-0 ml-0.5" :style="{ color: team.color }">
                    {{ getRoundPoints(pid) }}
                  </span>
                </div>
              </div>
            </div>

            <div class="flex items-center gap-4 relative z-10 min-w-[120px] justify-end">

              <div class="relative flex flex-col items-end leading-none">

                <div v-if="getRelevantAdjustments(team, 'groups').length > 0"
                     class="absolute -left-10 top-1/2 -translate-y-1/2 group/adj h-8 w-8 flex items-center justify-center">

                  <i class="ph-bold ph-warning-circle text-amber-500 text-2xl cursor-help"></i>

                  <div class="absolute top-full right-0 pt-2 hidden group-hover/adj:block z-50 w-max min-w-[160px] max-w-[400px]">
                    <div class="bg-slate-900 border border-slate-700 p-2 rounded shadow-xl">
                      <div v-for="adj in getRelevantAdjustments(team, 'groups')" :key="adj.id"
                           class="text-xs flex justify-between items-center gap-3 mb-1 last:mb-0 border-b border-slate-800 last:border-0 pb-1 last:pb-0">

                        <div class="flex-1 flex items-center min-w-0 mr-2">
                          <span class="text-slate-400 truncate mr-1" :title="adj.reason">{{ adj.reason }}:</span>
                          <span :class="adj.amount > 0 ? 'text-green-400' : 'text-red-400'" class="font-bold whitespace-nowrap shrink-0">
                           {{ adj.amount > 0 ? '+' : ''}}{{ adj.amount }}
                        </span>
                        </div>

                        <button v-if="isAdmin" @click.stop="removeTeamAdjustment(team.id, adj.id)" class="shrink-0 text-slate-500 hover:text-red-400 p-1 rounded hover:bg-slate-800 transition-colors" title="Delete"><i class="ph-bold ph-trash"></i></button>
                      </div>
                    </div>
                  </div>
                </div>

                <span class="text-2xl font-mono font-bold text-white tabular-nums">{{ team.points }}</span>
                <span class="text-[10px] font-bold text-slate-600 uppercase tracking-widest">PTS</span>
              </div>

              <div v-if="isAdmin" class="w-8 h-8 flex-shrink-0">
                <button @click.stop="openAdjustmentModal(team)"
                        class="w-8 h-8 rounded-full text-slate-600 hover:text-indigo-400 hover:bg-indigo-900/30 flex items-center justify-center transition-all"
                        title="Add Penalty/Bonus">
                  <i class="ph-bold ph-gavel text-lg"></i>
                </button>
              </div>
            </div>

          </div>

          <div v-if="getGroupWildcards('A').length > 0" class="mt-4 pt-4 border-t border-slate-700/50 border-dashed">
            <div class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2"><i class="ph-bold ph-ghost"></i> Wildcards</div>
            <div v-for="wc in getGroupWildcards('A')" :key="wc.id" class="bg-slate-800/50 rounded-lg p-3 border border-slate-700 border-dashed flex justify-between items-center hover:bg-slate-800 transition-colors mb-2">
              <div>
                <span class="font-bold text-slate-300">{{ wc.name }}</span> <span v-if="wc.uma" class="text-xs text-slate-500 ml-2">({{ wc.uma }})</span>
              </div>
              <div class="text-xl font-mono font-bold text-slate-400">{{ wc.points }} <span class="text-xs font-sans font-normal text-slate-600">PTS</span></div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="shouldShowGroup('B')">
        <div class="flex items-center justify-between mb-4 group">
          <div class="flex items-center gap-3">
            <h3 @click="openWildcardModal('B')"
                class="text-xl font-bold text-indigo-400 heading tracking-wide transition-colors"
                :class="isAdminRef ? 'cursor-pointer hover:text-white hover:underline decoration-dashed decoration-indigo-500/50 underline-offset-4' : ''">
              {{ 'Group B' }}
              <i v-if="isAdminRef" class="ph-bold ph-plus-circle inline-block text-sm opacity-0 group-hover:opacity-100 transition-opacity ml-1"></i>
            </h3>
          </div>
          <span class="text-xs font-mono bg-slate-800 px-2 py-1 rounded text-slate-400">{{ getRaceCount('B') }} / 5 Races</span>
        </div>
        <div class="space-y-3">
          <div v-for="(team, idx) in sortedTeamsB" :key="team.id"
               class="bg-slate-800 rounded-lg p-4 border-l-4 flex justify-between items-center transition-all duration-300 relative hover:z-30"
               :class="[
              getRankColor(idx),
              getProgressionStatus(team.id) === 'safe'
                  ? 'ring-2 ring-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)] z-10'
                  : (getProgressionStatus(team.id) === 'tied'
                      ? 'ring-2 ring-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.2)] z-10'
                      : 'opacity-80 hover:opacity-100')
           ]">

            <div class="absolute inset-0 overflow-hidden rounded-lg pointer-events-none">
              <div v-if="getProgressionStatus(team.id) === 'safe'" class="absolute -right-1 -top-2 text-emerald-500/10 font-black text-6xl select-none">Q</div>
              <div v-else-if="getProgressionStatus(team.id) === 'tied'" class="absolute -right-1 -top-2 text-amber-500/10 font-black text-6xl select-none rotate-12">?</div>
            </div>

            <div class="relative z-10 flex-1 min-w-0 mr-3">
              <div>
                <span class="font-bold text-lg text-white" :style="{ color: team.color }">{{ team.name }}</span>
              </div>
              <div class="flex flex-col sm:flex-row gap-1.5 mt-2">
                <div v-for="pid in [team.captainId, ...team.memberIds].sort((a,b) => getRoundPoints(b) - getRoundPoints(a))"
                     :key="pid"
                     class="flex items-center gap-1.5 bg-slate-900/80 rounded-md px-2 py-1.5 min-w-0 flex-1 overflow-hidden">
                  <img v-if="tournament.players[pid]?.uma"
                       :src="getUmaImagePath(tournament.players[pid]!.uma)"
                       :alt="tournament.players[pid]!.uma"
                       class="w-6 h-6 rounded-full object-cover shrink-0 bg-slate-700" />
                  <i v-else class="ph-fill ph-horse text-base shrink-0 text-slate-500"></i>
                  <div class="flex flex-col min-w-0 flex-1 overflow-hidden">
                    <span class="text-[11px] font-semibold truncate leading-tight" :style="{ color: team.color }">
                      {{ tournament.players[pid]?.name || pid }}
                    </span>
                    <span class="text-[10px] text-slate-500 truncate leading-tight">
                      {{ tournament.players[pid]?.uma || '—' }}
                    </span>
                  </div>
                  <span class="text-xs font-bold tabular-nums shrink-0 ml-0.5" :style="{ color: team.color }">
                    {{ getRoundPoints(pid) }}
                  </span>
                </div>
              </div>
            </div>

            <div class="flex items-center gap-4 relative z-10 min-w-[120px] justify-end">

              <div class="relative flex flex-col items-end leading-none">

                <div v-if="getRelevantAdjustments(team, 'groups').length > 0"
                     class="absolute -left-10 top-1/2 -translate-y-1/2 group/adj h-8 w-8 flex items-center justify-center">

                  <i class="ph-bold ph-warning-circle text-amber-500 text-2xl cursor-help"></i>

                  <div class="absolute top-full right-0 pt-2 hidden group-hover/adj:block z-50 w-max min-w-[160px] max-w-[400px]">
                    <div class="bg-slate-900 border border-slate-700 p-2 rounded shadow-xl">
                      <div v-for="adj in getRelevantAdjustments(team, 'groups')" :key="adj.id"
                           class="text-xs flex justify-between items-center gap-3 mb-1 last:mb-0 border-b border-slate-800 last:border-0 pb-1 last:pb-0">

                        <div class="flex-1 flex items-center min-w-0 mr-2">
                          <span class="text-slate-400 truncate mr-1" :title="adj.reason">{{ adj.reason }}:</span>
                          <span :class="adj.amount > 0 ? 'text-green-400' : 'text-red-400'" class="font-bold whitespace-nowrap shrink-0">
                           {{ adj.amount > 0 ? '+' : ''}}{{ adj.amount }}
                        </span>
                        </div>

                        <button v-if="isAdmin" @click.stop="removeTeamAdjustment(team.id, adj.id)" class="shrink-0 text-slate-500 hover:text-red-400 p-1 rounded hover:bg-slate-800 transition-colors" title="Delete"><i class="ph-bold ph-trash"></i></button>
                      </div>
                    </div>
                  </div>
                </div>

                <span class="text-2xl font-mono font-bold text-white tabular-nums">{{ team.points }}</span>
                <span class="text-[10px] font-bold text-slate-600 uppercase tracking-widest">PTS</span>
              </div>

              <div v-if="isAdmin" class="w-8 h-8 flex-shrink-0">
                <button @click.stop="openAdjustmentModal(team)"
                        class="w-8 h-8 rounded-full text-slate-600 hover:text-indigo-400 hover:bg-indigo-900/30 flex items-center justify-center transition-all"
                        title="Add Penalty/Bonus">
                  <i class="ph-bold ph-gavel text-lg"></i>
                </button>
              </div>
            </div>

          </div>

          <div v-if="getGroupWildcards('B').length > 0" class="mt-4 pt-4 border-t border-slate-700/50 border-dashed">
            <div class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2"><i class="ph-bold ph-ghost"></i> Wildcards</div>
            <div v-for="wc in getGroupWildcards('B')" :key="wc.id" class="bg-slate-800/50 rounded-lg p-3 border border-slate-700 border-dashed flex justify-between items-center hover:bg-slate-800 transition-colors mb-2">
              <div><span class="font-bold text-slate-300">{{ wc.name }}</span> <span v-if="wc.uma" class="text-xs text-slate-500 ml-2">({{ wc.uma }})</span></div>
              <div class="text-xl font-mono font-bold text-slate-400">{{ wc.points }} <span class="text-xs font-sans font-normal text-slate-600">PTS</span></div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="shouldShowGroup('C')">
        <div class="flex items-center justify-between mb-4 group">
          <div class="flex items-center gap-3">
            <h3 @click="openWildcardModal('C')"
                class="text-xl font-bold text-indigo-400 heading tracking-wide transition-colors"
                :class="isAdminRef ? 'cursor-pointer hover:text-white hover:underline decoration-dashed decoration-indigo-500/50 underline-offset-4' : ''">
              {{ 'Group C' }}
              <i v-if="isAdminRef" class="ph-bold ph-plus-circle inline-block text-sm opacity-0 group-hover:opacity-100 transition-opacity ml-1"></i>
            </h3>
          </div>
          <span class="text-xs font-mono bg-slate-800 px-2 py-1 rounded text-slate-400">{{ getRaceCount('C') }} / 5 Races</span>
        </div>
        <div class="space-y-3">
          <div v-for="(team, idx) in sortedTeamsC" :key="team.id"
               class="bg-slate-800 rounded-lg p-4 border-l-4 flex justify-between items-center transition-all duration-300 relative hover:z-30"
               :class="[
              getRankColor(idx),
              getProgressionStatus(team.id) === 'safe'
                  ? 'ring-2 ring-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)] z-10'
                  : (getProgressionStatus(team.id) === 'tied'
                      ? 'ring-2 ring-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.2)] z-10'
                      : 'opacity-80 hover:opacity-100')
           ]">

            <div class="absolute inset-0 overflow-hidden rounded-lg pointer-events-none">
              <div v-if="getProgressionStatus(team.id) === 'safe'" class="absolute -right-1 -top-2 text-emerald-500/10 font-black text-6xl select-none">Q</div>
              <div v-else-if="getProgressionStatus(team.id) === 'tied'" class="absolute -right-1 -top-2 text-amber-500/10 font-black text-6xl select-none rotate-12">?</div>
            </div>

            <div class="relative z-10 flex-1 min-w-0 mr-3">
              <div>
                <span class="font-bold text-lg text-white" :style="{ color: team.color }">{{ team.name }}</span>
              </div>
              <div class="flex flex-col sm:flex-row gap-1.5 mt-2">
                <div v-for="pid in [team.captainId, ...team.memberIds].sort((a,b) => getRoundPoints(b) - getRoundPoints(a))"
                     :key="pid"
                     class="flex items-center gap-1.5 bg-slate-900/80 rounded-md px-2 py-1.5 min-w-0 flex-1 overflow-hidden">
                  <img v-if="tournament.players[pid]?.uma"
                       :src="getUmaImagePath(tournament.players[pid]!.uma)"
                       :alt="tournament.players[pid]!.uma"
                       class="w-6 h-6 rounded-full object-cover shrink-0 bg-slate-700" />
                  <i v-else class="ph-fill ph-horse text-base shrink-0 text-slate-500"></i>
                  <div class="flex flex-col min-w-0 flex-1 overflow-hidden">
                    <span class="text-[11px] font-semibold truncate leading-tight" :style="{ color: team.color }">
                      {{ tournament.players[pid]?.name || pid }}
                    </span>
                    <span class="text-[10px] text-slate-500 truncate leading-tight">
                      {{ tournament.players[pid]?.uma || '—' }}
                    </span>
                  </div>
                  <span class="text-xs font-bold tabular-nums shrink-0 ml-0.5" :style="{ color: team.color }">
                    {{ getRoundPoints(pid) }}
                  </span>
                </div>
              </div>
            </div>

            <div class="flex items-center gap-4 relative z-10 min-w-[120px] justify-end">

              <div class="relative flex flex-col items-end leading-none">

                <div v-if="getRelevantAdjustments(team, 'groups').length > 0"
                     class="absolute -left-10 top-1/2 -translate-y-1/2 group/adj h-8 w-8 flex items-center justify-center">

                  <i class="ph-bold ph-warning-circle text-amber-500 text-2xl cursor-help"></i>

                  <div class="absolute top-full right-0 pt-2 hidden group-hover/adj:block z-50 w-max min-w-[160px] max-w-[400px]">
                    <div class="bg-slate-900 border border-slate-700 p-2 rounded shadow-xl">
                      <div v-for="adj in getRelevantAdjustments(team, 'groups')" :key="adj.id"
                           class="text-xs flex justify-between items-center gap-3 mb-1 last:mb-0 border-b border-slate-800 last:border-0 pb-1 last:pb-0">

                        <div class="flex-1 flex items-center min-w-0 mr-2">
                          <span class="text-slate-400 truncate mr-1" :title="adj.reason">{{ adj.reason }}:</span>
                          <span :class="adj.amount > 0 ? 'text-green-400' : 'text-red-400'" class="font-bold whitespace-nowrap shrink-0">
                           {{ adj.amount > 0 ? '+' : ''}}{{ adj.amount }}
                          </span>
                        </div>

                        <button v-if="isAdmin" @click.stop="removeTeamAdjustment(team.id, adj.id)" class="shrink-0 text-slate-500 hover:text-red-400 p-1 rounded hover:bg-slate-800 transition-colors" title="Delete"><i class="ph-bold ph-trash"></i></button>
                      </div>
                    </div>
                  </div>
                </div>

                <span class="text-2xl font-mono font-bold text-white tabular-nums">{{ team.points }}</span>
                <span class="text-[10px] font-bold text-slate-600 uppercase tracking-widest">PTS</span>
              </div>

              <div v-if="isAdmin" class="w-8 h-8 flex-shrink-0">
                <button @click.stop="openAdjustmentModal(team)"
                        class="w-8 h-8 rounded-full text-slate-600 hover:text-indigo-400 hover:bg-indigo-900/30 flex items-center justify-center transition-all"
                        title="Add Penalty/Bonus">
                  <i class="ph-bold ph-gavel text-lg"></i>
                </button>
              </div>
            </div>

          </div>

          <div v-if="getGroupWildcards('C').length > 0" class="mt-4 pt-4 border-t border-slate-700/50 border-dashed">
            <div class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2"><i class="ph-bold ph-ghost"></i> Wildcards</div>
            <div v-for="wc in getGroupWildcards('C')" :key="wc.id" class="bg-slate-800/50 rounded-lg p-3 border border-slate-700 border-dashed flex justify-between items-center hover:bg-slate-800 transition-colors mb-2">
              <div><span class="font-bold text-slate-300">{{ wc.name }}</span> <span v-if="wc.uma" class="text-xs text-slate-500 ml-2">({{ wc.uma }})</span></div>
              <div class="text-xl font-mono font-bold text-slate-400">{{ wc.points }} <span class="text-xs font-sans font-normal text-slate-600">PTS</span></div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="currentView === 'finals'" class="col-span-2 max-w-2xl mx-auto w-full">
        <div class="text-center mb-6">
          <i class="ph-fill ph-trophy text-amber-500 text-5xl mb-2"></i>
          <div class="flex items-center justify-between mb-4 group">
            <div class="flex items-center gap-3">
              <h3 @click="openWildcardModal('Finals')"
                  class="text-xl font-bold text-indigo-400 heading tracking-wide transition-colors"
                  :class="isAdminRef ? 'cursor-pointer hover:text-white hover:underline decoration-dashed decoration-indigo-500/50 underline-offset-4' : ''">
                {{ 'Finals' }}
                <i v-if="isAdminRef" class="ph-bold ph-plus-circle inline-block text-sm opacity-0 group-hover:opacity-100 transition-opacity ml-1"></i>
              </h3>
            </div>
            <span class="text-xs font-mono bg-slate-800 px-2 py-1 rounded text-slate-400">{{ getRaceCount('Finals') }} / 5 Races</span>
          </div>
        </div>
        <div class="space-y-4">
          <div v-for="(team, idx) in sortedFinalsTeams"
               :key="team.id"
               class="bg-slate-800 rounded-lg p-4 border-l-4 flex justify-between items-center hover:z-30 relative"
               :class="getRankColor(getVisualRankIndex(idx, sortedFinalsTeams))"
          >
            <div class="relative z-10 flex-1 min-w-0 mr-3">
              <div>
                <span class="font-bold text-lg text-white" :style="{ color: team.color }">{{ team.name }}</span>
              </div>
              <div class="flex flex-col sm:flex-row gap-1.5 mt-2">
                <div v-for="pid in [team.captainId, ...team.memberIds].sort((a,b) => getRoundPoints(b) - getRoundPoints(a))"
                     :key="pid"
                     class="flex items-center gap-1.5 bg-slate-900/80 rounded-md px-2 py-1.5 min-w-0 flex-1 overflow-hidden">
                  <img v-if="tournament.players[pid]?.uma"
                       :src="getUmaImagePath(tournament.players[pid]!.uma)"
                       :alt="tournament.players[pid]!.uma"
                       class="w-6 h-6 rounded-full object-cover shrink-0 bg-slate-700" />
                  <i v-else class="ph-fill ph-horse text-base shrink-0 text-slate-500"></i>
                  <div class="flex flex-col min-w-0 flex-1 overflow-hidden">
                    <span class="text-[11px] font-semibold truncate leading-tight" :style="{ color: team.color }">
                      {{ tournament.players[pid]?.name || pid }}
                    </span>
                    <span class="text-[10px] text-slate-500 truncate leading-tight">
                      {{ tournament.players[pid]?.uma || '—' }}
                    </span>
                  </div>
                  <span class="text-xs font-bold tabular-nums shrink-0 ml-0.5" :style="{ color: team.color }">
                    {{ getRoundPoints(pid) }}
                  </span>
                </div>
              </div>
            </div>

            <div class="flex items-center gap-4 relative z-10 min-w-[140px] justify-end">

              <div class="relative flex flex-col items-end leading-none">

                <div v-if="getRelevantAdjustments(team, 'finals').length > 0"
                     class="absolute -left-10 top-1/2 -translate-y-1/2 group/adj h-8 w-8 flex items-center justify-center">

                  <i class="ph-bold ph-warning-circle text-amber-500 text-2xl cursor-help"></i>

                  <div class="absolute top-full right-0 pt-2 hidden group-hover/adj:block z-50 w-max min-w-[160px] max-w-[400px]">
                    <div class="bg-slate-900 border border-slate-700 p-2 rounded shadow-xl">
                      <div v-for="adj in getRelevantAdjustments(team, 'finals')" :key="adj.id" class="text-xs flex justify-between items-center gap-3 mb-1 last:mb-0 border-b border-slate-800 last:border-0 pb-1 last:pb-0">

                        <div class="flex-1 flex items-center min-w-0 mr-2">
                          <span class="text-slate-400 truncate mr-1" :title="adj.reason">{{ adj.reason }}:</span>
                          <span :class="adj.amount > 0 ? 'text-green-400' : 'text-red-400'" class="font-bold whitespace-nowrap shrink-0">
                           {{ adj.amount > 0 ? '+' : ''}}{{ adj.amount }}
                        </span>
                        </div>

                        <button v-if="isAdmin" @click.stop="removeTeamAdjustment(team.id, adj.id)" class="shrink-0 text-slate-500 hover:text-red-400 p-1 rounded hover:bg-slate-800 transition-colors"><i class="ph-bold ph-trash"></i></button>
                      </div>
                    </div>
                  </div>
                </div>

                <span class="text-4xl font-mono font-bold text-indigo-400 tabular-nums">{{ team.finalsPoints || 0 }}</span>
                <span class="text-[10px] font-bold text-slate-600 uppercase tracking-widest">PTS</span>
              </div>

              <div v-if="isAdmin" class="w-8 h-8 flex-shrink-0">
                <button @click.stop="openAdjustmentModal(team)" class="w-8 h-8 rounded-full text-slate-600 hover:text-indigo-400 hover:bg-indigo-900/30 flex items-center justify-center transition-all">
                  <i class="ph-bold ph-gavel text-lg"></i>
                </button>
              </div>
            </div>

          </div>
          <div v-if="getGroupWildcards('Finals').length > 0" class="mt-4 pt-4 border-t border-slate-700/50 border-dashed">
            <div class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2"><i class="ph-bold ph-ghost"></i> Wildcards</div>
            <div v-for="wc in getGroupWildcards('Finals')" :key="wc.id" class="bg-slate-800/50 rounded-lg p-3 border border-slate-700 border-dashed flex justify-between items-center hover:bg-slate-800 transition-colors mb-2">
              <div><span class="font-bold text-slate-300">{{ wc.name }}</span> <span v-if="wc.uma" class="text-xs text-slate-500 ml-2">({{ wc.uma }})</span></div>
              <div class="text-xl font-mono font-bold text-slate-400">{{ wc.points }} <span class="text-xs font-sans font-normal text-slate-600">PTS</span></div>
            </div>
          </div>
        </div>

        <div v-if="tournament.status === 'completed'" class="mt-8 flex flex-col text-center items-center p-6 bg-indigo-900/20 border border-indigo-500/30 rounded-xl">
          <h3 class="text-2xl font-bold text-indigo-300 mb-2">Tournament Complete</h3>

          <p class="text-slate-300 mb-4">
            <span class="mr-1">{{ winningTeams.length > 1 ? 'Winners:' : 'Winner:' }}</span>
            <span class="font-bold text-white text-lg">
              {{ winningTeams.map(t => t.name).join(' & ') }}
            </span>
          </p>

          <div class="container mx-auto p-4">
            <DiscordExportPreview :tournament="tournament" :isAdmin="true" />
          </div>
        </div>
      </div>
    </div>

<!--    STAGE ADVANCEMENT BUTTONS-->
    <div v-if="canAdvanceToFinals" class="flex justify-center mt-8">
      <button @click="advanceToFinals"
              :disabled="!isAdminRef"
              class="bg-amber-500 hover:bg-amber-600 text-slate-900 text-lg font-bold py-3 px-8 rounded-lg shadow-lg shadow-amber-900/20 animate-pulse">
        Initialize Finals Stage
      </button>
    </div>

    <div v-if="canEndTournament" class="flex justify-center mt-8">
      <button @click="endTournament"
              :disabled="!isAdminRef || isEndingTournament"
              class="bg-slate-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-lg font-bold py-3 px-8 rounded-lg transition-colors">
        <template v-if="isEndingTournament">
          <i class="ph ph-spinner animate-spin"></i> Completing...
        </template>
        <template v-else>Complete Tournament</template>
      </button>
    </div>

    <div v-if="tournament.status === 'completed' && isAdminRef" class="flex justify-center mt-8">
      <button @click="reopenTournament"
              :disabled="isEndingTournament"
              class="bg-rose-900/40 hover:bg-rose-600 border border-rose-500/50 hover:border-rose-500 text-rose-300 hover:text-white text-sm font-bold py-2.5 px-6 rounded-lg transition-all flex items-center gap-2 shadow-lg hover:shadow-rose-900/50 disabled:opacity-50 disabled:cursor-not-allowed">
        <template v-if="isEndingTournament">
          <i class="ph ph-spinner animate-spin text-lg"></i> Reopening...
        </template>
        <template v-else>
          <i class="ph-bold ph-arrow-u-up-left text-lg"></i>
          Reopen for Corrections
        </template>
      </button>
    </div>

<!--    UMA POOLS (uma-draft format only) -->
    <div v-if="tournament.format === 'uma-draft' && tournament.teams.some(t => t.umaPool && t.umaPool.length > 0)" class="mb-8">
      <div class="bg-indigo-900/10 border border-indigo-500/20 rounded-xl overflow-hidden transition-all duration-300"
           :class="showUmaPools ? 'shadow-lg shadow-indigo-900/10' : ''">

        <button @click="showUmaPools = !showUmaPools"
                class="w-full px-4 py-3 flex items-center justify-between hover:bg-indigo-500/5 transition-colors group">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20 group-hover:bg-indigo-500/20 transition-colors">
              <i class="ph-fill ph-horse text-lg"></i>
            </div>
            <div class="text-left">
              <span class="block text-indigo-200 font-bold uppercase tracking-wider text-sm">Uma Pools</span>
              <span class="text-xs text-indigo-400/70">Drafted umas per team</span>
            </div>
          </div>
          <i class="ph-bold ph-caret-down text-indigo-400 transition-transform duration-300"
             :class="showUmaPools ? 'rotate-180' : ''"></i>
        </button>

        <div v-show="showUmaPools" class="border-t border-indigo-500/10 bg-indigo-950/10 p-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
            <div v-for="team in sortedTeamsForModal" :key="team.id"
                 class="relative bg-slate-800/80 backdrop-blur-sm border-t-4 border-b border-x border-slate-700 rounded-xl p-5"
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
        </div>
      </div>
    </div>

<!--    RACE RESULT INPUTS-->
    <RaceInputs
        :secure-update="secureUpdate"
        :tournament-prop="tournament"
        :is-admin="isAdminRef"

      />

<!--    HALL OF FAME-->
    <HallOfFame :tournament="tournament"></HallOfFame>

    <PlayerStatsBoard
        :tournament="tournament"
        :current-view="currentView"
        :is-admin="isAdminRef"
        :secure-update="secureUpdate"
    />

    <div v-if="showAdjustmentModal" class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">

      <div class="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full p-6 shadow-2xl">

        <h3 class="text-xl font-bold text-white mb-1">Adjust Points</h3>
        <p class="text-sm text-slate-400 mb-6">For team: <span class="text-indigo-400 font-bold">{{ activeTeamName }}</span></p>

        <div class="space-y-4">
          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Amount</label>

            <div class="flex flex-col sm:flex-row gap-2 mt-1">

              <div class="grid grid-cols-2 sm:flex gap-2">
                <button @click="adjAmount -= 10"
                        class="w-14 py-2 bg-slate-800 hover:bg-red-900/30 border border-slate-700 hover:border-red-500/50 text-red-400 rounded transition-colors font-bold flex justify-center items-center">
                  -10
                </button>
                <button @click="adjAmount -= 5"
                        class="w-14 py-2 bg-slate-800 hover:bg-red-900/30 border border-slate-700 hover:border-red-500/50 text-red-400 rounded transition-colors font-bold flex justify-center items-center">
                  -5
                </button>
              </div>

              <input v-model.number="adjAmount" type="number"
                     class="w-full sm:flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-2 text-white text-center font-bold focus:border-indigo-500 focus:outline-none">

              <div class="grid grid-cols-2 sm:flex gap-2">
                <button @click="adjAmount += 5"
                        class="w-14 py-2 bg-slate-800 hover:bg-emerald-900/30 border border-slate-700 hover:border-emerald-500/50 text-emerald-400 rounded transition-colors font-bold flex justify-center items-center">
                  +5
                </button>
                <button @click="adjAmount += 10"
                        class="w-14 py-2 bg-slate-800 hover:bg-emerald-900/30 border border-slate-700 hover:border-emerald-500/50 text-emerald-400 rounded transition-colors font-bold flex justify-center items-center">
                  +10
                </button>
              </div>

            </div>
            <p class="text-[10px] text-slate-500 mt-1">Negative for penalty, positive for bonus.</p>
          </div>

          <div>
            <label class="text-xs font-bold text-slate-500 uppercase">Reason</label>
            <input v-model="adjReason" type="text" placeholder="e.g. Slow Play, Disconnect..."
                   class="w-full mt-1 bg-slate-950 border border-slate-700 rounded p-3 text-white focus:border-indigo-500 focus:outline-none">
          </div>

          <div class="flex gap-3 pt-2">
            <button @click="showAdjustmentModal = false" class="flex-1 py-3 rounded-lg font-bold text-slate-400 hover:bg-slate-800 transition-colors">
              Cancel
            </button>
            <button @click="submitAdjustment"
                    :disabled="!adjAmount || !adjReason"
                    class="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-lg font-bold shadow-lg shadow-indigo-900/20 transition-all">
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showUmaModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div class="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl">

        <div class="flex justify-between items-center mb-6">
          <h3 class="text-2xl font-bold text-white">Edit Umas</h3>
          <button @click="closeUmaModal" class="text-slate-400 hover:text-white">
            <i class="ph-bold ph-x text-xl"></i>
          </button>
        </div>

        <div class="space-y-6">
          <p class="text-sm text-slate-400">
            Changes are saved automatically.
          </p>

          <div class="space-y-8">
            <div v-for="team in sortedTeamsForModal" :key="team.id" class="space-y-3">
              <h4 class="font-bold text-lg flex items-center gap-2">
                <span v-if="tournament.teams.length > 5" class="text-xs font-mono px-2 py-0.5 rounded border bg-slate-800 border-slate-700 text-slate-400">Group {{ team.group }}</span>
                <span :style="{ color: team.color }">{{ team.name }}</span>
              </h4>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div
                    v-for="playerId in [team.captainId, ...team.memberIds]"
                    :key="playerId"
                    class="flex items-center gap-3 bg-slate-800 p-3 rounded border border-slate-700"
                >
                  <span class="text-sm font-medium truncate flex-1 text-slate-200">
                    {{ tournament.players[playerId]?.name || 'Unknown' }}
                  </span>

                  <select
                      v-if="tournament.players[playerId]"
                      v-model="tournament.players[playerId].uma"
                      @change="submitUmaForPlayer(playerId, tournament.players[playerId].uma)"
                      class="w-48 shrink-0 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all cursor-pointer"
                  >
                    <option value="">- Select -</option>
                    <option v-for="uma in getUmaList(playerId)" :key="uma" :value="uma">
                      {{ uma }}
                    </option>
                  </select>
                </div>
              </div>
            </div>

            <div v-if="tournament.wildcards && tournament.wildcards.length > 0" class="space-y-3">
              <h4 class="font-bold text-lg text-slate-300 flex items-center gap-2">
                <i class="ph-fill ph-ghost text-slate-500"></i> Wildcards
              </h4>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div
                    v-for="wc in tournament.wildcards"
                    :key="wc.playerId"
                    class="flex items-center gap-3 bg-slate-800 p-3 rounded border border-slate-700"
                >
                  <span class="text-sm font-medium truncate flex-1 text-slate-200">
                    {{ tournament.players[wc.playerId]?.name || 'Unknown' }}
                  </span>

                  <select
                      v-if="tournament.players[wc.playerId]"
                      v-model="tournament.players[wc.playerId]!.uma"
                      @change="submitUmaForPlayer(wc.playerId, tournament.players[wc.playerId]!.uma)"
                      class="w-48 shrink-0 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all cursor-pointer"
                  >
                    <option value="">- Select -</option>
                    <option v-for="uma in getUmaList(wc.playerId)" :key="uma" :value="uma">
                      {{ uma }}
                    </option>
                  </select>
                </div>
              </div>
            </div>

            <div class="pt-4 border-t border-slate-700 flex justify-end gap-3">
              <button
                  @click="closeUmaModal"
                  class="bg-slate-700 hover:bg-slate-600 text-white px-6 py-2 rounded font-bold transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showWildcardModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" @click.self="showWildcardModal = false">
      <div class="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-6 shadow-2xl">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-xl font-bold text-white flex items-center gap-2">
            <i class="ph-fill ph-ghost text-indigo-400"></i>
            Add Wildcard
          </h3>
          <button @click="showWildcardModal = false" class="text-slate-500 hover:text-white"><i class="ph-bold ph-x"></i></button>
        </div>

        <p class="text-sm text-slate-400 mb-4">
          Adding a wildcard player to <span class="text-white font-bold">{{ wildcardTargetGroup === 'Finals' ? 'The Finals' : 'Group ' + wildcardTargetGroup }}</span>.
          They will not belong to a team but can participate in races.
        </p>

        <PlayerSelector
            :app-id="props.appId"
            :players="globalPlayers"
            :exclude-ids="tournamentPlayerIds"
            placeholder="Search or add wildcard player..."
            @select="handleWildcardSelect"
            @create="addGlobalPlayer"
        />
      </div>
    </div>

    <div v-if="showTieBreakerModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">

      <div class="bg-slate-900 border border-slate-700 rounded-xl w-auto min-w-[350px] max-w-[90vw] p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">

        <div class="text-center mb-6">
          <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/10 text-amber-500 mb-4 ring-1 ring-amber-500/50">
            <i class="ph-fill ph-scales text-3xl"></i>
          </div>

          <div class="relative flex justify-center items-center mb-2">
            <h3 class="text-2xl font-bold text-white whitespace-nowrap">Tie Breaker Required</h3>

            <button @click="cancelTieBreaker"
                    class="absolute -right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors p-2">
              <i class="ph-bold ph-x text-xl"></i>
            </button>
          </div>

          <p class="text-slate-400 text-sm mb-3">
            A perfect statistical tie was detected.
          </p>

          <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border whitespace-nowrap"
               :class="tournament.usePlacementTiebreaker ? 'bg-indigo-900/30 border-indigo-500/30 text-indigo-300' : 'bg-slate-800 border-slate-600 text-slate-400'">
            <i class="ph-fill" :class="tournament.usePlacementTiebreaker ? 'ph-check-circle' : 'ph-x-circle'"></i>
            {{ tournament.usePlacementTiebreaker ? 'Placement Tiebreaker: Active' : 'Placement Tiebreaker: Disabled' }}
          </div>
        </div>

        <div class="flex flex-wrap justify-center gap-4 mb-8">

          <div v-for="group in ['A', 'B', 'C'].filter(g => tiedTeams.some(t => t.group === g))" :key="group"
               class="bg-slate-950/50 rounded-lg p-3 border border-slate-800 flex flex-col gap-3 w-64 shrink-0">

            <div class="text-xs font-bold text-slate-500 uppercase tracking-widest text-center border-b border-slate-800 pb-2">
              Group {{ group }}
            </div>

            <div v-if="tournament.teams.some(t => t.group === group && guaranteedIds.includes(t.id) && !tiedTeams.some(tt => tt.id === t.id))"
                 class="space-y-2">

              <div class="text-[10px] text-emerald-500/70 font-bold uppercase tracking-wider px-1">Qualified</div>

              <div v-for="team in tournament.teams.filter(t => t.group === group && guaranteedIds.includes(t.id) && !tiedTeams.some(tt => tt.id === t.id)).sort((a,b) => b.points - a.points)"
                   :key="team.id"
                   class="bg-emerald-900/10 border border-emerald-500/20 rounded p-2 flex justify-between items-center opacity-70 grayscale-[0.3]">

                <div class="flex items-center gap-2 overflow-hidden">
                  <div class="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center text-[10px] font-bold ring-1 ring-emerald-500/50">Q</div>
                  <div class="text-sm font-bold text-slate-300 truncate" :style="{ color: team.color }">{{ team.name }}</div>
                </div>
                <div class="text-xs font-mono text-slate-500">{{ team.points }} pts</div>
              </div>

              <div class="border-t border-slate-800 border-dashed my-2"></div>
            </div>

            <div v-if="tournament.teams.some(t => t.group === group && guaranteedIds.includes(t.id) && !tiedTeams.some(tt => tt.id === t.id))"
                 class="text-[10px] text-amber-500/70 font-bold uppercase tracking-wider px-1 mb-1">
              Contenders
            </div>

            <button v-for="team in tiedTeams.filter(t => t.group === group)" :key="team.id"
                    @click="resolveManually(team)"
                    class="relative text-left p-3 rounded-lg border transition-all duration-200 group hover:shadow-lg"
                    :class="guaranteedIds.includes(team.id)
            ? 'bg-slate-800 border-emerald-500 ring-1 ring-emerald-500'
            : 'bg-slate-900 border-slate-700 hover:border-indigo-500 hover:bg-slate-800'"
            >
              <div class="absolute top-3 right-3 w-5 h-5 rounded-full border flex items-center justify-center transition-colors"
                   :class="guaranteedIds.includes(team.id) ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-600 text-transparent'">
                <i class="ph-bold ph-check text-xs"></i>
              </div>

              <div class="font-bold text-base mb-1 pr-6 truncate" :style="{ color: team.color }">{{ team.name }}</div>
              <div class="text-xs font-mono text-slate-400 mb-3">{{ team.points }} pts</div>

              <div class="space-y-1">
                <div v-for="pid in [team.captainId, ...team.memberIds]" :key="pid" class="flex items-center gap-1.5">
                  <div class="w-1 h-1 rounded-full bg-slate-600 shrink-0"></div>
                  <span class="text-[10px] text-slate-400 leading-tight truncate">
              {{ tournament.players[pid]?.name || 'Unknown' }}
            </span>
                </div>
              </div>
            </button>

          </div>
        </div>

        <div class="relative py-4">
          <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-slate-800"></div></div>
          <div class="relative flex justify-center text-xs uppercase font-bold tracking-widest">
            <span class="px-3 bg-slate-900 whitespace-nowrap"
                  :class="tiebreakersNeeded === 0 ? 'text-emerald-400' : 'text-slate-500'">
                {{
                tiebreakersNeeded > 0
                    ? `Select ${tiebreakersNeeded} more to advance`
                    : tiebreakersNeeded === 0 ? 'Selection Complete' : `De-select ${tiebreakersNeeded*-1} more to advance`
              }}
            </span>
          </div>
        </div>

        <button v-if="tiebreakersNeeded === 0"
                @click="confirmTiebreakerSelection"
                class="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-lg shadow-lg shadow-emerald-900/20 transition-all flex items-center justify-center gap-2 animate-fade-in">
          Confirm & Advance Teams <i class="ph-bold ph-arrow-right"></i>
        </button>
        <div v-else class="text-center text-xs text-slate-600 italic">
          Please resolve the tie to proceed.
        </div>

      </div>
    </div>

  </div>

<!--  <Teleport to="body">-->
<!--    <Transition-->
<!--        enter-active-class="transition duration-300 ease-out"-->
<!--        enter-from-class="translate-x-full"-->
<!--        enter-to-class="translate-x-0"-->
<!--        leave-active-class="transition duration-200 ease-in"-->
<!--        leave-from-class="translate-x-0"-->
<!--        leave-to-class="translate-x-full"-->
<!--    >-->
<!--      <div v-if="showBans" class="fixed inset-y-0 right-0 z-[100] w-full max-w-2xl bg-slate-900 shadow-2xl border-l border-red-500/20 flex flex-col">-->
<!--        -->
<!--        &lt;!&ndash; Header &ndash;&gt;-->
<!--        <div class="p-6 border-b border-slate-800 flex items-center justify-between bg-red-950/10">-->
<!--          <div class="flex items-center gap-4">-->
<!--            <div class="w-12 h-12 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center border border-red-500/20">-->
<!--              <i class="ph-bold ph-prohibit text-2xl"></i>-->
<!--            </div>-->
<!--            <div>-->
<!--              <h3 class="text-xl font-black text-white uppercase tracking-tighter">Banned Characters</h3>-->
<!--              <p class="text-xs text-red-400/70 font-bold uppercase tracking-widest">{{ tournament.bans?.length }} restricted from entries</p>-->
<!--            </div>-->
<!--          </div>-->
<!--          <button @click="showBans = false" class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">-->
<!--            <i class="ph-bold ph-x text-xl"></i>-->
<!--          </button>-->
<!--        </div>-->

<!--        &lt;!&ndash; Body &ndash;&gt;-->
<!--        <div class="flex-1 overflow-y-auto p-6 relative">-->
<!--          &lt;!&ndash; Background decorative stripes &ndash;&gt;-->
<!--          <div class="absolute inset-0 opacity-[0.02] pointer-events-none bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PHBhdGggZD0iTTAgNDBMNDAgME0tMTAgMTBMMTAgLTEwTTMwIDUwTDUwIDMwIiBzdHJva2U9IiNmZjAwMDAiIHN0cm9rZS13aWR0aD0iNSIvPjwvc3ZnPg==')]"></div>-->

<!--          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 relative z-10">-->
<!--            <div v-for="uma in tournament.bans" :key="uma"-->
<!--                 class="group/uma flex flex-col items-center gap-2 p-3 bg-slate-800/40 border border-slate-700/50 rounded-xl hover:border-red-500/40 hover:bg-red-950/20 transition-all duration-500">-->
<!--              <div class="relative">-->
<!--                <div class="w-20 h-20 rounded-2xl overflow-hidden border-2 border-slate-700 group-hover/uma:border-red-500/40 transition-colors shadow-inner bg-slate-900">-->
<!--                  <img :src="getUmaImagePath(uma)" :alt="uma"-->
<!--                       class="w-full h-full object-cover grayscale brightness-75 group-hover/uma:grayscale-0 group-hover/uma:brightness-100 transition-all duration-700" />-->
<!--                </div>-->
<!--                <div class="absolute -top-2 -right-2 w-7 h-7 bg-red-600 rounded-full flex items-center justify-center border-2 border-slate-900 shadow-lg animate-pulse">-->
<!--                  <i class="ph-fill ph-prohibit text-white text-xs"></i>-->
<!--                </div>-->
<!--              </div>-->
<!--              <span class="text-[11px] font-black uppercase tracking-tighter text-slate-400 group-hover/uma:text-red-200 transition-colors text-center leading-normal w-full px-1">-->
<!--                {{ uma }}-->
<!--              </span>-->
<!--            </div>-->
<!--          </div>-->
<!--        </div>-->
<!--      </div>-->
<!--    </Transition>-->

    <!-- Backdrop -->
<!--    <Transition-->
<!--        enter-active-class="transition duration-300 ease-out"-->
<!--        enter-from-class="opacity-0"-->
<!--        enter-to-class="opacity-100"-->
<!--        leave-active-class="transition duration-200 ease-in"-->
<!--        leave-from-class="opacity-100"-->
<!--        leave-to-class="opacity-0"-->
<!--    >-->
<!--      <div v-if="showBans" @click="showBans = false" class="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm"></div>-->
<!--    </Transition>-->
<!--  </Teleport>-->
</template>