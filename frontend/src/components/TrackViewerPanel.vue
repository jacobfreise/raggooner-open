<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import type { Tournament } from '../types';
import { TRACK_DICT } from '../utils/trackData';
import { generateAnnouncementText } from '../utils/announcementUtils';

const props = defineProps<{
  isOpen: boolean;
  tournament: Tournament;
}>();

defineEmits(['close']);

// Block background scrolling when drawer is open
watch(() => props.isOpen, (open) => {
  if (open) {
    document.body.classList.add('overflow-hidden');
  } else {
    document.body.classList.remove('overflow-hidden');
  }
}, { immediate: true });

onUnmounted(() => {
  document.body.classList.remove('overflow-hidden');
});

const track = computed(() => {
  const id = props.tournament.selectedTrack;
  if (!id) return null;
  return Object.values(TRACK_DICT).find(t => t.id === id) || null;
});

const condition = computed(() => props.tournament.selectedCondition || null);

const showCopySuccess = ref(false);
const showCopyImageSuccess = ref(false);

const copyAnnouncement = async () => {
    const text = generateAnnouncementText(props.tournament, track.value, condition.value);
    try {
        await navigator.clipboard.writeText(text);
        showCopySuccess.value = true;
        setTimeout(() => { showCopySuccess.value = false; }, 2500);
    } catch (e) { console.error('Clipboard failed', e); }
};

const copyTrackImage = async () => {
    if (!track.value) return;
    try {
        const blob = await fetch(`/assets/tracks/${track.value.id}.png`).then(r => r.blob());
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        showCopyImageSuccess.value = true;
        setTimeout(() => { showCopyImageSuccess.value = false; }, 2500);
    } catch (e) { console.error('Clipboard image failed', e); }
};

const getSurfaceBadgeClass = (surface: string) =>
    surface === 'Turf'
        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
        : 'bg-amber-500/20 text-amber-300 border-amber-500/50';

const getDirectionIcon = (dir: string) =>
    dir === 'left' ? 'ph-arrow-arc-left' : (dir === 'straight' ? 'ph-arrow-right' : 'ph-arrow-arc-right');

const getWeatherIcon = (w: string) => {
  switch (w) {
    case 'Sunny': return 'ph-sun';
    case 'Cloudy': return 'ph-cloud';
    case 'Rainy': return 'ph-cloud-rain';
    case 'Snowy': return 'ph-snowflake';
    default: return 'ph-cloud';
  }
};

const getSeasonIcon = (s: string) => {
  switch (s) {
    case 'Spring': return 'ph-flower-tulip';
    case 'Summer': return 'ph-sun-horizon';
    case 'Fall': return 'ph-leaf';
    case 'Winter': return 'ph-snowflake';
    default: return 'ph-calendar';
  }
};
</script>

