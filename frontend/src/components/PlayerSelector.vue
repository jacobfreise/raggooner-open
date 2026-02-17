<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { GlobalPlayer } from '../types';

const props = defineProps<{
  appId: string;
  excludeIds?: string[];
  placeholder?: string;
  showStats?: boolean;
}>();

const emit = defineEmits<{
  select: [player: GlobalPlayer];
}>();

const players = ref<GlobalPlayer[]>([]);
const loading = ref(true);
const searchQuery = ref('');
const showAddNew = ref(false);
const newPlayerName = ref('');
const isDropdownOpen = ref(false);

const filteredPlayers = computed(() => {
  const query = searchQuery.value.toLowerCase().trim();

  if (!query) return [];

  return players.value
      .filter(p => !props.excludeIds?.includes(p.id))
      .filter(p => p.name.toLowerCase().includes(query))
      .sort((a, b) => {
        // Exact match first
        const aExact = a.name.toLowerCase() === query;
        const bExact = b.name.toLowerCase() === query;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;

        // Then by most played
        const aDiff = (b.metadata.totalTournaments || 0) - (a.metadata.totalTournaments || 0);
        if (aDiff !== 0) return aDiff;

        // Finally alphabetically
        return a.name.localeCompare(b.name);
      });
});


const shouldShowDropdown = computed(() => {
  return isDropdownOpen.value && searchQuery.value.trim().length > 0;
});

onMounted(async () => {
  await fetchPlayers();
});

const fetchPlayers = async () => {
  loading.value = true;
  try {
    const playersRef = collection(db, 'artifacts', props.appId, 'public', 'data', 'players');
    const snap = await getDocs(playersRef);
    players.value = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as GlobalPlayer));
  } catch (e) {
    console.error('Failed to fetch players:', e);
  } finally {
    loading.value = false;
  }
};

const selectPlayer = (player: GlobalPlayer) => {
  emit('select', player);
  searchQuery.value = '';
  isDropdownOpen.value = false;
};

const openAddNew = () => {
  newPlayerName.value = searchQuery.value.trim();
  showAddNew.value = true;
  isDropdownOpen.value = false;
};

const createNewPlayer = async () => {
  if (!newPlayerName.value.trim()) return;

  const playerId = crypto.randomUUID();

  const newPlayer: GlobalPlayer = {
    id: playerId,
    name: newPlayerName.value.trim(),
    createdAt: new Date().toISOString(),
    metadata: {
      totalTournaments: 0,
      totalRaces: 0
    }
  };

  try {
    const playerRef = doc(db, 'artifacts', props.appId, 'public', 'data', 'players', playerId);
    await setDoc(playerRef, newPlayer);

    players.value.push(newPlayer);
    emit('select', newPlayer);

    newPlayerName.value = '';
    showAddNew.value = false;
    searchQuery.value = '';
  } catch (e) {
    console.error('Failed to create player:', e);
    alert('Failed to create player. Check console for details.');
  }
};

const handleFocus = () => {
  isDropdownOpen.value = true;
};

const handleBlur = () => {
  // Delay to allow click events on dropdown items
  setTimeout(() => {
    isDropdownOpen.value = false;
  }, 200);
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    isDropdownOpen.value = false;
    searchQuery.value = '';
  }
};
</script>

<template>
  <div class="relative">
    <!-- Search Input -->
    <div class="relative">
      <i class="ph-bold ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"></i>

      <input
          v-model="searchQuery"
          @focus="handleFocus"
          @blur="handleBlur"
          @keydown="handleKeydown"
          type="text"
          :placeholder="placeholder || 'Search or add player...'"
          class="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
      />

      <div v-if="loading" class="absolute right-3 top-1/2 -translate-y-1/2">
        <i class="ph ph-circle-notch animate-spin text-slate-400"></i>
      </div>
    </div>

    <!-- Dropdown -->
    <div
        v-if="shouldShowDropdown"
        class="absolute z-50 w-full mt-2 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl max-h-80 overflow-y-auto"
    >
      <!-- Existing Players -->
      <div v-if="filteredPlayers.length > 0" class="divide-y divide-slate-800">
        <button
            v-for="player in filteredPlayers.slice(0, 10)"
            :key="player.id"
            @click="selectPlayer(player)"
            class="w-full px-4 py-3 text-left hover:bg-slate-800 transition-colors flex items-center justify-between group"
        >
          <div class="flex-1 min-w-0">
            <div class="font-bold text-white truncate">{{ player.name }}</div>
            <div v-if="showStats !== false" class="text-xs text-slate-400 flex items-center gap-3 mt-1">
              <span class="flex items-center gap-1">
                <i class="ph-fill ph-trophy text-amber-500"></i>
                {{ player.metadata.totalTournaments || 0 }}
              </span>
              <span class="flex items-center gap-1">
                <i class="ph-fill ph-flag-checkered text-indigo-400"></i>
                {{ player.metadata.totalRaces || 0 }}
              </span>
              <span v-if="player.metadata.lastPlayed" class="text-slate-500 ml-auto">
                Last: {{ new Date(player.metadata.lastPlayed).toLocaleDateString() }}
              </span>
            </div>
          </div>
          <i class="ph-bold ph-caret-right text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity ml-3"></i>
        </button>
      </div>

      <!-- No Results / Add New -->
      <div v-else class="px-4 py-8 text-center">
        <div v-if="searchQuery.trim().length < 2" class="text-slate-500">
          <i class="ph ph-keyboard text-3xl mb-2"></i>
          <p class="text-sm">Type to search players...</p>
        </div>

        <div v-else>
          <i class="ph ph-user-plus text-4xl text-slate-600 mb-3"></i>
          <p class="text-slate-400 mb-4">No player found: <span class="text-white font-bold">"{{ searchQuery }}"</span></p>
          <button
              @click="openAddNew"
              class="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-bold transition-colors inline-flex items-center gap-2"
          >
            <i class="ph-bold ph-plus-circle"></i>
            Add as new player
          </button>
        </div>
      </div>

      <!-- Quick Stats Footer -->
      <div v-if="filteredPlayers.length > 0" class="px-4 py-2 bg-slate-950 border-t border-slate-800 text-xs text-slate-500">
        Showing {{ Math.min(10, filteredPlayers.length) }} of {{ filteredPlayers.length }} results
      </div>
    </div>

    <!-- Add New Player Modal -->
    <Teleport to="body">
      <div
          v-if="showAddNew"
          class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          @click.self="showAddNew = false"
      >
        <div class="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full shadow-2xl">
          <div class="flex items-center gap-3 mb-4">
            <div class="h-12 w-12 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <i class="ph-fill ph-user-plus text-2xl text-indigo-400"></i>
            </div>
            <div>
              <h3 class="text-xl font-bold text-white">Add New Player</h3>
              <p class="text-xs text-slate-400">This player will be added to the global pool</p>
            </div>
          </div>

          <input
              v-model="newPlayerName"
              @keyup.enter="createNewPlayer"
              type="text"
              placeholder="Player Name"
              autofocus
              class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 mb-4"
          />

          <div class="flex gap-3">
            <button
                @click="showAddNew = false"
                class="flex-1 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg font-bold transition-colors"
            >
              Cancel
            </button>
            <button
                @click="createNewPlayer"
                :disabled="!newPlayerName.trim()"
                class="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
            >
              <i class="ph-bold ph-check"></i>
              Add Player
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>