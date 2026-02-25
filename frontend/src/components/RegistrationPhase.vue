<script setup lang="ts">
import { ref, toRef, computed } from 'vue';
import type { Tournament, FirestoreUpdate, GlobalPlayer, Season } from '../types';
import { useRoster } from '../composables/useRoster';
import { useTournamentFlow } from '../composables/useTournamentFlow';
import PlayerSelector from './PlayerSelector.vue';
import { arrayUnion } from 'firebase/firestore';

const props = defineProps<{
  tournament: Tournament;
  isAdmin: boolean;
  appId: string;
  secureUpdate: (data: FirestoreUpdate<Tournament> | Record<string, any>) => Promise<void>;
  globalPlayers: GlobalPlayer[];
  addGlobalPlayer: (player: GlobalPlayer) => void;
  seasons: Season[];
}>();

// Season filter for dominance stat
const selectedSeasonId = ref<string>(props.tournament.seasonId || 'all');

const getDominance = (playerId: string): number | null => {
  const gp = props.globalPlayers.find(p => p.id === playerId);
  if (!gp) return null;

  let faced: number | undefined;
  let beaten: number | undefined;

  if (selectedSeasonId.value === 'all') {
    faced = gp.metadata.opponentsFaced;
    beaten = gp.metadata.opponentsBeaten;
  } else {
    const seasonData = gp.metadata.seasons?.[selectedSeasonId.value];
    if (!seasonData) return null;
    faced = seasonData.opponentsFaced;
    beaten = seasonData.opponentsBeaten;
  }

  if (!faced || faced === 0) return null;
  return ((beaten || 0) / faced) * 100;
};

const sortedPlayers = computed(() => {
  return Object.values(props.tournament.players).sort((a, b) => {
    // Then by dominance descending
    const domA = getDominance(a.id) ?? -1;
    const domB = getDominance(b.id) ?? -1;
    if (domA === domB) return a.name.localeCompare(b.name);
    return domB - domA;
  });
});

const tournamentRef = toRef(props, 'tournament');
const isAdminRef = toRef(props, 'isAdmin');

// Initialize Roster Logic
const {
  removePlayer,
  toggleCaptain,
  validTeamCount,
  validTotalPlayers,
  canStartDraft
} = useRoster(tournamentRef, props.secureUpdate, isAdminRef);

// Initialize Tournament Flow (for phase transitions)
const { advancePhase, isAdvancing } = useTournamentFlow(tournamentRef, props.secureUpdate);

// Get list of already added player IDs
const addedPlayerIds = () => {
  return Object.keys(props.tournament.players);
};

