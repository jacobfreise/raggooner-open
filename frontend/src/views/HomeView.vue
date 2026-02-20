<script setup lang="ts">
import { ref, computed, onMounted, inject, type Ref } from 'vue';
import { useRouter } from 'vue-router';
import { collection, doc, getDocs, orderBy, query, writeBatch, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { Tournament, Season } from '../types';
import { POINTS_SYSTEM } from "../utils/constants.ts";
import { getStatusColor } from "../utils/utils.ts";

const openChangelog = inject<() => void>('openChangelog')!;
const hasNewUpdates = inject<Ref<boolean>>('hasNewUpdates')!;

const router = useRouter();
const appId = 'default-app';

// State
const newTournamentName = ref('');
const joinId = ref('');
const isCreating = ref(false);
const availableSeasons = ref<Season[]>([]);
const selectedSeasonId = ref('');
const homeListLoading = ref(true);
const showHistory = ref(false);
const allTournaments = ref<Tournament[]>([]);

const loading = ref(false);

const activeTournamentsList = computed(() => allTournaments.value.filter(t => t.status !== 'completed'));
// const pastTournamentsList = computed(() => allTournaments.value.filter(t => t.status === 'completed'));

// Replace this:
// const pastTournamentsList = computed(() => allTournaments.value.filter(t => t.status === 'completed'));

// With this:
const groupedPastTournaments = computed(() => {
  const completed = allTournaments.value.filter(t => t.status === 'completed');

  // Create a map to hold tournaments by seasonId
  const groups = new Map<string, Tournament[]>();

  // Pre-fill the map with known seasons to maintain the descending 'startDate' order
  availableSeasons.value.forEach(s => groups.set(s.id, []));
  groups.set('unassigned', []); // Fallback for tournaments without a season

  // Distribute the completed tournaments into their respective season buckets
  // (They are already sorted by createdAt desc from the Firestore query)
  completed.forEach(t => {
    const sid = t.seasonId || 'unassigned';
    if (groups.has(sid)) {
      groups.get(sid)!.push(t);
    } else {
      groups.get('unassigned')!.push(t);
    }
  });

  // Format into an array for the template, omitting empty seasons
  const result = [];

  availableSeasons.value.forEach(season => {
    const tourneys = groups.get(season.id) || [];
    if (tourneys.length > 0) {
      result.push({ seasonId: season.id, seasonName: season.name, tournaments: tourneys });
    }
  });

  const unassignedTourneys = groups.get('unassigned') || [];
  if (unassignedTourneys.length > 0) {
    result.push({ seasonId: 'unassigned', seasonName: 'Unassigned / Older', tournaments: unassignedTourneys });
  }

  return result;
});

const fetchSeasons = async () => {
  try {
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'seasons'), orderBy('startDate', 'desc'));
    const snapshot = await getDocs(q);
    availableSeasons.value = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Season));
    if (availableSeasons.value.length > 0) selectedSeasonId.value = availableSeasons.value[0]!.id;
  } catch (e) {
    console.error('Failed to fetch seasons:', e);
  }
};

const fetchPublicTournaments = async () => {
  homeListLoading.value = true;
  try {
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'tournaments'), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    allTournaments.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Tournament));
  } catch (e) {
    console.error("Error fetching tournament list", e);
  } finally {
    homeListLoading.value = false;
  }
};

const createTournament = async () => {
  if (isCreating.value || !newTournamentName.value) return;
  isCreating.value = true;

  try {
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

    const batch = writeBatch(db);
    batch.set(tournamentRef, newTourney);
    batch.set(secretRef, { password: password });
    await batch.commit();

    await setDoc(adminRef, { tournamentId: id, userId: userId, password: password });
    localStorage.setItem(`admin_pwd_${id}`, password);

    // ROUTER REDIRECT
    router.push(`/t/${id}`);

  } catch (error) {
    console.error("Failed to create:", error);
    alert("Error creating tournament. Please try again.");
  } finally {
    isCreating.value = false;
  }
};

const joinTournament = () => {
  if (!joinId.value) return;
  router.push(`/t/${joinId.value}`);
};

const selectTournamentFromHome = (id: string) => {
  router.push(`/t/${id}`);
};

const formatTournamentStatus = (t: Tournament): string => {
  if (t.status === 'active') {
    return t.stage === 'groups' ? 'Group Stage' : 'Finals';
  }

  const statusMap: Record<Tournament['status'], string> = {
    registration: 'Registration',
    draft: 'Draft Phase',
    ban: 'Ban Phase',
    completed: 'Tournament Finished',
    active: '' // Handled above
  };

  return statusMap[t.status] || t.status;
};

