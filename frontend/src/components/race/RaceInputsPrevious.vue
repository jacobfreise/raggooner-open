// @ts-nocheck
<script setup lang="ts">

import {getPlayerAtPosition, getPositionStyle, getRaceTimestamp, raceKey} from "../../utils/utils.ts";
import {ref, toRef} from "vue";
import type {FirestoreUpdate, Tournament} from "../../types.ts";
import {useGameLogic} from "../../composables/useGameLogic.ts";
import {getRaceWinnerGif} from "../../utils/umaGifs.ts";
import {useRoster} from "../../composables/useRoster.ts";

const raceInputMode = ref<'tap' | 'dropdown'>('tap');

const props = withDefaults(defineProps<{
  tournamentProp: Tournament;
  isAdmin: boolean;
  appId?: string;
  secureUpdate: (data: FirestoreUpdate<Tournament> | Record<string, any>) => Promise<void>;
}>(), {
  appId: 'default-app'
});

const tournament = toRef(props, 'tournamentProp');
const isAdminRef = toRef(props, 'isAdmin');

const {
  currentView,
  saving,
  activeStagePlayers,
  editingRaceKey,
  entryMap,
  toggleEditRace,
  handleTapToRank,
  saveTapResults,
  updateRacePlacement
} = useGameLogic(tournament, props.secureUpdate);

const {
  getPlayerColor,
} = useRoster(tournament, props.secureUpdate, isAdminRef);

const shouldShowGroup = (group: string) => {
  if(currentView.value === 'finals') return false;

  const teamCount = props.tournamentProp.teams.length;
  if(teamCount < 6) return group === 'A';
  if(teamCount === 9) return ['A', 'B', 'C'].includes(group);
  return ['A', 'B'].includes(group);
};

// Wrapper to find the race and get the GIF
const getGifForRace = (group: string, raceNum: number) => {
  if (!tournament.value) return undefined;

  // Determine stage and group ID
  // If we are in 'finals' view, or the group string passed is 'Finals'
  const isFinals = currentView.value === 'finals' || group === 'Finals';
  const stage = isFinals ? 'finals' : 'groups';
  const targetGroup = isFinals ? 'Finals' : group;

  // Find the specific race object
  const key = raceKey(stage, targetGroup, raceNum);
  const race = tournament.value.races[key];

  if (!race) return undefined;

  // Get the GIF using the util function
  return getRaceWinnerGif(race, Object.values(tournament.value.players));
};

// const tData = computed(() => tournament.value as Tournament);

</script>

