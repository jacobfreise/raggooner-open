<script setup lang="ts">
import { computed } from 'vue';
import type { Tournament } from '../../types';
import { compareTeams } from '../../utils/utils';

const props = defineProps<{ tournament: Tournament }>();

const stageData = computed(() => {
  const t = props.tournament;
  return t.stages.map((stage, stageIdx) => {
    const nextStage = t.stages[stageIdx + 1];
    const isCompleted = stageIdx < t.currentStageIndex || t.status === 'completed';
    const isCurrent = stageIdx === t.currentStageIndex && t.status !== 'completed';
    const isLast = stageIdx === t.stages.length - 1;

    const numCurrent = stage.groups.length;
    const numNext = nextStage?.groups.length ?? 0;

    const groups = stage.groups.map((group, groupIdx) => {
      const groupTeams = t.teams
        .filter(tm => tm.stageGroups[stage.name] === group)
        .sort((a, b) => compareTeams(a, b, true, t, stage.name));

      const raceCount = Object.values(t.races)
        .filter(r => r.stage === stage.name && r.group === group).length;

      // Deterministic next-stage group destination (matches finalizeFinals seeding)
      const nextGroupIdx = !isLast && nextStage && numNext > 1
        ? Math.min(Math.floor(groupIdx * numNext / numCurrent), numNext - 1)
        : 0;
      const nextStageDest = !isLast && nextStage ? (nextStage.groups[nextGroupIdx] ?? nextStage.groups[0]) : null;
      const nextStageLabel = nextStage?.label ?? null;

      return {
        group,
        groupIdx,
        raceCount,
        nextStageDest,
        nextStageLabel,
        teams: groupTeams.map(team => ({
          id: team.id,
          name: team.name,
          color: team.color || '#94a3b8',
          points: team.stagePoints[stage.name] ?? 0,
          advanced: !isLast && nextStage
            ? (team.qualifiedStages?.includes(nextStage.name) ?? false)
            : false,
        })),
      };
    });

    const winner = isLast && t.status === 'completed'
      ? groups[0]?.teams.reduce<{ id: string; name: string; color: string; points: number } | null>(
          (best, tm) => (best === null || tm.points > best.points) ? tm : best,
          null
        )
      : null;

    return { stage, stageIdx, isCompleted, isCurrent, isLast, groups, winner };
  });
});

// For a single-stage tournament just render linearly
const isSingleStage = computed(() => stageData.value.length <= 1);

const finalsCol = computed(() => stageData.value[stageData.value.length - 1]);

// Pre-final stages (everything except the last)
const preFinalStages = computed(() => stageData.value.slice(0, -1));

// Left side: first ⌈N/2⌉ groups of each pre-final stage, in chronological order
const leftSideStages = computed(() =>
  preFinalStages.value.map(col => {
    const half = Math.ceil(col.groups.length / 2);
    return { ...col, sideGroups: col.groups.slice(0, half) };
  }).filter(col => col.sideGroups.length > 0)
);

// Right side: last ⌊N/2⌋ groups of each pre-final stage, in reverse chronological order (closest to Finals first)
const rightSideStages = computed(() =>
  [...preFinalStages.value]
    .reverse()
    .map(col => {
      const half = Math.ceil(col.groups.length / 2);
      return { ...col, sideGroups: col.groups.slice(half) };
    })
    .filter(col => col.sideGroups.length > 0)
);

const hasRightSide = computed(() => rightSideStages.value.length > 0);
</script>

