<script setup lang="ts">
import {onMounted, ref} from 'vue';
import { db } from '../firebase';
import {collection, doc, getDocs, orderBy, query, setDoc, updateDoc, writeBatch} from 'firebase/firestore';
import type {Season} from "../types.ts";

defineProps<{ isOpen: boolean }>();
const emit = defineEmits(['close']);

const isCreatingSeason = ref(false);

// State
const seasons = ref<Season[]>([]);
const isActionLoading = ref(false);
const showEditList = ref(false);
const editingSeason = ref<Season | null>(null);

// Fetch all seasons
const fetchSeasons = async () => {
  try {
    const seasonsRef = collection(db, 'artifacts', 'default-app', 'public', 'data', 'seasons');
    const q = query(seasonsRef, orderBy('startDate', 'desc'));
    const snap = await getDocs(q);
    seasons.value = snap.docs.map(d => d.data() as Season);
  } catch (e) {
    console.error("Error fetching seasons:", e);
  }
};

const formatDateForInput = (isoString: string | undefined) => {
  if (!isoString) return '';
  return isoString.split('T')[0];
};

// Open the edit form
const startEditing = (season: Season) => {
  // We format the dates specifically for the HTML inputs
  editingSeason.value = {
    ...season,
    startDate: formatDateForInput(season.startDate) || '',
    endDate: season.endDate ? formatDateForInput(season.endDate) : ''
  };
  showEditList.value = false;
};

// Save updates to Firestore
const saveSeasonUpdate = async () => {
  if (!editingSeason.value) return;

  isActionLoading.value = true;
  try {
    const seasonRef = doc(db, 'artifacts', 'default-app', 'public', 'data', 'seasons', editingSeason.value.id);

    await updateDoc(seasonRef, {
      name: editingSeason.value.name,
      startDate: new Date(editingSeason.value.startDate).toISOString(),
      endDate: editingSeason.value.endDate ? new Date(editingSeason.value.endDate).toISOString() : null,
      description: editingSeason.value.description || '',
    });
    alert("Season updated!");
    await fetchSeasons();
    editingSeason.value = null;
  } catch (e: any) {
    alert("Update failed: " + e.message);
  } finally {
    isActionLoading.value = false;
  }
};

onMounted(fetchSeasons);

const createNewSeason = async () => {
  const name = prompt("Enter Season Name (e.g. Season 3):");
  if (!name) return;

  const description = prompt("Enter Season Description (e.g. Third Season):");
  if (!description) return;

  const id = name.toLowerCase().replace(/\s+/g, '-');
  const startDate = prompt("Enter Start Date (YYYY-MM-DD):", new Date().toISOString().split('T')[0]);
  if (!startDate) return;

  isCreatingSeason.value = true;
  try {
    const seasonData = {
      id,
      name,
      description,
      startDate: new Date(startDate).toISOString(),
      tournamentIds: [],
    };

    // Replace 'default-app' with your actual APP_ID variable if needed
    const seasonRef = doc(db, 'artifacts', 'default-app', 'public', 'data', 'seasons', id);
    await setDoc(seasonRef, seasonData);

    alert(`Success: ${name} created!`);
  } catch (e: any) {
    console.error(e);
    alert("Error creating season: " + e.message);
  } finally {
    isCreatingSeason.value = false;
  }
};


// --- Rename Player State ---
const showRenameTool = ref(false);
const renameSearchQuery = ref('');
const renameTarget = ref<any | null>(null);
const newPlayerName = ref('');
const isRenaming = ref(false);

const selectForRename = (player: any) => {
  renameTarget.value = player;
  renameSearchQuery.value = '';
  newPlayerName.value = player.name;
};

