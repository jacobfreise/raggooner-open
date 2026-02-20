<script setup lang="ts">
import {computed, onMounted, ref} from 'vue';
import {signInAnonymously, signInWithCustomToken} from 'firebase/auth';
import {collection, doc, getDocs, onSnapshot, orderBy, query, updateDoc, writeBatch, setDoc} from 'firebase/firestore';
import {auth, db} from './firebase';
import type {FirestoreUpdate, Tournament, Season, GlobalPlayer} from './types';
import {
  getStatusColor, recalculateTournamentScores,
} from "./utils/utils.ts";
import {useAdmin} from './composables/useAdmin';
import {useGameLogic} from "./composables/useGameLogic";
import {useEasterEgg} from "./composables/useEasterEgg.ts";
import { APP_VERSION } from './data/changelog';

import RegistrationPhase from "./components/RegistrationPhase.vue";
import DraftPhase from './components/DraftPhase.vue';
import BanPhase from "./components/BanPhase.vue";
import ActivePhase from './components/ActivePhase.vue';
import ChangelogModal from './components/ChangelogModal.vue';
import {POINTS_SYSTEM} from "./utils/constants.ts";
import {seedDatabase} from "./utils/seedData.ts";
// import Migrate from "./components/Migrate.vue";
// import SeasonSetup from "./components/SeasonSetup.vue";
import AnalyticsDashboard from "./components/AnalyticsDashboard.vue";

// Config
const appId = 'default-app';

const getTournamentRef = (id: string) => {
  return doc(db, 'artifacts', appId, 'public', 'data', 'tournaments', id);
};

const isDev = import.meta.env.DEV;

//version info
const showChangelog = ref(false);
const hasNewUpdates = ref(false);
const previousVersion = ref('0.0.0');

// State
const tournament = ref<Tournament | null>(null);
const loading = ref(true);
const hasInitialViewLoaded = ref(false);
const newTournamentName = ref('');
const joinId = ref('');
const currentUnsubscribe = ref<(() => void) | null>(null);
const isCreating = ref(false);

// Season state
const availableSeasons = ref<Season[]>([]);
const selectedSeasonId = ref('');

// Global players (for child components)
const globalPlayers = ref<GlobalPlayer[]>([]);
const addGlobalPlayer = (player: GlobalPlayer) => { globalPlayers.value.push(player); };

// --- NEW STATE FOR HOME PAGE ---
const homeListLoading = ref(false);
const showHistory = ref(false);
const allTournaments = ref<Tournament[]>([]); // We store brief summaries here


// Fetch available seasons for the season selector
const fetchSeasons = async () => {
  try {
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'seasons'), orderBy('startDate', 'desc'));
    const snapshot = await getDocs(q);
    availableSeasons.value = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Season));
    // Auto-select the first (most recent) season
    if (availableSeasons.value.length > 0) {
      selectedSeasonId.value = availableSeasons.value[0]!.id;
    }
  } catch (e) {
    console.error('Failed to fetch seasons:', e);
  }
};

// Auth & Init
const init = async () => {
  const initialToken = (window as any).__initial_auth_token;

  if (initialToken) {
    await signInWithCustomToken(auth, initialToken);
  } else {
    await signInAnonymously(auth);
  }

  // Fetch seasons for the create form
  fetchSeasons();

  // 1. Check if ID is in the URL (First priority)
  const urlParams = new URLSearchParams(window.location.search);
  let tid = urlParams.get('tid');

  if (tid) {
    // Found in URL? Save it to browser storage for safety
    sessionStorage.setItem('active_tid', tid);
    const savedPwd = localStorage.getItem(`admin_pwd_${tid}`);
    if(savedPwd) localAdminPassword.value = savedPwd;
    subscribeToTournament(tid);
  } else {
    // No ID in URL -> Load the "Home Page" list
    sessionStorage.removeItem('active_tid');
    loading.value = false; // Stop main loading to show Home
    fetchPublicTournaments();
  }
};

// --- NEW FUNCTION: Fetch List for Home Page ---
const fetchPublicTournaments = async () => {
  homeListLoading.value = true;
  try {
    // Note: ensure you have an index on 'createdAt' desc in Firestore
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'tournaments'), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);

    // Map docs to a lightweight version of Tournament (we don't need all races here really, but it's simpler to type)
    allTournaments.value = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Tournament));
  } catch (e) {
    console.error("Error fetching tournament list", e);
  } finally {
    homeListLoading.value = false;
  }
};

// Computed for Home Page
const activeTournamentsList = computed(() =>
    allTournaments.value.filter(t => t.status !== 'completed')
);