<template>
  <!-- Single-stage: simple linear layout -->
  <div v-if="isSingleStage" class="overflow-x-auto -mx-2 px-2 pb-4">
    <div class="flex items-center gap-0 min-w-max">
      <template v-for="(col, si) in stageData" :key="col.stage.name">
        <div class="flex flex-col w-[210px] shrink-0">
          <!-- Stage header -->
          <div class="mb-3 flex items-center gap-2 px-1">
            <span class="text-xs font-black uppercase tracking-widest"
                  :class="col.isCurrent ? 'text-indigo-400' : col.isCompleted ? 'text-slate-400' : 'text-slate-600'">
              {{ col.stage.label }}
            </span>
            <span v-if="col.isCurrent"
                  class="text-[9px] bg-indigo-500 text-white px-1.5 py-0.5 rounded font-black uppercase tracking-wide animate-pulse">
              Live
            </span>
            <span v-else-if="col.isCompleted"
                  class="text-[9px] bg-slate-800 border border-slate-700 text-slate-500 px-1.5 py-0.5 rounded font-black uppercase tracking-wide">
              Done
            </span>
            <span v-else
                  class="text-[9px] bg-slate-900 border border-slate-800 text-slate-600 px-1.5 py-0.5 rounded font-black uppercase tracking-wide">
              Upcoming
            </span>
          </div>
          <!-- Groups -->
          <div class="flex flex-col gap-3 px-1">
            <div v-for="{ group, raceCount, teams, nextStageDest, nextStageLabel } in col.groups" :key="group">
              <div class="flex items-center justify-between mb-1.5">
                <div class="flex items-center gap-1">
                  <span v-if="col.groups.length > 1"
                        class="text-[9px] font-black uppercase tracking-widest text-slate-600">
                    Group {{ group }}
                  </span>
                  <span v-else-if="col.isLast"
                        class="text-[9px] font-black uppercase tracking-widest text-amber-600">
                    Finals
                  </span>
                  <span v-else class="text-[9px] font-black uppercase tracking-widest text-slate-600">
                    Standings
                  </span>
                  <span v-if="nextStageDest && nextStageLabel && !col.isLast && col.groups.length > 1"
                        class="text-[8px] text-slate-700 font-mono">
                    → {{ nextStageLabel }} {{ nextStageDest }}
                  </span>
                </div>
                <span class="text-[9px] font-mono text-slate-600 tabular-nums">
                  {{ raceCount }}<span class="text-slate-700">/{{ col.stage.racesRequired }}</span>
                </span>
              </div>
              <div class="bg-slate-900 rounded-lg overflow-hidden border border-slate-800"
                   :class="col.isCurrent ? 'border-indigo-900/60' : ''">
                <template v-if="teams.length > 0">
                  <div v-for="(team, tidx) in teams" :key="team.id"
                       class="flex items-center gap-1.5 px-2.5 py-2 border-b border-slate-800/60 last:border-b-0 transition-colors relative"
                       :class="[
                         col.isLast && col.winner?.id === team.id && col.isCompleted
                           ? 'bg-amber-950/30'
                           : team.advanced
                             ? 'bg-emerald-950/20'
                             : col.isCompleted && !col.isLast
                               ? 'opacity-45'
                               : ''
                       ]">
                    <span class="text-[9px] font-mono text-slate-700 w-3 shrink-0 text-right tabular-nums">
                      {{ tidx + 1 }}
                    </span>
                    <div class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: team.color }"></div>
                    <span class="text-xs font-bold flex-1 truncate leading-tight" :style="{ color: team.color }">
                      {{ team.name }}
                    </span>
                    <span class="text-[10px] font-mono tabular-nums shrink-0"
                          :class="team.points > 0 ? 'text-slate-400' : 'text-slate-700'">
                      {{ col.isCurrent || col.isCompleted ? team.points : '—' }}
                    </span>
                    <template v-if="col.isLast && col.winner?.id === team.id && col.isCompleted">
                      <i class="ph-fill ph-trophy text-amber-400 text-[10px] shrink-0"></i>
                    </template>
                    <template v-else-if="!col.isLast && col.isCompleted">
                      <i v-if="team.advanced" class="ph-fill ph-caret-right text-emerald-500 text-[10px] shrink-0"></i>
                      <i v-else class="ph-bold ph-x text-slate-700 text-[9px] shrink-0"></i>
                    </template>
                  </div>
                </template>
                <template v-else>
                  <div class="px-3 py-3 text-center">
                    <span class="text-[10px] text-slate-700 italic">TBD</span>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </div>
        <div v-if="si < stageData.length - 1"
             class="flex items-center justify-center w-10 shrink-0 self-stretch">
          <div class="flex flex-col items-center gap-1 text-slate-700">
            <i class="ph-bold ph-arrow-right text-base"></i>
          </div>
        </div>
      </template>
    </div>
  </div>

  <!-- Multi-stage: symmetric layout with Finals centered -->
  <div v-else class="overflow-x-auto -mx-2 px-2 pb-4">
    <div class="flex items-center gap-0 min-w-max justify-center">

      <!-- LEFT SIDE: pre-final stages, chronological (earliest first), left groups -->
      <template v-for="(col, si) in leftSideStages" :key="'left-' + col.stage.name">
        <div class="flex flex-col w-[210px] shrink-0">
          <!-- Stage header -->
          <div class="mb-3 flex items-center gap-2 px-1">
            <span class="text-xs font-black uppercase tracking-widest"
                  :class="col.isCurrent ? 'text-indigo-400' : col.isCompleted ? 'text-slate-400' : 'text-slate-600'">
              {{ col.stage.label }}
            </span>
            <span v-if="col.isCurrent"
                  class="text-[9px] bg-indigo-500 text-white px-1.5 py-0.5 rounded font-black uppercase tracking-wide animate-pulse">
              Live
            </span>
            <span v-else-if="col.isCompleted"
                  class="text-[9px] bg-slate-800 border border-slate-700 text-slate-500 px-1.5 py-0.5 rounded font-black uppercase tracking-wide">
              Done
            </span>
            <span v-else
                  class="text-[9px] bg-slate-900 border border-slate-800 text-slate-600 px-1.5 py-0.5 rounded font-black uppercase tracking-wide">
              Upcoming
            </span>
          </div>
          <!-- Groups (left half) -->
          <div class="flex flex-col gap-3 px-1">
            <div v-for="{ group, raceCount, teams, nextStageDest, nextStageLabel } in col.sideGroups" :key="group">
              <div class="flex items-center justify-between mb-1.5">
                <div class="flex items-center gap-1">
                  <span v-if="col.groups.length > 1"
                        class="text-[9px] font-black uppercase tracking-widest text-slate-600">
                    Group {{ group }}
                  </span>
                  <span v-else class="text-[9px] font-black uppercase tracking-widest text-slate-600">
                    Standings
                  </span>
                  <span v-if="nextStageDest && nextStageLabel"
                        class="text-[8px] text-slate-700 font-mono">
                    → {{ nextStageLabel }} {{ nextStageDest }}
                  </span>
                </div>
                <span class="text-[9px] font-mono text-slate-600 tabular-nums">
                  {{ raceCount }}<span class="text-slate-700">/{{ col.stage.racesRequired }}</span>
                </span>
              </div>
              <div class="bg-slate-900 rounded-lg overflow-hidden border border-slate-800"
                   :class="col.isCurrent ? 'border-indigo-900/60' : ''">
                <template v-if="teams.length > 0">
                  <div v-for="(team, tidx) in teams" :key="team.id"
                       class="flex items-center gap-1.5 px-2.5 py-2 border-b border-slate-800/60 last:border-b-0 transition-colors"
                       :class="[
                         team.advanced ? 'bg-emerald-950/20' : col.isCompleted ? 'opacity-45' : ''
                       ]">
                    <span class="text-[9px] font-mono text-slate-700 w-3 shrink-0 text-right tabular-nums">
                      {{ tidx + 1 }}
                    </span>
                    <div class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: team.color }"></div>
                    <span class="text-xs font-bold flex-1 truncate leading-tight" :style="{ color: team.color }">
                      {{ team.name }}
                    </span>
                    <span class="text-[10px] font-mono tabular-nums shrink-0"
                          :class="team.points > 0 ? 'text-slate-400' : 'text-slate-700'">
                      {{ col.isCurrent || col.isCompleted ? team.points : '—' }}
                    </span>
                    <template v-if="col.isCompleted">
                      <i v-if="team.advanced" class="ph-fill ph-caret-right text-emerald-500 text-[10px] shrink-0"></i>
                      <i v-else class="ph-bold ph-x text-slate-700 text-[9px] shrink-0"></i>
                    </template>
                  </div>
                </template>
                <template v-else>
                  <div class="px-3 py-3 text-center">
                    <span class="text-[10px] text-slate-700 italic">TBD</span>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </div>

        <!-- Connector → toward Finals -->
        <div class="flex items-center justify-center w-10 shrink-0 self-stretch">
          <div class="flex flex-col items-center gap-1 text-slate-700">
            <i class="ph-bold ph-arrow-right text-base"></i>
          </div>
        </div>
      </template>

      <!-- FINALS (center) -->
      <div v-if="finalsCol" class="flex flex-col w-[210px] shrink-0">
        <!-- Stage header -->
        <div class="mb-3 flex items-center gap-2 px-1">
          <span class="text-xs font-black uppercase tracking-widest"
                :class="finalsCol.isCurrent ? 'text-indigo-400' : finalsCol.isCompleted ? 'text-amber-400' : 'text-slate-600'">
            {{ finalsCol.stage.label }}
          </span>
          <span v-if="finalsCol.isCurrent"
                class="text-[9px] bg-indigo-500 text-white px-1.5 py-0.5 rounded font-black uppercase tracking-wide animate-pulse">
            Live
          </span>
          <span v-else-if="finalsCol.isCompleted"
                class="text-[9px] bg-amber-900/60 border border-amber-800/60 text-amber-500 px-1.5 py-0.5 rounded font-black uppercase tracking-wide">
            Done
          </span>
          <span v-else
                class="text-[9px] bg-slate-900 border border-slate-800 text-slate-600 px-1.5 py-0.5 rounded font-black uppercase tracking-wide">
            Upcoming
          </span>
        </div>
        <!-- Finals groups -->
        <div class="flex flex-col gap-3 px-1">
          <div v-for="{ group, raceCount, teams } in finalsCol.groups" :key="group">
            <div class="flex items-center justify-between mb-1.5">
              <span v-if="finalsCol.groups.length > 1"
                    class="text-[9px] font-black uppercase tracking-widest text-slate-600">
                Group {{ group }}
              </span>
              <span v-else
                    class="text-[9px] font-black uppercase tracking-widest text-amber-600">
                Finals
              </span>
              <span class="text-[9px] font-mono text-slate-600 tabular-nums">
                {{ raceCount }}<span class="text-slate-700">/{{ finalsCol.stage.racesRequired }}</span>
              </span>
            </div>
            <div class="bg-slate-900 rounded-lg overflow-hidden border border-slate-800"
                 :class="finalsCol.isCurrent ? 'border-indigo-900/60' : finalsCol.isCompleted ? 'border-amber-900/40' : ''">
              <template v-if="teams.length > 0">
                <div v-for="(team, tidx) in teams" :key="team.id"
                     class="flex items-center gap-1.5 px-2.5 py-2 border-b border-slate-800/60 last:border-b-0 transition-colors"
                     :class="[
                       finalsCol.winner?.id === team.id && finalsCol.isCompleted
                         ? 'bg-amber-950/30'
                         : ''
                     ]">
                  <span class="text-[9px] font-mono text-slate-700 w-3 shrink-0 text-right tabular-nums">
                    {{ tidx + 1 }}
                  </span>
                  <div class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: team.color }"></div>
                  <span class="text-xs font-bold flex-1 truncate leading-tight" :style="{ color: team.color }">
                    {{ team.name }}
                  </span>
                  <span class="text-[10px] font-mono tabular-nums shrink-0"
                        :class="team.points > 0 ? 'text-slate-400' : 'text-slate-700'">
                    {{ finalsCol.isCurrent || finalsCol.isCompleted ? team.points : '—' }}
                  </span>
                  <template v-if="finalsCol.winner?.id === team.id && finalsCol.isCompleted">
                    <i class="ph-fill ph-trophy text-amber-400 text-[10px] shrink-0"></i>
                  </template>
                </div>
              </template>
              <template v-else>
                <div class="px-3 py-3 text-center">
                  <span class="text-[10px] text-slate-700 italic">TBD</span>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- RIGHT SIDE: pre-final stages, reverse chronological (closest to Finals first), right groups -->
      <template v-if="hasRightSide" v-for="(col, si) in rightSideStages" :key="'right-' + col.stage.name + '-' + si">
        <!-- Connector ← toward Finals -->
        <div class="flex items-center justify-center w-10 shrink-0 self-stretch">
          <div class="flex flex-col items-center gap-1 text-slate-700">
            <i class="ph-bold ph-arrow-left text-base"></i>
          </div>
        </div>

        <div class="flex flex-col w-[210px] shrink-0">
          <!-- Stage header -->
          <div class="mb-3 flex items-center gap-2 px-1">
            <span class="text-xs font-black uppercase tracking-widest"
                  :class="col.isCurrent ? 'text-indigo-400' : col.isCompleted ? 'text-slate-400' : 'text-slate-600'">
              {{ col.stage.label }}
            </span>
            <span v-if="col.isCurrent"
                  class="text-[9px] bg-indigo-500 text-white px-1.5 py-0.5 rounded font-black uppercase tracking-wide animate-pulse">
              Live
            </span>
            <span v-else-if="col.isCompleted"
                  class="text-[9px] bg-slate-800 border border-slate-700 text-slate-500 px-1.5 py-0.5 rounded font-black uppercase tracking-wide">
              Done
            </span>
            <span v-else
                  class="text-[9px] bg-slate-900 border border-slate-800 text-slate-600 px-1.5 py-0.5 rounded font-black uppercase tracking-wide">
              Upcoming
            </span>
          </div>
          <!-- Groups (right half) -->
          <div class="flex flex-col gap-3 px-1">
            <div v-for="{ group, raceCount, teams, nextStageDest, nextStageLabel } in col.sideGroups" :key="group">
              <div class="flex items-center justify-between mb-1.5">
                <span class="text-[9px] font-mono text-slate-600 tabular-nums">
                  {{ raceCount }}<span class="text-slate-700">/{{ col.stage.racesRequired }}</span>
                </span>
                <div class="flex items-center gap-1">
                  <span v-if="nextStageDest && nextStageLabel"
                        class="text-[8px] text-slate-700 font-mono">
                    {{ nextStageLabel }} {{ nextStageDest }} ←
                  </span>
                  <span v-if="col.groups.length > 1"
                        class="text-[9px] font-black uppercase tracking-widest text-slate-600">
                    Group {{ group }}
                  </span>
                  <span v-else class="text-[9px] font-black uppercase tracking-widest text-slate-600">
                    Standings
                  </span>
                </div>
              </div>
              <div class="bg-slate-900 rounded-lg overflow-hidden border border-slate-800"
                   :class="col.isCurrent ? 'border-indigo-900/60' : ''">
                <template v-if="teams.length > 0">
                  <div v-for="(team, tidx) in teams" :key="team.id"
                       class="flex items-center gap-1.5 px-2.5 py-2 border-b border-slate-800/60 last:border-b-0 transition-colors"
                       :class="[
                         team.advanced ? 'bg-emerald-950/20' : col.isCompleted ? 'opacity-45' : ''
                       ]">
                    <span class="text-[9px] font-mono text-slate-700 w-3 shrink-0 text-right tabular-nums">
                      {{ tidx + 1 }}
                    </span>
                    <div class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: team.color }"></div>
                    <span class="text-xs font-bold flex-1 truncate leading-tight" :style="{ color: team.color }">
                      {{ team.name }}
                    </span>
                    <span class="text-[10px] font-mono tabular-nums shrink-0"
                          :class="team.points > 0 ? 'text-slate-400' : 'text-slate-700'">
                      {{ col.isCurrent || col.isCompleted ? team.points : '—' }}
                    </span>
                    <template v-if="col.isCompleted">
                      <i v-if="team.advanced" class="ph-fill ph-caret-left text-emerald-500 text-[10px] shrink-0"></i>
                      <i v-else class="ph-bold ph-x text-slate-700 text-[9px] shrink-0"></i>
                    </template>
                  </div>
                </template>
                <template v-else>
                  <div class="px-3 py-3 text-center">
                    <span class="text-[10px] text-slate-700 italic">TBD</span>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </div>
      </template>

    </div>
  </div>
</template>
