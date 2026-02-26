<script setup lang="ts">
import {computed, ref, toRef} from 'vue';
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
  getPlayerNameOrUma,
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
const showPlayerOrUmaName = ref(true);

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

        <div v-show="showBans" class="border-t border-red-500/10 bg-red-950/10 p-4">
          <div class="flex flex-wrap gap-2">
                  <span v-for="uma in tournament.bans" :key="uma"
                        class="px-3 py-1 bg-red-900/40 border border-red-500/30 rounded text-red-200 text-sm flex items-center gap-2">
                      <i class="ph-fill ph-prohibit text-xs opacity-50"></i>
                      {{ uma }}
                  </span>
          </div>
        </div>
      </div>
    </div>

<!--    OVERVIEW AND PLAYER / SETTINGS BUTTONS -->
<!--    <div class="flex justify-between items-center mb-6">-->
<!--      <h2 class="text-3xl font-bold text-white">-->
<!--        Tournament Overview-->
<!--      </h2>-->

<!--      <div class="flex gap-2">-->
<!--        <div class="bg-slate-800 p-1 rounded-lg flex text-xs font-bold">-->
<!--          <button @click="showPlayerOrUmaName = true"-->
<!--                  class="px-3 py-1 rounded transition-colors"-->
<!--                  :class="showPlayerOrUmaName ? 'bg-slate-600 text-white' : 'text-slate-500 hover:text-slate-300'">Name</button>-->
<!--          <button @click="showPlayerOrUmaName = false"-->
<!--                  class="px-3 py-1 rounded transition-colors"-->
<!--                  :class="!showPlayerOrUmaName ? 'bg-slate-600 text-white' : 'text-slate-500 hover:text-slate-300'">Uma</button>-->
<!--        </div>-->

<!--        <button v-if="isAdminRef" @click="showUmaModal = true" class="text-slate-500 hover:text-indigo-400 px-2 transition-colors">-->
<!--          <i class="ph-bold ph-gear text-xl"></i>-->
<!--        </button>-->
<!--      </div>-->
<!--    </div>-->

<!--    <div v-if="tournament.teams.length >= 6" class="flex justify-center border-b border-slate-700 mb-8">-->
<!--      <button @click="currentView = 'groups'"-->
<!--              class="pb-3 px-6 text-sm font-bold uppercase tracking-widest border-b-2 transition-all"-->
<!--              :class="currentView === 'groups' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-300'">-->
<!--        Group Stage-->
<!--      </button>-->
<!--      <button @click="currentView = 'finals'"-->
<!--              :disabled="!canShowFinals"-->
<!--              class="pb-3 px-6 text-sm font-bold uppercase tracking-widest border-b-2 transition-all disabled:opacity-30 disabled:cursor-not-allowed"-->
<!--              :class="currentView === 'finals' ? 'border-amber-500 text-amber-500' : 'border-transparent text-slate-500 hover:text-slate-300'">-->
<!--        Grand Finals-->
<!--      </button>-->
<!--    </div>-->

