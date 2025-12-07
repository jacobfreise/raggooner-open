<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { doc, onSnapshot, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { auth, db } from './firebase';
import type { Tournament, Player, Team, Race } from './types';

// Constants
const POINTS_SYSTEM: Record<number, number> = {
  1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2,
  10: 1, 11: 0, 12: 0, 13: 0, 14: 0, 15: 0, 16: 0, 17: 0, 18: 0
};

const UMAS = ['Manhattan Cafe', 'Kawakami Princess', 'Halloween Rice Shower', 'Halloween Super Creek',
  'Agnes Digital', 'Hishi Akebono', 'Full Armor Matikanefukukitaru', 'Eishin Flash', 'Meisho Doto', 'Summer Special Week',
  'Summer Maruzensky', 'Gold City', 'Fuji Kiseki', 'Fantasy Grass Wonder', 'Fantasy El Condor Pasa', 'Hishi Amazon',
  'Seiun Sky', 'Wedding Air Groove', 'Wedding Mayano Top Gun', 'Narita Brian', 'Smart Falcon', 'Narita Taishin',
  'Curren Chan', 'Anime Tokai Teio', 'Anime Mejiro McQueen', 'Biwa Hayahide', 'Mihono Bourbon', 'TM Opera O',
  'Special Week', 'Silence Suzuka', 'Tokai Teio', 'Maruzensky', 'Oguri Cap', 'Taiki Shuttle', 'Mejiro McQueen',
  'Symboli Rudolf', 'Rice Shower', 'Gold Ship', 'Vodka', 'Daiwa Scarlet', 'Grass Wonder', 'El Condor Pasa', 'Air Groove',
  'Mayano Top Gun', 'Super Creek', 'Mejiro Ryan', 'Agnes Tachyon', 'Winning Ticket', 'Sakura Bakushin O', 'Haru Urara',
  'Matikanefukukitaru', 'Nice Nature', 'King Halo'];

// Config
const appId = 'default-app'; // Can use import.meta.env.VITE_APP_ID if needed

const getTournamentRef = (id: string) => {
  return doc(db, 'artifacts', appId, 'public', 'data', 'tournaments', id);
};

// State
const tournament = ref<Tournament | null>(null);
const loading = ref(true);
const hasInitialViewLoaded = ref(false);
const newTournamentName = ref('');
const joinId = ref('');
const newPlayerName = ref('');
const isCaptain = ref(false);
const currentView = ref<'groups' | 'finals'>('groups');

// Modals & UI
const showUmaModal = ref(false);
const showPlayerOrUmaName = ref(true);
const saving = ref(false);

// Auth & Init
const init = async () => {
  // Check for custom token passed via global variable (common in some embedded scenarios)
  // In strict TS/Vite, we usually use window object or env vars, but kept simplified here:
  const initialToken = (window as any).__initial_auth_token;

  if (initialToken) {
    await signInWithCustomToken(auth, initialToken);
  } else {
    await signInAnonymously(auth);
  }

  // 1. Check if ID is in the URL (First priority)
  const urlParams = new URLSearchParams(window.location.search);
  let tid = urlParams.get('tid');

  if (tid) {
    // Found in URL? Save it to browser storage for safety
    sessionStorage.setItem('active_tid', tid);

    // CLEAN THE URL IMMEDIATELY
    // This removes '?tid=...' from the address bar without reloading the page
    window.history.replaceState({}, document.title, window.location.pathname);
  } else {
    // Not in URL? Check if we have one saved from before (handling page refreshes)
    tid = sessionStorage.getItem('active_tid');
  }

  if (tid) {
    subscribeToTournament(tid);
  } else {
    loading.value = false;
  }
};

const subscribeToTournament = (id: string) => {
  loading.value = true;
  onSnapshot(getTournamentRef(id), (docSnap) => {
    if (docSnap.exists()) {
      tournament.value = docSnap.data() as Tournament;

      // Fix: Only auto-switch to finals once
      if(!hasInitialViewLoaded.value && tournament.value.stage === 'finals') {
        currentView.value = 'finals';
        hasInitialViewLoaded.value = true;
      }
    } else {
      alert('Tournament not found');
      window.history.pushState({}, document.title, window.location.pathname);
    }
    loading.value = false;
  }, (error) => {
    console.error("Sync error:", error);
    loading.value = false;
  });
};

// Actions
const createTournament = async () => {
  const id = Math.random().toString(36).substring(2, 8).toUpperCase();
  const newDoc: Tournament = {
    id,
    name: newTournamentName.value,
    status: 'registration',
    stage: 'groups',
    players: [],
    teams: [],
    races: [],
    createdAt: new Date().toISOString()
  };

  await setDoc(getTournamentRef(id), newDoc);
  // NEW: Save to storage so it persists on refresh
  sessionStorage.setItem('active_tid', id);
  subscribeToTournament(id);
  // window.history.pushState({}, '', `?tid=${id}`);
};

const joinTournament = () => {
  if(!joinId.value) return;
  subscribeToTournament(joinId.value);
  joinId.value = '';
  // window.history.pushState({}, '', `?tid=${joinId.value}`);
};

const exitTournament = () => {
  // NEW: Clear the saved ID
  sessionStorage.removeItem('active_tid');

  tournament.value = null;
  window.history.pushState({}, '', window.location.pathname);
};

const copyId = () => {
  if(tournament.value) {
    navigator.clipboard.writeText(tournament.value.id);
    alert("ID Copied!");
  }
};

const copyLink = () => {
  if(tournament.value) {
    navigator.clipboard.writeText(window.location.href + '?tid=' + tournament.value.id);
    alert("Link Copied!");
  }
};

// Registration
const addPlayer = async () => {
  if(!newPlayerName.value || !tournament.value) return;
  const player: Player = {
    id: crypto.randomUUID(),
    name: newPlayerName.value,
    isCaptain: isCaptain.value,
    uma: ''
  };

  await updateDoc(getTournamentRef(tournament.value.id), {
    players: arrayUnion(player)
  });
  newPlayerName.value = '';
  isCaptain.value = false;
};

const removePlayer = async (pid: string) => {
  if(!tournament.value) return;
  const newPlayers = tournament.value.players.filter(p => p.id !== pid);
  await updateDoc(getTournamentRef(tournament.value.id), {
    players: newPlayers
  });
};

const submitUmas = async () => {
  if(!tournament.value) return;
  const newPlayers = tournament.value.players.map(p => ({...p})); // Shallow copy
  await updateDoc(getTournamentRef(tournament.value.id), {
    players: newPlayers
  });
  showUmaModal.value = false;
};

// Validation
const validTeamCount = computed(() => {
  if(!tournament.value) return false;
  const caps = tournament.value.players.filter(p => p.isCaptain).length;
  return caps >= 3 && caps <= 6;
});

const validTotalPlayers = computed(() => {
  if(!tournament.value) return false;
  const caps = tournament.value.players.filter(p => p.isCaptain).length;
  return tournament.value.players.length === (caps * 3);
});

const canStartDraft = computed(() => validTeamCount.value && validTotalPlayers.value);

// Draft
const startDraft = async () => {
  if(!tournament.value) return;
  const captains = tournament.value.players.filter(p => p.isCaptain);
  const shuffledCaptains = [...captains].sort(() => Math.random() - 0.5);
  const groupCaptains = [...captains].sort(() => Math.random() - 0.5);

  const teams: Team[] = shuffledCaptains.map((cap) => ({
    id: crypto.randomUUID(),
    captainId: cap.id,
    memberIds: [],
    name: `Team ${cap.name}`,
    points: 0,
    finalsPoints: 0,
    group: groupCaptains.indexOf(cap) < 3 ? 'A' : 'B'
  }));

  const draftOrder: string[] = [];
  for(let i=0; i<teams.length; i++) draftOrder.push(teams[i]!.id);
  for(let i=teams.length-1; i>=0; i--) draftOrder.push(teams[i]!.id);

  await updateDoc(getTournamentRef(tournament.value.id), {
    status: 'draft',
    teams: teams,
    draft: {
      order: draftOrder,
      currentIdx: 0
    }
  });
};

const availablePlayers = computed(() => {
  if(!tournament.value) return [];
  const assignedIds = new Set<string>();
  tournament.value.teams.forEach(t => t.memberIds.forEach(m => assignedIds.add(m)));
  return tournament.value.players.filter(p => !p.isCaptain && !assignedIds.has(p.id));
});

const currentDrafter = computed(() => {
  if(!tournament.value?.draft) return null;
  const teamId = tournament.value.draft.order[tournament.value.draft.currentIdx];
  const team = tournament.value.teams.find(t => t.id === teamId);
  return team ? { ...team, name: getPlayerName(team.captainId), teamName: team.name } : null;
});

const draftPreview = computed(() => {
  if(!tournament.value?.draft) return [];
  const d = tournament.value.draft;
  return d.order.slice(d.currentIdx, d.currentIdx + 5);
});

const draftPlayer = async (player: Player) => {
  if(!tournament.value || !tournament.value.draft) return;
  const t = tournament.value;
  const currentTeamId = t.draft?.order[t.draft?.currentIdx];
  const teamIndex = t.teams.findIndex(tm => tm.id === currentTeamId);

  const updatedTeams = [...t.teams];
  updatedTeams[teamIndex]?.memberIds.push(player.id);

  const nextIdx = t.draft!.currentIdx! + 1;

  const updates: any = {
    teams: updatedTeams,
    'draft.currentIdx': nextIdx
  };

  if(nextIdx >= t.draft!.order!.length) {
    updates.status = 'active';
  }

  await updateDoc(getTournamentRef(t.id), updates);
};

// Data Helpers
const getUmaList = () => [...UMAS].sort();
const getPlayerName = (id: string) => tournament.value?.players.find(p => p.id === id)?.name || 'Unknown';
const getPlayerUma = (id: string) => tournament.value?.players.find(p => p.id === id)?.uma || '';
const getPlayerNameOrUma = (id: string) => showPlayerOrUmaName.value ? getPlayerName(id) : getPlayerUma(id);

const shouldShowGroup = (group: string) => {
  if(currentView.value === 'finals') return false;
  if(tournament.value && tournament.value.teams.length < 6) return group === 'A';
  return true;
};

// Race Logic
const activeStagePlayers = (targetGroup: 'A' | 'B' | 'Finals') : Player[] => {
  if (!tournament.value) return [];

  let targetTeams: Team[] = [];
  if (currentView.value === 'finals' || targetGroup === 'Finals') {
    targetTeams = tournament.value.teams.filter(t => t.inFinals);
  } else if (targetGroup) {
    if(tournament.value.teams.length === 6) {
      targetTeams = tournament.value.teams.filter(t => t.group === targetGroup);
    } else {
      targetTeams = tournament.value.teams;
    }
  }

  let players: {id: string, name: string, isCaptain: boolean, uma: string}[] = [];
  targetTeams.forEach(t => {
    players.push({ id: t.captainId, name: getPlayerName(t.captainId), isCaptain: true, uma: getPlayerUma(t.captainId) });
    t.memberIds.forEach(mid => players.push({ id: mid, name: getPlayerName(mid), isCaptain: false, uma: getPlayerUma(mid) }));
  });
  return players;
};

const findRace = (group: string, raceNumber: number) => {
  if(!tournament.value) return undefined;
  const stage = currentView.value;
  return tournament.value.races.find(r =>
      r.stage === stage &&
      r.group === group &&
      r.raceNumber === raceNumber
  );
};

const getPlayerAtPosition = (group: any, raceNumber: number, position: number) => {
  const race = findRace(group, raceNumber);
  if (!race || !race.placements) return "";
  const entry = Object.entries(race.placements).find(([_, pos]) => pos == position);
  return entry ? entry[0] : "";
};

const getRaceTimestamp = (group: any, raceNumber: number) => {
  const race = findRace(group, raceNumber);
  if(!race) return "Not Started";
  return new Date(race.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

const updateRacePlacement = async (group: any, raceNumber: number, position: number, playerId: string) => {
  if(!tournament.value) return;
  saving.value = true;
  const stage = currentView.value;

  let currentRaces = [...tournament.value.races];
  let raceIndex = currentRaces.findIndex(r => r.stage === stage && r.group === group && r.raceNumber === raceNumber);
  let raceData: Race;

  if (raceIndex === -1) {
    raceData = {
      id: crypto.randomUUID(),
      stage: stage,
      group: group,
      raceNumber: raceNumber,
      timestamp: new Date().toISOString(),
      placements: {}
    };
    currentRaces.push(raceData);
    raceIndex = currentRaces.length - 1;
  } else {
    raceData = { ...currentRaces[raceIndex]! };
  }

  const newPlacements = { ...raceData.placements };

  if (playerId) {
    for (const [pid] of Object.entries(newPlacements)) {
      if (pid === playerId) delete newPlacements[pid];
    }
  }

  for (const [pid, pos] of Object.entries(newPlacements)) {
    if (pos == position) delete newPlacements[pid];
  }

  if (playerId) {
    newPlacements[playerId] = position;
  }

  raceData.placements = newPlacements;
  currentRaces[raceIndex] = raceData;

  // Recalculate
  const updatedTeams = tournament.value.teams.map(t => ({
    ...t,
    points: 0,
    finalsPoints: 0
  }));

  const getTeamIndex = (pid: string) => updatedTeams.findIndex(t => t.captainId === pid || t.memberIds.includes(pid));

  currentRaces.forEach(r => {
    for (const [pid, pos] of Object.entries(r.placements)) {
      const points = POINTS_SYSTEM[pos] || 0;
      const tIdx = getTeamIndex(pid);

      if (tIdx !== -1) {
        if (r.stage === 'finals') {
          updatedTeams[tIdx]!.finalsPoints += points;
        } else {
          updatedTeams[tIdx]!.points += points;
        }
      }
    }
  });

  try {
    await updateDoc(getTournamentRef(tournament.value.id), {
      races: currentRaces,
      teams: updatedTeams
    });
  } catch (e) {
    console.error("Error saving race:", e);
    alert("Failed to save result. Check console.");
  } finally {
    saving.value = false;
  }
};

// Stats & View Logic
const getRaceCount = (group: string) => {
  if(!tournament.value) return 0;
  return tournament.value.races.filter(r => r.stage === 'groups' && r.group === group).length;
};

const sortedRaces = computed(() => {
  if(!tournament.value || !tournament.value.races) return [];
  return [...tournament.value.races].sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
});

const getRaceResults = (race: Race) => {
  if(!race.placements) return [];
  const results = Object.entries(race.placements).map(([pid, pos]) => ({
    playerId: pid,
    name: getPlayerName(pid),
    position: pos,
    uma: getPlayerUma(pid)
  }));
  return results.sort((a,b) => a.position - b.position);
};

const getRaceResultsForPlayer = (playerId: string) => {
  if(!tournament.value || !tournament.value.races) return [];
  const stagePriority: Record<string, number> = { 'groups': 1, 'finals': 2 };

  const sortedRaces = [...tournament.value.races]
      .filter(r => Object.keys(r.placements).includes(playerId))
      .sort((a, b) => {
        const stageA = stagePriority[a.stage] || 99;
        const stageB = stagePriority[b.stage] || 99;
        if (stageA !== stageB) return stageA - stageB;
        return (a.raceNumber || 0) - (b.raceNumber || 0)
      });

  return sortedRaces.map(race => {
    const pos = race.placements[playerId];
    return {
      raceNumber: race.raceNumber,
      position: pos,
      points: pos ? (POINTS_SYSTEM[pos] || 0) : 0,
      stage: race.stage
    };
  });
}

const getPositionStyle = (pos?: number, stage?: string) => {
  if (!pos) return 'bg-slate-900 border-slate-800 text-slate-600';
  let style = 'bg-slate-800 border-slate-600 text-slate-400';
  if (pos === 1) style = 'bg-amber-500/10 border-amber-500 text-amber-500';
  if (pos === 2) style = 'bg-slate-300/10 border-slate-300 text-slate-300';
  if (pos === 3) style = 'bg-orange-700/10 border-orange-700 text-orange-600';

  if (stage === 'finals') {
    style += ' ring-2 ring-amber-500/30';
  }
  return style;
};

const getTotalPoints = (playerid: string) => {
  if(!tournament.value) return 0;
  let points = 0;
  tournament.value.races.forEach(race => {
    const placement = race.placements[playerid];
    if (placement) {
      points += POINTS_SYSTEM[placement]!;
    }
  })
  return points;
};

const sortedTeamsA = computed(() => {
  if(!tournament.value) return [];
  const teams = tournament.value.teams.filter(t => tournament.value!.teams.length < 6 || t.group === 'A');
  return teams.sort((a,b) => b.points - a.points);
});

const sortedTeamsB = computed(() => {
  if(!tournament.value) return [];
  const teams = tournament.value.teams.filter(t => t.group === 'B');
  return teams.sort((a,b) => b.points - a.points);
});

const sortedFinalsTeams = computed(() => {
  if(!tournament.value) return [];
  return tournament.value.teams.filter(t => t.inFinals).sort((a,b) => b.finalsPoints - a.finalsPoints);
});

const canAdvanceToFinals = computed(() => {
  if(!tournament.value || tournament.value.teams.length !== 6) return false;
  if(tournament.value.stage === 'finals') return false;
  const countA = getRaceCount('A');
  const countB = getRaceCount('B');
  return countA >= 5 && countB >= 5;
});

const canEndTournament = computed(() => {
  if(!tournament.value) return false;
  if(tournament.value.status === 'completed') return false;
  if(tournament.value.teams.length < 6) return getRaceCount('A') >= 5;
  const finalsRaces = tournament.value.races.filter(r => r.stage === 'finals').length;
  return finalsRaces >= 5;
});

const advanceToFinals = async () => {
  if(!tournament.value) return;
  const groupA = [...sortedTeamsA.value];
  const groupB = [...sortedTeamsB.value];

  const winnerA = groupA[0];
  const winnerB = groupB[0];
  const runnerUpA = groupA[1];
  const runnerUpB = groupB[1];

  let wildCard;
  if(runnerUpA!.points > runnerUpB!.points) wildCard = runnerUpA;
  else if(runnerUpB!.points > runnerUpA!.points) wildCard = runnerUpB;
  else wildCard = Math.random() > 0.5 ? runnerUpA : runnerUpB;

  const finalistsIds = [winnerA!.id, winnerB!.id, wildCard!.id];

  const updatedTeams = tournament.value.teams.map(t => ({
    ...t,
    inFinals: finalistsIds.includes(t.id),
    finalsPoints: 0
  }));

  await updateDoc(getTournamentRef(tournament.value.id), {
    teams: updatedTeams,
    stage: 'finals'
  });

  currentView.value = 'finals';
  hasInitialViewLoaded.value = true;
};

const endTournament = async () => {
  if(!tournament.value) return;
  await updateDoc(getTournamentRef(tournament.value.id), {
    status: 'completed'
  });
};

const getRankColor = (idx: number) => {
  if(idx === 0) return 'border-amber-400';
  if(idx === 1) return 'border-slate-400';
  if(idx === 2) return 'border-orange-700';
  return 'border-slate-700';
};

const canShowFinals = computed(() => tournament.value && tournament.value.stage === 'finals');

onMounted(() => {
  init();
});
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header class="border-b border-slate-700 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
      <div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div class="flex items-center gap-2 text-indigo-500">
          <i class="ph-fill ph-flag-checkered text-3xl"></i>
          <span class="text-2xl font-bold text-white heading tracking-widest">Raccoon Open</span>
        </div>
        <div v-if="tournament" class="flex items-center gap-4">
          <div class="hidden md:flex flex-col items-end">
            <button @click="copyId" class="text-sm font-mono text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
              Tournament ID <i class="ph ph-copy"></i>
            </button>
            <button @click="copyLink" class="text-sm font-mono text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
              Link <i class="ph ph-share"></i>
            </button>
          </div>
          <button @click="exitTournament" class="text-slate-400 hover:text-white">
            <i class="ph ph-sign-out text-xl"></i>
          </button>
        </div>
      </div>
    </header>

    <main class="flex-grow p-4 md:p-6 max-w-7xl mx-auto w-full">

      <div v-if="loading" class="flex justify-center items-center h-64">
        <i class="ph ph-spinner animate-spin text-4xl text-indigo-500"></i>
      </div>

      <div v-else-if="!tournament" class="max-w-md mx-auto mt-10 space-y-8">
        <div class="text-center space-y-2">
          <h1 class="text-5xl font-bold text-white">Race Manager</h1>
          <p class="text-slate-400">Organize Racc Open. Draft a Team, low-roll your career, mald a lot and race against the other teams.</p>
        </div>

        <div class="glass-panel p-6 rounded-xl space-y-6">
          <div>
            <label class="block text-sm font-medium text-slate-300 mb-2">Create New Tournament</label>
            <input v-model="newTournamentName" type="text" placeholder="e.g. Sunday Cup" class="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none mb-3">
            <button @click="createTournament" :disabled="!newTournamentName" class="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-colors heading text-lg">
              Start New Engine
            </button>
          </div>

          <div class="relative">
            <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-slate-700"></div></div>
            <div class="relative flex justify-center text-sm"><span class="px-2 bg-slate-800 text-slate-500 rounded">Or join existing</span></div>
          </div>

          <div>
            <div class="flex gap-2">
              <input v-model="joinId" type="text" placeholder="Paste Tournament ID" class="flex-1 bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none">
              <button @click="joinTournament" :disabled="!joinId" class="bg-slate-700 hover:bg-slate-600 text-white px-6 rounded-lg font-bold transition-colors">
                Join
              </button>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="tournament.status === 'registration'" class="space-y-6">
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 class="text-3xl font-bold text-white">{{ tournament.name }}</h2>
            <p class="text-slate-400">Phase: <span class="text-indigo-400 font-semibold">Registration</span></p>
          </div>
          <div class="bg-slate-800 px-4 py-2 rounded-lg border border-slate-700">
            <div class="text-sm text-slate-400">Total Players</div>
            <div class="text-2xl font-bold text-white font-mono">{{ tournament.players.length }} <span class="text-sm font-normal text-slate-500">/ 18 max</span></div>
          </div>
        </div>

        <div class="grid md:grid-cols-3 gap-6">
          <div class="md:col-span-1 glass-panel p-6 rounded-xl h-fit sticky top-20">
            <h3 class="text-xl font-bold mb-4 text-white">Add Participant</h3>
            <div class="space-y-4">
              <input v-model="newPlayerName" @keyup.enter="addPlayer" type="text" placeholder="Racer Name" class="w-full bg-slate-900 border border-slate-700 rounded p-3 text-white focus:outline-none focus:border-indigo-500">
              <div class="flex items-center gap-2 cursor-pointer" @click="isCaptain = !isCaptain">
                <div class="w-5 h-5 rounded border flex items-center justify-center transition-colors" :class="isCaptain ? 'bg-indigo-500 border-indigo-500' : 'border-slate-600'">
                  <i v-if="isCaptain" class="ph-bold ph-check text-xs text-white"></i>
                </div>
                <span class="text-sm select-none">Designate as Captain</span>
              </div>
              <button @click="addPlayer" :disabled="!newPlayerName" class="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded font-bold uppercase tracking-wider text-sm transition-colors">
                Add Racer
              </button>
            </div>

            <div class="mt-8 pt-6 border-t border-slate-700">
              <h4 class="text-sm font-bold text-slate-400 uppercase mb-2">Requirements</h4>
              <ul class="text-xs space-y-2 text-slate-500">
                <li class="flex items-center gap-2">
                  <i class="ph-fill" :class="validTeamCount ? 'ph-check-circle text-green-500' : 'ph-x-circle text-red-500'"></i>
                  3 to 6 Captains (Teams)
                </li>
                <li class="flex items-center gap-2">
                  <i class="ph-fill" :class="validTotalPlayers ? 'ph-check-circle text-green-500' : 'ph-x-circle text-red-500'"></i>
                  Total players = Teams × 3
                </li>
              </ul>
              <button @click="startDraft" :disabled="!canStartDraft" class="w-full mt-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-20 disabled:cursor-not-allowed text-white py-3 rounded font-bold uppercase tracking-wider transition-colors shadow-lg shadow-emerald-900/20">
                Start Draft
              </button>
            </div>
          </div>

          <div class="md:col-span-2 space-y-4">
            <div v-if="tournament.players.length === 0" class="text-center py-12 text-slate-600 border-2 border-dashed border-slate-800 rounded-xl">
              No racers added yet.
            </div>
            <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div v-for="player in tournament.players" :key="player.id" class="bg-slate-800 p-3 rounded-lg flex items-center justify-between group border border-slate-700/50 hover:border-indigo-500/50 transition-colors">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm" :class="player.isCaptain ? 'bg-amber-500 text-slate-900' : 'bg-slate-700 text-slate-300'">
                    <i v-if="player.isCaptain" class="ph-fill ph-crown"></i>
                    <span v-else>{{ player.name.charAt(0) }}</span>
                  </div>
                  <span class="font-medium">{{ player.name }}</span>
                </div>
                <button @click="removePlayer(player.id)" class="text-slate-600 hover:text-red-400 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <i class="ph-bold ph-trash"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="tournament.status === 'draft'" class="space-y-6">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-3xl font-bold text-white">Team Draft</h2>
            <p class="text-slate-400">Captains are picking their crew</p>
          </div>
          <div class="text-right">
            <div class="text-sm text-slate-400">Remaining Pool</div>
            <div class="text-2xl font-mono font-bold">{{ availablePlayers.length }}</div>
          </div>
        </div>

        <div class="bg-slate-800 p-4 rounded-xl border border-indigo-500/30 flex flex-col md:flex-row items-center justify-between gap-4 shadow-lg shadow-indigo-900/10">
          <div class="flex items-center gap-3">
            <span class="text-slate-400 uppercase text-xs font-bold tracking-wider">Current Pick:</span>
            <div class="flex items-center gap-2">
              <span class="text-amber-400 font-bold text-xl heading">{{ currentDrafter?.name }}</span>
              <span class="text-slate-500 text-sm">({{ currentDrafter?.teamName }})</span>
            </div>
          </div>
          <div class="flex gap-1">
            <div v-for="(_, idx) in draftPreview" :key="idx"
                 class="w-3 h-3 rounded-full transition-all"
                 :class="idx === 0 ? 'bg-amber-500 scale-125' : 'bg-slate-700'">
            </div>
          </div>
        </div>

        <div class="grid md:grid-cols-12 gap-6">
          <div class="md:col-span-8">
            <h3 class="text-lg font-bold mb-3 text-slate-300">Available Drivers</h3>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              <button v-for="player in availablePlayers" :key="player.id"
                      @click="draftPlayer(player)"
                      class="bg-slate-800 hover:bg-indigo-600 border border-slate-700 hover:border-indigo-400 p-4 rounded-lg transition-all text-left group relative overflow-hidden">
                <span class="relative z-10 font-medium group-hover:text-white">{{ player.name }}</span>
                <div class="absolute bottom-0 right-0 p-2 text-slate-700 group-hover:text-indigo-400 opacity-20">
                  <i class="ph-fill ph-steering-wheel text-4xl"></i>
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
                <span class="font-bold text-white">{{ team.name }}</span>
                <i v-if="currentDrafter?.id === team.captainId" class="ph-fill ph-pencil-simple text-amber-500 animate-pulse"></i>
              </div>
              <div class="space-y-2">
                <div class="flex items-center gap-2 text-sm text-amber-400">
                  <i class="ph-fill ph-crown"></i> {{ getPlayerName(team.captainId) }}
                </div>
                <div v-for="memberId in team.memberIds" :key="memberId" class="flex items-center gap-2 text-sm text-slate-300 ml-2">
                  <i class="ph-fill ph-user"></i> {{ getPlayerName(memberId) }}
                </div>
                <div v-for="n in (2 - team.memberIds.length)" :key="n" class="flex items-center gap-2 text-sm text-slate-700 ml-2 border-dashed border border-slate-800 p-1 rounded">
                  <span class="text-xs">Empty Seat</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="tournament.status === 'ban'" class="space-y-6"></div>

      <div v-else-if="tournament.status === 'active' || tournament.status === 'completed'" class="space-y-6">

        <div v-if="tournament.teams.length === 6" class="flex justify-center mb-6">
          <div class="bg-slate-800 p-1 rounded-lg flex gap-1">
            <button @click="currentView = 'groups'"
                    class="px-6 py-2 rounded-md font-bold transition-colors"
                    :class="currentView === 'groups' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'">
              Group Stage
            </button>
            <button @click="currentView = 'finals'"
                    :disabled="!canShowFinals"
                    class="px-6 py-2 rounded-md font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    :class="currentView === 'finals' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'">
              Finals
            </button>
          </div>
        </div>

        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 class="text-3xl font-bold text-white">
              <span v-if="tournament.teams.length < 6">Main Event</span>
              <span v-else>{{ currentView === 'groups' ? 'Group Stage' : 'Grand Finals' }}</span>
            </h2>
            <p class="text-slate-400" v-if="currentView === 'groups' && tournament.teams.length === 6">Top winner of each group + best runner-up advance.</p>
          </div>

          <div class="bg-slate-800 p-1 rounded-lg flex gap-1">
            <button @click="showPlayerOrUmaName = true"
                    class="px-6 py-2 rounded-md font-bold transition-colors"
                    :class="showPlayerOrUmaName === true ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'">
              Players
            </button>
            <button @click="showPlayerOrUmaName = false"
                    class="px-6 py-2 rounded-md font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    :class="showPlayerOrUmaName === false ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'">
              Umas
            </button>
          </div>
          <button @click="showUmaModal = true" class="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg shadow-indigo-900/20">
            <i class="ph-bold ph-gear"></i> Edit Umas
          </button>
        </div>

        <div class="grid md:grid-cols-2 gap-8">

          <div v-if="shouldShowGroup('A')">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-xl font-bold text-indigo-400 heading tracking-wide">{{ tournament?.teams.length === 6 ? 'Group A' : 'Standings' }}</h3>
              <span class="text-xs font-mono bg-slate-800 px-2 py-1 rounded text-slate-400">{{ getRaceCount('A') }} / 5 Races</span>
            </div>
            <div class="space-y-3">
              <div v-for="(team, idx) in sortedTeamsA" :key="team.id" class="bg-slate-800 rounded-lg p-4 border-l-4 flex justify-between items-center" :class="getRankColor(idx)">
                <div>
                  <div class="font-bold text-lg text-white">{{ team.name }}</div>
                  <div class="text-xs text-slate-400 flex gap-2">
                    <span v-for="pid in [team.captainId, ...team.memberIds]" :key="pid">{{ getPlayerNameOrUma(pid) }}</span>
                  </div>
                </div>
                <div class="text-2xl font-mono font-bold">{{ team.points }} <span class="text-xs font-sans font-normal text-slate-500">PTS</span></div>
              </div>
            </div>
          </div>

          <div v-if="shouldShowGroup('B')">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-xl font-bold text-rose-400 heading tracking-wide">Group B</h3>
              <span class="text-xs font-mono bg-slate-800 px-2 py-1 rounded text-slate-400">{{ getRaceCount('B') }} / 5 Races</span>
            </div>
            <div class="space-y-3">
              <div v-for="(team, idx) in sortedTeamsB" :key="team.id" class="bg-slate-800 rounded-lg p-4 border-l-4 flex justify-between items-center" :class="getRankColor(idx)">
                <div>
                  <div class="font-bold text-lg text-white">{{ team.name }}</div>
                  <div class="text-xs text-slate-400 flex gap-2">
                    <span v-for="pid in [team.captainId, ...team.memberIds]" :key="pid">{{ getPlayerNameOrUma(pid) }}</span>
                  </div>
                </div>
                <div class="text-2xl font-mono font-bold">{{ team.points }} <span class="text-xs font-sans font-normal text-slate-500">PTS</span></div>
              </div>
            </div>
          </div>

          <div v-if="currentView === 'finals'" class="col-span-2 max-w-2xl mx-auto w-full">
            <div class="text-center mb-6">
              <i class="ph-fill ph-trophy text-amber-500 text-5xl mb-2"></i>
            </div>
            <div class="space-y-4">
              <div v-for="(team, idx) in sortedFinalsTeams" :key="team.id" class="relative bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700 flex justify-between items-center shadow-xl">
                <div class="absolute -left-4 w-8 h-8 rounded-full bg-slate-900 border-2 border-slate-700 flex items-center justify-center font-bold font-mono text-slate-300">
                  {{ idx + 1 }}
                </div>
                <div>
                  <div class="font-bold text-2xl text-white heading">{{ team.name }}</div>
                  <div class="text-sm text-slate-400 flex gap-2 mt-1">
                    <span v-for="pid in [team.captainId, ...team.memberIds]" :key="pid" class="bg-slate-900 px-2 py-0.5 rounded">{{ getPlayerNameOrUma(pid) }}</span>
                  </div>
                </div>
                <div class="text-4xl font-mono font-bold text-indigo-400">{{ team.finalsPoints || 0 }}</div>
              </div>
            </div>

            <div v-if="tournament.status === 'completed'" class="mt-8 text-center p-6 bg-indigo-900/20 border border-indigo-500/30 rounded-xl">
              <h3 class="text-2xl font-bold text-indigo-300 mb-2">Tournament Complete</h3>
              <p class="text-slate-300">Winner: <span class="font-bold text-white">{{ sortedFinalsTeams[0]?.name }}</span></p>
            </div>
          </div>
        </div>

        <div v-if="canAdvanceToFinals" class="flex justify-center mt-8">
          <button @click="advanceToFinals" class="bg-amber-500 hover:bg-amber-600 text-slate-900 text-lg font-bold py-3 px-8 rounded-lg shadow-lg shadow-amber-900/20 animate-pulse">
            Initialize Finals Stage
          </button>
        </div>

        <div v-if="canEndTournament" class="flex justify-center mt-8">
          <button @click="endTournament" class="bg-slate-700 hover:bg-green-600 text-white text-lg font-bold py-3 px-8 rounded-lg transition-colors">
            Complete Tournament
          </button>
        </div>

        <div class="space-y-8">

          <div v-if="shouldShowGroup('A')">
            <div class="flex items-center gap-4 mb-4">
              <h3 class="text-2xl font-bold text-white tracking-wide">
                            <span class="text-indigo-400">
                                {{ tournament?.teams.length === 6 ? 'Group A' : 'Race' }}
                            </span> Results
              </h3>
              <div v-if="saving" class="text-xs font-mono text-emerald-400 animate-pulse">
                <i class="ph-bold ph-floppy-disk"></i> SAVING...
              </div>
            </div>

            <div class="overflow-x-auto pb-4">
              <div class="flex gap-4 min-w-max">
                <div v-for="raceNum in 5" :key="raceNum" class="w-64 bg-slate-800 rounded-xl border border-slate-700 overflow-hidden flex flex-col">
                  <div class="bg-slate-900/50 p-3 border-b border-slate-700 flex justify-between items-center">
                    <span class="font-bold text-indigo-400">Race {{ raceNum }}</span>
                    <span class="text-xs text-slate-500">{{ getRaceTimestamp('A', raceNum) }}</span>
                  </div>
                  <div class="p-2 space-y-1 flex-1">
                    <div v-for="pos in (activeStagePlayers('A').length)" :key="pos" class="flex items-center gap-2">
                      <div class="shrink-0 w-6 h-6 rounded flex items-center justify-center text-xs font-mono font-bold"
                           :class="getPositionStyle(pos)">
                        {{ pos }}
                      </div>
                      <select
                          :disabled="tournament.stage !== 'groups'"
                          :value="getPlayerAtPosition('A', raceNum, pos)"
                          @change="updateRacePlacement('A', raceNum, pos, ($event.target as HTMLSelectElement).value)"
                          class="min-w-0 flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all">
                        <option value="">- Select -</option>
                        <option v-for="player in activeStagePlayers('A')" :key="player.id" :value="player.id">
                          {{ player.name }} {{ player.uma ? `(${player.uma})` : '' }}
                        </option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="shouldShowGroup('B')">
            <div class="flex items-center gap-4 mb-4 border-t border-slate-700 pt-8">
              <h3 class="text-2xl font-bold text-white tracking-wide">
                <span class="text-rose-400">Group B</span> Results
              </h3>
            </div>

            <div class="overflow-x-auto pb-4">
              <div class="flex gap-4 min-w-max">
                <div v-for="raceNum in 5" :key="raceNum" class="w-64 bg-slate-800 rounded-xl border border-slate-700 overflow-hidden flex flex-col">
                  <div class="bg-slate-900/50 p-3 border-b border-slate-700 flex justify-between items-center">
                    <span class="font-bold text-rose-400">Race {{ raceNum }}</span>
                    <span class="text-xs text-slate-500">{{ getRaceTimestamp('B', raceNum) }}</span>
                  </div>
                  <div class="p-2 space-y-1 flex-1">
                    <div v-for="pos in (activeStagePlayers('B').length)" :key="pos" class="flex items-center gap-2">
                      <div class="shrink-0 w-6 h-6 rounded flex items-center justify-center text-xs font-mono font-bold"
                           :class="getPositionStyle(pos)">
                        {{ pos }}
                      </div>
                      <select
                          :disabled="tournament.stage !== 'groups'"
                          :value="getPlayerAtPosition('B', raceNum, pos)"
                          @change="updateRacePlacement('B', raceNum, pos, ($event.target as HTMLSelectElement).value)"
                          class="min-w-0 flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all">
                        <option value="">- Select -</option>
                        <option v-for="player in activeStagePlayers('B')" :key="player.id" :value="player.id">
                          {{ player.name }} {{ player.uma ? `(${player.uma})` : '' }}
                        </option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="currentView === 'finals'">
            <div class="flex items-center gap-4 mb-4">
              <h3 class="text-2xl font-bold text-white tracking-wide">
                <span class="text-amber-500">Finals</span> Results
              </h3>
            </div>

            <div class="overflow-x-auto pb-4">
              <div class="flex gap-4 min-w-max">
                <div v-for="raceNum in 5" :key="raceNum" class="w-64 bg-slate-800 rounded-xl border border-slate-700 overflow-hidden flex flex-col">
                  <div class="bg-slate-900/50 p-3 border-b border-slate-700 flex justify-between items-center">
                    <span class="font-bold text-amber-500">Race {{ raceNum }}</span>
                    <span class="text-xs text-slate-500">{{ getRaceTimestamp('Finals', raceNum) }}</span>
                  </div>
                  <div class="p-2 space-y-1 flex-1">
                    <div v-for="pos in (activeStagePlayers('Finals').length)" :key="pos" class="flex items-center gap-2">
                      <div class="shrink-0 w-6 h-6 rounded flex items-center justify-center text-xs font-mono font-bold"
                           :class="getPositionStyle(pos)">
                        {{ pos }}
                      </div>
                      <select
                          :disabled="tournament.stage !== 'finals'"
                          :value="getPlayerAtPosition('Finals', raceNum, pos)"
                          @change="updateRacePlacement('Finals', raceNum, pos, ($event.target as HTMLSelectElement).value)"
                          class="min-w-0 flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all">
                        <option value="">- Select -</option>
                        <option v-for="player in activeStagePlayers('Finals')" :key="player.id" :value="player.id">
                          {{ player.name }} {{ player.uma ? `(${player.uma})` : '' }}
                        </option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-12 pt-8 border-t border-slate-700">
          <h3 class="text-2xl font-bold text-white mb-6">Player Statistics</h3>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">

            <div v-for="player in tournament!.players!" :key="player.id"
                 class="bg-slate-800 rounded-xl p-4 border border-slate-700 hover:border-indigo-500/50 transition-all flex flex-col h-full">

              <div class="flex justify-between items-start mb-4 pb-3 border-b border-slate-700/50">
                <div>
                  <div class="font-bold text-white text-lg leading-tight">{{ player.name }}</div>
                  <div class="text-xs text-slate-500 mt-1" v-if="player.uma">{{ player.uma }}</div>
                </div>
                <div class="text-right">
                  <div class="text-2xl font-mono font-bold text-indigo-400">
                    {{ getTotalPoints(player.id) }}
                  </div>
                  <div class="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Total Pts</div>
                </div>
              </div>

              <div class="flex-1">
                <div class="grid grid-cols-5 gap-2">
                  <div v-for="(result, idx) in getRaceResultsForPlayer(player.id)" :key="idx" class="flex flex-col items-center gap-1">

                    <div class="w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold border shadow-sm"
                         :class="getPositionStyle(result.position, result.stage)">
                      {{ result.position || '-' }}
                    </div>

                    <span class="text-[10px] font-mono text-slate-400">
                      {{ result.points > 0 ? '+' + result.points : '0' }}
                    </span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        <div class="mt-12 pt-8 border-t border-slate-700">
          <h3 class="text-2xl font-bold text-white mb-6">Race History Log</h3>

          <div v-if="sortedRaces.length === 0" class="text-center py-8 text-slate-500 italic bg-slate-800/50 rounded-lg">
            No races recorded yet.
          </div>

          <div class="space-y-4">
            <div v-for="race in sortedRaces" :key="race.id" class="bg-slate-800 rounded-lg p-5 border border-slate-700 hover:border-indigo-500/30 transition-colors">
              <div class="flex justify-between items-start mb-4">
                <div class="flex items-center gap-3">
                                <span class="px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider shadow-sm"
                                      :class="race.stage === 'finals' ? 'bg-amber-900/50 text-amber-200 border border-amber-700/50' : 'bg-indigo-900/50 text-indigo-200 border border-indigo-700/50'">
                                    {{ race.stage === 'finals' ? 'Grand Finals' : (tournament?.teams.length === 6 ? 'Group ' + race.group : 'Main Event') }}
                                </span>
                  <span class="text-slate-400 text-sm flex items-center gap-1">
                                    <i class="ph-bold ph-clock"></i>
                                    {{ new Date(race.timestamp).toLocaleString() }}
                                </span>
                </div>
              </div>

              <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                <div v-for="result in getRaceResults(race)" :key="result.playerId"
                     class="text-sm rounded px-2 py-1.5 flex items-center gap-2 border"
                     :class="result.position === 1 ? 'bg-amber-500/10 border-amber-500/50 text-amber-100' : 'bg-slate-900 border-slate-700 text-slate-300'">
                  <span class="font-mono w-5 font-bold" :class="result.position === 1 ? 'text-amber-400' : 'text-slate-500'">{{ result.position }}</span>
                  <span class="truncate">{{ result.name }} - {{ result.uma }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

    </main>

    <div v-if="showUmaModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div class="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
        <div class="flex justify-between items-center mb-6">
          <h3 class="text-2xl font-bold text-white">Edit Umas</h3>
          <button @click="submitUmas" class="text-slate-400 hover:text-white"><i class="ph-bold ph-x text-xl"></i></button>
        </div>

        <div class="space-y-6">
          <p class="text-sm text-slate-400">Enter Umas used by players.</p>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div v-for="player in tournament!.players" :key="player.id" class="flex items-center justify-between bg-slate-800 p-3 rounded border border-slate-700">
              <span class="text-sm font-medium truncate w-32">{{ player.name }}</span>
              <select
                  v-model="player.uma"
                  class="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all">
                <option value="">- Select -</option>
                <option v-for="uma in getUmaList()" :key="player.id" :value="uma">
                  {{ uma }}
                </option>
              </select>
            </div>
          </div>

          <div class="pt-4 border-t border-slate-700 flex justify-end gap-3">
            <button @click="submitUmas" class="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded font-bold">Submit Umas</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>