const executeRename = async () => {
  if (!renameTarget.value || !newPlayerName.value.trim()) return;

  const oldName = renameTarget.value.name;
  const newName = newPlayerName.value.trim();

  if (oldName === newName) {
    alert("New name is the same as the current name.");
    return;
  }

  // Check for name conflicts
  const conflict = allPlayers.value.find(p => p.name === newName && p.id !== renameTarget.value.id);
  if (conflict) {
    alert(`Cannot rename: a different player named "${newName}" already exists (${conflict.id}).`);
    return;
  }

  const confirmMsg = `Rename "${oldName}" to "${newName}"?\n\nThis will update all tournaments and team names. This cannot be undone.`;
  if (!confirm(confirmMsg)) return;

  isRenaming.value = true;
  const appId = 'default-app';

  try {
    const tournamentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'tournaments');
    const tournamentsSnap = await getDocs(tournamentsRef);

    const batch = writeBatch(db);

    // 1. Update global player doc: set new name, add old name to aliases
    const playerRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', renameTarget.value.id);
    const aliases = [...(renameTarget.value.aliases || [])];
    if (!aliases.includes(oldName)) {
      aliases.push(oldName);
    }
    batch.update(playerRef, { name: newName, aliases });

    // 2. Update tournaments: player names in players map + team names
    let tournamentsUpdated = 0;
    tournamentsSnap.docs.forEach(tDoc => {
      const t = tDoc.data();
      let changed = false;
      const updates: Record<string, any> = {};

      // Update player name in players map
      const players = t.players || {};
      if (players[renameTarget.value.id]) {
        updates[`players.${renameTarget.value.id}.name`] = newName;
        changed = true;
      }

      // Update team names ("Team OldName" → "Team NewName") if player is captain
      const teams = t.teams || [];
      const teamIdx = teams.findIndex((team: any) => team.name === `Team ${oldName}`);
      if (teamIdx !== -1) {
        const updatedTeams = teams.map((team: any) =>
            team.name === `Team ${oldName}` ? { ...team, name: `Team ${newName}` } : team
        );
        updates.teams = updatedTeams;
        changed = true;
      }

      if (changed) {
        batch.update(tDoc.ref, updates);
        tournamentsUpdated++;
      }
    });

    await batch.commit();
    alert(`Rename Complete!\n"${oldName}" → "${newName}"\nUpdated ${tournamentsUpdated} tournaments.`);

    // Reset
    renameTarget.value = null;
    newPlayerName.value = '';
    showRenameTool.value = false;
    await fetchPlayers();
  } catch (e: any) {
    console.error(e);
    alert("Rename Failed: " + e.message);
  } finally {
    isRenaming.value = false;
  }
};

// --- Merge Player State ---
const showMergeTool = ref(false);
const playerSearchQuery = ref('');
const allPlayers = ref<any[]>([]); // To be populated from a fetch
const keeper = ref<any | null>(null);
const duplicate = ref<any | null>(null);
const isMerging = ref(false);

