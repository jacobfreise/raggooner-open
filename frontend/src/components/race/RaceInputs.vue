<script setup lang="ts">
import {computed, ref, toRef} from 'vue';
import type { FirestoreUpdate, Tournament, Team } from '../../types';
import { useGameLogic } from '../../composables/useGameLogic';
import { useRoster } from '../../composables/useRoster';
import RaceStage from './RaceStage.vue';

const props = withDefaults(defineProps<{
  tournamentProp: Tournament;
  isAdmin: boolean;
  appId?: string;
  secureUpdate: (data: FirestoreUpdate<Tournament> | Record<string, any>) => Promise<void>;
  captainTeam?: Team | null;
  onCaptainSaveTap?: (group: string, raceNumber: number, placements: Record<string, number>) => Promise<void>;
  onCaptainUpdatePlacement?: (group: string, raceNumber: number, position: number, playerId: string) => Promise<void>;
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
const captainSaving = ref(false);

interface VisibleStage {
  id: string;
  title: string;
  stageId: string;
  color: string;
  focusColor: string;
}

const GROUP_COLORS = [
  { color: 'text-indigo-400', focusColor: 'focus:border-indigo-500 focus:ring-indigo-500' },
  { color: 'text-rose-400',   focusColor: 'focus:border-rose-500 focus:ring-rose-500' },
  { color: 'text-emerald-400',focusColor: 'focus:border-emerald-500 focus:ring-emerald-500' },
  { color: 'text-violet-400', focusColor: 'focus:border-violet-500 focus:ring-violet-500' },
  { color: 'text-cyan-400',   focusColor: 'focus:border-cyan-500 focus:ring-cyan-500' },
  { color: 'text-orange-400', focusColor: 'focus:border-orange-500 focus:ring-orange-500' },
  { color: 'text-pink-400',   focusColor: 'focus:border-pink-500 focus:ring-pink-500' },
  { color: 'text-teal-400',   focusColor: 'focus:border-teal-500 focus:ring-teal-500' },
  { color: 'text-lime-400',   focusColor: 'focus:border-lime-500 focus:ring-lime-500' },
];

const visibleStages = computed((): VisibleStage[] => {
  const t = tournament.value;
  const stageName = currentView.value;
  const stageConfig = t.stages.find(s => s.name === stageName) ?? t.stages[t.currentStageIndex];
  if (!stageConfig) return [];

  const lastStageName = t.stages[t.stages.length - 1]?.name;
  const isLastStage = stageName === lastStageName;

  if (isLastStage) {
    // Use 'Finals' as group id for backwards compat with existing race records
    return [{ id: 'Finals', title: stageConfig.label, stageId: stageName, color: 'text-amber-500', focusColor: 'focus:border-amber-500 focus:ring-amber-500' }];
  }

  return stageConfig.groups.map((group, idx) => {
    const c = GROUP_COLORS[idx % GROUP_COLORS.length]!;
    return {
      id: group,
      title: stageConfig.groups.length === 1 ? 'Race' : `Group ${group}`,
      stageId: stageName,
      color: c.color,
      focusColor: c.focusColor,
    };
  });
});

// Resolves whether the captain can edit a given group.
const captainEditableGroupId = computed((): string | null => {
  const team = props.captainTeam;
  if (!team || !props.tournamentProp.captainActionsEnabled || props.isAdmin) return null;
  const t = tournament.value;
  const stageName = t.stages[t.currentStageIndex]?.name ?? '';
  const isLastStage = t.currentStageIndex >= t.stages.length - 1;
  if (isLastStage) {
    return team.qualifiedStages.includes(stageName) ? stageName : null;
  }
  return team.stageGroups[stageName] ?? null;
});

// Routed handlers — admin uses secureUpdate via useGameLogic; captain uses Cloud Functions.
const handleSaveTap = async (groupId: string, raceNum: number) => {
  if (props.isAdmin) {
    await saveTapResults(groupId, raceNum);
    return;
  }
  if (captainEditableGroupId.value === groupId && props.onCaptainSaveTap) {
    if (captainSaving.value) return;
    const placements: Record<string, number> = {};
    Object.entries(entryMap.value).forEach(([rank, pid]) => {
      placements[pid] = parseInt(rank);
    });
    captainSaving.value = true;
    try {
      await props.onCaptainSaveTap(groupId, raceNum, placements);
      editingRaceKey.value = null;
      await new Promise(resolve => setTimeout(resolve, 300));
      entryMap.value = {};
    } catch (e: any) {
      console.error('Captain save tap failed', e);
      alert(e?.message ?? 'Failed to save race results. Please try again.');
    } finally {
      captainSaving.value = false;
    }
  }
};

const handleUpdatePlacement = async (groupId: string, raceNum: number, pos: number, pid: string) => {
  if (props.isAdmin) {
    await updateRacePlacement(groupId, raceNum, pos, pid);
    return;
  }
  if (captainEditableGroupId.value === groupId && props.onCaptainUpdatePlacement) {
    try {
      await props.onCaptainUpdatePlacement(groupId, raceNum, pos, pid);
    } catch (e: any) {
      console.error('Captain update placement failed', e);
      alert(e?.message ?? 'Failed to update placement. Please try again.');
    }
  }
};
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
        :can-captain-edit="stage.id === captainEditableGroupId"
        :active-players="activeStagePlayers(stage.id)"
        :saving="saving || captainSaving"
        :editing-race-key="editingRaceKey"
        :entry-map="entryMap"
        :get-player-color="getPlayerColor"
        :class="{ 'border-t border-slate-700 pt-8': index !== 0 }"
        v-model:race-input-mode="raceInputMode"

        @toggle-edit="toggleEditRace"
        @cancel-edit="editingRaceKey = null"
        @clear-entry="entryMap = {}"
        @save-tap="handleSaveTap"
        @tap-player="handleTapToRank"
        @update-placement="handleUpdatePlacement"
    />
  </div>
</template>
