<script setup lang="ts">
import type { Tournament } from '../../types';
import RaceCard from './RaceCard.vue';

defineProps<{
  groupData: { id: string; title: string; color: string; focusColor: string; stageId: 'groups' | 'finals' };
  tournament: Tournament;
  currentView: string;
  isAdmin: boolean;
  canCaptainEdit?: boolean;
  activePlayers: any[];
  saving: boolean;
  editingRaceKey: string | null;
  entryMap: Record<number, string>;
  getPlayerColor: (id: string) => string | undefined;
  raceInputMode: 'tap' | 'dropdown';
}>();

const emit = defineEmits<{
  (e: 'toggleEdit', stageId: 'groups' | 'finals', groupId: string, raceNum: number): void;
  (e: 'cancelEdit'): void;
  (e: 'clearEntry'): void;
  (e: 'saveTap', groupId: string, raceNum: number): void;
  (e: 'tapPlayer', playerId: string): void;
  (e: 'updatePlacement', groupId: string, raceNum: number, pos: number, playerId: string): void;
  (e: 'update:raceInputMode', value: 'tap' | 'dropdown'): void;
}>();

</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-4">
        <h3 class="text-2xl font-bold text-white tracking-wide">
          <span :class="groupData.color">{{ groupData.title }}</span> Results
        </h3>
        <div v-if="saving" class="text-xs font-mono text-emerald-400 animate-pulse">
          <i class="ph-bold ph-floppy-disk"></i> SAVING...
        </div>
      </div>

      <button v-if="(isAdmin || canCaptainEdit) && tournament.stages[tournament.currentStageIndex]?.name === groupData.stageId"
              @click="$emit('update:raceInputMode', raceInputMode === 'tap' ? 'dropdown' : 'tap')"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all shrink-0"
              :class="raceInputMode === 'tap' ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300' : 'bg-amber-600/20 border-amber-500/50 text-amber-300'">
        <i :class="raceInputMode === 'tap' ? 'ph-bold ph-hand-tap' : 'ph-bold ph-list'"></i>
        {{ raceInputMode === 'tap' ? 'Tap to Rank' : 'Dropdowns' }}
      </button>
    </div>

    <div class="overflow-x-auto overflow-y-hidden">
      <div class="flex gap-4 min-w-max">
        <RaceCard
            v-for="raceNum in 5"
            :key="raceNum"
            :race-num="raceNum"
            :group-id="groupData.id"
            :stage-id="groupData.stageId"
            :tournament="tournament"
            :current-view="currentView"
            :is-admin="isAdmin"
            :can-captain-edit="canCaptainEdit"
            :input-mode="raceInputMode"
            :color-class="groupData.color"
            :focus-color-class="groupData.focusColor"
            :active-players="activePlayers"
            :editing-race-key="editingRaceKey"
            :entry-map="entryMap"
            :saving="saving"
            :get-player-color="getPlayerColor"
            @toggle-edit="$emit('toggleEdit', groupData.stageId, groupData.id, $event)"
            @cancel-edit="$emit('cancelEdit')"
            @clear-entry="$emit('clearEntry')"
            @save-tap="$emit('saveTap', groupData.id, $event)"
            @tap-player="$emit('tapPlayer', $event)"
            @update-placement="(pos:number, pid:string) => $emit('updatePlacement', groupData.id, raceNum, pos, pid)"
        />
      </div>
    </div>
  </div>
</template>