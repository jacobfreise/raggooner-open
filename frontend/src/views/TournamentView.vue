<script setup lang="ts">
import {ref, computed, watch, onUnmounted, onMounted, inject, type Ref} from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { doc, onSnapshot, updateDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import type { FirestoreUpdate, Tournament, GlobalPlayer, Season } from '../types';
import { recalculateTournamentScores, migrateRaces, migratePlayers } from "../utils/utils.ts";
import { POINTS_SYSTEM, TOURNAMENT_FORMATS } from "../utils/constants.ts";
import { useAdmin } from '../composables/useAdmin';
import { useGameLogic } from "../composables/useGameLogic";
import { useEasterEgg } from "../composables/useEasterEgg.ts";

import RegistrationPhase from "../components/RegistrationPhase.vue";
import PlayerDraftPhase from '../components/PlayerDraftPhase.vue';
import UmaBanPhase from "../components/UmaBanPhase.vue";
import UmaDraftPhase from "../components/UmaDraftPhase.vue";
import GroupsFinalsPhase from '../components/playFormats/GroupsFinalsPhase.vue';

// Inject Changelog functions from App.vue
const openChangelog = inject<() => void>('openChangelog')!;
const hasNewUpdates = inject<Ref<boolean>>('hasNewUpdates')!;

const route = useRoute();
const router = useRouter();
const appId = 'default-app';

const tournament = ref<Tournament | null>(null);
const loading = ref(true);
const hasInitialViewLoaded = ref(false);
let currentUnsubscribe: (() => void) | null = null;

const getTournamentRef = (id: string) => doc(db, 'artifacts', appId, 'public', 'data', 'tournaments', id);

const secureUpdate = async (data: FirestoreUpdate<Tournament>) => {
  if (!tournament.value) return;
  try {
    await updateDoc(getTournamentRef(tournament.value.id), data);
  } catch (e: any) {
    if(e.code === 'permission-denied') {
      localAdminPassword.value = '';
      localStorage.removeItem(`admin_pwd_${tournament.value.id}`);
      alert("Permission Denied: Invalid admin password.");
    }
  }
};

const {
  adminPasswordInput, localAdminPassword, showAdminModal, isDangerZoneOpen, isDeleting, editedName, editedTiebreaker,
  isAdmin, loginAsAdmin, copyPassword, updateTournamentName, togglePlacementTiebreaker, deleteTournament, autoLoginIfSuperAdmin
} = useAdmin(tournament, secureUpdate, async () => { await router.push('/'); }, appId);

const { currentView } = useGameLogic(tournament, secureUpdate);
const { activeVisualEgg } = useEasterEgg(tournament);

// Global players & seasons (shared across phases)
const globalPlayers = ref<GlobalPlayer[]>([]);
const seasons = ref<Season[]>([]);

const addGlobalPlayer = (player: GlobalPlayer) => {
  globalPlayers.value.push(player);
};

onMounted(async () => {
  try {
    const [playersSnap, seasonsSnap] = await Promise.all([
      getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'players')),
      getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'seasons')),
    ]);
    globalPlayers.value = playersSnap.docs.map(d => ({ id: d.id, ...d.data() } as GlobalPlayer));
    seasons.value = seasonsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Season));
  } catch (e) {
    console.error('Failed to fetch global players/seasons:', e);
  }
});

const cleanupSubscription = () => {
  if (currentUnsubscribe) {
    currentUnsubscribe();
    currentUnsubscribe = null;
  }
};