<template>
  <Teleport to="body">
    <!-- Sliding Drawer -->
    <Transition
        enter-active-class="transition duration-300 ease-out"
        enter-from-class="translate-x-full"
        enter-to-class="translate-x-0"
        leave-active-class="transition duration-200 ease-in"
        leave-from-class="translate-x-0"
        leave-to-class="translate-x-full"
    >
      <div v-if="isOpen" class="fixed inset-y-0 right-0 z-[100] w-full md:w-2/3 bg-slate-900 shadow-2xl border-l border-slate-700 flex flex-col">
        
        <!-- Header -->
        <div class="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-800/30">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
              <i class="ph-bold ph-map-trifold text-2xl"></i>
            </div>
            <div>
              <h3 class="text-xl font-black text-white uppercase tracking-tighter">Track Information</h3>
              <p v-if="track" class="text-xs text-indigo-400/70 font-bold uppercase tracking-widest">{{ track.location }} — {{ track.distance }}m</p>
            </div>
          </div>
          
          <div class="flex items-center gap-2">
            <template v-if="track">
              <button @click="copyAnnouncement"
                  class="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg border transition-all"
                  :class="showCopySuccess
                    ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/40'
                    : 'bg-slate-800 text-slate-400 hover:text-white border-slate-700'">
                <i :class="showCopySuccess ? 'ph-bold ph-check' : 'ph-bold ph-copy'"></i>
                <span class="hidden sm:inline">{{ showCopySuccess ? 'Copied!' : 'Copy Announcement' }}</span>
              </button>
              <button @click="copyTrackImage"
                  class="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg border transition-all"
                  :class="showCopyImageSuccess
                    ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/40'
                    : 'bg-slate-800 text-slate-400 hover:text-white border-slate-700'">
                <i :class="showCopyImageSuccess ? 'ph-bold ph-check' : 'ph-bold ph-image'"></i>
                <span class="hidden sm:inline">{{ showCopyImageSuccess ? 'Copied!' : 'Copy Image' }}</span>
              </button>
            </template>
            <button @click="$emit('close')" class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-slate-800 text-slate-400 hover:text-white transition-colors ml-2">
              <i class="ph-bold ph-x text-xl"></i>
            </button>
          </div>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto p-6 space-y-8">
          <div v-if="!track" class="text-center py-20 text-slate-500">
            <i class="ph-fill ph-map-trifold text-6xl mb-4 block opacity-20"></i>
            <p class="text-lg font-bold">No track selected yet.</p>
          </div>

          <div v-else class="space-y-4 animate-fade-in">
            <!-- Seamless Header & Info -->
            <div class="text-center space-y-3">
              <div>
                <h2 class="text-2xl font-black text-white uppercase tracking-tighter drop-shadow-lg">
                  {{ track.location }}
                </h2>
                <div class="h-0.5 w-12 bg-indigo-500 mx-auto mt-0.5 rounded-full"></div>
              </div>

              <!-- Compact Info Bar (No Block) -->
              <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 py-1">
                <!-- Track Specs -->
                <div class="flex items-center gap-2">
                  <div class="flex flex-col items-center">
                    <span class="text-[7px] uppercase font-black text-slate-500 tracking-tighter">Dist</span>
                    <span class="text-xs font-black text-slate-200 leading-none">{{ track.distance }}m</span>
                  </div>
                  <div class="w-px h-4 bg-slate-800"></div>
                  <div class="flex flex-col items-center">
                    <span class="text-[7px] uppercase font-black text-slate-500 tracking-tighter">Type</span>
                    <span class="text-xs font-black text-slate-200 leading-none">{{ track.distanceType }}</span>
                  </div>
                  <div class="w-px h-4 bg-slate-800"></div>
                  <div class="flex flex-col items-center">
                    <span class="text-[7px] uppercase font-black text-slate-500 tracking-tighter">Surf</span>
                    <span class="text-xs font-black leading-none" :class="track.surface === 'Turf' ? 'text-emerald-500/80' : 'text-amber-500/80'">{{ track.surface }}</span>
                  </div>
                  <div class="w-px h-4 bg-slate-800"></div>
                  <div class="flex flex-col items-center">
                    <span class="text-[7px] uppercase font-black text-slate-500 tracking-tighter">Dir</span>
                    <div class="flex items-center gap-1 text-xs font-black text-slate-200 leading-none">
                      <i class="ph-bold" :class="getDirectionIcon(track.direction)"></i>
                      {{ track.direction === 'straight' ? 'Str' : track.direction.charAt(0).toUpperCase() }}
                    </div>
                  </div>
                </div>

                <!-- Subtle divider -->
                <div class="hidden sm:block w-px h-6 bg-slate-800 mx-1"></div>

                <!-- Conditions -->
                <div v-if="condition" class="flex items-center gap-3">
                  <div class="flex flex-col items-center">
                    <span class="text-[7px] uppercase font-black text-orange-500/50 tracking-tighter">Ground</span>
                    <span class="text-xs font-bold text-orange-200/80 leading-none">{{ condition.ground }}</span>
                  </div>
                  <div class="flex flex-col items-center">
                    <span class="text-[7px] uppercase font-black text-sky-500/50 tracking-tighter">Weather</span>
                    <div class="flex items-center gap-1 text-xs font-bold text-sky-200/80 leading-none">
                      <i class="ph-fill text-[9px]" :class="getWeatherIcon(condition.weather)"></i>
                      {{ condition.weather }}
                    </div>
                  </div>
                  <div class="flex flex-col items-center">
                    <span class="text-[7px] uppercase font-black text-pink-500/50 tracking-tighter">Season</span>
                    <div class="flex items-center gap-1 text-xs font-bold text-pink-200/80 leading-none">
                      <i class="ph-fill text-[9px]" :class="getSeasonIcon(condition.season)"></i>
                      {{ condition.season }}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Visuals -->
            <div class="space-y-6">
              <div class="space-y-3">
                <div class="rounded-2xl overflow-hidden border-2 border-slate-700 bg-slate-950 shadow-2xl">
                  <img :src="`/assets/tracks/${track.id}.png`"
                       class="w-full object-contain"
                       :alt="track.location" />
                </div>
              </div>

              <div class="space-y-3">
                <div class="rounded-2xl overflow-hidden border-2 border-slate-700 bg-slate-950 shadow-2xl relative group/sim">
                  <div class="absolute inset-0 bg-indigo-500/5 opacity-0 group-hover/sim:opacity-100 transition-opacity pointer-events-none"></div>
                  <img :src="`/assets/tracks/${track.id}-sim.png`"
                       class="w-full object-contain"
                       :alt="`${track.location} simulation`" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="p-6 border-t border-slate-800 bg-slate-950/50">
          <button @click="$emit('close')" class="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg transition-colors uppercase tracking-widest text-sm">
            Close Panel
          </button>
        </div>
      </div>
    </Transition>

    <!-- Backdrop -->
    <Transition
        enter-active-class="transition duration-300 ease-out"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition duration-200 ease-in"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
    >
      <div v-if="isOpen" @click="$emit('close')" class="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm"></div>
    </Transition>
  </Teleport>
</template>