<!--    <div v-if="currentView === 'groups' && tournament.teams.length >= 6" class="mb-6 bg-indigo-900/20 border border-indigo-500/20 p-3 rounded-lg flex items-center gap-3 text-sm text-indigo-200">-->
<!--      <i class="ph-fill ph-info text-indigo-400"></i>-->
<!--      <span>-->
<!--        <span v-if="tournament.teams.length === 9">Winners of groups A, B, and C advance automatically.</span>-->
<!--        <span v-else>Winners of A & B, plus the highest scoring runner-up advance.</span>-->
<!--      </span>-->
<!--    </div>-->

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
        <div class="bg-slate-800 p-1 rounded-lg flex text-xs font-bold">
          <button @click="showPlayerOrUmaName = true"
                  class="px-3 py-1 rounded transition-colors"
                  :class="showPlayerOrUmaName ? 'bg-slate-600 text-white' : 'text-slate-500 hover:text-slate-300'">Name
          </button>
          <button @click="showPlayerOrUmaName = false"
                  class="px-3 py-1 rounded transition-colors"
                  :class="!showPlayerOrUmaName ? 'bg-slate-600 text-white' : 'text-slate-500 hover:text-slate-300'">Uma
          </button>
        </div>

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

            <div class="relative z-10">
              <div>
                <span class="font-bold text-lg text-white" :style="{ color: team.color }">{{ team.name + ' ' }} </span>
                <span class="font-light text-sm">{{ team.memberIds.map((member) => tournament.players[member]?.name).join(' ') }}</span>
              </div>
              <div class="text-xs text-slate-400 flex gap-2 mt-1">
            <span :style="{ color: team.color }"
                  v-for="pid in [team.captainId, ...team.memberIds].sort((a,b) => getRoundPoints(b) - getRoundPoints(a))"
                  :key="pid" class="bg-slate-900 px-2 py-0.5 rounded">
              {{ getPlayerNameOrUma(pid, showPlayerOrUmaName) + ' (' + getRoundPoints(pid) + ')'}}
            </span>
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

            <div class="relative z-10">
              <div>
                <span class="font-bold text-lg text-white" :style="{ color: team.color }">{{ team.name + ' ' }} </span>
                <span class="font-light text-sm">{{ team.memberIds.map((member) => tournament.players[member]?.name).join(' ') }}</span>
              </div>
              <div class="text-xs text-slate-400 flex gap-2 mt-1">
             <span :style="{ color: team.color }"
                   v-for="pid in [team.captainId, ...team.memberIds].sort((a,b) => getRoundPoints(b) - getRoundPoints(a))"
                   :key="pid" class="bg-slate-900 px-2 py-0.5 rounded">
               {{ getPlayerNameOrUma(pid, showPlayerOrUmaName) + ' (' + getRoundPoints(pid) + ')'}}
             </span>
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

            <div class="relative z-10">
              <div>
                <span class="font-bold text-lg text-white" :style="{ color: team.color }">{{ team.name + ' ' }} </span>
                <span class="font-light text-sm">{{ team.memberIds.map((member) => tournament.players[member]?.name).join(' ') }}</span>
              </div>
              <div class="text-xs text-slate-400 flex gap-2 mt-1">
             <span :style="{ color: team.color }"
                   v-for="pid in [team.captainId, ...team.memberIds].sort((a,b) => getRoundPoints(b) - getRoundPoints(a))"
                   :key="pid" class="bg-slate-900 px-2 py-0.5 rounded">
               {{ getPlayerNameOrUma(pid, showPlayerOrUmaName) + ' (' + getRoundPoints(pid) + ')'}}
             </span>
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
            <div class="relative z-10">
              <div>
                <span class="font-bold text-lg text-white" :style="{ color: team.color }">{{ team.name + ' ' }} </span>
                <span class="font-light text-sm">
                  {{ team.memberIds.map((member) => tournament.players[member]?.name).join(' ') }}
                </span>
              </div>
              <div class="text-sm text-slate-400 flex gap-2 mt-1">
                <span :style="{ color: team.color }"
                      v-for="pid in [team.captainId, ...team.memberIds].sort((a,b) => getRoundPoints(b) - getRoundPoints(a))"
                      :key="pid" class="bg-slate-900 px-2 py-0.5 rounded">{{ getPlayerNameOrUma(pid, showPlayerOrUmaName) + ' (' + getRoundPoints(pid) + ')'}}</span>
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
            <div v-for="team in tournament.teams" :key="team.id"
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

<!--    PLAYER STATISTICS-->
<!--    <div class="mt-12 pt-8 border-t border-slate-700">-->
<!--      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">-->
<!--        <div class="flex items-center gap-3 mb-6">-->
<!--          <div class="h-8 w-1.5 bg-amber-500 rounded-full shadow-[0_0_15px_rgba(245,158,11,0.6)]"></div>-->
<!--          <div>-->
<!--            <h2 class="text-xl font-bold text-white uppercase tracking-widest">Player Stats</h2>-->
<!--            <p class="text-xs text-slate-400 font-medium">Points and Placements of Players</p>-->
<!--          </div>-->
<!--        </div>-->

<!--        <div class="flex flex-wrap items-center gap-2">-->

<!--          <span class="text-xs font-bold text-slate-500 uppercase tracking-widest mr-1 hidden sm:inline">-->
<!--            Sort:-->
<!--          </span>-->