const subscribeToTournament = (id: string) => {
  cleanupSubscription();
  loading.value = true;
  currentUnsubscribe = onSnapshot(getTournamentRef(id), (docSnap) => {
    if (isDeleting.value) return;
    if (docSnap.exists()) {
      const data = docSnap.data() as Tournament;

      //BACKWARDS COMPATIBILITY FIXES
      //old tournaments used password
      if (data.password) delete data.password;
      //migrate races, players to maps from arrays
      data.races = migrateRaces(data.races);
      data.players = migratePlayers(data.players);
      //calculates scores on snapshot, instead of write
      const { teams, players, wildcards } = recalculateTournamentScores(data);
      data.teams = teams;
      data.players = players;
      data.wildcards = wildcards;
      // Migrate legacy tournaments to the default 'uma-ban' format
      if (!data.format) {
        data.format = 'uma-ban';
      }

      tournament.value = data;
      if (!localAdminPassword.value) autoLoginIfSuperAdmin();
      if (!hasInitialViewLoaded.value && tournament.value.stage === 'finals') {
        currentView.value = 'finals';
        hasInitialViewLoaded.value = true;
      }
    } else {
      cleanupSubscription();
      alert('Tournament not found or deleted.');
      router.push('/');
    }
    loading.value = false;
  }, (error) => {
    console.error("Sync error:", error);
    loading.value = false;
  });
};

watch(() => route.params.id, (newId) => {
  if (newId) {
    const savedPwd = localStorage.getItem(`admin_pwd_${newId}`);
    if (savedPwd) localAdminPassword.value = savedPwd;
    subscribeToTournament(newId as string);
  }
}, { immediate: true });

onUnmounted(() => { cleanupSubscription(); });

// Replace exitTournament with router navigation
const exitTournament = () => { router.push('/'); };

const copyId = () => { navigator.clipboard.writeText(tournament.value?.id || ''); alert("ID Copied!"); };
const copyLink = () => { navigator.clipboard.writeText(window.location.href); alert("Link Copied!"); };
const tData = computed(() => tournament.value as Tournament);

// Admin Point Editing Logic (Your existing setup)
const isEditingPoints = ref(false);
const localPointsSystem = ref<Record<number, number>>({});
const startEditingPoints = () => {
  if (!tournament.value) return;
  localPointsSystem.value = { ...(tournament.value.pointsSystem || POINTS_SYSTEM) };
  isEditingPoints.value = true;
};
const savePointsSystem = async () => {
  if (!tournament.value) return;
  await secureUpdate({ pointsSystem: localPointsSystem.value });
  isEditingPoints.value = false;
};
</script>