onMounted(() => {
  fetchSeasons();
  fetchPublicTournaments();
  auth.onAuthStateChanged(user => {
    if (user) console.log('[Auth] Your UID:', user.uid);
  });
});
</script>

<template>
  <div class="w-full flex flex-col min-h-full">

    <header class="border-b border-slate-700 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
      <div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div class="flex items-center gap-2 text-indigo-500 z-10">
          <i class="ph-fill ph-flag-checkered text-3xl"></i>
          <span class="text-2xl font-bold text-white heading tracking-widest hidden sm:block">Raccoon Open</span>
          <span class="text-2xl font-bold text-white heading tracking-widest sm:hidden">RO</span>
        </div>

        <div class="flex items-center gap-4 z-10">
          <button @click="openChangelog" class="relative text-slate-400 hover:text-white transition-colors">
            <i class="ph-bold ph-bell text-xl"></i>
            <span v-if="hasNewUpdates" class="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-slate-900 animate-pulse"></span>
          </button>
        </div>
      </div>
    </header>

    <main class="flex-grow p-4 md:p-6 max-w-7xl mx-auto w-full">
      <div class="max-w-3xl mx-auto mt-4 mb-12 animate-fade-in">

        <div class="grid grid-cols-2 md:grid-cols-2 gap-4 mb-12 border-b border-slate-800 pb-12">

          <router-link to="/" class="group bg-indigo-600 border border-indigo-500 rounded-xl p-4 flex items-center gap-3 hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-500/20 cursor-default pointer-events-none">
            <i class="ph-fill ph-flag-checkered text-2xl text-white"></i>
            <div>
              <div class="text-sm font-bold text-white uppercase tracking-widest">Play</div>
              <div class="text-[10px] text-indigo-200">Tournaments</div>
            </div>
          </router-link>

          <router-link to="/analytics" class="group bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-center gap-3 hover:border-indigo-500 hover:bg-slate-750 transition-colors cursor-pointer">
            <i class="ph-fill ph-chart-line-up text-2xl text-indigo-400 group-hover:text-indigo-300"></i>
            <div>
              <div class="text-sm font-bold text-white uppercase tracking-widest group-hover:text-indigo-100">Analytics</div>
              <div class="text-[10px] text-slate-400">Global Stats</div>
            </div>
          </router-link>

<!--          <router-link to="/tools" class="hidden md:flex group bg-slate-800 border border-slate-700 rounded-xl p-4 items-center gap-3 hover:border-indigo-500 hover:bg-slate-750 transition-colors cursor-pointer opacity-50 hover:opacity-100">-->
<!--            <i class="ph-fill ph-dice-three text-2xl text-indigo-400 group-hover:text-indigo-300"></i>-->
<!--            <div>-->
<!--              <div class="text-sm font-bold text-white uppercase tracking-widest group-hover:text-indigo-100">Roller</div>-->
<!--              <div class="text-[10px] text-slate-400">Track Generator</div>-->
<!--            </div>-->
<!--          </router-link>-->

        </div>

        <div v-if="!loading" class="max-w-lg mx-auto mt-8 space-y-12">

          <div class="text-center space-y-4">
            <h1 class="text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">Racc Open</h1>
            <p class="text-xl text-slate-400 max-w-2xl mx-auto">Organize Racc Open. Draft a Team, low-roll your career, mald a lot and race against the other teams.</p>
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
                    <i class="ph-fill ph-trophy"></i> {{ formatTournamentStatus(t) }}
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

            <div v-if="showHistory" class="mt-8 space-y-8 animate-fade-in-down">

              <div v-if="groupedPastTournaments.length === 0" class="text-center text-slate-600 py-4">
                No completed tournaments yet.
              </div>

              <div v-for="group in groupedPastTournaments" :key="group.seasonId">

                <div class="flex items-center gap-3 mb-4">
                  <div class="h-5 w-1.5 bg-slate-600 rounded-full"></div>
                  <h3 class="text-lg font-bold text-slate-300">{{ group.seasonName }}</h3>
                </div>

                <div class="grid md:grid-cols-2 gap-3">
                  <div v-for="t in group.tournaments" :key="t.id"
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
                </div>

              </div>
            </div>
          </div>
        </div>

      </div>
    </main>
  </div>
</template>