<!--          <div class="relative">-->
<!--            <select v-model="sortBy"-->
<!--                    class="appearance-none bg-slate-800 text-slate-300 text-xs font-bold uppercase tracking-wider pl-3 pr-8 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-indigo-500 cursor-pointer hover:bg-slate-750 transition-colors">-->
<!--              <option value="total">Points (Total)</option>-->
<!--              <option value="group" v-if="!isSmallTournament">Points (Group)</option>-->
<!--              <option value="finals" v-if="!isSmallTournament">Points (Finals)</option>-->
<!--              <option value="name">Name</option>-->
<!--              <option value="uma">Uma</option>-->
<!--            </select>-->
<!--            <i class="ph-bold ph-caret-down absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"></i>-->
<!--          </div>-->

<!--          <button @click="sortDesc = !sortDesc"-->
<!--                  class="flex items-center bg-slate-800 text-slate-300 hover:text-white px-3 py-2 text-xs rounded-lg border border-slate-700 hover:border-slate-600 transition-colors"-->
<!--                  :title="sortDesc ? 'Descending' : 'Ascending'">-->
<!--            <i class="ph-bold text-base" :class="!sortDesc ? 'ph-sort-descending' : 'ph-sort-ascending'"></i>-->
<!--          </button>-->

<!--          <div class="w-px h-6 bg-slate-700 mx-1"></div>-->

<!--          <button @click="groupByTeam = !groupByTeam"-->
<!--                  class="flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-xs font-bold uppercase tracking-wider"-->
<!--                  :class="groupByTeam ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'">-->
<!--            <i class="ph-bold" :class="groupByTeam ? 'ph-users-three' : 'ph-squares-four'"></i>-->
<!--            <span class="hidden sm:inline">Group by Team</span>-->
<!--          </button>-->
<!--        </div>-->
<!--      </div>-->

<!--      <div class="space-y-8">-->
<!--        <div v-for="section in structuredPlayerStats" :key="section.id">-->

<!--          <div v-if="groupByTeam && section.id !== 'all'" class="flex items-center gap-3 mb-4">-->

<!--            <div class="h-px bg-slate-700 flex-1"></div>-->

<!--            <span class="flex items-center gap-2 text-sm font-bold uppercase tracking-widest px-3 py-1 rounded border bg-slate-800/50 whitespace-nowrap"-->
<!--                  :style="{ color: section.color || '#fff', borderColor: (section.color || '#fff') + '40' }">-->
<!--              {{ section.title }}-->
<!--              <span v-if="['total', 'group', 'finals'].includes(sortBy)"-->
<!--                    class="whitespace-nowrap text-xs font-mono font-bold text-slate-400 bg-slate-900 px-2 rounded border border-slate-800 shadow-sm">-->
<!--                {{ section.sortNumeric }} pts-->
<!--              </span>-->
<!--            </span>-->

<!--            <div class="h-px bg-slate-700 flex-1"></div>-->
<!--          </div>-->

<!--          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">-->

<!--            <div v-for="player in section.players" :key="player.id"-->
<!--                 class="relative overflow-hidden bg-slate-800 rounded-xl p-4 border border-slate-700 hover:border-indigo-500/50 transition-all flex flex-col h-full group hover:shadow-xl hover:-translate-y-1">-->

<!--              <div class="absolute inset-0 transition-opacity duration-500 opacity-0 group-hover:opacity-100 pointer-events-none"-->
<!--                   :style="{ background: `linear-gradient(to bottom right, ${getPlayerColor(player.id)}33, transparent)` }">-->
<!--              </div>-->

<!--              <div class="relative z-10 flex justify-between items-start pb-2 border-slate-700/50">-->
<!--                <div>-->
<!--                  <div class="text-2xl font-bold leading-none group-hover:text-indigo-300 transition-colors"-->
<!--                       :style="{ color: getPlayerColor(player.id) }">-->
<!--                    {{ player.name }}-->
<!--                  </div>-->
<!--                  <div class="text-[10px] uppercase font-bold tracking-wider text-slate-500 mt-1 h-3.5" v-if="player.uma">-->
<!--                    {{ player.uma }}-->
<!--                  </div>-->
<!--                  <div v-else class="h-3.5 mt-1"></div>-->
<!--                </div>-->
<!--                <div class="text-right">-->
<!--                  <div class="text-2xl font-bold leading-none text-indigo-400 tabular-nums">-->
<!--                    {{ getTotalPoints(player.id) }}-->
<!--                  </div>-->
<!--                  <div class="text-[10px] uppercase font-bold tracking-wider text-slate-500 mt-1 h-3.5">-->
<!--                    Total Pts-->
<!--                  </div>-->
<!--                </div>-->
<!--              </div>-->