const pastTournamentsList = computed(() =>
    allTournaments.value.filter(t => t.status === 'completed')
);

const selectTournamentFromHome = (id: string) => {
  joinId.value = id;
  joinTournament();
}


// --- CRITICAL: Secure Update Helper ---
const secureUpdate = async (data: FirestoreUpdate<Tournament>) => {
  if (!tournament.value) return;

  try {
    await updateDoc(getTournamentRef(tournament.value.id), data);
  } catch (e: any) {
    console.error("Update failed", e);
    if(e.code === 'permission-denied') {
      localAdminPassword.value = '';
      localStorage.removeItem(`admin_pwd_${tournament.value!.id}`);
      alert("Permission Denied: You do not have the correct admin password.");
    } else {
      alert("Error saving data.");
    }
  }
};


const {
  adminPasswordInput,
  localAdminPassword,
  showAdminModal,
  isDangerZoneOpen,
  isDeleting,
  editedName,
  editedTiebreaker,
  isAdmin,
  loginAsAdmin,
  copyPassword,
  updateTournamentName,
  togglePlacementTiebreaker,
  deleteTournament
} = useAdmin(tournament, secureUpdate, fetchPublicTournaments, appId);

const {
  currentView,
} = useGameLogic(tournament, secureUpdate, appId);

const { activeVisualEgg } = useEasterEgg(tournament);

const subscribeToTournament = (id: string) => {
  // 1. If we are already listening to a tournament, stop listening!
  if (currentUnsubscribe.value) {
    currentUnsubscribe.value();
    currentUnsubscribe.value = null;
  }
  loading.value = true;

  currentUnsubscribe.value = onSnapshot(getTournamentRef(id), (docSnap) => {

    // 1. If we are intentionally deleting, do NOTHING.
    if (isDeleting.value) return;

    if (docSnap.exists()) {
      const data = docSnap.data() as Tournament;

      if (data.password) delete data.password;

      tournament.value = data;

      if (!hasInitialViewLoaded.value && tournament.value.stage === 'finals') {
        currentView.value = 'finals';
        hasInitialViewLoaded.value = true;
      }
    } else {
      alert('Tournament not found');
      window.history.pushState({}, document.title, window.location.pathname.split('?')[0]);
      tournament.value = null; // Go back to home
    }
    loading.value = false;
  }, (error) => {
    console.error("Sync error:", error);
    loading.value = false;
  });
};

const createTournament = async () => {
  if (isCreating.value) return;
  isCreating.value = true;

  try {
    if (!auth.currentUser) await signInAnonymously(auth);

    const id = Math.random().toString(36).substring(2, 8).toUpperCase();
    const password = Math.random().toString(36).substring(2, 6).toUpperCase();
    const userId = auth.currentUser!.uid;

    const tournamentRef = doc(db, 'artifacts', appId, 'public', 'data', 'tournaments', id);
    const secretRef = doc(db, 'artifacts', appId, 'public', 'data', 'secrets', id);
    const adminRef = doc(db, 'artifacts', appId, 'public', 'data', 'admins', `${id}_${userId}`);

    const newTourney: Tournament = {
      id,
      name: newTournamentName.value,
      seasonId: selectedSeasonId.value || undefined,
      status: 'registration',
      stage: 'groups',
      players: [],
      teams: [],
      races: [],
      playerIds: [],
      isSecured: true,
      usePlacementTiebreaker: true,
      pointsSystem: { ...POINTS_SYSTEM },
      createdAt: new Date().toISOString(),
    };

    // Step 1: Create tournament + secret first
    // (admin doc creation reads the secret via get(), so the secret must exist first)
    const batch = writeBatch(db);
    batch.set(tournamentRef, newTourney);
    batch.set(secretRef, { password: password });
    await batch.commit();

    // Step 2: Create admin doc (now the secret exists for the security rule to verify)
    await setDoc(adminRef, {
      tournamentId: id,
      userId: userId,
      password: password
    });

    tournament.value = newTourney;
    localAdminPassword.value = password;
    localStorage.setItem(`admin_pwd_${id}`, password);

    subscribeToTournament(id);
    window.history.pushState({}, '', `?tid=${id}`);

  } catch (error) {
    console.error("Failed to create tournament:", error);
    alert("Error creating tournament. Please try again.");
  } finally {
    // 4. Unlock the function (always runs, success or fail)
    isCreating.value = false;
  }
};

