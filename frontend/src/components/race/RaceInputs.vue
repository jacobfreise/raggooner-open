<script setup lang="ts">
import {computed, ref, toRef} from 'vue';
import type { FirestoreUpdate, Tournament } from '../../types';
import { useGameLogic } from '../../composables/useGameLogic';
import { useRoster } from '../../composables/useRoster';
import RaceStage from './RaceStage.vue';

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

const { getPlayerColor } = useRoster(tournament, props.secureUpdate, isAdminRef);

const raceInputMode = ref<'tap' | 'dropdown'>('tap');

// 1. Define the specific literal type
type ValidGroupId = 'A' | 'B' | 'C' | 'Finals';

// 2. Define the shape of your stage object
interface StageConfig {
  id: ValidGroupId;
  title: string;
  stageId: 'groups' | 'finals';
  color: string;
  focusColor: string;
}

// Unify all group logic into a single configuration array
const visibleStages = computed(() => {
  const stages: StageConfig[] = [];
  const t = tournament.value;
  const isFinals = currentView.value === 'finals';

  if (!isFinals) {
    if (t.teams.length < 6) {
      stages.push({ id: 'A', title: 'Race', stageId: 'groups' as const, color: 'text-indigo-400', focusColor: 'focus:border-indigo-500 focus:ring-indigo-500' });
    } else {
      stages.push({ id: 'A', title: 'Group A', stageId: 'groups' as const, color: 'text-indigo-400', focusColor: 'focus:border-indigo-500 focus:ring-indigo-500' });
      stages.push({ id: 'B', title: 'Group B', stageId: 'groups' as const, color: 'text-rose-400', focusColor: 'focus:border-rose-500 focus:ring-rose-500' });
      if (t.teams.length === 9) {
        stages.push({ id: 'C', title: 'Group C', stageId: 'groups' as const, color: 'text-emerald-400', focusColor: 'focus:border-emerald-500 focus:ring-emerald-500' });
      }
    }
  } else {
    stages.push({ id: 'Finals', title: 'Finals', stageId: 'finals' as const, color: 'text-amber-500', focusColor: 'focus:border-amber-500 focus:ring-amber-500' });
  }

  return stages;
});
</script>

<template>
  <div class="space-y-8">
    <RaceStage
        v-for="(stage, index) in visibleStages"
        :key="stage.id"
        :group-data="stage"
        :tournament="tournament"
        :current-view="currentView"
        :is-admin="isAdminRef"
        :active-players="activeStagePlayers(stage.id)"
        :saving="saving && stage.id === 'A'"
        :editing-race-key="editingRaceKey"
        :entry-map="entryMap"
        :get-player-color="getPlayerColor"
        :class="{ 'border-t border-slate-700 pt-8': index !== 0 }"
        v-model:race-input-mode="raceInputMode"

        @toggle-edit="toggleEditRace"
        @cancel-edit="editingRaceKey = null"
        @clear-entry="entryMap = {}"
        @save-tap="saveTapResults"
        @tap-player="handleTapToRank"
        @update-placement="updateRacePlacement"
    />
  </div>
</template>