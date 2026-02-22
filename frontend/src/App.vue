<script setup lang="ts">
import {onMounted, ref, provide, computed} from 'vue';
import { onAuthStateChanged, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { auth } from './firebase';
import { APP_VERSION } from './data/changelog';
import ChangelogModal from './components/ChangelogModal.vue';
import SuperAdminPanel from "./components/SuperAdminPanel.vue";
import {SUPERADMIN_UIDS} from "./utils/constants.ts";
// import SeasonSetup from "./components/SeasonSetup.vue";
// import Migrate from "./components/Migrate.vue";

const showChangelog = ref(false);
const hasNewUpdates = ref(false);
const previousVersion = ref('0.0.0');

const currentUserUid = ref<string | null>(null);
const isPanelOpen = ref(false);

const isSuperAdmin = computed(() => {
  return currentUserUid.value && SUPERADMIN_UIDS.includes(currentUserUid.value);
});

const init = async () => {
  onAuthStateChanged(auth, (user) => {
    currentUserUid.value = user?.uid || null;
  });

  const initialToken = (window as any).__initial_auth_token;
  if (initialToken) {
    await signInWithCustomToken(auth, initialToken);
  } else if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
};

const openChangelog = () => {
  showChangelog.value = true;
  hasNewUpdates.value = false;
  localStorage.setItem('last_seen_version', APP_VERSION);
};

const closeChangelog = () => {
  showChangelog.value = false;
  previousVersion.value = APP_VERSION;
};

// Share these with ALL router views (so any header can open the changelog)
provide('openChangelog', openChangelog);
provide('hasNewUpdates', hasNewUpdates);

onMounted(() => {
  init();
  const lastSeen = localStorage.getItem('last_seen_version');
  if (lastSeen) previousVersion.value = lastSeen;
  if (lastSeen !== APP_VERSION) hasNewUpdates.value = true;
});
</script>

<template>
  <div class="min-h-screen flex flex-col">


<!--          <SeasonSetup></SeasonSetup>-->
<!--          <Migrate></Migrate>-->

    <div v-if="isSuperAdmin"
         class="fixed left-0 top-1/2 -translate-y-1/2 z-[100] transition-transform duration-300"
         :class="isPanelOpen ? 'translate-x-80' : 'translate-x-0'">
      <button
          @click="isPanelOpen = !isPanelOpen"
          class="bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-r-lg shadow-lg border-y border-r border-indigo-400 flex items-center justify-center group">
        <i class="ph-bold ph-caret-right transition-transform duration-300" :class="isPanelOpen ? 'rotate-180' : ''"></i>
      </button>
    </div>

    <SuperAdminPanel
        v-if="isSuperAdmin"
        :is-open="isPanelOpen"
        @close="isPanelOpen = false"
    />

    <router-view class="flex-grow flex flex-col"></router-view>

    <footer class="border-t border-slate-800 bg-slate-900/50 py-8 mt-auto backdrop-blur-sm">
      <div class="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4">
        <div class="text-xs font-mono text-slate-600 flex items-center gap-2">
          <i class="ph-bold ph-code"></i>
          <span>
            Powered by <span class="text-emerald-500 font-bold">Vue</span> & <span class="text-amber-500 font-bold">Firebase</span>
          </span>
        </div>
        <div class="text-sm text-slate-400 flex items-center gap-2">
          <span>Created with <i class="ph-fill ph-heart text-rose-500 inline-block animate-pulse"></i> by</span>
          <a href="https://discord.com/users/131446525585784832" target="_blank" rel="noopener noreferrer" class="font-bold text-indigo-400 hover:text-white transition-colors flex items-center gap-1.5 group">
            Sumpfranze <i class="ph-fill ph-discord-logo text-lg group-hover:scale-110 transition-transform"></i>
          </a>
        </div>
      </div>
    </footer>

    <Transition enter-active-class="duration-200 ease-out" enter-from-class="opacity-0 scale-95" enter-to-class="opacity-100 scale-100" leave-active-class="duration-150 ease-in" leave-from-class="opacity-100 scale-100" leave-to-class="opacity-0 scale-95">
      <ChangelogModal v-if="showChangelog" :last-seen-version="previousVersion" @close="closeChangelog" />
    </Transition>
  </div>
</template>