<!--              <div class="flex-1 flex flex-col gap-2">-->
<!--                <template v-for="results in [getSplitResults(player.id)]" :key="player.id">-->

<!--                  <div v-if="isSmallTournament">-->
<!--                    <div class="text-[10px] uppercase text-slate-500 font-bold tracking-widest mb-2 flex items-center gap-2">-->
<!--                      Races-->
<!--                      <div class="h-px bg-slate-700 flex-1"></div>-->
<!--                    </div>-->

<!--                    <div class="min-h-[60px] flex flex-col justify-center">-->
<!--                      <div v-if="results.finals.length === 0" class="flex items-center justify-center">-->
<!--                        <span class="text-xs text-slate-600 italic">No races recorded yet</span>-->
<!--                      </div>-->
<!--                      <div v-else class="grid grid-cols-5 gap-2">-->
<!--                        <div v-for="(result, idx) in results.finals" :key="'r'+idx" class="flex flex-col items-center gap-1">-->
<!--                          <div class="w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold border shadow-sm transition-transform hover:scale-110"-->
<!--                               :class="getPositionStyle(result.position, 'finals')">-->
<!--                            {{ result.position || '-' }}-->
<!--                          </div>-->
<!--                          <span class="text-[10px] font-mono text-slate-500">-->
<!--                          {{ result.points > 0 ? '+' + result.points : (result.points === 0 ? '0' : result.points) }}-->
<!--                        </span>-->
<!--                        </div>-->
<!--                      </div>-->
<!--                    </div>-->
<!--                  </div>-->

<!--                  <div v-else class="contents">-->
<!--                    <div>-->
<!--                      <div class="text-[10px] uppercase text-slate-500 font-bold tracking-widest mb-2 flex items-center gap-2">-->
<!--                        Group Stage-->
<!--                        <div class="h-px bg-slate-700 flex-1"></div>-->
<!--                        <span class="font-mono text-slate-400">{{ getPhaseTotal(results.groups) }} pts</span>-->
<!--                      </div>-->

<!--                      <div class="min-h-[60px] flex flex-col justify-center">-->
<!--                        <div v-if="results.groups.length === 0" class="flex items-center justify-center">-->
<!--                          <span class="text-xs text-slate-600 italic">No races recorded yet</span>-->
<!--                        </div>-->
<!--                        <div v-else class="grid grid-cols-5 gap-2">-->
<!--                          <div v-for="(result, idx) in results.groups" :key="'g'+idx" class="flex flex-col items-center gap-1">-->
<!--                            <div class="w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold border shadow-sm transition-transform hover:scale-110"-->
<!--                                 :class="getPositionStyle(result.position, 'groups')">-->
<!--                              {{ result.position || '-' }}-->
<!--                            </div>-->
<!--                            <span class="text-[10px] font-mono text-slate-500">-->
<!--                            {{ result.points > 0 ? '+' + result.points : (result.points === 0 ? '0' : result.points) }}-->
<!--                          </span>-->
<!--                          </div>-->
<!--                        </div>-->
<!--                      </div>-->
<!--                    </div>-->

<!--                    <div v-if="!playerEliminated(player.id) || results.finals.length > 0">-->
<!--                      <div class="text-[10px] uppercase text-slate-500 font-bold tracking-widest mb-2 mt-1 flex items-center gap-2">-->
<!--                        <span class="text-amber-500">Finals</span>-->
<!--                        <div class="h-px bg-slate-700 flex-1"></div>-->
<!--                        <span class="font-mono text-slate-400">{{ getPhaseTotal(results.finals) }} pts</span>-->
<!--                      </div>-->

