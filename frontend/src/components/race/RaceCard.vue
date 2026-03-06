<script setup lang="ts">
import { computed } from 'vue';
import { getPositionStyle, getPlayerAtPosition, getRaceTimestamp, raceKey } from '../../utils/utils';
import { getRaceWinnerGif } from '../../utils/umaGifs';
import { getUmaImagePath } from '../../utils/umaData';
import type { Tournament } from '../../types';

const props = defineProps<{
  raceNum: number;
  groupId: string;
  stageId: 'groups' | 'finals';
  tournament: Tournament;
  currentView: string;
  isAdmin: boolean;
  inputMode: 'tap' | 'dropdown';
  colorClass: string;
  focusColorClass: string;
  activePlayers: any[];
  editingRaceKey: string | null;
  entryMap: Record<number, string>;
  getPlayerColor: (id: string) => string | undefined;
}>();

const emit = defineEmits<{
  (e: 'toggleEdit', raceNum: number): void;
  (e: 'cancelEdit'): void;
  (e: 'clearEntry'): void;
  (e: 'saveTap', raceNum: number): void;
  (e: 'tapPlayer', playerId: string): void;
  (e: 'updatePlacement', pos: number, playerId: string): void;
}>();

// --- Computed Helpers ---
const isEditing = computed(() => props.editingRaceKey === raceKey(props.stageId, props.groupId, props.raceNum));

const raceGif = computed(() => {
  const key = raceKey(props.stageId, props.groupId, props.raceNum);
  const race = props.tournament.races[key];
  return race ? getRaceWinnerGif(race, Object.values(props.tournament.players)) : undefined;
});

const hasResults = computed(() =>
  !!props.tournament.races[raceKey(props.stageId, props.groupId, props.raceNum)]
);

const isNextRace = computed(() => {
  if (hasResults.value) return false;
  for (let i = 1; i < props.raceNum; i++) {
    if (!props.tournament.races[raceKey(props.stageId, props.groupId, i)]) return false;
  }
  return true;
});

const canEdit = computed(() => {
  if (!props.isAdmin) return false;
  if (props.stageId === 'groups' && props.tournament.stage !== 'groups') return false;
  if (props.stageId === 'finals' && props.tournament.status !== 'active') return false;
  return hasResults.value || isNextRace.value;
});

const isSelectDisabled = computed(() => !canEdit.value);

const sortedPlayers = computed(() => [...props.activePlayers].sort((a, b) => a.name.localeCompare(b.name)));
</script>

