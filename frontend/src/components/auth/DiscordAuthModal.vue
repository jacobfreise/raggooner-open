<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import type { GlobalPlayer } from '../../types';
import PlayerSelector from '../PlayerSelector.vue';
import { useAuth } from '../../composables/useAuth';

const globalPlayers = ref<GlobalPlayer[]>([]);
const isFetchingPlayers = ref(true);

onMounted(async () => {
  try {
    const playersRef = collection(db, 'artifacts', 'default-app', 'public', 'data', 'players');
    const snap = await getDocs(playersRef);
    globalPlayers.value = snap.docs.map(d => ({ id: d.id, ...d.data() } as GlobalPlayer));
  } catch (e) {
    console.error('Failed to fetch players:', e);
  } finally {
    isFetchingPlayers.value = false;
  }
});

const { user, linkToPlayer, createAndLinkPlayer, logout } = useAuth();

const step = ref<'choice' | 'link' | 'create'>('choice');
const isSubmitting = ref(false);
const error = ref<string | null>(null);

const handleSelectExisting = async (player: GlobalPlayer) => {
  if (player.firebaseUid) {
    error.value = "This player is already linked to another account.";
    return;
  }
  
  isSubmitting.value = true;
  error.value = null;
  try {
    await linkToPlayer(player);
  } catch (e) {
    error.value = "Failed to link player. Please try again.";
  } finally {
    isSubmitting.value = false;
  }
};

const newName = ref('');
const submitCreate = async () => {
    if (!newName.value.trim()) return;
    isSubmitting.value = true;
    error.value = null;
    try {
        await createAndLinkPlayer(newName.value.trim());
    } catch (e) {
        error.value = "Failed to create player. Please try again.";
    } finally {
        isSubmitting.value = false;
    }
};

</script>

<template>
  <div class="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4">
    <div class="bg-slate-900 border border-slate-700 rounded-2xl p-8 max-w-lg w-full shadow-2xl relative overflow-hidden">
      
      <!-- Decorative Background -->
      <div class="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl"></div>
      <div class="absolute bottom-0 left-0 -mb-8 -ml-8 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl"></div>

      <div class="relative z-10">
        <div class="flex items-center gap-4 mb-8">
          <div class="h-16 w-16 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-900/40">
            <i class="ph-fill ph-discord-logo text-4xl text-white"></i>
          </div>
          <div>
            <h2 class="text-2xl font-black text-white tracking-tight">Discord Link Required</h2>
            <p class="text-slate-400">Welcome, <span class="text-indigo-400 font-bold">{{ user?.displayName }}</span>!</p>
          </div>
        </div>

        <div v-if="error" class="mb-6 p-4 bg-red-900/20 border border-red-500/30 rounded-xl flex items-center gap-3 text-red-400 text-sm animate-shake">
          <i class="ph-bold ph-warning-circle text-xl flex-shrink-0"></i>
          <p>{{ error }}</p>
        </div>

        <!-- STEP: Choice -->
        <div v-if="step === 'choice'" class="space-y-4 animate-fade-in">
          <p class="text-slate-300 leading-relaxed mb-6">
            To continue, you need to link your Discord account to a player profile. 
            Do you want to link to an existing profile or create a new one?
          </p>

          <button @click="step = 'link'" class="w-full group bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-indigo-500/50 p-4 rounded-xl transition-all flex items-center gap-4 text-left">
            <div class="h-12 w-12 rounded-lg bg-indigo-500/10 flex items-center justify-center group-hover:bg-indigo-500/20 transition-colors">
              <i class="ph-bold ph-link text-2xl text-indigo-400"></i>
            </div>
            <div class="flex-1">
              <div class="font-bold text-white">Link Existing Player</div>
              <div class="text-xs text-slate-500">Search for your name in our records</div>
            </div>
            <i class="ph-bold ph-caret-right text-slate-600 group-hover:text-indigo-400 transition-colors"></i>
          </button>

          <button @click="step = 'create'" class="w-full group bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-emerald-500/50 p-4 rounded-xl transition-all flex items-center gap-4 text-left">
            <div class="h-12 w-12 rounded-lg bg-emerald-500/10 flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">
              <i class="ph-bold ph-user-plus text-2xl text-emerald-400"></i>
            </div>
            <div class="flex-1">
              <div class="font-bold text-white">Create New Profile</div>
              <div class="text-xs text-slate-500">Start fresh with a new profile</div>
            </div>
            <i class="ph-bold ph-caret-right text-slate-600 group-hover:text-emerald-400 transition-colors"></i>
          </button>
        </div>

        <!-- STEP: Link -->
        <div v-if="step === 'link'" class="space-y-6 animate-fade-in">
          <div>
            <button @click="step = 'choice'" class="text-indigo-400 hover:text-indigo-300 text-sm font-bold flex items-center gap-1 mb-4 transition-colors">
              <i class="ph-bold ph-arrow-left"></i> Back
            </button>
            <h3 class="text-lg font-bold text-white mb-2">Search for your profile</h3>
            <p class="text-sm text-slate-400 mb-6">Type your player name to find and link your account.</p>
          </div>

          <PlayerSelector 
            app-id="default-app" 
            :players="globalPlayers" 
            @select="handleSelectExisting"
            placeholder="Search for your name..."
          />

          <div v-if="isSubmitting" class="flex justify-center py-4">
             <i class="ph ph-spinner animate-spin text-3xl text-indigo-500"></i>
          </div>
        </div>

        <!-- STEP: Create -->
        <div v-if="step === 'create'" class="space-y-6 animate-fade-in">
          <div>
            <button @click="step = 'choice'" class="text-indigo-400 hover:text-indigo-300 text-sm font-bold flex items-center gap-1 mb-4 transition-colors">
              <i class="ph-bold ph-arrow-left"></i> Back
            </button>
            <h3 class="text-lg font-bold text-white mb-2">Create new profile</h3>
            <p class="text-sm text-slate-400 mb-6">Enter the name you want to use for your player profile.</p>
          </div>

          <div class="space-y-4">
            <input 
              v-model="newName" 
              type="text" 
              placeholder="Player Name" 
              class="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-4 text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
              @keyup.enter="submitCreate"
            />
            
            <button 
              @click="submitCreate" 
              :disabled="!newName.trim() || isSubmitting"
              class="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-indigo-900/30 flex items-center justify-center gap-2"
            >
              <i v-if="isSubmitting" class="ph ph-spinner animate-spin"></i>
              <i v-else class="ph-bold ph-check"></i>
              <span>Create & Link Profile</span>
            </button>
          </div>
        </div>

        <div class="mt-12 pt-6 border-t border-slate-800 flex justify-center">
          <button @click="logout" class="text-slate-500 hover:text-red-400 text-xs font-bold transition-colors flex items-center gap-2">
            <i class="ph-bold ph-sign-out"></i>
            Cancel and Logout
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.3s ease-out;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.animate-shake {
  animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
}
@keyframes shake {
  10%, 90% { transform: translate3d(-1px, 0, 0); }
  20%, 80% { transform: translate3d(2px, 0, 0); }
  30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
  40%, 60% { transform: translate3d(4px, 0, 0); }
}
</style>