// Handle player selection from PlayerSelector
const handlePlayerSelect = async (globalPlayer: GlobalPlayer) => {
  if (!props.isAdmin) return;

  // Convert GlobalPlayer to Player format
  const player = {
    id: globalPlayer.id,
    name: globalPlayer.name,
    isCaptain: false,
    uma: ''
  };

  await props.secureUpdate({
    [`players.${player.id}`]: player,
    playerIds: arrayUnion(globalPlayer.id)
  });
};
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div>
        <h2 class="text-3xl font-bold text-white">{{ tournament.name }}</h2>
        <p class="text-slate-400">Phase: <span class="text-indigo-400 font-semibold">Registration</span></p>
      </div>
      <div class="bg-slate-800 px-4 py-2 rounded-lg border border-slate-700">
        <div class="text-sm text-slate-400">Total Players</div>
        <div class="text-2xl font-bold text-white font-mono">
          {{ Object.keys(tournament.players).length }}
          <span class="text-sm font-normal text-slate-500">/ 27 max</span>
        </div>
      </div>
    </div>

    <div class="grid md:grid-cols-3 gap-6">
      <!-- Left Panel: Add Player -->
      <div class="md:col-span-1 glass-panel p-6 rounded-xl h-fit sticky top-20">
        <h3 class="text-xl font-bold mb-4 text-white flex items-center gap-2">
          <i class="ph-bold ph-user-plus text-indigo-400"></i>
          Add Participant
        </h3>

        <div class="space-y-4">
          <!-- PlayerSelector Component -->
          <PlayerSelector
              :app-id="appId"
              :players="globalPlayers"
              :exclude-ids="addedPlayerIds()"
              :show-stats="true"
              placeholder="Search or add player..."
              @select="handlePlayerSelect"
              @create="addGlobalPlayer"
              :disabled="!isAdmin"
          />

          <div class="bg-slate-900/50 border border-slate-700 rounded-lg p-3">
            <p class="text-xs text-slate-400 leading-relaxed">
              <i class="ph-fill ph-info text-indigo-400 mr-1"></i>
              Search for existing players or add new ones to the global pool. Click on a player in the list to promote them to
              <span class="text-amber-500 font-bold">
                <i class="ph-fill ph-crown"></i> Captain
              </span>.
            </p>
          </div>
        </div>

        <!-- Requirements & Start Draft -->
        <div class="mt-8 pt-6 border-t border-slate-700">
          <h4 class="text-sm font-bold text-slate-400 uppercase mb-2 flex items-center gap-2">
            <i class="ph-fill ph-check-square"></i>
            Requirements
          </h4>
          <ul class="text-xs space-y-2 text-slate-500">
            <li class="flex items-center gap-2">
              <i
                  class="ph-fill"
                  :class="validTeamCount ? 'ph-check-circle text-green-500' : 'ph-x-circle text-red-500'"
              ></i>
              3 to 9 Captains (not 7)
            </li>
            <li class="flex items-center gap-2">
              <i
                  class="ph-fill"
                  :class="validTotalPlayers ? 'ph-check-circle text-green-500' : 'ph-x-circle text-red-500'"
              ></i>
              Total Players = Captains × 3
            </li>
          </ul>

          <button
              @click="advancePhase"
              :disabled="!canStartDraft || !isAdmin || isAdvancing"
              class="w-full mt-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-20 disabled:cursor-not-allowed text-white py-3 rounded-lg font-bold uppercase tracking-wider transition-all shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2"
          >
            <template v-if="isAdvancing">
              <i class="ph ph-spinner animate-spin"></i> Starting...
            </template>
            <template v-else>
              <i class="ph-bold ph-play-circle"></i>
              Start Draft
            </template>
          </button>
        </div>
      </div>

      <!-- Right Panel: Player List -->
      <div class="md:col-span-2 space-y-4">
        <div v-if="Object.keys(tournament.players).length > 0" class="flex items-center justify-end">
          <select v-model="selectedSeasonId"
                  class="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-indigo-500">
            <option value="all">All Time</option>
            <option v-for="season in seasons" :key="season.id" :value="season.id">{{ season.name }}</option>
          </select>
        </div>

        <div
            v-if="Object.keys(tournament.players).length === 0"
            class="text-center py-20 text-slate-600 border-2 border-dashed border-slate-800 rounded-xl"
        >
          <i class="ph ph-users text-6xl mb-4 opacity-30"></i>
          <p class="text-lg font-medium">No players added yet</p>
          <p class="text-sm text-slate-700 mt-2">Use the search on the left to add players</p>
        </div>

        <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div
              v-for="player in sortedPlayers"
              :key="player.id"
              @click="isAdmin && toggleCaptain(player.id)"
              class="relative p-3 rounded-lg flex items-center justify-between group border transition-all select-none"
              :class="[
              player.isCaptain
                ? 'bg-amber-900/20 border-amber-500/50 hover:bg-amber-900/30'
                : 'bg-slate-800 border-slate-700/50 hover:border-indigo-500/50 hover:bg-slate-750',
              isAdmin ? 'cursor-pointer' : 'cursor-default'
            ]"
          >
            <div class="flex items-center gap-3 flex-1 min-w-0">
              <div
                  class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-transform group-active:scale-95 shadow-sm shrink-0"
                  :class="player.isCaptain
                  ? 'bg-amber-500 text-slate-900 ring-2 ring-amber-500/20'
                  : 'bg-slate-700 text-slate-400'"
              >
                <i v-if="player.isCaptain" class="ph-fill ph-crown text-lg"></i>
                <span v-else>{{ player.name.charAt(0) }}</span>
              </div>

              <div class="flex flex-col min-w-0 flex-1">
                <span
                    class="font-bold truncate"
                    :class="player.isCaptain ? 'text-amber-100' : 'text-slate-200'"
                >
                  {{ player.name }}
                </span>
                              <div class="flex items-center gap-2 mt-0.5">
                  <span
                      class="text-[10px] uppercase font-bold tracking-wider"
                      :class="player.isCaptain ? 'text-amber-500' : 'text-slate-500'"
                  >
                    {{ player.isCaptain ? 'Captain' : 'Player' }}
                  </span>

                  <div v-if="getDominance(player.id) !== null"
                       class="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-900/80 border border-slate-700/50 text-slate-300">
                    <i class="ph-fill ph-sword text-indigo-400"></i>
                    {{ getDominance(player.id)!.toFixed(1) }}%
                  </div>
                </div>
              </div>
            </div>

            <!-- Remove Button -->
<!--            <button-->
<!--                v-if="isAdmin"-->
<!--                @click.stop="removePlayer(player.id)"-->
<!--                class="opacity-0 group-hover:opacity-100 items-center justify-center text-rose-400 hover:text-rose-300 transition-all p-2 rounded hover:bg-slate-900/50"-->
<!--                title="Remove player"-->
<!--            >-->
<!--              <i class="ph-bold ph-x text-lg"></i>-->
<!--            </button>-->
            <button @click.stop="removePlayer(player.id)"
                    :disabled="!isAdmin"
                    title="Remove Player"
                    class="opacity-0 group-hover:opacity-100 w-8 h-8 flex items-center justify-center rounded text-slate-600 hover:bg-red-500/10 hover:text-red-400 transition-colors">
              <i class="ph-bold ph-trash"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.glass-panel {
  background: rgba(30, 41, 59, 0.4);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(71, 85, 105, 0.3);
}
</style>