<template>
  <div class="w-64 flex-1 mb-4 transition-all duration-500 perspective-1000" :class="{ 'opacity-40': !hasResults }">

    <div v-if="inputMode === 'dropdown'" class="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden flex flex-col h-full">
      <div class="bg-slate-900/50 p-3 border-b border-slate-700 flex justify-between items-center relative overflow-hidden">
        <span class="font-bold" :class="colorClass">Race {{ raceNum }}</span>
        <div v-if="raceGif" class="absolute inset-0 flex items-center justify-center pointer-events-none opacity-80">
          <img :src="raceGif" class="h-10 w-10 object-contain" alt="Winner GIF" />
        </div>
        <span class="text-xs text-slate-500 z-10 relative">{{ getRaceTimestamp(groupId, raceNum, tournament, currentView) }}</span>
      </div>

      <div class="p-2 space-y-1 flex-1">
        <div v-for="pos in activePlayers.length" :key="pos" class="flex items-center gap-2">
          <div class="shrink-0 w-6 h-6 rounded flex items-center justify-center text-xs font-mono font-bold" :class="getPositionStyle(pos)">{{ pos }}</div>
          <select
              :disabled="isSelectDisabled"
              :value="getPlayerAtPosition(groupId, raceNum, pos, tournament, currentView)"
              @change="$emit('updatePlacement', pos, ($event.target as HTMLSelectElement).value)"
              :style="{ color: getPlayerColor(getPlayerAtPosition(groupId, raceNum, pos, tournament, currentView)) }"
              class="min-w-0 flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 transition-all h-[26px]"
              :class="focusColorClass">
            <option value="">- Select -</option>
            <option v-for="player in activePlayers" :key="player.id" :value="player.id" :style="{ color: getPlayerColor(player.id) }">
              {{ player.name }} {{ player.uma ? `(${player.uma})` : '' }}
            </option>
          </select>
        </div>
      </div>
    </div>

    <div v-else class="relative transition-transform duration-500 preserve-3d h-full" :class="{ 'rotate-y-180': isEditing }">

      <div class="front-face select-none bg-slate-800 rounded-xl border border-slate-700 flex flex-col shadow-lg backface-hidden overflow-hidden h-full">
        <div class="bg-slate-900/50 p-3 border-b border-slate-700 flex justify-between items-center relative overflow-hidden">
          <span class="font-bold z-10 relative" :class="colorClass">Race {{ raceNum }}</span>
          <div v-if="raceGif" class="absolute inset-0 flex items-center justify-center pointer-events-none opacity-80">
            <img :src="raceGif" class="h-10 w-10 object-contain" alt="Winner GIF" />
          </div>
          <button v-if="canEdit" @click="$emit('toggleEdit', raceNum)" class="z-10 relative px-1.5 rounded bg-slate-800/80 hover:bg-indigo-600 text-slate-400 hover:text-white transition-all backdrop-blur-sm">
            <i class="ph-bold ph-pencil-simple"></i>
          </button>
        </div>

        <div class="p-2 space-y-1 flex-1">
          <div v-for="pos in activePlayers.length" :key="pos" class="flex items-center gap-2">
            <div class="shrink-0 w-6 h-6 rounded flex items-center justify-center text-xs font-mono font-bold" :class="getPositionStyle(pos)">{{ pos }}</div>

            <template v-if="getPlayerAtPosition(groupId, raceNum, pos, tournament, currentView)">
              <div class="flex-1 min-w-0 border border-slate-700 bg-slate-900 rounded px-2 text-xs font-medium truncate flex items-center h-[26px]"
                   :style="{ color: getPlayerColor(getPlayerAtPosition(groupId, raceNum, pos, tournament, currentView)) }">
                <span class="ml-1">
                  {{ tournament.players[getPlayerAtPosition(groupId, raceNum, pos, tournament, currentView)]?.name || 'Unknown Player' }}
                </span>
                <span v-if="tournament.players[getPlayerAtPosition(groupId, raceNum, pos, tournament, currentView)]?.uma" class="opacity-60 ml-1">
                  ({{ tournament.players[getPlayerAtPosition(groupId, raceNum, pos, tournament, currentView)]!.uma }})
                </span>
              </div>
            </template>
            <template v-else>
              <div class="flex-1 border border-dashed border-slate-700/50 rounded px-2 text-xs text-slate-600 uppercase tracking-widest flex items-center h-[26px]">
                Vacant
              </div>
            </template>
          </div>
        </div>
      </div>

      <div class="back-face select-none absolute inset-0 backface-hidden rotate-y-180 bg-slate-950 rounded-xl border-1 border-indigo-500 shadow-2xl flex flex-col overflow-hidden">
        <div class="p-3 bg-indigo-900/20 border-b border-indigo-500/30 flex justify-between items-center shrink-0">
          <span class="text-[10px] font-black uppercase text-indigo-300">Set Finish Order</span>
          <div class="flex gap-2">
            <button @click.stop="$emit('cancelEdit')" class="w-6 h-6 flex items-center justify-center rounded bg-slate-800 text-rose-400 hover:bg-rose-500 hover:text-white"><i class="ph-bold ph-x"></i></button>
            <button @click.stop="$emit('clearEntry')" class="w-6 h-6 flex items-center justify-center rounded bg-slate-800 text-rose-400 hover:bg-rose-500 hover:text-white"><i class="ph-bold ph-trash"></i></button>
            <button @click.stop="$emit('saveTap', raceNum)" class="w-6 h-6 flex items-center justify-center rounded bg-emerald-600 text-white shadow-lg"><i class="ph-bold ph-check"></i></button>
          </div>
        </div>

        <div class="p-2 grid grid-cols-2 gap-2 flex-1 overflow-y-auto custom-scrollbar auto-rows-fr">
          <button v-for="player in sortedPlayers" :key="player.id" @click="$emit('tapPlayer', player.id)"
                  class="relative px-2 py-1.5 justify-center rounded-lg border text-left transition-all duration-200 group flex flex-col gap-0 min-h-0 h-full"
                  :class="Object.values(entryMap).includes(player.id) ? 'bg-indigo-600 border-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.4)]' : 'bg-slate-800 border-slate-700 hover:border-slate-500'">

            <div v-if="Object.values(entryMap).includes(player.id)" class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-amber-500 text-slate-900 text-[10px] font-black flex items-center justify-center ring-2 ring-slate-950 z-10">
              {{ Object.keys(entryMap).find(key => entryMap[parseInt(key)] === player.id) }}
            </div>

            <div class="flex items-center gap-1.5 w-full overflow-hidden text-left">
              <img v-if="player.uma" :src="getUmaImagePath(player.uma)" :alt="player.uma"
                   class="w-6 h-6 rounded-full object-cover shrink-0 bg-slate-700" />
              <div class="flex flex-col min-w-0 overflow-hidden">
                <span class="text-xs font-bold truncate group-hover:text-white leading-tight block w-full" :style="{ color: Object.values(entryMap).includes(player.id) ? '#fff' : getPlayerColor(player.id) }">
                  {{ player.name }}
                </span>
                <span class="text-[10px] opacity-70 truncate font-medium leading-none block w-full" :style="{ color: Object.values(entryMap).includes(player.id) ? '#fff' : getPlayerColor(player.id) }">
                  {{ player.uma || '' }}
                </span>
              </div>
            </div>
          </button>
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