<template>
  <div class="space-y-8">
    <div v-for="group in ([
          { id: 'A', color: 'text-indigo-400', focusColor: 'focus:border-indigo-500 focus:ring-indigo-500' },
          { id: 'B', color: 'text-rose-400', focusColor: 'focus:border-rose-500 focus:ring-rose-500' },
          { id: 'C', color: 'text-emerald-400', focusColor: 'focus:border-emerald-500 focus:ring-emerald-500' }
        ] as const)" :key="group.id">

      <div v-if="shouldShowGroup(group.id)">
        <div class="flex items-center justify-between mb-4" :class="{ 'border-t border-slate-700 pt-8': group.id !== 'A' }">
          <div class="flex items-center gap-4">
            <h3 class="text-2xl font-bold text-white tracking-wide">
                <span :class="group.color">
                  {{ group.id === 'A' && tournament.teams.length < 6 ? 'Race' : `Group ${group.id}` }}
                </span> Results
            </h3>
            <div v-if="saving && group.id === 'A'" class="text-xs font-mono text-emerald-400 animate-pulse">
              <i class="ph-bold ph-floppy-disk"></i> SAVING...
            </div>
          </div>
          <button v-if="group.id === 'A' && isAdminRef && tournament.status === 'active'"
                  @click="raceInputMode = raceInputMode === 'tap' ? 'dropdown' : 'tap'"
                  class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all shrink-0"
                  :class="raceInputMode === 'tap'
                      ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300'
                      : 'bg-amber-600/20 border-amber-500/50 text-amber-300'">
            <i :class="raceInputMode === 'tap' ? 'ph-bold ph-hand-tap' : 'ph-bold ph-list'"></i>
            {{ raceInputMode === 'tap' ? 'Tap to Rank' : 'Dropdowns' }}
          </button>
        </div>

        <!-- DROPDOWN MODE (Groups) -->
        <div v-if="raceInputMode === 'dropdown'" class="overflow-x-auto">
          <div class="flex gap-4 min-w-max">
            <div v-for="raceNum in 5" :key="raceNum" class="w-64 mb-4 bg-slate-800 rounded-xl border border-slate-700 overflow-hidden flex-1 flex-col">
              <div class="bg-slate-900/50 p-3 border-b border-slate-700 flex justify-between items-center relative overflow-hidden">
                <span class="font-bold" :class="group.color">Race {{ raceNum }}</span>
                <div v-if="getGifForRace(group.id, raceNum)" class="absolute inset-0 flex items-center justify-center pointer-events-none opacity-80">
                  <img :src="getGifForRace(group.id, raceNum)" class="h-10 w-10 object-contain" alt="Winner GIF" />
                </div>
                <span class="text-xs text-slate-500 z-10 relative">{{ getRaceTimestamp(group.id, raceNum, tournament, currentView) }}</span>
              </div>
              <div class="p-2 space-y-1 flex-1">
                <div v-for="pos in activeStagePlayers(group.id).length" :key="pos" class="flex items-center gap-2">
                  <div class="shrink-0 w-6 h-6 rounded flex items-center justify-center text-xs font-mono font-bold" :class="getPositionStyle(pos)">{{ pos }}</div>
                  <select
                      :disabled="!isAdminRef || tournament.stages[tournament.currentStageIndex]?.name === tournament.stages[tournament.stages.length - 1]?.name"
                      :value="getPlayerAtPosition(group.id, raceNum, pos, tournament, currentView)"
                      @change="updateRacePlacement(group.id, raceNum, pos, ($event.target as HTMLSelectElement).value)"
                      :style="{ color: getPlayerColor(getPlayerAtPosition(group.id, raceNum, pos, tournament, currentView)) }"
                      class="min-w-0 flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 transition-all"
                      :class="group.focusColor">
                    <option value="">- Select -</option>
                    <option v-for="player in activeStagePlayers(group.id)" :key="player.id" :value="player.id" :style="{ color: getPlayerColor(player.id) }">
                      {{ player.name }} {{ player.uma ? `(${player.uma})` : '' }}
                    </option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- TAP-TO-RANK MODE (Groups) -->
        <div v-else class="overflow-x-auto">
          <div class="flex gap-4 min-w-max">
            <div class="flex sm:flex-nowrap flex-wrap gap-4 w-full overflow-y-hidden">
              <div v-for="raceNum in 5" :key="raceNum"
                   class="flex-1 mb-4 w-64 transition-all duration-500 perspective-1000">

                <div class="relative transition-transform duration-500 preserve-3d h-full"
                     :class="{ 'rotate-y-180': editingRaceKey === raceKey('groups', group.id, raceNum) }">

                  <div class="front-face select-none bg-slate-800 rounded-xl border border-slate-700 flex flex-col shadow-lg backface-hidden overflow-hidden h-full">
                    <div class="bg-slate-900/50 p-3 border-b border-slate-700 flex justify-between items-center relative overflow-hidden">
                      <span class="font-bold z-10 relative" :class="group.color">Race {{ raceNum }}</span>

                      <div v-if="getGifForRace(group.id, raceNum)"
                           class="absolute inset-0 flex items-center justify-center pointer-events-none opacity-80">
                        <img :src="getGifForRace(group.id, raceNum)"
                             class="h-10 w-10 object-contain"
                             alt="Winner GIF" />
                      </div>

                      <button v-if="isAdminRef && tournament.currentStageIndex < tournament.stages.length - 1"
                              @click="toggleEditRace(currentView, group.id, raceNum)"
                              class="z-10 relative px-1.5 rounded bg-slate-800/80 hover:bg-indigo-600 text-slate-400 hover:text-white transition-all backdrop-blur-sm">
                        <i class="ph-bold ph-pencil-simple"></i>
                      </button>
                    </div>

                    <div class="p-2 space-y-1 flex-1">
                      <div v-for="pos in activeStagePlayers(group.id).length" :key="pos"
                           class="flex items-center gap-2">

                        <div class="shrink-0 w-6 h-6 rounded flex items-center justify-center text-xs font-mono font-bold"
                             :class="getPositionStyle(pos)">
                          {{ pos }}
                        </div>

                        <template v-if="getPlayerAtPosition(group.id, raceNum, pos, tournament, currentView)">
                          <div class="flex-1 border border-slate-700 bg-slate-900 rounded px-2 py-1 text-xs font-medium truncate"
                               :style="{ color: getPlayerColor(getPlayerAtPosition(group.id, raceNum, pos, tournament, currentView)) }">
                              <span class="ml-1">
                                {{ tournament.players[getPlayerAtPosition(group.id, raceNum, pos, tournament, currentView)]?.name || 'Unknown Player' }}
                              </span>
                            <span v-if="tournament.players[getPlayerAtPosition(group.id, raceNum, pos, tournament, currentView)]?.uma"
                                  class="opacity">
                                ({{ tournament.players[getPlayerAtPosition(group.id, raceNum, pos, tournament, currentView)]!.uma }})
                              </span>
                          </div>
                        </template>
                        <template v-else>
                          <div class="flex-1 border border-dashed border-slate-700/50 rounded px-2 py-1 text-xs text-slate-600 uppercase tracking-widest">
                            Vacant
                          </div>
                        </template>
                      </div>
                    </div>
                  </div>

                  <div class="back-face select-none absolute inset-0 backface-hidden rotate-y-180 bg-slate-950 rounded-xl border-2 border-indigo-500 shadow-2xl flex flex-col overflow-hidden">
                    <div class="p-3 bg-indigo-900/20 border-b border-indigo-500/30 flex justify-between items-center shrink-0">
                      <span class="text-[10px] font-black uppercase text-indigo-300">Set Finish Order</span>
                      <div class="flex gap-2">
                        <button @click.stop="editingRaceKey = null" class="w-9 h-9 flex items-center justify-center rounded bg-slate-800 text-rose-400 hover:bg-rose-500"><i class="ph-bold ph-x"></i></button>
                        <button @click.stop="entryMap = {}" class="w-9 h-9 flex items-center justify-center rounded bg-slate-800 text-rose-400 hover:bg-rose-500"><i class="ph-bold ph-trash"></i></button>
                        <button @click.stop="saveTapResults(group.id, raceNum)" class="w-9 h-9 flex items-center justify-center rounded bg-emerald-600 text-white shadow-lg"><i class="ph-bold ph-check"></i></button>
                      </div>
                    </div>

                    <div class="p-2 grid grid-cols-2 gap-2 flex-1 content-start overflow-y-auto custom-scrollbar">
                      <button v-for="player in activeStagePlayers(group.id).sort((a,b) => a.name.localeCompare(b.name))"
                              :key="player.id"
                              @click="handleTapToRank(player.id)"
                              class="relative px-2 py-1.5 rounded-lg border text-left transition-all duration-200 group flex flex-col gap-0 min-h-0"
                              :class="Object.values(entryMap).includes(player.id) ? 'bg-indigo-600 border-indigo-400' : 'bg-slate-800 border-slate-700'">

                        <div v-if="Object.values(entryMap).includes(player.id)"
                             class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-amber-500 text-slate-900 text-[10px] font-black flex items-center justify-center ring-2 ring-slate-950 z-10">
                          {{ Object.keys(entryMap).find(key => entryMap[parseInt(key)] === player.id) }}
                        </div>

                        <span class="text-[11px] font-bold truncate" :style="{ color: Object.values(entryMap).includes(player.id) ? '#fff' : getPlayerColor(player.id) }">
                            {{ player.name }}
                          </span>
                        <span class="text-[10px] opacity-70 truncate font-medium" :style="{ color: Object.values(entryMap).includes(player.id) ? '#fff' : getPlayerColor(player.id) }">
                            {{ player.uma || '' }}
                          </span>
                      </button>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="currentView === 'finals'">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-2xl font-bold text-white tracking-wide"><span class="text-amber-500">Finals</span> Results</h3>
        <button v-if="isAdminRef && tournament.status === 'active'"
                @click="raceInputMode = raceInputMode === 'tap' ? 'dropdown' : 'tap'"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all shrink-0"
                :class="raceInputMode === 'tap'
                    ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300'
                    : 'bg-amber-600/20 border-amber-500/50 text-amber-300'">
          <i :class="raceInputMode === 'tap' ? 'ph-bold ph-hand-tap' : 'ph-bold ph-list'"></i>
          {{ raceInputMode === 'tap' ? 'Tap to Rank' : 'Dropdowns' }}
        </button>
      </div>

      <!-- DROPDOWN MODE (Finals) -->
      <div v-if="raceInputMode === 'dropdown'" class="overflow-x-auto">
        <div class="flex gap-4 min-w-max">
          <div v-for="raceNum in 5" :key="raceNum" class="w-64 mb-4 bg-slate-800 rounded-xl border border-slate-700 overflow-hidden flex-1 flex-col">
            <div class="bg-slate-900/50 p-3 border-b border-slate-700 flex justify-between items-center relative overflow-hidden">
              <span class="font-bold text-amber-500">Race {{ raceNum }}</span>
              <div v-if="getGifForRace('Finals', raceNum)" class="absolute inset-0 flex items-center justify-center pointer-events-none opacity-80">
                <img :src="getGifForRace('Finals', raceNum)" class="h-10 w-10 object-contain" alt="Winner GIF" />
              </div>
              <span class="text-xs text-slate-500 z-10 relative">{{ getRaceTimestamp('Finals', raceNum, tournament, currentView) }}</span>
            </div>
            <div class="p-2 space-y-1 flex-1">
              <div v-for="pos in activeStagePlayers('Finals').length" :key="pos" class="flex items-center gap-2">
                <div class="shrink-0 w-6 h-6 rounded flex items-center justify-center text-xs font-mono font-bold" :class="getPositionStyle(pos)">{{ pos }}</div>
                <select
                    :disabled="!isAdminRef || !(tournament.currentStageIndex >= tournament.stages.length - 1 && tournament.status === 'active')"
                    :value="getPlayerAtPosition('Finals', raceNum, pos, tournament, currentView)"
                    @change="updateRacePlacement('Finals', raceNum, pos, ($event.target as HTMLSelectElement).value)"
                    :style="{ color: getPlayerColor(getPlayerAtPosition('Finals', raceNum, pos, tournament, currentView)) }"
                    class="min-w-0 flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all">
                  <option value="">- Select -</option>
                  <option v-for="player in activeStagePlayers('Finals')" :key="player.id" :value="player.id" :style="{ color: getPlayerColor(player.id) }">
                    {{ player.name }} {{ player.uma ? `(${player.uma})` : '' }}
                  </option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- TAP-TO-RANK MODE (Finals) -->
      <div v-else class="overflow-x-auto">
        <div class="flex gap-4">
          <div class="flex sm:flex-nowrap flex-wrap gap-4 w-full min-w-max overflow-y-hidden">
            <div v-for="raceNum in 5" :key="raceNum"
                 class="flex-1 mb-4 w-64 transition-all duration-500 perspective-1000">

              <div class="relative transition-transform duration-500 preserve-3d h-full"
                   :class="{ 'rotate-y-180': editingRaceKey === raceKey('finals', 'Finals', raceNum) }">

                <div class="front-face select-none bg-slate-800 rounded-xl border border-slate-700 flex flex-col shadow-lg backface-hidden overflow-hidden h-full">
                  <div class="bg-slate-900/50 p-3 border-b border-slate-700 flex justify-between items-center relative overflow-hidden">

                    <span class="font-bold text-amber-500 z-10 relative">Race {{ raceNum }}</span>

                    <div v-if="getGifForRace('Finals', raceNum)"
                         class="absolute inset-0 flex items-center justify-center pointer-events-none opacity-80">
                      <img :src="getGifForRace('Finals', raceNum)"
                           :key="getGifForRace('Finals', raceNum)"
                           @error="($event.target as HTMLImageElement).style.display='none'"
                           class="h-10 w-10 object-contain"
                           alt="Winner GIF" />
                    </div>

                    <button v-if="isAdminRef && tournament.status === 'active'"
                            @click="toggleEditRace(currentView, 'Finals', raceNum)"
                            class="z-10 relative px-1.5 rounded bg-slate-800/80 hover:bg-indigo-600 text-slate-400 hover:text-white transition-all backdrop-blur-sm">
                      <i class="ph-bold ph-pencil-simple"></i>
                    </button>

                  </div>

                  <div class="p-2 space-y-1 flex-1">
                    <div v-for="pos in activeStagePlayers('Finals').length" :key="pos"
                         class="flex items-center gap-2">

                      <div class="shrink-0 w-6 h-6 rounded flex items-center justify-center text-xs font-mono font-bold"
                           :class="getPositionStyle(pos)">
                        {{ pos }}
                      </div>

                      <template v-if="getPlayerAtPosition('Finals', raceNum, pos, tournament, currentView)">
                        <div class="flex-1 min-w-0 border border-slate-700 bg-slate-900 rounded px-2 py-1 text-xs font-medium truncate"
                             :style="{ color: getPlayerColor(getPlayerAtPosition('Finals', raceNum, pos, tournament, currentView)) }">
                            <span class="ml-1">
                              {{ tournament.players[getPlayerAtPosition('Finals', raceNum, pos, tournament, currentView)]?.name || 'Unknown Player' }}
                            </span>
                          <span v-if="tournament.players[getPlayerAtPosition('Finals', raceNum, pos, tournament, currentView)]?.uma"
                                class="opacity">
                              ({{ tournament.players[getPlayerAtPosition('Finals', raceNum, pos, tournament, currentView)]!.uma }})
                            </span>

                        </div>
                      </template>
                      <template v-else>
                        <div class="flex-1 border border-dashed border-slate-700/50 rounded px-2 py-1 text-xs text-slate-600 uppercase tracking-widest">
                          Vacant
                        </div>
                      </template>
                    </div>
                  </div>
                </div>

                <div class="back-face select-none absolute inset-0 backface-hidden rotate-y-180 bg-slate-950 rounded-xl border-2 border-indigo-500 shadow-2xl flex flex-col overflow-hidden">
                  <div class="p-3 bg-indigo-900/20 border-b border-indigo-500/30 flex justify-between items-center shrink-0">
                    <span class="text-[10px] font-black uppercase text-indigo-300">Set Finish Order</span>
                    <div class="flex gap-2">
                      <button @click.stop="editingRaceKey = null"
                              class="w-9 h-9 flex items-center justify-center rounded bg-slate-800 text-rose-400 hover:bg-rose-500 hover:text-white transition-colors">
                        <i class="ph-bold ph-x"></i>
                      </button>
                      <button @click.stop="entryMap = {}"
                              class="w-9 h-9 flex items-center justify-center rounded bg-slate-800 text-rose-400 hover:bg-rose-500 hover:text-white transition-colors">
                        <i class="ph-bold ph-trash"></i>
                      </button>
                      <button @click.stop="saveTapResults('Finals', raceNum)"
                              class="w-9 h-9 flex items-center justify-center rounded bg-emerald-600 text-white disabled:opacity-30 transition-colors shadow-lg">
                        <i class="ph-bold ph-check"></i>
                      </button>
                    </div>
                  </div>

                  <div class="p-2 grid grid-cols-2 gap-2 flex-1 content-start overflow-y-auto custom-scrollbar">
                    <button v-for="player in activeStagePlayers('Finals').sort((a,b) => a.name.localeCompare(b.name))"
                            :key="player.id"
                            @click="handleTapToRank(player.id)"
                            class="relative px-2 py-1.5 rounded-lg border text-left transition-all duration-200 group flex flex-col gap-0 min-h-0"
                            :class="Object.values(entryMap).includes(player.id)
                                ? 'bg-indigo-600 border-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.4)]'
                                : 'bg-slate-800 border-slate-700 hover:border-slate-500'">

                      <div v-if="Object.values(entryMap).includes(player.id)"
                           class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-amber-500 text-slate-900 text-[10px] font-black flex items-center justify-center ring-2 ring-slate-950 z-10">
                        {{ Object.keys(entryMap).find(key => entryMap[parseInt(key)] === player.id) }}
                      </div>

                      <span class="text-[11px] font-bold truncate group-hover:text-white leading-tight"
                            :class="Object.values(entryMap).includes(player.id) ? 'text-indigo-100' : 'text-slate-200'"
                            :style="{ color: Object.values(entryMap).includes(player.id) ? '#fff' : getPlayerColor(player.id) }">
                          {{ player.name }}
                        </span>
                      <span class="text-[10px] opacity-70 truncate font-medium leading-none"
                            :style="{ color: Object.values(entryMap).includes(player.id) ? '#fff' : getPlayerColor(player.id) }">
                          {{ player.uma || '' }}
                        </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.perspective-1000 {
  perspective: 1000px;
}

.preserve-3d {
  transform-style: preserve-3d;
  position: relative;
  height: 100%; /* Important for equal height rows */
}

.backface-hidden {
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

.front-face {
  position: relative;
  z-index: 2;
  width: 100%;
  height: 100%; /* Stretch to fill parent flex container */
}

.back-face {
  position: absolute !important;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  transform: rotateY(180deg);
  display: flex;
  flex-direction: column;
}

.rotate-y-180 {
  transform: rotateY(180deg);
}

.rotate-y-180 .front-face {
  pointer-events: none;
}

.rotate-y-180 .back-face {
  z-index: 3;
  pointer-events: auto;
  transform: rotateY(180deg) translateZ(1px);
}
</style>