<template>
  <div>
    <div :class="activeVisualEgg?.visual?.rootClass" class="w-full relative flex flex-col min-h-full">

      <header class="border-b border-slate-700 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
        <div class="max-w-[1800px] mx-auto px-4 h-16 md:px-8 flex items-center justify-between relative">
          <router-link to="/" class="flex items-center gap-2 text-indigo-500 hover:text-indigo-400 transition-colors z-10">
            <i class="ph-fill ph-flag-checkered text-3xl"></i>
            <span class="text-2xl font-bold text-white heading tracking-widest hidden sm:block">Raccoon Open</span>
            <span class="text-2xl font-bold text-white heading tracking-widest sm:hidden">RO</span>
          </router-link>

          <div v-if="tournament" class="absolute left-1/2 -translate-x-1/2 font-bold text-slate-200 uppercase tracking-widest text-sm md:text-base hidden md:block whitespace-nowrap overflow-hidden text-ellipsis max-w-[300px] text-center">
            {{ tData.name }}
          </div>

          <div class="flex items-center gap-4 z-10">
            <button @click="openChangelog" class="relative text-slate-400 hover:text-white transition-colors mr-2">
              <i class="ph-bold ph-bell text-xl"></i>
              <span v-if="hasNewUpdates" class="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-slate-900 animate-pulse"></span>
            </button>

            <template v-if="tournament">
              <button @click="showAdminModal = true"
                      class="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold border transition-colors mr-2"
                      :class="isAdmin ? 'bg-emerald-900/30 border-emerald-500/50 text-emerald-400 hover:bg-emerald-900/50' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'">
                <i class="ph-bold" :class="isAdmin ? 'ph-lock-open' : 'ph-lock'"></i>
                {{ isAdmin ? 'Admin' : 'Viewer' }}
              </button>

              <div class="hidden md:flex flex-col items-end">
                <button @click="copyId" class="text-sm font-mono text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                  Tournament ID <i class="ph ph-copy"></i>
                </button>
                <button @click="copyLink" class="text-sm font-mono text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                  Link <i class="ph ph-share"></i>
                </button>
              </div>

              <button @click="exitTournament" class="text-slate-400 hover:text-white" title="Go to Home">
                <i class="ph ph-sign-out text-xl"></i>
              </button>
            </template>
          </div>
        </div>
      </header>

      <main class="flex-grow p-4 md:p-6 max-w-[1800px] mx-auto w-full">
        <div v-if="loading" class="flex justify-center items-center h-96">
          <i class="ph ph-spinner animate-spin text-5xl text-indigo-500"></i>
        </div>

        <div v-else-if="tournament" class="space-y-6 animate-fade-in">
          <h1 class="text-3xl font-black text-white text-center md:hidden mb-4">{{ tData.name }}</h1>

          <RegistrationPhase v-if="tournament.status === 'registration'" :tournament="tournament" :is-admin="isAdmin" :app-id="appId" :secure-update="secureUpdate" :global-players="globalPlayers" :add-global-player="addGlobalPlayer" :seasons="seasons" />
          <PlayerDraftPhase v-else-if="tournament.status === 'draft'" :tournament="tournament" :is-admin="isAdmin" :secure-update="secureUpdate" :global-players="globalPlayers" :seasons="seasons" />
          <UmaBanPhase v-else-if="tournament.status === 'ban'" :tournament="tournament" :is-admin="isAdmin" :secure-update="secureUpdate" />
          <UmaDraftPhase v-else-if="tournament.status === 'pick'" :tournament="tournament" :is-admin="isAdmin" :secure-update="secureUpdate" />
          <GroupsFinalsPhase v-else-if="tournament.status === 'active' || tournament.status === 'completed'"
                       :tournament-prop="tournament"
                       :is-admin="isAdmin"
                       :app-id="appId"
                       :secure-update="secureUpdate"
                       :global-players="globalPlayers"
                       :add-global-player="addGlobalPlayer" />
        </div>
      </main>

      <div v-if="showAdminModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <div class="bg-slate-900 border border-slate-700 rounded-xl max-w-sm w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">

          <div class="flex justify-between items-center mb-4">
            <h3 class="text-xl font-bold text-white">
              {{ isAdmin ? 'Admin Settings' : 'Admin Access' }}
            </h3>
            <button @click="showAdminModal = false" class="text-slate-500 hover:text-white"><i class="ph-bold ph-x"></i></button>
          </div>

          <div v-if="!isAdmin">
            <p class="text-sm text-slate-400 mb-4">Enter the tournament password to enable editing.</p>
            <input v-model="adminPasswordInput" type="password" placeholder="Password"
                   @keyup.enter="loginAsAdmin"
                   class="w-full bg-slate-800 border border-slate-700 rounded p-3 text-white mb-6 focus:outline-none focus:border-indigo-500 text-center font-mono text-lg tracking-widest uppercase">
            <button @click="loginAsAdmin" class="w-full bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-3 rounded-lg font-bold">
              Unlock Editing
            </button>
          </div>

          <div v-else>
            <div class="bg-slate-800 rounded-lg p-4 mb-4 border border-slate-700 text-center">
              <p class="text-xs text-slate-500 uppercase tracking-wider font-bold mb-2">Tournament Password</p>
              <div class="text-3xl font-mono text-emerald-400 tracking-widest font-bold mb-1">
                {{ "****" }}
              </div>
              <p class="text-xs text-slate-500">Share this with co-commentators.</p>
            </div>

            <button @click="copyPassword" class="w-full bg-slate-700 hover:bg-slate-600 text-white px-4 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors mb-6">
              <i class="ph-bold ph-copy"></i> Copy Password
            </button>

            <div class="border-t border-slate-700 pt-6 mb-6">
              <h4 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <i class="ph-bold ph-sliders"></i> Settings
              </h4>

              <div class="space-y-2">
                <label class="text-xs text-slate-500 uppercase font-bold">Edit Tournament Name</label>
                <div class="flex gap-2">
                  <input v-model="editedName"
                         type="text"
                         class="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                         placeholder="Enter name...">

                  <button @click="updateTournamentName"
                          :disabled="editedName === tournament?.name || !editedName"
                          class="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-2 rounded font-bold transition-colors">
                    <i class="ph-bold ph-check"></i>
                  </button>
                </div>
              </div>
              <div class="pt-4 mt-4 border-t border-slate-700/50">
                <div class="flex items-center justify-between">
                  <div class="flex flex-col">
                    <div class="flex items-center gap-2">
                      <label class="text-xs text-slate-500 uppercase font-bold">Placement Tiebreaker</label>

                      <div class="group relative flex items-center">
                        <i class="ph-fill ph-info text-indigo-400 hover:text-indigo-300 cursor-help text-sm"></i>
                        <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-900 border border-slate-600 rounded-lg shadow-xl text-xs text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                          <div class="font-bold text-white mb-1">How it works:</div>
                          <p><strong>Enabled:</strong> If points are tied, the team with more 1st places wins. If still tied, 2nd places, etc.</p>
                          <div class="mt-2 border-t border-slate-700 pt-2">
                            <p><strong>Disabled:</strong> Only total points matter. Ties must be resolved via Admin selection.</p>
                          </div>
                          <div class="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-600"></div>
                        </div>
                      </div>
                    </div>
                    <span class="text-[10px] text-slate-500">
                      {{ editedTiebreaker ? 'Auto-resolve ties via race results' : 'Manual resolution for point ties' }}
                    </span>
                  </div>

                  <button @click="togglePlacementTiebreaker"
                          class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900"
                          :class="editedTiebreaker ? 'bg-indigo-600' : 'bg-slate-700'">
                    <span class="sr-only">Enable Tiebreaker</span>
                    <span class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                          :class="editedTiebreaker ? 'translate-x-6' : 'translate-x-1'"/>
                  </button>
                </div>
              </div>
              <div class="border-t border-slate-700 pt-6 mb-6">
                <div class="flex items-center justify-between mb-3">
                  <h4 class="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <i class="ph-bold ph-list-numbers"></i> Points System
                  </h4>
                  <button v-if="!isEditingPoints" @click="startEditingPoints" class="text-xs text-indigo-400 hover:text-white font-bold">
                    Edit
                  </button>
                  <div v-else class="flex gap-2">
                    <button @click="isEditingPoints = false" class="text-xs text-slate-500 hover:text-white">Cancel</button>
                    <button @click="savePointsSystem" class="text-xs text-emerald-400 hover:text-emerald-300 font-bold">Save</button>
                  </div>
                </div>

                <div v-if="!isEditingPoints" class="grid grid-cols-6 gap-2 bg-slate-800 p-3 rounded-lg border border-slate-700">
                  <div v-for="pos in 18" :key="pos" class="text-center">
                    <div class="text-[10px] text-slate-500 font-bold mb-0.5">{{ pos }}</div>
                    <div class="text-sm font-mono text-white">
                      {{ (tData?.pointsSystem || POINTS_SYSTEM)[pos] || 0 }}
                    </div>
                  </div>
                </div>

                <div v-else class="grid grid-cols-4 gap-2 bg-slate-800 p-3 rounded-lg border border-slate-700">
                  <div v-for="pos in 18" :key="pos" class="flex flex-col">
                    <label class="text-[10px] text-slate-500 font-bold text-center mb-1">Pos {{ pos }}</label>
                    <input
                        v-model.number="localPointsSystem[pos]"
                        type="number"
                        class="bg-slate-900 border border-slate-600 rounded px-1 py-1 text-center text-white text-sm focus:border-indigo-500 focus:outline-none"
                    >
                  </div>
                </div>

                <p v-if="isEditingPoints" class="text-[10px] text-amber-500 mt-2 flex items-center gap-1">
                  <i class="ph-bold ph-warning"></i> Saving will recalculate all past race scores immediately.
                </p>
              </div>
            </div>

            <div class="border-t border-slate-700 mt-6 pt-2">

              <button @click="isDangerZoneOpen = !isDangerZoneOpen"
                      class="w-full flex items-center justify-between py-2 text-xs font-bold text-red-500 uppercase tracking-widest hover:text-red-400 transition-colors group">
                <span class="flex items-center gap-2">
                   <i class="ph-bold ph-warning"></i> Danger Zone
                </span>
                <i class="ph-bold ph-caret-down transition-transform duration-300"
                   :class="isDangerZoneOpen ? 'rotate-180' : ''"></i>
              </button>

              <div v-if="isDangerZoneOpen" class="pt-3 pb-2 animate-fade-in">
                <p class="text-[10px] text-slate-500 mb-3 leading-relaxed">
                  This will permanently delete the tournament and kick all active users to the home screen.
                </p>

                <button @click="deleteTournament"
                        class="w-full bg-red-900/10 hover:bg-red-900/30 border border-red-500/30 text-red-400 hover:text-red-300 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all">
                  <i class="ph-bold ph-trash"></i> Delete Tournament
                </button>
              </div>

            </div>

          </div>

        </div>
      </div>

    </div>

    <!-- Easter egg overlay: rendered OUTSIDE the root div so CSS transforms (shake) don't break fixed positioning -->
    <Teleport to="body">
      <div v-if="activeVisualEgg" :class="activeVisualEgg.visual?.overlayClass" class="flex items-center justify-center fixed inset-0 pointer-events-none z-[9999]">
        <h1 v-if="activeVisualEgg.visual?.text" class="text-9xl font-black text-red-500/50 uppercase tracking-widest animate-pulse rotate-12 select-none drop-shadow-2xl">
          {{ activeVisualEgg.visual.text }}
        </h1>
        <img v-if="activeVisualEgg.visual?.image" :src="activeVisualEgg.visual.image" :class="activeVisualEgg.visual.imageClass" alt="Easter Egg Visual" class="max-w-full max-h-screen object-contain" />
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* EASTER EGG STYLES */
@keyframes sumo-shake {
  0% { transform: translate(0, 0) rotate(0deg); }
  10% { transform: translate(-10px, -10px) rotate(-1deg); }
  20% { transform: translate(10px, 10px) rotate(1deg); }
  30% { transform: translate(-10px, 10px) rotate(0deg); }
  40% { transform: translate(10px, -10px) rotate(1deg); }
  50% { transform: translate(-10px, 0) rotate(-1deg); }
  60% { transform: translate(10px, 0) rotate(0deg); }
  70% { transform: translate(-5px, 5px) rotate(0.5deg); }
  80% { transform: translate(5px, -5px) rotate(-0.5deg); }
  90% { transform: translate(0, 0) rotate(0); }
  100% { transform: translate(0, 0) rotate(0); }
}

@keyframes flash-pulse {
  0%, 100% { background-color: rgba(220, 38, 38, 0); } /* Transparent */
  50% { background-color: rgba(220, 38, 38, 0.4); } /* Strong Red flash */
}

@keyframes flash-red {
  0% { background-color: transparent; }
  10% { background-color: rgba(255, 100, 100, 0.2); }
  100% { background-color: transparent; }
}

.hishi-quake {
  /* Use overflow-hidden during shake to prevent scrollbars appearing */
  overflow: hidden;
  animation: sumo-shake 1.2s cubic-bezier(.36,.07,.19,.97) both;
  /* Optional: repeat the shake a few times for a long sound */
  /* animation-iteration-count: 3; */
}

.hishi-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
  /* Run the pulse animation infinitely, 0.4s per pulse */
  animation: flash-pulse 1s ease-in-out infinite;
  backdrop-filter: contrast(1.2) sepia(0.2); /* Adds to the chaos */
}
</style>