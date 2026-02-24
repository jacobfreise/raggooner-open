<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref, toRef} from 'vue';
import type {Tournament} from '../types';
import {useHallOfFame} from "../composables/useHallOfFame.ts"; // Import your types

const props = defineProps<{
  tournament: Tournament;
}>();

const tournamentRef = toRef(props, 'tournament');
// Cycle Duration for category display
const CYCLE_DURATION = 10000

const { activeStats } = useHallOfFame(tournamentRef);

// --- View State ---
const isGridView = ref(false); // Default to cycling view
const currentIndex = ref(0);
let cycleInterval: ReturnType<typeof setInterval> | null = null;

const startCycle = () => {
  if (cycleInterval) clearInterval(cycleInterval);
  cycleInterval = setInterval(() => {
    if (!isGridView.value && activeStats.value.length > 0) {
      currentIndex.value = (currentIndex.value + 1) % activeStats.value.length;
    }
  }, CYCLE_DURATION); // Change category every 10 seconds
};

const stopCycle = () => {
  if (cycleInterval) clearInterval(cycleInterval);
};

const toggleView = () => {
  isGridView.value = !isGridView.value;
  if (!isGridView.value) {
    currentIndex.value = 0; // Reset to start when switching back
    startCycle();
  } else {
    stopCycle();
  }
};

const goToNext = () => {
  stopCycle();
  currentIndex.value = (currentIndex.value + 1) % activeStats.value.length;
  startCycle();
};

const goToPrevious = () => {
  stopCycle();
  currentIndex.value = currentIndex.value === 0
      ? activeStats.value.length - 1
      : currentIndex.value - 1;
  startCycle();
};

const currentStat = computed(() => {
  if (activeStats.value.length === 0) return null;
  return activeStats.value[currentIndex.value];
});

// Lifecycle
onMounted(() => {
  startCycle();
});
onUnmounted(() => {
  stopCycle();
});

</script>

<!-- ========================================
     UPDATED TEMPLATE - Supports Multiple Winners
     ======================================== -->

<template>
  <div v-if="activeStats.length > 0" class="animate-fade-in">
    <div class="mt-8 pt-8 border-t border-slate-700">

      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div class="flex items-center gap-3">
          <div class="h-8 w-1.5 bg-amber-500 rounded-full shadow-[0_0_15px_rgba(245,158,11,0.6)]"></div>
          <div>
            <h2 class="text-xl font-bold text-white uppercase tracking-widest">Hall of Fame</h2>
            <p class="text-xs text-slate-400 font-medium">Tournament Records & Superlatives</p>
          </div>
        </div>

        <button @click="toggleView"
                class="flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-xs font-bold uppercase tracking-wider"
                :class="isGridView ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'">
          <i class="ph-bold" :class="isGridView ? 'ph-squares-four' : 'ph-monitor-play'"></i>
          <span class="hidden sm:inline">{{ isGridView ? 'Grid View' : 'Cycling View' }}</span>
        </button>
      </div>

      <div v-if="!isGridView && currentStat" class="relative overflow-hidden rounded-2xl border border-slate-700 bg-slate-800/50 p-6 sm:p-10 min-h-[300px] flex items-center justify-center">

        <div class="absolute inset-0 bg-gradient-to-br opacity-80 transition-all duration-1000 ease-in-out"
             :class="currentStat.gradient"></div>

        <i :class="[currentStat.icon, currentStat.color]"
           class="ph-fill absolute -right-10 -bottom-10 text-[16rem] opacity-10 transition-all duration-700 ease-out pointer-events-none transform -rotate-12"></i>

        <Transition name="fade-slide" mode="out-in">
          <div :key="currentStat.id" class="relative z-10 w-full max-w-2xl mx-auto flex flex-col items-center text-center">

            <div class="mb-6 h-20 w-20 rounded-2xl bg-slate-900 border border-slate-700 flex items-center justify-center shadow-lg">
              <i :class="[currentStat.icon, currentStat.color]" class="ph-fill text-4xl drop-shadow-lg"></i>
            </div>

            <h3 class="text-3xl sm:text-4xl font-black uppercase tracking-widest text-white mb-2 leading-tight">
              {{ currentStat.title }}
            </h3>

            <p class="text-sm sm:text-base font-medium text-slate-400 max-w-md mx-auto mb-10 leading-relaxed">
              {{ currentStat.description }}
            </p>

            <div class="w-full flex flex-col items-center gap-4">
              <div class="text-xs font-bold text-slate-500 uppercase tracking-[0.2em]">
                {{ currentStat.hasMultipleWinners ? 'Winners' : 'Winner' }}
              </div>

              <div class="flex flex-wrap justify-center gap-3 w-full">
                <div v-for="(result, idx) in currentStat.results" :key="idx"
                     class="flex items-center justify-between gap-4 px-5 py-3 rounded-xl bg-slate-900/80 border border-slate-700 shadow-sm min-w-[280px]">

                  <span class="text-lg font-bold text-white truncate">
                    {{ result.winner.name }}
                  </span>

                  <div class="flex flex-col items-end">
                    <span class="text-sm font-black" :class="currentStat.color">
                      {{ result.value }}
                    </span>
                    <span class="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      {{ result.subtext }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </Transition>

        <div class="absolute inset-y-0 left-4 right-4 flex items-center justify-between pointer-events-none">
          <button
              @click="goToPrevious"
              class="pointer-events-auto h-10 w-10 rounded-full bg-slate-900/80 border border-slate-700
           hover:bg-slate-800 hover:border-indigo-500 transition-all text-white">
            <i class="ph-bold ph-caret-left"></i>
          </button>
          <button
              @click="goToNext"
              class="pointer-events-auto h-10 w-10 rounded-full bg-slate-900/80 border border-slate-700
           hover:bg-slate-800 hover:border-indigo-500 transition-all text-white">
            <i class="ph-bold ph-caret-right"></i>
          </button>
        </div>

