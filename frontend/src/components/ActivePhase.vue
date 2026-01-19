<script setup lang="ts">
import {computed, ref, toRef} from 'vue';
import type { Tournament, FirestoreUpdate } from '../types';
import { useGameLogic } from '../composables/useGameLogic';
import { useRoster } from '../composables/useRoster';
import {
  getPlayerAtPosition,
  getPositionStyle,
  getRaceTimestamp,
  getRankColor,
} from '../utils/utils';
import {generateDiscordReport} from "../utils/exportUtils.ts";

const props = defineProps<{
  tournamentProp: Tournament;
  isAdmin: boolean;
  secureUpdate: (data: FirestoreUpdate<Tournament> | Record<string, any>) => Promise<void>;
}>();

// Create Refs for composables
const tournament = toRef(props, 'tournamentProp');
const isAdminRef = toRef(props, 'isAdmin');

// Initialize Game Logic locally
// This keeps 'currentView' (Groups vs Finals) state inside this component
const {
  currentView,
  saving,
  sortedTeamsA,
  sortedTeamsB,
  sortedTeamsC,
  sortedFinalsTeams,
  sortedRaces,
  sortedPlayers,
  canAdvanceToFinals,
  canEndTournament,
  canShowFinals,
  activeStagePlayers,
  getRaceResults,
  getRaceResultsForPlayer,
  getTotalPoints,
  getGroupWildcards,
  updateRacePlacement,
  advanceToFinals,
  endTournament,
  getRoundPoints,
  getRaceCount,
  showTieBreakerModal,
  tiedTeams,
  tiebreakersNeeded,
  guaranteedIds,
  resolveManually,
  getVisualRankIndex,
  getProgressionStatus
} = useGameLogic(tournament, props.secureUpdate);

// Initialize Roster (for visual helpers like colors/names)
const {
  showUmaModal,
  getPlayerColor,
  getPlayerNameOrUma,
  submitUmas,
  getUmaList,
  showWildcardModal,
  openWildcardModal,
  newWildcardName,
  wildcardTargetGroup,
  addWildcard,
} = useRoster(tournament, props.secureUpdate, isAdminRef);

const showBans = ref(false);
const showPlayerOrUmaName = ref(true);

// Helper for 'shouldShowGroup' since it relies on local 'currentView'
const shouldShowGroup = (group: string) => {
  if(currentView.value === 'finals') return false;

  const teamCount = props.tournamentProp.teams.length;
  if(teamCount < 6) return group === 'A';
  if(teamCount === 9) return ['A', 'B', 'C'].includes(group);
  return ['A', 'B'].includes(group);
};

const copyResults = async () => {
  if (!tournament.value) return;
  const text = generateDiscordReport(tournament.value);

  await navigator.clipboard.writeText(text);
  alert("Results copied to clipboard!");
};

const tData = computed(() => tournament.value as Tournament);
</script>

