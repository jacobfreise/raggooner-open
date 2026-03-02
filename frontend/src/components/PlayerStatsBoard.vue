<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import type {Tournament, FirestoreUpdate, Player, Team} from '../types';
import { useGameLogic } from '../composables/useGameLogic';
import { useRoster } from '../composables/useRoster';
import { getPositionStyle } from '../utils/utils';
import { getUmaImagePath } from '../utils/umaData';
import { useHallOfFame } from '../composables/useHallOfFame';

const props = defineProps<{
  tournament: Tournament;
  currentView: string;
  isAdmin: boolean;
  secureUpdate: (data: FirestoreUpdate<Tournament> | Record<string, any>) => Promise<void>;
}>();

const tournamentRef = toRef(props, 'tournament');
const isAdminRef = toRef(props, 'isAdmin');

// Initialize composables just to grab the read-only helper functions
const { getRaceResultsForPlayer, getTotalPoints } = useGameLogic(tournamentRef, props.secureUpdate);
const { getPlayerColor } = useRoster(tournamentRef, props.secureUpdate, isAdminRef);

// --- Local State & Helpers ---
const isSmallTournament = computed(() => (props.tournament.teams?.length || 0) < 6);

const getSplitResults = (playerId: string) => {
  const allResults = getRaceResultsForPlayer(playerId);
  return {
    groups: allResults.filter(r => r.stage === 'groups'),
    finals: allResults.filter(r => r.stage === 'finals')
  };
};

const playerEliminated = (playerId: string) => {
  if (!props.tournament) return false;
  if (isSmallTournament.value) return false;

  const isFinalsPhase = props.currentView === 'finals' || props.tournament.status === 'completed';
  if (!isFinalsPhase) return false;

  const team = props.tournament.teams.find(t =>
      t.captainId === playerId || t.memberIds.includes(playerId)
  );
  return team ? !team.inFinals : false;
};

const getPhaseTotal = (results: any[]) => {
  return results.reduce((sum, r) => sum + r.points, 0);
};

// --- Sorting & Grouping Logic ---
type SortOption = 'total' | 'group' | 'finals' | 'name' | 'uma';
const sortBy = ref<SortOption>('total');
const sortDesc = ref(true);
const groupByTeam = ref(false);

const getPlayerSortPoints = (pid: string, type: 'total' | 'group' | 'finals') => {
  if (type === 'total') return getTotalPoints(pid);
  const splits = getSplitResults(pid);
  if (type === 'group') return getPhaseTotal(splits.groups);
  if (type === 'finals') return getPhaseTotal(splits.finals);
  return 0;
};

const sortFunction = (a: any, b: any) => {
  let result: number;
  if (sortBy.value === 'name') {
    result = a.name.localeCompare(b.name);
  } else if (sortBy.value === 'uma') {
    const umaA = a.uma || 'zzzz';
    const umaB = b.uma || 'zzzz';
    result = umaA.localeCompare(umaB);
  } else {
    const ptsA = getPlayerSortPoints(a.id, sortBy.value as any);
    const ptsB = getPlayerSortPoints(b.id, sortBy.value as any);
    result = ptsA - ptsB;
  }
  return sortDesc.value ? result * -1 : result;
};