const fetchPlayers = async () => {
  const playersRef = collection(db, 'artifacts', 'default-app', 'public', 'data', 'players');
  const snap = await getDocs(query(playersRef, orderBy('name', 'asc')));
  allPlayers.value = snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

const selectForMerge = (player: any, type: 'keeper' | 'duplicate') => {
  if (type === 'keeper') keeper.value = player;
  else duplicate.value = player;
  playerSearchQuery.value = '';
};

const executeMerge = async () => {
  if (!keeper.value || !duplicate.value) return;
  if (keeper.value.id === duplicate.value.id) {
    alert("Keeper and Duplicate cannot be the same person!");
    return;
  }

  const confirmMsg = `Merge "${duplicate.value.name}" INTO "${keeper.value.name}"?\n\nThis will update all tournaments. This cannot be undone.`;
  if (!confirm(confirmMsg)) return;

  isMerging.value = true;
  const appId = 'default-app';

  try {
    const tournamentsRef = collection(db, 'artifacts', appId, 'public', 'data', 'tournaments');
    const tournamentsSnap = await getDocs(tournamentsRef);

    const batch = writeBatch(db);

    // 1. Update Tournaments: players map, playerIds, teams, wildcards, draft, and embedded races
    let tournamentsUpdated = 0;
    const dupId = duplicate.value.id;
    const keepId = keeper.value.id;

    tournamentsSnap.docs.forEach(tDoc => {
      const t = tDoc.data();
      let changed = false;
      const updates: Record<string, any> = {};

      // Update players map
      const players = { ...t.players };
      if (players[dupId]) {
        players[keepId] = { ...players[dupId], id: keepId, name: keeper.value.name };
        delete players[dupId];
        updates.players = players;
        changed = true;
      }

      // Update playerIds array
      const playerIds: string[] = [...(t.playerIds || [])];
      const dupIdx = playerIds.indexOf(dupId);
      if (dupIdx !== -1) {
        if (!playerIds.includes(keepId)) {
          playerIds[dupIdx] = keepId;
        } else {
          playerIds.splice(dupIdx, 1);
        }
        updates.playerIds = playerIds;
        changed = true;
      }

      // Update teams
      let teamsChanged = false;
      const teams = (t.teams || []).map((team: any) => {
        let teamChanged = false;
        let cId = team.captainId;
        let mIds = [...team.memberIds];

        if (cId === dupId) { cId = keepId; teamChanged = true; }
        if (mIds.includes(dupId)) {
          mIds = mIds.map((id: string) => id === dupId ? keepId : id);
          teamChanged = true;
        }

        if (teamChanged) { teamsChanged = true; return { ...team, captainId: cId, memberIds: mIds }; }
        return team;
      });
      if (teamsChanged) {
        updates.teams = teams;
        changed = true;
      }

      // Update wildcards
      const wildcards = t.wildcards || [];
      const wcIdx = wildcards.findIndex((w: any) => w.playerId === dupId);
      if (wcIdx !== -1) {
        updates.wildcards = wildcards.map((w: any) =>
            w.playerId === dupId ? { ...w, playerId: keepId } : w
        );
        changed = true;
      }

      // Update draft order
      if (t.draft?.order?.includes(dupId)) {
        updates['draft.order'] = t.draft.order.map((id: string) => id === dupId ? keepId : id);
        changed = true;
      }

      // Update embedded races map (tournament.races)
      const races = { ...t.races };
      let racesChanged = false;
      for (const rKey of Object.keys(races)) {
        const race = races[rKey];
        if (!race.placements || !(dupId in race.placements)) continue;

        const placements = { ...race.placements };
        placements[keepId] = placements[dupId];
        delete placements[dupId];
        races[rKey] = { ...race, placements };
        racesChanged = true;
      }
      if (racesChanged) {
        updates.races = races;
        changed = true;
      }

      if (changed) {
        batch.update(tDoc.ref, updates);
        tournamentsUpdated++;
      }
    });

    // 2. Update Keeper Metadata & Aliases
    const keeperRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', keepId);
    const dupRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', dupId);

    const km = keeper.value.metadata || {};
    const dm = duplicate.value.metadata || {};

    const newAliases = [...(keeper.value.aliases || [])];
    if (!newAliases.includes(duplicate.value.name)) newAliases.push(duplicate.value.name);
    (duplicate.value.aliases || []).forEach((a: string) => {
      if (!newAliases.includes(a)) newAliases.push(a);
    });

    // Merge per-season dominance metadata
    const mergedSeasons: Record<string, any> = { ...(km.seasons || {}) };
    for (const [seasonId, dupSeason] of Object.entries(dm.seasons || {} as Record<string, any>)) {
      const ds = dupSeason as { opponentsFaced: number; opponentsBeaten: number };
      if (mergedSeasons[seasonId]) {
        mergedSeasons[seasonId] = {
          opponentsFaced: (mergedSeasons[seasonId].opponentsFaced || 0) + (ds.opponentsFaced || 0),
          opponentsBeaten: (mergedSeasons[seasonId].opponentsBeaten || 0) + (ds.opponentsBeaten || 0),
        };
      } else {
        mergedSeasons[seasonId] = { ...ds };
      }
    }

    // Pick the more recent lastPlayed
    const keeperLastPlayed = km.lastPlayed || '';
    const dupLastPlayed = dm.lastPlayed || '';
    const mergedLastPlayed = keeperLastPlayed > dupLastPlayed ? keeperLastPlayed : dupLastPlayed;

    const metadataUpdate: Record<string, any> = {
      aliases: newAliases,
      'metadata.totalTournaments': (km.totalTournaments || 0) + (dm.totalTournaments || 0),
      'metadata.totalRaces': (km.totalRaces || 0) + (dm.totalRaces || 0),
      'metadata.opponentsFaced': (km.opponentsFaced || 0) + (dm.opponentsFaced || 0),
      'metadata.opponentsBeaten': (km.opponentsBeaten || 0) + (dm.opponentsBeaten || 0),
      'metadata.seasons': mergedSeasons,
    };
    if (mergedLastPlayed) {
      metadataUpdate['metadata.lastPlayed'] = mergedLastPlayed;
    }

    batch.update(keeperRef, metadataUpdate);

    // 3. Delete Duplicate
    batch.delete(dupRef);

    await batch.commit();
    alert(`Merge Complete!\nUpdated ${tournamentsUpdated} tournaments.`);

    // Reset
    keeper.value = null;
    duplicate.value = null;
    showMergeTool.value = false;
    await fetchPlayers();
  } catch (e: any) {
    console.error(e);
    alert("Merge Failed: " + e.message);
  } finally {
    isMerging.value = false;
  }
};
</script>

<template>
  <aside
      class="fixed left-0 top-0 h-full w-80 bg-slate-900 border-r border-slate-700 shadow-2xl z-[90] transform transition-transform duration-300 flex flex-col"
      :class="isOpen ? 'translate-x-0' : '-translate-x-full'"
  >
    <div class="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50 backdrop-blur-md">
      <div>
        <h2 class="text-xl font-black text-white uppercase tracking-wider">Super Admin</h2>
        <p class="text-xs text-indigo-400 font-bold">Management Panel</p>
      </div>
      <button @click="emit('close')" class="text-slate-500 hover:text-white transition-colors">
        <i class="ph-bold ph-x text-xl"></i>
      </button>
    </div>

    <div class="flex-grow overflow-y-auto p-4 space-y-6">

      <div v-if="!showEditList && !editingSeason" class="space-y-6">
        <section class="space-y-3">
          <h3 class="text-xs font-bold text-slate-500 uppercase tracking-widest px-2">Seasons</h3>
          <div class="grid gap-2">
            <button
                @click="createNewSeason"
                :disabled="isCreatingSeason"
                class="flex items-center gap-3 w-full p-3 bg-slate-800 hover:bg-indigo-600/20 border border-slate-700 hover:border-indigo-500/50 rounded-xl text-white transition-all group"
            >
              <i class="ph-fill ph-calendar-plus text-xl text-indigo-400 group-hover:scale-110 transition-transform"></i>
              <span class="text-sm font-bold">{{ isCreatingSeason ? 'Creating...' : 'Create New Season' }}</span>
            </button>

            <button
                @click="showEditList = true"
                class="flex items-center gap-3 w-full p-3 bg-slate-800 hover:bg-indigo-600/20 border border-slate-700 hover:border-indigo-500/50 rounded-xl text-white transition-all group"
            >
              <i class="ph-bold ph-note-pencil text-xl text-indigo-400"></i>
              <span class="text-sm font-bold">Edit Existing Season</span>
            </button>
          </div>
        </section>

        <section class="space-y-3">
          <h3 class="text-xs font-bold text-slate-500 uppercase tracking-widest px-2">Players</h3>
          <div class="grid gap-2">
            <button
                @click="showMergeTool = true"
                class="flex items-center gap-3 w-full p-3 bg-slate-800 hover:bg-indigo-600/20 border border-slate-700 hover:border-indigo-500/50 rounded-xl text-white transition-all group"
            >
              <i class="ph-bold ph-users-three text-indigo-400"></i>
              <span class="text-sm font-bold">Merge Players</span>
            </button>

            <button
                @click="showRenameTool = true; fetchPlayers()"
                class="flex items-center gap-3 w-full p-3 bg-slate-800 hover:bg-indigo-600/20 border border-slate-700 hover:border-indigo-500/50 rounded-xl text-white transition-all group"
            >
              <i class="ph-bold ph-text-t text-xl text-indigo-400 group-hover:scale-110 transition-transform"></i>
              <span class="text-sm font-bold">Rename Player</span>
            </button>
          </div>
        </section>
      </div>
      <section v-else-if="showEditList" class="space-y-3">
        <div class="flex items-center justify-between px-2">
          <h3 class="text-xs font-bold text-slate-500 uppercase tracking-widest">Select Season</h3>
          <button @click="showEditList = false" class="text-[10px] text-indigo-400 font-bold uppercase hover:underline">Back</button>
        </div>
        <div class="grid gap-2">
          <button
              v-for="s in seasons" :key="s.id"
              @click="startEditing(s)"
              class="w-full p-3 bg-slate-800 border border-slate-700 rounded-lg text-left hover:border-indigo-500/50 hover:bg-slate-800/80 transition-all group"
          >
            <div class="text-sm font-bold text-white group-hover:text-indigo-300">{{ s.name }}</div>
            <div class="text-[10px] text-slate-500 font-mono">{{ s.id }}</div>
          </button>
        </div>
      </section>

      <section v-else-if="editingSeason" class="space-y-4">
        <div class="flex items-center justify-between px-2">
          <h3 class="text-xs font-bold text-indigo-400 uppercase tracking-widest">Editing: {{ editingSeason.id }}</h3>
          <button @click="editingSeason = null" class="text-[10px] text-slate-500 font-bold uppercase hover:text-white">Cancel</button>
        </div>

        <div class="space-y-4 bg-slate-800/30 p-4 rounded-xl border border-slate-800">
          <div>
            <label class="text-[10px] font-bold text-slate-500 uppercase ml-1">Display Name</label>
            <input v-model="editingSeason.name" type="text" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors" />
          </div>

          <div>
            <label class="text-[10px] font-bold text-slate-500 uppercase ml-1">Start Date</label>
            <input v-model="editingSeason.startDate" type="date" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors" />
          </div>

          <div>
            <label class="text-[10px] font-bold text-slate-500 uppercase ml-1">End Date (Optional)</label>
            <input v-model="editingSeason.endDate" type="date" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors" />
          </div>

          <div>
            <label class="text-[10px] font-bold text-slate-500 uppercase ml-1">Description</label>
            <textarea v-model="editingSeason.description" rows="3" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"></textarea>
          </div>

          <button
              @click="saveSeasonUpdate"
              :disabled="isActionLoading"
              class="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-900/20 transition-all flex items-center justify-center gap-2"
          >
            <i v-if="isActionLoading" class="ph-bold ph-circle-notch animate-spin"></i>
            {{ isActionLoading ? 'Saving...' : 'Save Changes' }}
          </button>
        </div>
      </section>
      <section v-if="showRenameTool" class="space-y-4 animate-in slide-in-from-right-4 duration-200">
        <div class="flex items-center justify-between px-2">
          <h3 class="text-xs font-bold text-indigo-400 uppercase tracking-widest">Rename Player</h3>
          <button @click="showRenameTool = false; renameTarget = null; newPlayerName = ''" class="text-[10px] text-slate-500 font-bold uppercase hover:text-white">Cancel</button>
        </div>

        <div class="bg-slate-800/30 p-4 rounded-xl border border-slate-800 space-y-4">
          <div v-if="!renameTarget" class="space-y-2">
            <input
                v-model="renameSearchQuery"
                type="text"
                placeholder="Search player to rename..."
                class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
            />

            <div v-if="renameSearchQuery" class="max-h-40 overflow-y-auto bg-slate-900 border border-slate-700 rounded-lg shadow-xl">
              <button
                  v-for="p in allPlayers.filter(p => p.name.toLowerCase().includes(renameSearchQuery.toLowerCase()))"
                  :key="p.id"
                  @click="selectForRename(p)"
                  class="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-indigo-600 hover:text-white border-b border-slate-800 last:border-0"
              >
                {{ p.name }} <span class="text-[9px] opacity-50 font-mono">({{ p.id }})</span>
              </button>
            </div>
          </div>

          <div v-else class="space-y-3">
            <div class="p-3 bg-slate-900 rounded-lg border border-slate-700">
              <div class="text-[9px] font-black text-indigo-400 uppercase mb-1">Selected Player</div>
              <div class="text-xs font-bold text-white">{{ renameTarget.name }}</div>
              <div class="text-[9px] text-slate-500 font-mono">{{ renameTarget.id }}</div>
              <button @click="renameTarget = null; newPlayerName = ''" class="text-[9px] text-rose-400 mt-1 hover:underline">Change</button>
            </div>

            <div>
              <label class="text-[10px] font-bold text-slate-500 uppercase ml-1">New Name</label>
              <input
                  v-model="newPlayerName"
                  type="text"
                  placeholder="Enter new name..."
                  class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>

            <button
                @click="executeRename"
                :disabled="!newPlayerName.trim() || newPlayerName.trim() === renameTarget.name || isRenaming"
                class="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:grayscale text-white rounded-xl font-bold text-sm shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <i v-if="isRenaming" class="ph-bold ph-circle-notch animate-spin"></i>
              {{ isRenaming ? 'Renaming...' : 'Confirm Rename' }}
            </button>
          </div>
        </div>
      </section>

      <section v-if="showMergeTool" class="space-y-4 animate-in slide-in-from-right-4 duration-200">
        <div class="flex items-center justify-between px-2">
          <h3 class="text-xs font-bold text-indigo-400 uppercase tracking-widest">Merge Players</h3>
          <button @click="showMergeTool = false; keeper = null; duplicate = null" class="text-[10px] text-slate-500 font-bold uppercase hover:text-white">Cancel</button>
        </div>

        <div class="bg-slate-800/30 p-4 rounded-xl border border-slate-800 space-y-4">
          <div class="space-y-2">
            <input
                v-model="playerSearchQuery"
                @focus="fetchPlayers"
                type="text"
                placeholder="Search players..."
                class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
            />

            <div v-if="playerSearchQuery" class="max-h-40 overflow-y-auto bg-slate-900 border border-slate-700 rounded-lg shadow-xl">
              <button
                  v-for="p in allPlayers.filter(p => p.name.toLowerCase().includes(playerSearchQuery.toLowerCase()))"
                  :key="p.id"
                  @click="selectForMerge(p, !keeper ? 'keeper' : 'duplicate')"
                  class="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-indigo-600 hover:text-white border-b border-slate-800 last:border-0"
              >
                {{ p.name }} <span class="text-[9px] opacity-50 font-mono">({{ p.id }})</span>
              </button>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div class="p-3 bg-slate-900 rounded-lg border border-slate-700">
              <div class="text-[9px] font-black text-indigo-400 uppercase mb-1">Keeper</div>
              <div class="text-xs font-bold text-white truncate">{{ keeper?.name || '---' }}</div>
            </div>
            <div class="p-3 bg-slate-900 rounded-lg border border-slate-700">
              <div class="text-[9px] font-black text-rose-400 uppercase mb-1">Duplicate</div>
              <div class="text-xs font-bold text-white truncate">{{ duplicate?.name || '---' }}</div>
            </div>
          </div>

          <button
              @click="executeMerge"
              :disabled="!keeper || !duplicate || isMerging"
              class="w-full py-3 bg-rose-600 hover:bg-rose-500 disabled:opacity-30 disabled:grayscale text-white rounded-xl font-bold text-sm shadow-lg transition-all flex items-center justify-center gap-2"
          >
            <i v-if="isMerging" class="ph-bold ph-circle-notch animate-spin"></i>
            {{ isMerging ? 'Processing...' : 'Confirm Merge' }}
          </button>
        </div>
      </section>
    </div>

    <div class="p-4 bg-slate-950 border-t border-slate-800">
      <div class="text-[10px] font-mono text-slate-600 uppercase text-center">
        Access restricted to Superadmins
      </div>
    </div>
  </aside>
</template>