const joinTournament = () => {
  if(!joinId.value) return;
  if (localStorage.getItem(`admin_pwd_${joinId.value}`)) {
    localAdminPassword.value = localStorage.getItem(`admin_pwd_${joinId.value}`)!
  } else {
    localAdminPassword.value = '';
  }
  subscribeToTournament(joinId.value);
  window.history.pushState({}, '', `?tid=${joinId.value}`);
  joinId.value = '';
};

const exitTournament = () => {
  // Stop listening to Firestore
  if (currentUnsubscribe.value) {
    currentUnsubscribe.value();
    currentUnsubscribe.value = null;
  }

  sessionStorage.removeItem('active_tid');
  tournament.value = null;
  // Clear URL params
  const url = new URL(window.location.href);
  url.searchParams.delete('tid');
  window.history.pushState({}, '', url);

  // Reload list for home page
  fetchPublicTournaments();
};

const copyId = () => {
  if(tournament.value) {
    navigator.clipboard.writeText(tournament.value.id);
    alert("ID Copied!");
  }
};

const copyLink = () => {
  if(tournament.value) {
    navigator.clipboard.writeText(window.location.href);
    alert("Link Copied!");
  }
};

const openChangelog = () => {
  showChangelog.value = true;
  hasNewUpdates.value = false; // Clear the dot immediately
  localStorage.setItem('last_seen_version', APP_VERSION);
};

const closeChangelog = () => {
  showChangelog.value = false;
  // Update the ref so if they click the button again in this same session,
  // there are no longer any "New" highlights.
  previousVersion.value = APP_VERSION;
};

const isEditingPoints = ref(false);
const localPointsSystem = ref<Record<number, number>>({});

// Initialize the local state when the modal opens or when editing starts
const startEditingPoints = () => {
  if (!tournament.value) return;
  // Deep copy the current system (or default if missing)
  localPointsSystem.value = { ...(tournament.value.pointsSystem || POINTS_SYSTEM) };
  isEditingPoints.value = true;
};

const savePointsSystem = async () => {
  if (!tournament.value) return;

  // 1. Update the tournament object
  // We need to trigger a recalculation of ALL scores because the rules changed!
  // This is expensive but necessary.

  // We can reuse the recalculateTournamentScores logic locally
  const tempTournament = {
    ...tournament.value,
    pointsSystem: localPointsSystem.value
  };

  // Import recalculateTournamentScores from utils
  const { teams, players } = recalculateTournamentScores(tempTournament);

  await secureUpdate({
    pointsSystem: localPointsSystem.value,
    teams,   // Save recalculated teams
    players  // Save recalculated players
  });

  isEditingPoints.value = false;
};

const tData = computed(() => tournament.value as Tournament);

onMounted(() => {
  init();

  // Check version
  const lastSeen = localStorage.getItem('last_seen_version');
  if (lastSeen) {
    previousVersion.value = lastSeen;
  }
  if (lastSeen !== APP_VERSION) {
    hasNewUpdates.value = true;
  }
});

const handleSeed = async () => {
  if (confirm('Are you sure? This will insert 3 new tournaments into your database.')) {
    await seedDatabase(db, auth, appId);
    alert('Check console for passwords!');
  }
}
</script>