const structuredPlayerStats = computed(() => {
  if (!props.tournament) return [];
  const players = Object.values(props.tournament.players);

  if (groupByTeam.value) {
    const teams = props.tournament.teams;
    const assignedIds = new Set(teams.flatMap(t => [t.captainId, ...t.memberIds]));
    const unassigned = players.filter(p => !assignedIds.has(p.id));

    const sections = teams.map(team => {
      const teamPlayers = players.filter(p => p.id === team.captainId || team.memberIds.includes(p.id));
      teamPlayers.sort(sortFunction);

      let teamAggregate: number;
      if (['total', 'group', 'finals'].includes(sortBy.value)) {
        teamAggregate = teamPlayers.reduce((sum, p) => sum + getPlayerSortPoints(p.id, sortBy.value as any), 0);
      } else {
        teamAggregate = teamPlayers.length;
      }

      return {
        id: team.id, title: team.name, color: team.color, players: teamPlayers, sortNumeric: teamAggregate, sortString: team.name
      };
    });

    if (unassigned.length > 0) {
      unassigned.sort(sortFunction);
      let wcAggregate = 0;
      if (['total', 'group', 'finals'].includes(sortBy.value)) {
        wcAggregate = unassigned.reduce((sum, p) => sum + getPlayerSortPoints(p.id, sortBy.value as any), 0);
      }
      sections.push({
        id: 'wildcards', title: 'Wildcards', color: '#94a3b8', players: unassigned, sortNumeric: wcAggregate, sortString: 'Wildcards'
      });
    }

    sections.sort((a, b) => {
      let result: number;
      if (sortBy.value === 'name' || sortBy.value === 'uma') {
        result = a.sortString.localeCompare(b.sortString);
      } else {
        result = a.sortNumeric - b.sortNumeric;
      }
      return sortDesc.value ? result * -1 : result;
    });

    return sections;
  }

  players.sort(sortFunction);
  return [{ id: 'all', title: null, color: null, players, sortNumeric: 0, sortString: '' }];
});

// 2. FETCH ACTIVE STATS
const { activeStats } = useHallOfFame(tournamentRef);

// 3. MAP FAME TO PLAYERS
const playerFameMap = computed(() => {
  const map: Record<string, { title: string, icon: string, color: string }[]> = {};

  if (!activeStats.value) return map;

  activeStats.value.forEach(stat => {
    stat.results.forEach(result => {
      // If it's a team award, give the badge to all roster members
      if (stat.isTeam) {
        const team = result.winner as Team;
        const roster = [team.captainId, ...(team.memberIds || [])];

        roster.forEach(pid => {
          if (!pid) return;
          // Creates the array if it doesn't exist, then immediately pushes to it
          (map[pid] ??= []).push({ title: stat.title, icon: stat.icon, color: stat.color });
        });
      } else {
        // Individual award
        const player = result.winner as Player;
        if (!player?.id) return;

        // Creates the array if it doesn't exist, then immediately pushes to it
        (map[player.id] ??= []).push({ title: stat.title, icon: stat.icon, color: stat.color });
      }
    });
  });

  return map;
});
</script>