<!--        Counter Indicator-->
        <div class="absolute top-4 right-4 flex gap-1.5">
          <div
              v-for="(stat, idx) in activeStats"
              :key="stat.id"
              class="h-1.5 rounded-full transition-all duration-300"
              :class="idx === currentIndex ? 'w-6 bg-indigo-500' : 'w-1.5 bg-slate-600'"
          ></div>
        </div>

<!--        Progress Bar -->
<!--        <div class="absolute bottom-0 left-0 h-1 bg-slate-700 w-full overflow-hidden">-->
<!--          <div :key="currentStat.id" class="h-full bg-indigo-500 animate-progress origin-left"></div>-->
<!--        </div>-->
      </div>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">

        <div v-for="stat in activeStats" :key="stat.id"
             class="group relative bg-slate-800 rounded-xl border border-slate-700 p-4 overflow-hidden hover:border-slate-600 transition-all hover:shadow-xl hover:-translate-y-1">

          <div class="absolute inset-0 bg-gradient-to-br to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"
               :class="stat.gradient"></div>

          <i :class="[stat.icon, stat.color]"
             class="ph-fill absolute -right-6 -bottom-6 text-9xl opacity-[0.08] group-hover:opacity-[0.13] group-hover:scale-110 group-hover:rotate-12 transition-all duration-700 ease-out pointer-events-none"></i>

          <div class="relative z-10 flex flex-col h-full">
            <div class="flex items-center gap-3 mb-6">
              <div class="h-12 w-12 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center shrink-0 shadow-sm group-hover:shadow-md group-hover:scale-105 transition-all duration-300">
                <i :class="[stat.icon, stat.color]" class="ph-fill text-2xl drop-shadow-lg"></i>
              </div>

              <div class="flex-1 min-w-0">
                <div class="text-sm font-black uppercase tracking-widest text-slate-100 group-hover:text-white transition-colors leading-tight break-words">
                  {{ stat.title }}
                </div>
                <div class="text-[10px] font-medium text-slate-500 leading-tight mt-1 line-clamp-2">
                  {{ stat.description }}
                </div>
              </div>
            </div>

            <div class="flex flex-col gap-2 mt-auto pl-1">
              <div class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">
                {{ stat.hasMultipleWinners ? 'Winners' : 'Winner' }}
              </div>

              <div v-if="!stat.hasMultipleWinners" class="flex items-center justify-between gap-2 w-full">
                <div class="text-base font-bold text-white group-hover:text-amber-50 leading-tight break-words min-w-0">
                  {{ stat.results[0]?.winner.name }}
                </div>
                <div class="shrink-0 flex flex-col items-end pl-2 max-w-[50%]">
                  <span class="text-xs font-bold text-white whitespace-nowrap">{{ stat.results[0]?.value }}</span>
                  <span class="text-[9px] font-bold uppercase tracking-wider text-slate-400 text-right leading-tight">{{ stat.results[0]?.subtext }}</span>
                </div>
              </div>

              <div v-else class="flex flex-col gap-1">
                <div v-for="(result, idx) in stat.results.slice(0, -1)" :key="idx"
                     class="text-sm font-bold text-white/90 leading-tight truncate">
                  {{ result.winner.name }},
                </div>
                <div class="flex items-center justify-between gap-2 w-full">
                  <div class="text-sm font-bold text-white/90 leading-tight break-words">
                    {{ stat.results[stat.results.length - 1]?.winner.name }}
                  </div>
                  <div class="shrink-0 flex flex-col items-end pl-2 max-w-[50%]">
                    <span class="text-xs font-bold text-white whitespace-nowrap">{{ stat.results[0]?.value }}</span>
                    <span class="text-[9px] font-bold uppercase tracking-wider text-slate-400 text-right leading-tight">{{ stat.results[0]?.subtext }}</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
/* Smooth transitions for the cycle view */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.5s ease;
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(15px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-15px);
}

/* Progress bar animation for the cycle view */
@keyframes progress {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}

.animate-progress {
  animation: progress 10s linear forwards;
}
/* Optional: Add animation for multiple winners */
.winner-enter-active,
.winner-leave-active {
  transition: all 0.3s ease;
}

.winner-enter-from,
.winner-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}
</style>
