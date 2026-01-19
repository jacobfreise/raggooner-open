<script setup lang="ts">
import { toRef } from 'vue';
import type { Tournament, FirestoreUpdate } from '../types';
import { useRoster } from '../composables/useRoster';
import { useDraft } from '../composables/useDraft'; // Need startDraft from here

const props = defineProps<{
  tournament: Tournament;
  isAdmin: boolean;
  secureUpdate: (data: FirestoreUpdate<Tournament> | Record<string, any>) => Promise<void>;
}>();

const tournamentRef = toRef(props, 'tournament');
const isAdminRef = toRef(props, 'isAdmin');

// Initialize Roster Logic (Add/Remove players)
const {
  newPlayerName,
  addPlayer,
  removePlayer,
  toggleCaptain,
  validTeamCount,
  validTotalPlayers,
  canStartDraft
} = useRoster(tournamentRef, props.secureUpdate, isAdminRef);

// Initialize Draft Logic (Just for startDraft)
const { startDraft } = useDraft(tournamentRef, props.secureUpdate, isAdminRef);

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
        <div class="text-2xl font-bold text-white font-mono">{{ tournament.players.length }} <span class="text-sm font-normal text-slate-500">/ 27 max</span></div>
      </div>
    </div>
    <div class="grid md:grid-cols-3 gap-6">
      <div class="md:col-span-1 glass-panel p-6 rounded-xl h-fit sticky top-20">
        <h3 class="text-xl font-bold mb-4 text-white">Add Participant</h3>
        <div class="space-y-4">
          <div class="relative">
            <input v-model="newPlayerName"
                   :disabled="!isAdmin"
                   @keyup.enter="addPlayer"
                   type="text"
                   placeholder="Player Name"
                   class="w-full bg-slate-900 border border-slate-700 rounded p-3 pl-4 pr-10 text-white focus:outline-none focus:border-indigo-500 transition-colors">
            <button @click="addPlayer" :disabled="!newPlayerName || !isAdmin" class="absolute right-2 top-1/2 -translate-y-1/2 text-indigo-400 hover:text-white disabled:opacity-30 disabled:hover:text-indigo-400 transition-colors">
              <i class="ph-bold ph-plus text-xl"></i>
            </button>
          </div>
          <p class="text-xs text-slate-500 leading-relaxed">
            Enter names one by one. Click on a player in the list to promote them to <span class="text-amber-500 font-bold"><i class="ph-fill ph-crown"></i> Captain</span>.
          </p>
        </div>
        <div class="mt-8 pt-6 border-t border-slate-700">
          <h4 class="text-sm font-bold text-slate-400 uppercase mb-2">Requirements</h4>
          <ul class="text-xs space-y-2 text-slate-500">
            <li class="flex items-center gap-2">
              <i class="ph-fill" :class="validTeamCount ? 'ph-check-circle text-green-500' : 'ph-x-circle text-red-500'"></i>
              3 to 9 Captains
            </li>
            <li class="flex items-center gap-2">
              <i class="ph-fill" :class="validTotalPlayers ? 'ph-check-circle text-green-500' : 'ph-x-circle text-red-500'"></i>
              Players = Captains × 3
            </li>
          </ul>
          <button @click="startDraft" :disabled="!canStartDraft || !isAdmin" class="w-full mt-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-20 disabled:cursor-not-allowed text-white py-3 rounded font-bold uppercase tracking-wider transition-colors shadow-lg shadow-emerald-900/20">Start Draft</button>
        </div>
      </div>
      <div class="md:col-span-2 space-y-4">
        <div v-if="tournament.players.length === 0" class="text-center py-12 text-slate-600 border-2 border-dashed border-slate-800 rounded-xl">No players added yet.</div>
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div v-for="player in tournament.players" :key="player.id"
               @click="toggleCaptain(player.id)"
               class="relative p-3 rounded-lg flex items-center justify-between group cursor-pointer border transition-all select-none"
               :class="player.isCaptain
                      ? 'bg-amber-900/20 border-amber-500/50 hover:bg-amber-900/30'
                       : 'bg-slate-800 border-slate-700/50 hover:border-indigo-500/50 hover:bg-slate-750'">

            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-transform group-active:scale-95 shadow-sm"
                   :class="player.isCaptain ? 'bg-amber-500 text-slate-900 ring-2 ring-amber-500/20' : 'bg-slate-700 text-slate-400'">
                <i v-if="player.isCaptain" class="ph-fill ph-crown text-lg"></i>
                <span v-else>{{ player.name.charAt(0) }}</span>
              </div>
              <div class="flex flex-col">
                <span class="font-medium" :class="player.isCaptain ? 'text-amber-100' : 'text-slate-200'">{{ player.name }}</span>
                <span class="text-[10px] uppercase font-bold tracking-wider"
                      :class="player.isCaptain ? 'text-amber-500' : 'text-slate-600'">
                          {{ player.isCaptain ? 'Captain' : 'Player' }}
                      </span>
              </div>
            </div>
            <button @click.stop="removePlayer(player.id)"
                    :disabled="!isAdmin" class="w-8 h-8 flex items-center justify-center rounded text-slate-600 hover:bg-red-500/10 hover:text-red-400 transition-colors">
              <i class="ph-bold ph-trash"></i></button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>