<template>
  <div class="min-h-screen flex flex-col"
       :class="activeVisualEgg?.visual?.rootClass">
    <header class="border-b border-slate-700 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
      <div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between relative">
        <div class="flex items-center gap-2 text-indigo-500 cursor-pointer z-10" @click="exitTournament">
          <i class="ph-fill ph-flag-checkered text-3xl"></i>
          <span class="text-2xl font-bold text-white heading tracking-widest hidden sm:block">Raccoon Open</span>
          <span class="text-2xl font-bold text-white heading tracking-widest sm:hidden">RO</span>
        </div>

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

    <main class="flex-grow p-4 md:p-6 max-w-7xl mx-auto w-full">

      <div v-if="isDev">
        <button @click="handleSeed">
          Seed
        </button>
      </div>

      <!--      <SeasonSetup></SeasonSetup>-->
      <!--      <Migrate></Migrate>-->
      <AnalyticsDashboard></AnalyticsDashboard>
      <div v-if="!loading && !tournament" class="max-w-lg mx-auto mt-8 space-y-12">

        <div class="text-center space-y-4">
          <h1 class="text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">
            Racc Open
          </h1>
          <p class="text-xl text-slate-400 max-w-2xl mx-auto">
            Organize Racc Open. Draft a Team, low-roll your career, mald a lot and race against the other teams.
          </p>
        </div>

        <div class="glass-panel p-6 rounded-2xl grid  gap-8 items-center bg-slate-800/40 border border-slate-700/50 shadow-2xl">
          <div class="space-y-4">
            <h2 class="text-2xl font-bold text-white mb-4">Create New Tournament</h2>
            <div class="space-y-3">
              <input v-model="newTournamentName"
                     @keydown.enter="createTournament"
                     :disabled="isCreating"
                     type="text"
                     placeholder="Tournament Name"
                     class="w-full bg-slate-900 border border-slate-700 rounded-lg p-4 text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all disabled:opacity-50">

              <select v-model="selectedSeasonId"
                      :disabled="isCreating || availableSeasons.length === 0"
                      class="w-full bg-slate-900 border border-slate-700 rounded-lg p-4 text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all disabled:opacity-50 appearance-none cursor-pointer">
                <option value="" class="text-slate-500">No Season</option>
                <option v-for="season in availableSeasons" :key="season.id" :value="season.id">
                  {{ season.name }}
                </option>
              </select>

              <button @click="createTournament"
                      :disabled="!newTournamentName || isCreating"
                      class="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-lg transition-all shadow-lg shadow-indigo-900/30 flex items-center justify-center gap-2">

                <template v-if="isCreating">
                  <svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Creating...</span>
                </template>

                <template v-else>
                  <i class="ph-bold ph-plus-circle"></i>
                  <span>Start</span>
                </template>

              </button>
            </div>

            <div class="relative">
              <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-slate-700"></div></div>
              <div class="relative flex justify-center text-sm"><span class="px-2 bg-slate-800 text-slate-500 rounded">Or join existing</span></div>
            </div>
          </div>

          <div class="space-y-4">
            <h2 class="text-2xl font-bold text-white mb-4">Join by ID</h2>
            <div class="flex gap-2">
              <input v-model="joinId" type="text" placeholder="Enter Tournament ID" class="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-4 text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-mono">
              <button @click="joinTournament" :disabled="!joinId" class="bg-slate-700 hover:bg-slate-600 text-white px-8 rounded-lg font-bold transition-colors">
                Join
              </button>
            </div>
          </div>
        </div>

        <div>
          <div class="flex items-center gap-3 mb-6">
            <div class="h-8 w-2 bg-indigo-500 rounded-full"></div>
            <h2 class="text-2xl font-bold text-white">Ongoing Events</h2>
          </div>

          <div v-if="homeListLoading" class="text-center py-12">
            <i class="ph ph-spinner animate-spin text-4xl text-indigo-500"></i>
          </div>

          <div v-else-if="activeTournamentsList.length === 0" class="text-center py-12 text-slate-500 border border-dashed border-slate-800 rounded-xl">
            No active tournaments found. Start one above!
          </div>

          <div v-else class="grid lg:grid-cols-2 gap-4">
            <div v-for="t in activeTournamentsList" :key="t.id"
                 @click="selectTournamentFromHome(t.id)"
                 class="group relative bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-indigo-500/50 rounded-xl p-6 cursor-pointer transition-all duration-300 hover:-translate-y-1 shadow-lg hover:shadow-indigo-500/10 flex flex-col h-full">

              <div class="flex justify-between items-start mb-3">
                <div class="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
                  <i class="ph-bold ph-calendar-blank"></i>
                  {{ new Date(t.createdAt).toLocaleDateString() }}
                </div>

                <div :class="`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${getStatusColor(t.status)}`">
                  {{ t.status }}
                </div>
              </div>

              <h3 class="text-xl font-bold text-white mb-auto group-hover:text-indigo-400 transition-colors line-clamp-2">
                {{ t.name }}
              </h3>

              <div class="flex flex-col gap-1 text-sm text-slate-400 mt-6 pt-4 border-t border-slate-700/50">
                <div class="flex items-center gap-2">
                  <i class="ph-fill ph-users"></i> {{ t.players?.length || 0 }} Players
                </div>
                <div class="flex items-center gap-2">
                  <i class="ph-fill ph-trophy"></i> {{ t.stage === 'groups' ? 'Group Stage' : 'Finals' }}
                </div>
                <div class="flex items-center gap-2 mt-1 text-xs text-slate-600">
                  ID: <span class="font-mono text-slate-500">{{ t.id }}</span>
                </div>
              </div>

            </div>
          </div>
        </div>

        <div class="border-t border-slate-800 pt-8 pb-12">
          <button
              @click="showHistory = !showHistory"
              class="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mx-auto px-4 py-2 hover:bg-slate-800 rounded-lg"
          >
            <span>{{ showHistory ? 'Hide' : 'Show' }} Past Tournaments</span>
            <i class="ph-bold ph-caret-down transition-transform duration-300" :class="{ 'rotate-180': showHistory }"></i>
          </button>

          <div v-if="showHistory" class="mt-6 grid md:grid-cols-2 gap-3 animate-fade-in-down">
            <div v-for="t in pastTournamentsList" :key="t.id"
                 @click="selectTournamentFromHome(t.id)"
                 class="flex items-center justify-between bg-slate-900/50 hover:bg-slate-800 border border-slate-800 hover:border-slate-600 rounded-lg p-4 cursor-pointer transition-colors">
              <div>
                <h4 class="font-bold text-slate-300">{{ t.name }}</h4>
                <p class="text-xs text-slate-500 mt-1">
                  {{ new Date(t.createdAt).toLocaleDateString() }}
                </p>
              </div>
              <span class="text-[10px] uppercase font-bold bg-slate-800 text-slate-500 px-2 py-1 rounded border border-slate-700">
                Completed
              </span>
            </div>
            <div v-if="pastTournamentsList.length === 0" class="text-center text-slate-600 col-span-2 py-4">
              No completed tournaments yet.
            </div>
          </div>
        </div>

      </div>

      <div v-else-if="loading" class="flex justify-center items-center h-96">
        <i class="ph ph-spinner animate-spin text-5xl text-indigo-500"></i>
      </div>

      <div v-else-if="tournament" class="space-y-6 animate-fade-in">

        <RegistrationPhase
            v-if="tournament.status === 'registration'"
            :tournament="tournament"
            :is-admin="isAdmin"
            :app-id="appId"
            :secure-update="secureUpdate"
            :global-players="globalPlayers"
            :add-global-player="addGlobalPlayer"
            :seasons="availableSeasons"
        />

        <DraftPhase
            v-else-if="tournament.status === 'draft'"
            :tournament="tournament"
            :is-admin="isAdmin"
            :secure-update="secureUpdate"
            :global-players="globalPlayers"
            :seasons="availableSeasons"
        />

        <BanPhase
            v-else-if="tournament.status === 'ban'"
            :tournament="tournament"
            :is-admin="isAdmin"
            :secure-update="secureUpdate"
        />

        <ActivePhase
            v-else-if="tournament.status === 'active' || tournament.status === 'completed'"
            :tournament-prop="tournament"
            :is-admin="isAdmin"
            :secure-update="secureUpdate"
            :global-players="globalPlayers"
            :add-global-player="addGlobalPlayer"
        />

      </div>
    </main>
    <footer class="border-t border-slate-800 bg-slate-900/50 py-8 mt-auto backdrop-blur-sm">
      <div class="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4">

        <div class="text-xs font-mono text-slate-600 flex items-center gap-2">
          <i class="ph-bold ph-code"></i>
          <span>
            Powered by
            <span class="text-emerald-500 font-bold">Vue</span> &
            <span class="text-amber-500 font-bold">Firebase</span>
          </span>
        </div>

        <div class="text-sm text-slate-400 flex items-center gap-2">
          <span>Created with <i class="ph-fill ph-heart text-rose-500 inline-block animate-pulse"></i> by</span>

          <a href="https://discord.com/users/131446525585784832"
             target="_blank"
             rel="noopener noreferrer"
             class="font-bold text-indigo-400 hover:text-white transition-colors flex items-center gap-1.5 group"
             title="Contact on Discord">

            Sumpfranze

            <i class="ph-fill ph-discord-logo text-lg group-hover:scale-110 transition-transform"></i>
          </a>
        </div>

      </div>
    </footer>
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
  <div v-if="activeVisualEgg"
       :class="activeVisualEgg.visual?.overlayClass"
       class="flex items-center justify-center fixed inset-0 pointer-events-none z-[9999]">

    <h1 v-if="activeVisualEgg.visual?.text"
        class="text-9xl font-black text-red-500/50 uppercase tracking-widest animate-pulse rotate-12 select-none drop-shadow-2xl">
      {{ activeVisualEgg.visual.text }}
    </h1>

    <img v-if="activeVisualEgg.visual?.image"
         :src="activeVisualEgg.visual.image"
         :class="activeVisualEgg.visual.imageClass"
         alt="Easter Egg Visual"
         class="max-w-full max-h-screen object-contain" />
  </div>

  <Transition enter-active-class="duration-200 ease-out" enter-from-class="opacity-0 scale-95" enter-to-class="opacity-100 scale-100" leave-active-class="duration-150 ease-in" leave-from-class="opacity-100 scale-100" leave-to-class="opacity-0 scale-95">
    <ChangelogModal v-if="showChangelog"
                    :last-seen-version="previousVersion"
                    @close="closeChangelog"
    />
  </Transition>
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