<!--                      <div class="min-h-[60px] flex flex-col justify-center">-->
<!--                        <div v-if="results.finals.length === 0" class="flex items-center justify-center">-->
<!--                          <span class="text-xs text-slate-600 italic">No races recorded yet</span>-->
<!--                        </div>-->
<!--                        <div v-else class="grid grid-cols-5 gap-2">-->
<!--                          <div v-for="(result, idx) in results.finals" :key="'f'+idx" class="flex flex-col items-center gap-1">-->
<!--                            <div class="w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold border shadow-sm transition-transform hover:scale-110"-->
<!--                                 :class="getPositionStyle(result.position, 'finals')">-->
<!--                              {{ result.position || '-' }}-->
<!--                            </div>-->
<!--                            <span class="text-[10px] font-mono text-slate-500">-->
<!--                            {{ result.points > 0 ? '+' + result.points : (result.points === 0 ? '0' : result.points) }}-->
<!--                          </span>-->
<!--                          </div>-->
<!--                        </div>-->
<!--                      </div>-->
<!--                    </div>-->

<!--                    <div v-else-if="playerEliminated(player.id)" class="mt-auto">-->
<!--                      <div class="text-[10px] uppercase text-slate-500 font-bold tracking-widest mb-2 mt-1 flex items-center gap-2">-->
<!--                        <span class="text-amber-500">Finals</span>-->
<!--                        <div class="h-px bg-slate-700 flex-1"></div>-->
<!--                        <span class="font-mono text-slate-400">{{ getPhaseTotal(results.finals) }} pts</span>-->
<!--                      </div>-->
<!--                      <div class="min-h-[60px] flex flex-col justify-center">-->
<!--                        <div class="bg-slate-900/50 rounded-lg border border-slate-700 border-dashed p-3 text-center">-->
<!--                          <span class="text-xs text-slate-500 italic">Did not qualify for finals</span>-->
<!--                        </div>-->
<!--                      </div>-->
<!--                    </div>-->
<!--                  </div>-->
<!--                </template>-->
<!--              </div>-->

<!--            </div>-->
<!--          </div>-->
<!--        </div>-->
<!--      </div>-->
<!--    </div>-->
    <PlayerStatsBoard
        :tournament="tournament"
        :current-view="currentView"
        :is-admin="isAdminRef"
        :secure-update="secureUpdate"
    />

<!--    RACE HISTORY LOG-->
    <div class="mt-12 pt-8 border-t border-slate-700" v-if="isDev">
      <h3 class="text-2xl font-bold text-white mb-6">Race History Log</h3>

      <div v-if="sortedRaces.length === 0" class="text-center py-8 text-slate-500 italic bg-slate-800/50 rounded-lg">
        No races recorded yet.
      </div>

      <div class="space-y-4">
        <div v-for="race in sortedRaces" :key="race.id" class="bg-slate-800 rounded-lg p-5 border border-slate-700 hover:border-indigo-500/30 transition-colors">
          <div class="flex justify-between items-start mb-4">
            <div class="flex items-center gap-3">
                    <span class="px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider shadow-sm"
                          :class="race.stage === 'finals' ? 'bg-amber-900/50 text-amber-200 border border-amber-700/50' : 'bg-indigo-900/50 text-indigo-200 border border-indigo-700/50'">
                        {{ race.stage === 'finals' ? 'Grand Finals' : (tournament?.teams.length >= 6 ? 'Group ' + race.group : 'Main Event') }}
                    </span>
              <span class="text-slate-400 text-sm flex items-center gap-1">
                      <i class="ph-bold ph-clock"></i>
                      {{ new Date(race.timestamp).toLocaleString() }}
                    </span>
            </div>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            <div v-for="result in getRaceResults(race)" :key="result.playerId"
                 class="text-sm rounded px-2 py-1.5 flex items-center gap-2 border"
                 :class="result.position === 1 ? 'bg-amber-500/10 border-amber-500/50 text-amber-100' : 'bg-slate-900 border-slate-700 text-slate-300'">
              <span class="font-mono w-5 font-bold" :class="result.position === 1 ? 'text-amber-400' : 'text-slate-500'">{{ result.position }}</span>
              <span class="truncate" :style="{ color: getPlayerColor(result.playerId) }">{{ result.name }} - {{ result.uma }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

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
</template>