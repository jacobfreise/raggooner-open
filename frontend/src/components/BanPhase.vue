<script setup lang="ts">
import { toRef, ref, computed } from 'vue';
import type { Tournament, FirestoreUpdate } from '../types';
import { useDraft } from '../composables/useDraft';
import { useGameLogic } from '../composables/useGameLogic';
import { UMAS } from '../utils/constants';
import { getPlayerName } from '../utils/utils';

const props = defineProps<{
  tournament: Tournament;
  isAdmin: boolean;
  secureUpdate: (data: FirestoreUpdate<Tournament> | Record<string, any>) => Promise<void>;
}>();

const tournamentRef = toRef(props, 'tournament');
const isAdminRef = toRef(props, 'isAdmin');

// Initialize Draft (for Undo)
const { undoLastPick, currentDrafter } = useDraft(tournamentRef, props.secureUpdate, isAdminRef);

// Initialize Game Logic (for Banning)
const { toggleBan, finishBanPhase, isBanned } = useGameLogic(tournamentRef, props.secureUpdate);

// Local State for Search
const banSearch = ref('');

// Computed for Search
const filteredUmas = computed(() => {
  const query = banSearch.value.toLowerCase();
  return [...UMAS].sort().filter(u => u.toLowerCase().includes(query));
});
</script>

<template>
  <div class="space-y-6">
    <div class="sticky top-20 z-30 bg-slate-900/90 backdrop-blur-md p-4 rounded-xl border border-slate-700 shadow-xl flex flex-col sm:flex-row justify-between items-center gap-4">
      <div>
        <h2 class="text-3xl font-bold text-white flex items-center gap-3">
          <i class="ph-fill ph-prohibit text-red-500"></i>
          Ban Phase
        </h2>
        <p class="text-slate-400 text-sm">Select characters to exclude from the tournament.</p>
      </div>

      <div class="flex items-center gap-4 w-full sm:w-auto">
        <button v-if="isAdmin && (!tournament.bans || tournament.bans.length === 0)"
                @click="undoLastPick"
                class="text-slate-500 hover:text-white flex items-center gap-2 px-3 py-2 rounded hover:bg-slate-800 transition-colors mr-2">
          <i class="ph-bold ph-arrow-u-up-left"></i>
          <span class="hidden sm:inline">Back to Draft</span>
        </button>

        <div class="text-right hidden sm:block">
          <div class="text-2xl font-mono font-bold text-red-400">
            {{ tournament.bans?.length || 0 }}
          </div>
          <div class="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Banned</div>
        </div>

        <button @click="finishBanPhase"
                :disabled="!isAdmin"
                class="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-lg font-bold shadow-lg shadow-indigo-900/20 transition-all flex items-center justify-center gap-2">
          <span>Start Tournament</span>
          <i class="ph-bold ph-arrow-right"></i>
        </button>
      </div>
    </div>

    <div class="relative">
      <i class="ph-bold ph-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-xl"></i>
      <input v-model="banSearch"
             type="text"
             placeholder="Search Umas..."
             class="w-full bg-slate-800 border border-slate-700 rounded-xl py-4 pl-12 pr-4 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-sm">
    </div>

    <div class="grid md:grid-cols-12 gap-6">
      <div class="md:col-span-8">
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <button v-for="uma in filteredUmas" :key="uma"
                  @click="toggleBan(uma)"
                  :disabled="!isAdmin"
                  class="relative group p-4 rounded-lg border-2 text-left transition-all duration-200 overflow-hidden"
                  :class="isBanned(uma) ? 'bg-red-900/20 border-red-500/50' : 'bg-slate-800 border-slate-700 hover:border-indigo-400 hover:bg-slate-750'">
            <div v-if="isBanned(uma)" class="absolute inset-0 opacity-10 pointer-events-none bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMSIvPgo8cGF0aCBkPSJNLTEgMUwyIC0xTTEgOUw5IDFNOSA5TDEgMSIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjIiLz4KPC9zdmc+')]"></div>
            <div class="flex justify-between items-start relative z-10">
              <span class="font-medium text-sm pr-2" :class="isBanned(uma) ? 'text-red-300 line-through decoration-red-500/50' : 'text-slate-200 group-hover:text-white'">{{ uma }}</span>
              <div class="w-5 h-5 rounded flex items-center justify-center shrink-0 transition-colors" :class="isBanned(uma) ? 'bg-red-500 text-white' : 'bg-slate-700 text-slate-500 group-hover:bg-indigo-500 group-hover:text-white'">
                <i class="ph-bold" :class="isBanned(uma) ? 'ph-x' : 'ph-check'"></i>
              </div>
            </div>
          </button>
        </div>
      </div>

      <div class="md:col-span-4 space-y-4">
        <h3 class="text-lg font-bold mb-3 text-slate-300">Squads</h3>
        <div v-for="team in tournament.teams" :key="team.id"
             class="bg-slate-900 border rounded-lg p-4 transition-colors"
             :class="currentDrafter?.id === team.captainId ? 'border-amber-500 ring-1 ring-amber-500/50' : 'border-slate-800'">
          <div class="flex justify-between items-center mb-2">
            <span class="font-bold text-white" :style="{ color: team.color }">{{ team.name }}</span>
            <i v-if="currentDrafter?.id === team.captainId" class="ph-fill ph-pencil-simple text-amber-500 animate-pulse"></i>
          </div>
          <div class="space-y-2">
            <div class="flex items-center gap-2 text-sm text-amber-400">
              <i class="ph-fill ph-crown"></i> {{ getPlayerName(tournament, team.captainId) }}
            </div>
            <div v-for="memberId in team.memberIds" :key="memberId" class="flex items-center gap-2 text-sm text-slate-300 ml-2">
              <i class="ph-fill ph-user"></i> {{ getPlayerName(tournament, memberId) }}
            </div>
            <div v-for="n in (2 - team.memberIds.length)" :key="n" class="flex items-center gap-2 text-sm text-slate-700 ml-2 border-dashed border border-slate-800 p-1 rounded">
              <span class="text-xs">Empty Slot</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="filteredUmas.length === 0" class="text-center py-12 text-slate-500">
      No Umas found matching "{{ banSearch }}"
    </div>
  </div>
</template>