<template>
  <div class="space-y-6">
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
              <span class="text-xs text-red-400/70">{{ tData.bans?.length }} characters restricted</span>
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

    <div v-if="tournament.teams.length >= 6" class="flex justify-center mb-6">
      <div class="bg-slate-800 p-1 rounded-lg flex gap-1">
        <button @click="currentView = 'groups'"
                class="px-6 py-2 rounded-md font-bold transition-colors"
                :class="currentView === 'groups' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'">
          Group Stage
        </button>
        <button @click="currentView = 'finals'"
                :disabled="!canShowFinals"
                class="px-6 py-2 rounded-md font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                :class="currentView === 'finals' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'">
          Finals
        </button>
      </div>
    </div>

    <div class="flex flex-col gap-4 md:grid md:grid-cols-3 md:items-center">
      <div class="text-center md:text-left md:justify-self-start">
        <h2 class="text-3xl font-bold text-white">
          <span v-if="tournament.teams.length < 6">Main Event</span>
          <span v-else>{{ currentView === 'groups' ? 'Group Stage' : 'Grand Finals' }}</span>
        </h2>
        <p class="text-slate-400" v-if="currentView === 'groups'">
          <span v-if="tournament.teams.length === 9">Winner of each group advances (A, B, C)</span>
          <span v-else-if="tournament.teams.length >= 6">Winner of A & B + best runner-up advance</span>
        </p>
      </div>

      <div class="bg-slate-800 p-1 rounded-lg flex gap-1 mx-auto md:mx-0 md:justify-self-center">
        <button @click="showPlayerOrUmaName = true"
                class="px-6 py-2 rounded-md font-bold transition-colors"
                :class="showPlayerOrUmaName === true ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'">
          Players
        </button>
        <button @click="showPlayerOrUmaName = false"
                class="px-6 py-2 rounded-md font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                :class="!showPlayerOrUmaName ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'">
          Umas
        </button>
      </div>
      <div class="mx-auto md:mx-0 md:justify-self-end">
        <button @click="showUmaModal = true"
                :disabled="!isAdminRef"
                class="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg shadow-indigo-900/20">
          <i class="ph-bold ph-gear"></i> Edit Umas
        </button>
      </div>
    </div>

    <div :class="tournament?.teams.length === 9 && currentView === 'groups' ? 'grid md:grid-cols-3 gap-8' : 'grid md:grid-cols-2 gap-8'">

      <div v-if="shouldShowGroup('A')">
        <div class="flex items-center justify-between mb-4 group">
          <div class="flex items-center gap-3">
            <h3 @click="openWildcardModal('A')"
                class="text-xl font-bold text-indigo-400 heading tracking-wide transition-colors"
                :class="isAdminRef ? 'cursor-pointer hover:text-white hover:underline decoration-dashed decoration-indigo-500/50 underline-offset-4' : ''">
              {{ tData?.teams.length >= 6 ? 'Group A' : 'Standings' }}
              <i v-if="isAdminRef" class="ph-bold ph-plus-circle inline-block text-sm opacity-0 group-hover:opacity-100 transition-opacity ml-1"></i>
            </h3>
          </div>
          <span class="text-xs font-mono bg-slate-800 px-2 py-1 rounded text-slate-400">{{ getRaceCount('A') }} / 5 Races</span>
        </div>

        <div class="space-y-3">
          <div v-for="(team, idx) in sortedTeamsA" :key="team.id"
               class="bg-slate-800 rounded-lg p-4 border-l-4 flex justify-between items-center transition-all duration-300 relative overflow-hidden"
               :class="[
                  getRankColor(idx),
                  getProgressionStatus(team.id) === 'safe'
                      ? 'ring-2 ring-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)] z-10'
                      : (getProgressionStatus(team.id) === 'tied'
                          ? 'ring-2 ring-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.2)] z-10'
                          : 'opacity-80')
               ]">

            <div v-if="getProgressionStatus(team.id) === 'safe'"
                 class="absolute -right-1 -top-2 text-emerald-500/10 font-black text-6xl pointer-events-none select-none">
              Q
            </div>

            <div v-else-if="getProgressionStatus(team.id) === 'tied'"
                 class="absolute -right-1 -top-2 text-amber-500/10 font-black text-6xl pointer-events-none select-none rotate-12">
              ?
            </div>
            <div>
              <div>
                <span class="font-bold text-lg text-white" :style="{ color: team.color }">{{ team.name + ' ' }} </span>
                <span class="font-light text-sm">{{ team.memberIds.map((member) => tData.players.find((el) => el.id === member)?.name).join(' ') }}</span>
              </div>
              <div class="text-xs text-slate-400 flex gap-2">
                    <span :style="{ color: team.color }"
                          v-for="pid in [team.captainId, ...team.memberIds].sort((a,b) => getRoundPoints(b) - getRoundPoints(a))"
                          :key="pid" class="bg-slate-900 px-2 py-0.5 rounded">{{ getPlayerNameOrUma(pid, showPlayerOrUmaName) + ' (' + getRoundPoints(pid) + ')'}}</span>
              </div>
            </div>
            <div class="text-2xl font-mono font-bold">{{ team.points }} <span class="text-xs font-sans font-normal text-slate-500">PTS</span></div>
          </div>

          <div v-if="getGroupWildcards('A').length > 0" class="mt-4 pt-4 border-t border-slate-700/50 border-dashed">
            <div class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
              <i class="ph-bold ph-ghost"></i> Wildcards
            </div>

            <div v-for="wc in getGroupWildcards('A')" :key="wc.id"
                 class="bg-slate-800/50 rounded-lg p-3 border border-slate-700 border-dashed flex justify-between items-center hover:bg-slate-800 transition-colors">
              <div>
                <div>
                  <span class="font-bold text-slate-300">{{ wc.name }}</span>
                  <span v-if="wc.uma" class="text-xs text-slate-500 ml-2">({{ wc.uma }})</span>
                </div>
              </div>
              <div class="text-xl font-mono font-bold text-slate-400">
                {{ wc.points }} <span class="text-xs font-sans font-normal text-slate-600">PTS</span>
              </div>
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
               class="bg-slate-800 rounded-lg p-4 border-l-4 flex justify-between items-center transition-all duration-300 relative overflow-hidden"
               :class="[
                  getRankColor(idx),
                  getProgressionStatus(team.id) === 'safe'
                      ? 'ring-2 ring-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)] z-10'
                      : (getProgressionStatus(team.id) === 'tied'
                          ? 'ring-2 ring-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.2)] z-10'
                          : 'opacity-80')
               ]">

            <div v-if="getProgressionStatus(team.id) === 'safe'"
                 class="absolute -right-1 -top-2 text-emerald-500/10 font-black text-6xl pointer-events-none select-none">
              Q
            </div>

            <div v-else-if="getProgressionStatus(team.id) === 'tied'"
                 class="absolute -right-1 -top-2 text-amber-500/10 font-black text-6xl pointer-events-none select-none rotate-12">
              ?
            </div>
            <div>
              <div>
                <span class="font-bold text-lg text-white" :style="{ color: team.color }">{{ team.name + ' ' }} </span>
                <span class="font-light text-sm">{{ team.memberIds.map((member) => tData.players.find((el) => el.id === member)?.name).join(' ') }}</span>
              </div>
              <div class="text-xs text-slate-400 flex gap-2">
                      <span :style="{ color: team.color }"
                            v-for="pid in [team.captainId, ...team.memberIds].sort((a,b) => getRoundPoints(b) - getRoundPoints(a))"
                            :key="pid" class="bg-slate-900 px-2 py-0.5 rounded">
                        {{ getPlayerNameOrUma(pid, showPlayerOrUmaName) + ' (' + getRoundPoints(pid) + ')'}}
                      </span>
              </div>
            </div>
            <div class="text-2xl font-mono font-bold">{{ team.points }} <span class="text-xs font-sans font-normal text-slate-500">PTS</span></div>
          </div>
          <div v-if="getGroupWildcards('B').length > 0" class="mt-4 pt-4 border-t border-slate-700/50 border-dashed">
            <div class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
              <i class="ph-bold ph-ghost"></i> Wildcards
            </div>

            <div v-for="wc in getGroupWildcards('B')" :key="wc.id"
                 class="bg-slate-800/50 rounded-lg p-3 border border-slate-700 border-dashed flex justify-between items-center hover:bg-slate-800 transition-colors">
              <div>
                <div>
                  <span class="font-bold text-slate-300">{{ wc.name }}</span>
                  <span v-if="wc.uma" class="text-xs text-slate-500 ml-2">({{ wc.uma }})</span>
                </div>
              </div>
              <div class="text-xl font-mono font-bold text-slate-400">
                {{ wc.points }} <span class="text-xs font-sans font-normal text-slate-600">PTS</span>
              </div>
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
               class="bg-slate-800 rounded-lg p-4 border-l-4 flex justify-between items-center transition-all duration-300 relative overflow-hidden"
               :class="[
                  getRankColor(idx),
                  getProgressionStatus(team.id) === 'safe'
                      ? 'ring-2 ring-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)] z-10'
                      : (getProgressionStatus(team.id) === 'tied'
                          ? 'ring-2 ring-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.2)] z-10'
                          : 'opacity-80')
               ]">

            <div v-if="getProgressionStatus(team.id) === 'safe'"
                 class="absolute -right-1 -top-2 text-emerald-500/10 font-black text-6xl pointer-events-none select-none">
              Q
            </div>

            <div v-else-if="getProgressionStatus(team.id) === 'tied'"
                 class="absolute -right-1 -top-2 text-amber-500/10 font-black text-6xl pointer-events-none select-none rotate-12">
              ?
            </div>
            <div>
              <div>
                <span class="font-bold text-lg text-white" :style="{ color: team.color }">{{ team.name + ' ' }} </span>
                <span class="font-light text-sm">{{ team.memberIds.map((member) => tData.players.find((el) => el.id === member)?.name).join(' ') }}</span>
              </div>
              <div class="text-xs text-slate-400 flex gap-2">
                      <span :style="{ color: team.color }"
                            v-for="pid in [team.captainId, ...team.memberIds].sort((a,b) => getRoundPoints(b) - getRoundPoints(a))"
                            :key="pid" class="bg-slate-900 px-2 py-0.5 rounded">
                        {{ getPlayerNameOrUma(pid, showPlayerOrUmaName) + ' (' + getRoundPoints(pid) + ')'}}
                      </span>
              </div>
            </div>
            <div class="text-2xl font-mono font-bold">{{ team.points }} <span class="text-xs font-sans font-normal text-slate-500">PTS</span></div>
          </div>
          <div v-if="getGroupWildcards('C').length > 0" class="mt-4 pt-4 border-t border-slate-700/50 border-dashed">
            <div class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
              <i class="ph-bold ph-ghost"></i> Wildcards
            </div>

            <div v-for="wc in getGroupWildcards('C')" :key="wc.id"
                 class="bg-slate-800/50 rounded-lg p-3 border border-slate-700 border-dashed flex justify-between items-center hover:bg-slate-800 transition-colors">
              <div>
                <div>
                  <span class="font-bold text-slate-300">{{ wc.name }}</span>
                  <span v-if="wc.uma" class="text-xs text-slate-500 ml-2">({{ wc.uma }})</span>
                </div>
              </div>
              <div class="text-xl font-mono font-bold text-slate-400">
                {{ wc.points }} <span class="text-xs font-sans font-normal text-slate-600">PTS</span>
              </div>
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
               class="bg-slate-800 rounded-lg p-4 border-l-4 flex justify-between items-center"
               :class="getRankColor(getVisualRankIndex(idx, sortedFinalsTeams))"
          >
            <div>
              <div>
                <span class="font-bold text-lg text-white" :style="{ color: team.color }">{{ team.name + ' ' }} </span>
                <span class="font-light text-sm">{{ team.memberIds.map((member) => tData.players.find((el) => el.id === member)?.name).join(' ') }}</span>
              </div>
              <div class="text-sm text-slate-400 flex gap-2 mt-1">
                    <span :style="{ color: team.color }"
                          v-for="pid in [team.captainId, ...team.memberIds].sort((a,b) => getRoundPoints(b) - getRoundPoints(a))"
                          :key="pid" class="bg-slate-900 px-2 py-0.5 rounded">{{ getPlayerNameOrUma(pid, showPlayerOrUmaName) + ' (' + getRoundPoints(pid) + ')'}}</span>
              </div>
            </div>
            <div class="text-4xl font-mono font-bold text-indigo-400">{{ team.finalsPoints || 0 }}</div>
          </div>
          <div v-if="getGroupWildcards('Finals').length > 0" class="mt-4 pt-4 border-t border-slate-700/50 border-dashed">
            <div class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
              <i class="ph-bold ph-ghost"></i> Wildcards
            </div>

            <div v-for="wc in getGroupWildcards('Finals')" :key="wc.id"
                 class="bg-slate-800/50 rounded-lg p-3 border border-slate-700 border-dashed flex justify-between items-center hover:bg-slate-800 transition-colors">
              <div>
                <div>
                  <span class="font-bold text-slate-300">{{ wc.name }}</span>
                  <span v-if="wc.uma" class="text-xs text-slate-500 ml-2">({{ wc.uma }})</span>
                </div>
              </div>
              <div class="text-xl font-mono font-bold text-slate-400">
                {{ wc.points }} <span class="text-xs font-sans font-normal text-slate-600">PTS</span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="tournament.status === 'completed'" class="mt-8 flex flex-col text-center items-center p-6 bg-indigo-900/20 border border-indigo-500/30 rounded-xl">
          <h3 class="text-2xl font-bold text-indigo-300 mb-2">Tournament Complete</h3>
          <p class="text-slate-300">Winner: <span class="font-bold text-white">{{ sortedFinalsTeams[0]?.name }}</span></p>
          <button
              @click="copyResults"
              class="bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold py-2 px-4 rounded flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
              <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
            </svg>
            Export for Discord
          </button>
        </div>
      </div>
    </div>

    <div v-if="canAdvanceToFinals" class="flex justify-center mt-8">
      <button @click="advanceToFinals"
              :disabled="!isAdminRef"
              class="bg-amber-500 hover:bg-amber-600 text-slate-900 text-lg font-bold py-3 px-8 rounded-lg shadow-lg shadow-amber-900/20 animate-pulse">
        Initialize Finals Stage
      </button>
    </div>

    <div v-if="canEndTournament" class="flex justify-center mt-8">
      <button @click="endTournament"
              :disabled="!isAdminRef"
              class="bg-slate-700 hover:bg-green-600 text-white text-lg font-bold py-3 px-8 rounded-lg transition-colors">
        Complete Tournament
      </button>
    </div>

    <div class="space-y-8">

      <div v-if="shouldShowGroup('A')">
        <div class="flex items-center gap-4 mb-4">
          <h3 class="text-2xl font-bold text-white tracking-wide">
                            <span class="text-indigo-400">
                                {{ tData?.teams.length >= 6 ? 'Group A' : 'Race' }}
                            </span> Results
          </h3>
          <div v-if="saving" class="text-xs font-mono text-emerald-400 animate-pulse">
            <i class="ph-bold ph-floppy-disk"></i> SAVING...
          </div>
        </div>

        <div class="overflow-x-auto pb-4">
          <div class="flex gap-4 min-w-max">
            <div v-for="raceNum in 5" :key="raceNum" class="w-64 bg-slate-800 rounded-xl border border-slate-700 overflow-hidden flex flex-col">
              <div class="bg-slate-900/50 p-3 border-b border-slate-700 flex justify-between items-center">
                <span class="font-bold text-indigo-400">Race {{ raceNum }}</span>
                <span class="text-xs text-slate-500">{{ getRaceTimestamp('A', raceNum, tournament, currentView) }}</span>
              </div>
              <div class="p-2 space-y-1 flex-1">
                <div v-for="pos in (activeStagePlayers('A').length)" :key="pos" class="flex items-center gap-2">
                  <div class="shrink-0 w-6 h-6 rounded flex items-center justify-center text-xs font-mono font-bold"
                       :class="getPositionStyle(pos)">
                    {{ pos }}
                  </div>
                  <select
                      :disabled="!isAdminRef || tournament.stage !== 'groups'"
                      :value="getPlayerAtPosition('A',raceNum,pos,tournament,currentView)"
                      @change="updateRacePlacement('A', raceNum, pos, ($event.target as HTMLSelectElement).value)"
                      :style="{ color: getPlayerColor(getPlayerAtPosition('A',raceNum,pos,tournament,currentView)) }"
                      class="min-w-0 flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all">
                    <option value="">- Select -</option>
                    <option v-for="player in activeStagePlayers('A')"
                            :key="player.id"
                            :value="player.id"
                            :style="{ color: getPlayerColor(player.id) }">
                      {{ player.name }} {{ player.uma ? `(${player.uma})` : '' }}
                    </option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="shouldShowGroup('B')">
        <div class="flex items-center gap-4 mb-4 border-t border-slate-700 pt-8">
          <h3 class="text-2xl font-bold text-white tracking-wide">
            <span class="text-rose-400">Group B</span> Results
          </h3>
        </div>

        <div class="overflow-x-auto pb-4">
          <div class="flex gap-4 min-w-max">
            <div v-for="raceNum in 5" :key="raceNum" class="w-64 bg-slate-800 rounded-xl border border-slate-700 overflow-hidden flex flex-col">
              <div class="bg-slate-900/50 p-3 border-b border-slate-700 flex justify-between items-center">
                <span class="font-bold text-rose-400">Race {{ raceNum }}</span>
                <span class="text-xs text-slate-500">{{ getRaceTimestamp('B', raceNum, tournament, currentView) }}</span>
              </div>
              <div class="p-2 space-y-1 flex-1">
                <div v-for="pos in (activeStagePlayers('B').length)" :key="pos" class="flex items-center gap-2">
                  <div class="shrink-0 w-6 h-6 rounded flex items-center justify-center text-xs font-mono font-bold"
                       :class="getPositionStyle(pos)">
                    {{ pos }}
                  </div>
                  <select
                      :disabled="!isAdminRef || tournament.stage !== 'groups'"
                      :value="getPlayerAtPosition('B',raceNum,pos,tournament,currentView)"
                      @change="updateRacePlacement('B', raceNum, pos, ($event.target as HTMLSelectElement).value)"
                      :style="{ color: getPlayerColor(getPlayerAtPosition('B',raceNum,pos,tournament,currentView)) }"
                      class="min-w-0 flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all">
                    <option value="">- Select -</option>
                    <option v-for="player in activeStagePlayers('B')"
                            :key="player.id"
                            :value="player.id"
                            :style="{ color: getPlayerColor(player.id) }">
                      {{ player.name }} {{ player.uma ? `(${player.uma})` : '' }}
                    </option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="shouldShowGroup('C')">
        <div class="flex items-center gap-4 mb-4 border-t border-slate-700 pt-8">
          <h3 class="text-2xl font-bold text-white tracking-wide">
            <span class="text-emerald-400">Group C</span> Results
          </h3>
        </div>

        <div class="overflow-x-auto pb-4">
          <div class="flex gap-4 min-w-max">
            <div v-for="raceNum in 5" :key="raceNum" class="w-64 bg-slate-800 rounded-xl border border-slate-700 overflow-hidden flex flex-col">
              <div class="bg-slate-900/50 p-3 border-b border-slate-700 flex justify-between items-center">
                <span class="font-bold text-emerald-400">Race {{ raceNum }}</span>
                <span class="text-xs text-slate-500">{{ getRaceTimestamp('C', raceNum, tournament, currentView) }}</span>
              </div>
              <div class="p-2 space-y-1 flex-1">
                <div v-for="pos in (activeStagePlayers('C').length)" :key="pos" class="flex items-center gap-2">
                  <div class="shrink-0 w-6 h-6 rounded flex items-center justify-center text-xs font-mono font-bold"
                       :class="getPositionStyle(pos)">
                    {{ pos }}
                  </div>
                  <select
                      :disabled="!isAdminRef || tournament.stage !== 'groups'"
                      :value="getPlayerAtPosition('C',raceNum,pos,tournament,currentView)"
                      @change="updateRacePlacement('C', raceNum, pos, ($event.target as HTMLSelectElement).value)"
                      :style="{ color: getPlayerColor(getPlayerAtPosition('C',raceNum,pos,tournament,currentView)) }"
                      class="min-w-0 flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all">
                    <option value="">- Select -</option>
                    <option v-for="player in activeStagePlayers('C')"
                            :key="player.id"
                            :value="player.id"
                            :style="{ color: getPlayerColor(player.id) }">
                      {{ player.name }} {{ player.uma ? `(${player.uma})` : '' }}
                    </option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="currentView === 'finals'">
        <div class="flex items-center gap-4 mb-4">
          <h3 class="text-2xl font-bold text-white tracking-wide">
            <span class="text-amber-500">Finals</span> Results
          </h3>
        </div>

        <div class="overflow-x-auto pb-4">
          <div class="flex gap-4 min-w-max">
            <div v-for="raceNum in 5" :key="raceNum" class="w-64 bg-slate-800 rounded-xl border border-slate-700 overflow-hidden flex flex-col">
              <div class="bg-slate-900/50 p-3 border-b border-slate-700 flex justify-between items-center">
                <span class="font-bold text-amber-500">Race {{ raceNum }}</span>
                <span class="text-xs text-slate-500">{{
                    getRaceTimestamp('Finals', raceNum, tournament, currentView)
                  }}</span>
              </div>
              <div class="p-2 space-y-1 flex-1">
                <div v-for="pos in (activeStagePlayers('Finals').length)" :key="pos" class="flex items-center gap-2">
                  <div class="shrink-0 w-6 h-6 rounded flex items-center justify-center text-xs font-mono font-bold"
                       :class="getPositionStyle(pos)">
                    {{ pos }}
                  </div>
                  <select
                      :disabled="!isAdminRef || tournament.stage !== 'finals'"
                      :value="getPlayerAtPosition('Finals',raceNum,pos,tournament,currentView)"
                      @change="updateRacePlacement('Finals', raceNum, pos, ($event.target as HTMLSelectElement).value)"
                      :style="{ color: getPlayerColor(getPlayerAtPosition('Finals',raceNum,pos,tournament,currentView)) }"
                      class="min-w-0 flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all">
                    <option value="">- Select -</option>
                    <option v-for="player in activeStagePlayers('Finals')"
                            :key="player.id"
                            :value="player.id"
                            :style="{ color: getPlayerColor(player.id) }">
                      {{ player.name }} {{ player.uma ? `(${player.uma})` : '' }}
                    </option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="mt-12 pt-8 border-t border-slate-700">
      <h3 class="text-2xl font-bold text-white mb-6">Player Statistics</h3>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">

        <div v-for="player in sortedPlayers" :key="player.id"
             class="bg-slate-800 rounded-xl p-4 border border-slate-700 hover:border-indigo-500/50 transition-all flex flex-col h-full">

          <div class="flex justify-between items-start mb-4 pb-3 border-b border-slate-700/50">
            <div>
              <div class="font-bold text-white text-lg leading-tight"
                   :style="{ color: getPlayerColor(player.id) }">{{ player.name }}</div>
              <div class="text-xs text-slate-500 mt-1" v-if="player.uma">{{ player.uma }}</div>
            </div>
            <div class="text-right">
              <div class="text-2xl font-mono font-bold text-indigo-400">
                {{ getTotalPoints(player.id) }}
              </div>
              <div class="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Total Pts</div>
            </div>
          </div>

          <div class="flex-1">
            <div class="grid grid-cols-5 gap-2">
              <div v-for="(result, idx) in getRaceResultsForPlayer(player.id)" :key="idx" class="flex flex-col items-center gap-1">

                <div class="w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold border shadow-sm"
                     :class="getPositionStyle(result.position, result.stage)">
                  {{ result.position || '-' }}
                </div>

                <span class="text-[10px] font-mono text-slate-400">
                      {{ result.points > 0 ? '+' + result.points : '0' }}
                    </span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>

    <div class="mt-12 pt-8 border-t border-slate-700">
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
                        {{ race.stage === 'finals' ? 'Grand Finals' : (tData?.teams.length >= 6 ? 'Group ' + race.group : 'Main Event') }}
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


    <div v-if="showUmaModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div class="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
        <div class="flex justify-between items-center mb-6">
          <h3 class="text-2xl font-bold text-white">Edit Umas</h3>
          <button @click="submitUmas" class="text-slate-400 hover:text-white"><i class="ph-bold ph-x text-xl"></i></button>
        </div>

        <div class="space-y-6">
          <p class="text-sm text-slate-400">Enter Umas used by players.</p>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div v-for="player in tournament!.players" :key="player.id" class="flex items-center justify-between bg-slate-800 p-3 rounded border border-slate-700">
              <span class="text-sm font-medium truncate w-32">{{ player.name }}</span>
              <select
                  v-model="player.uma"
                  class="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all">
                <option value="">- Select -</option>
                <option v-for="uma in getUmaList()" :key="player.id" :value="uma">
                  {{ uma }}
                </option>
              </select>
            </div>
          </div>

          <div class="pt-4 border-t border-slate-700 flex justify-end gap-3">
            <button @click="submitUmas"
                    :disabled="!isAdmin"
                    class="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded font-bold">Submit Umas</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showWildcardModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div class="bg-slate-900 border border-slate-700 rounded-xl max-w-sm w-full p-6 shadow-2xl">
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

        <div class="space-y-4">
          <input v-model="newWildcardName"
                 @keyup.enter="addWildcard"
                 type="text"
                 placeholder="Player Name"
                 class="w-full bg-slate-800 border border-slate-700 rounded p-3 text-white focus:outline-none focus:border-indigo-500 transition-colors">

          <button @click="addWildcard"
                  :disabled="!newWildcardName"
                  class="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-3 rounded-lg font-bold flex items-center justify-center gap-2">
            Add Player
          </button>
        </div>
      </div>
    </div>

    <div v-if="showTieBreakerModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div class="bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full p-6 shadow-2xl relative">
        <div class="text-center mb-6">
          <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/10 text-amber-500 mb-4 ring-1 ring-amber-500/50">
            <i class="ph-fill ph-scales text-3xl"></i>
          </div>
          <div class="relative flex justify-center items-center mb-4">

            <h3 class="text-2xl font-bold text-white">Tie Breaker Required</h3>

            <button @click="showTieBreakerModal = false"
                    class="absolute right-0 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors p-2">
              <i class="ph-bold ph-x text-xl"></i>
            </button>

          </div>
          <p class="text-slate-400 mt-2">
            A perfect statistical tie was detected between:
          </p>
        </div>

        <div class="flex justify-center gap-4 mb-8">
          <div v-for="(team, idx) in tiedTeams" :key="team.id"
               class="bg-slate-800 border border-slate-700 p-4 rounded-lg text-center min-w-[120px]">
            <div class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Candidate {{ idx + 1 }}</div>
            <div class="font-bold text-white text-lg" :style="{ color: team.color }">{{ team.name }}</div>
            <div class="text-xs text-slate-400">{{ team.points }} pts</div>
          </div>
        </div>

        <div class="space-y-3">
          <div class="relative">
            <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-slate-800"></div></div>
            <div class="relative flex justify-center text-xs uppercase"><span class="px-2 bg-slate-900 text-slate-600">Select Winner Manually</span></div>
            <div class="relative flex justify-center text-xs uppercase"><span class="px-2 bg-slate-900 text-slate-600">{{ tiebreakersNeeded }} {{ tiebreakersNeeded > 1 ? 'Teams' : 'Team' }} needed</span></div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <button v-for="team in tiedTeams" :key="team.id"
                    @click="resolveManually(team)"
                    class="py-3 rounded-lg font-bold transition-all relative overflow-hidden"
                    :class="guaranteedIds.includes(team.id)
                      ? 'bg-slate-800 border-emerald-500 text-emerald-400 ring-2 ring-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                      : 'bg-indigo-600/10 border border-indigo-500/30 hover:border-indigo-500 text-indigo-300 hover:bg-indigo-600/20'">
              Advance {{ team.name }}
            </button>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>