<template>
  <div class="mt-12 pt-8 border-t border-slate-700">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
      <div class="flex items-center gap-3 mb-6">
        <div class="h-8 w-1.5 bg-amber-500 rounded-full shadow-[0_0_15px_rgba(245,158,11,0.6)]"></div>
        <div>
          <h2 class="text-xl font-bold text-white uppercase tracking-widest">Player Stats</h2>
          <p class="text-xs text-slate-400 font-medium">Points and Placements of Players</p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs font-bold text-slate-500 uppercase tracking-widest mr-1 hidden sm:inline">Sort:</span>
        <div class="relative">
          <select v-model="sortBy" class="appearance-none bg-slate-800 text-slate-300 text-xs font-bold uppercase tracking-wider pl-3 pr-8 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-indigo-500 cursor-pointer hover:bg-slate-750 transition-colors">
            <option value="total">Points (Total)</option>
            <option value="group" v-if="!isSmallTournament">Points (Group)</option>
            <option value="finals" v-if="!isSmallTournament">Points (Finals)</option>
            <option value="name">Name</option>
            <option value="uma">Uma</option>
          </select>
          <i class="ph-bold ph-caret-down absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"></i>
        </div>

        <button @click="sortDesc = !sortDesc" class="flex items-center bg-slate-800 text-slate-300 hover:text-white px-3 py-2 text-xs rounded-lg border border-slate-700 hover:border-slate-600 transition-colors" :title="sortDesc ? 'Descending' : 'Ascending'">
          <i class="ph-bold text-base" :class="!sortDesc ? 'ph-sort-descending' : 'ph-sort-ascending'"></i>
        </button>

        <div class="w-px h-6 bg-slate-700 mx-1"></div>

        <button @click="groupByTeam = !groupByTeam" class="flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-xs font-bold uppercase tracking-wider" :class="groupByTeam ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'">
          <i class="ph-bold" :class="groupByTeam ? 'ph-users-three' : 'ph-squares-four'"></i>
          <span class="hidden sm:inline">Group by Team</span>
        </button>
      </div>
    </div>

    <div class="space-y-8">
      <div v-for="section in structuredPlayerStats" :key="section.id">
        <div v-if="groupByTeam && section.id !== 'all'" class="flex items-center gap-3 mb-4">
          <div class="h-px bg-slate-700 flex-1"></div>
          <span class="flex items-center gap-2 text-sm font-bold uppercase tracking-widest px-3 py-1 rounded border bg-slate-800/50 whitespace-nowrap" :style="{ color: section.color || '#fff', borderColor: (section.color || '#fff') + '40' }">
            {{ section.title }}
            <span v-if="['total', 'group', 'finals'].includes(sortBy)" class="whitespace-nowrap text-xs font-mono font-bold text-slate-400 bg-slate-900 px-2 rounded border border-slate-800 shadow-sm">
              {{ section.sortNumeric }} pts
            </span>
          </span>
          <div class="h-px bg-slate-700 flex-1"></div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-start">
          <div v-for="player in section.players" :key="player.id" class="relative overflow-hidden bg-slate-800 rounded-xl p-4 border border-slate-700 hover:border-indigo-500/50 transition-all flex flex-col group hover:shadow-xl hover:-translate-y-1">
            <div class="absolute inset-0 transition-opacity duration-500 opacity-0 group-hover:opacity-100 pointer-events-none" :style="{ background: `linear-gradient(to bottom right, ${getPlayerColor(player.id)}33, transparent)` }"></div>

            <div class="relative z-10 pb-2 border-slate-700/50">
              <div class="flex justify-between items-start">
                <div class="flex-1 flex items-start gap-3 min-w-0">
                  <img v-if="player.uma" :src="getUmaImagePath(player.uma)" :alt="player.uma"
                       class="w-10 h-10 rounded-full object-cover shrink-0 bg-slate-700 mt-0.5" />
                  <div class="flex flex-col min-w-0">
                    <div class="text-2xl font-bold leading-none group-hover:text-indigo-300 transition-colors" :style="{ color: getPlayerColor(player.id) }">{{ player.name }}</div>
                    <div class="text-[10px] uppercase font-bold tracking-wider text-slate-500 mt-1 h-3.5" v-if="player.uma">{{ player.uma }}</div>
                    <div v-else class="h-3.5 mt-1"></div>
                  </div>
                </div>
                <div class="text-right shrink-0 ml-2">
                  <div class="text-2xl font-bold leading-none text-indigo-400 tabular-nums">{{ getTotalPoints(player.id) }}</div>
                  <div class="text-[10px] uppercase font-bold tracking-wider text-slate-500 mt-1 h-3.5">Total Pts</div>
                </div>
              </div>
              <div v-if="playerFameMap[player.id]?.length" class="flex flex-wrap gap-1 mt-2">
                <div v-for="fame in playerFameMap[player.id]" :key="fame.title"
                     class="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded border border-slate-700 bg-slate-900/80 flex items-center gap-1 shadow-sm">
                  <i :class="[fame.icon, fame.color]" class="ph-fill text-[10px]"></i>
                  <span class="text-slate-400">{{ fame.title }}</span>
                </div>
              </div>
            </div>

            <div class="flex-1 flex flex-col gap-2">
              <template v-for="results in [getSplitResults(player.id)]" :key="player.id">
                <div v-if="isSmallTournament">
                  <div class="text-[10px] uppercase text-slate-500 font-bold tracking-widest mb-2 flex items-center gap-2">
                    Races <div class="h-px bg-slate-700 flex-1"></div>
                  </div>
                  <div class="min-h-[60px] flex flex-col justify-center">
                    <div v-if="results.finals.length === 0" class="flex items-center justify-center">
                      <span class="text-xs text-slate-600 italic">No races recorded yet</span>
                    </div>
                    <div v-else class="grid grid-cols-5 gap-2">
                      <div v-for="(result, idx) in results.finals" :key="'r'+idx" class="flex flex-col items-center gap-1">
                        <div class="w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold border shadow-sm transition-transform hover:scale-110" :class="getPositionStyle(result.position, 'finals')">
                          {{ result.position || '-' }}
                        </div>
                        <span class="text-[10px] font-mono text-slate-500">
                          {{ result.points > 0 ? '+' + result.points : (result.points === 0 ? '0' : result.points) }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div v-else class="contents">
                  <div>
                    <div class="text-[10px] uppercase text-slate-500 font-bold tracking-widest mb-2 flex items-center gap-2">
                      Group Stage <div class="h-px bg-slate-700 flex-1"></div>
                      <span class="font-mono text-slate-400">{{ getPhaseTotal(results.groups) }} pts</span>
                    </div>
                    <div class="min-h-[60px] flex flex-col justify-center">
                      <div v-if="results.groups.length === 0" class="flex items-center justify-center">
                        <span class="text-xs text-slate-600 italic">No races recorded yet</span>
                      </div>
                      <div v-else class="grid grid-cols-5 gap-2">
                        <div v-for="(result, idx) in results.groups" :key="'g'+idx" class="flex flex-col items-center gap-1">
                          <div class="w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold border shadow-sm transition-transform hover:scale-110" :class="getPositionStyle(result.position, 'groups')">
                            {{ result.position || '-' }}
                          </div>
                          <span class="text-[10px] font-mono text-slate-500">
                            {{ result.points > 0 ? '+' + result.points : (result.points === 0 ? '0' : result.points) }}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div v-if="!playerEliminated(player.id) || results.finals.length > 0">
                    <div class="text-[10px] uppercase text-slate-500 font-bold tracking-widest mb-2 mt-1 flex items-center gap-2">
                      <span class="text-amber-500">Finals</span>
                      <div class="h-px bg-slate-700 flex-1"></div>
                      <span class="font-mono text-slate-400">{{ getPhaseTotal(results.finals) }} pts</span>
                    </div>
                    <div class="min-h-[60px] flex flex-col justify-center">
                      <div v-if="results.finals.length === 0" class="flex items-center justify-center">
                        <span class="text-xs text-slate-600 italic">No races recorded yet</span>
                      </div>
                      <div v-else class="grid grid-cols-5 gap-2">
                        <div v-for="(result, idx) in results.finals" :key="'f'+idx" class="flex flex-col items-center gap-1">
                          <div class="w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold border shadow-sm transition-transform hover:scale-110" :class="getPositionStyle(result.position, 'finals')">
                            {{ result.position || '-' }}
                          </div>
                          <span class="text-[10px] font-mono text-slate-500">
                            {{ result.points > 0 ? '+' + result.points : (result.points === 0 ? '0' : result.points) }}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div v-else-if="playerEliminated(player.id)" class="mt-auto">
                    <div class="text-[10px] uppercase text-slate-500 font-bold tracking-widest mb-2 mt-1 flex items-center gap-2">
                      <span class="text-amber-500">Finals</span>
                      <div class="h-px bg-slate-700 flex-1"></div>
                      <span class="font-mono text-slate-400">{{ getPhaseTotal(results.finals) }} pts</span>
                    </div>
                    <div class="min-h-[60px] flex flex-col justify-center">
                      <div class="bg-slate-900/50 rounded-lg border border-slate-700 border-dashed p-3 text-center">
                        <span class="text-xs text-slate-500 italic">Did not qualify for finals</span>
                      </div>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>