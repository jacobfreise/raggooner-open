<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Tournament } from '../types';
import { TRACK_DICT } from '../utils/trackData';
import { generateAnnouncementText } from '../utils/announcementUtils';

const props = defineProps<{
  isOpen: boolean;
  tournament: Tournament;
}>();

defineEmits(['close']);

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
  <div
      class="fixed right-0 top-0 h-full w-full md:w-2/3 bg-slate-900 border-l border-slate-700 shadow-2xl z-[90] transform transition-transform duration-300 flex flex-col"
      :class="isOpen ? 'translate-x-0' : 'translate-x-full'">

    <div class="flex items-center justify-between p-4 border-b border-slate-700">
      <h3 class="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
        <i class="ph-fill ph-map-trifold text-indigo-400"></i>
        Track Info
      </h3>
      <template v-if="track">
        <button @click="copyAnnouncement"
            class="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-md border transition-colors mr-1 ml-3"
            :class="showCopySuccess
              ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/40'
              : 'bg-slate-800 text-slate-400 hover:text-white border-slate-700'">
          <i :class="showCopySuccess ? 'ph-bold ph-check' : 'ph-bold ph-copy'"></i>
          {{ showCopySuccess ? 'Copied!' : 'Copy Text' }}
        </button>
        <button @click="copyTrackImage"
            class="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-md border transition-colors mr-auto"
            :class="showCopyImageSuccess
              ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/40'
              : 'bg-slate-800 text-slate-400 hover:text-white border-slate-700'">
          <i :class="showCopyImageSuccess ? 'ph-bold ph-check' : 'ph-bold ph-image'"></i>
          {{ showCopyImageSuccess ? 'Copied!' : 'Copy Image' }}
        </button>
      </template>
      <button @click="$emit('close')" class="text-slate-500 hover:text-white transition-colors">
        <i class="ph-bold ph-x"></i>
      </button>
    </div>

    <div class="flex-1 overflow-y-auto p-4">
      <div v-if="!track" class="text-center py-12 text-slate-500">
        <i class="ph-fill ph-map-trifold text-4xl mb-3 block"></i>
        <p class="text-sm">No track selected yet.</p>
      </div>

      <div v-else class="space-y-4">
        <!-- Track name -->
        <div class="text-center">
          <h4 class="text-xl font-bold text-white">{{ track.location }}</h4>
          <p class="text-sm text-slate-400 mt-1">{{ track.distance }}m {{ track.distanceType }}</p>
          <div class="flex flex-wrap items-center justify-center gap-1.5 mt-2">
            <span class="text-xs font-bold px-2 py-0.5 rounded border bg-slate-800 text-slate-300 border-slate-600">
              {{ track.distance }}m
            </span>
            <span class="text-xs font-bold px-2 py-0.5 rounded border bg-slate-800 text-slate-300 border-slate-600 flex items-center gap-1">
              {{ track.distanceType }}
            </span>
            <span class="text-xs font-bold px-2 py-0.5 rounded border" :class="getSurfaceBadgeClass(track.surface)">
              {{ track.surface }}
            </span>
            <span class="text-xs font-bold px-2 py-0.5 rounded border bg-slate-800 text-slate-300 border-slate-600 flex items-center gap-1">
              <i class="ph-bold" :class="getDirectionIcon(track.direction)"></i>
              {{ track.direction === 'left' ? 'Left' : 'Right' }}
            </span>
            <template v-if="condition">
              <span class="text-xs font-bold px-2 py-0.5 rounded border bg-orange-500/20 text-orange-300 border-orange-500/50">
                {{ condition.ground }}
              </span>
              <span class="text-xs font-bold px-2 py-0.5 rounded border bg-sky-500/20 text-sky-300 border-sky-500/50 flex items-center gap-1">
                <i class="ph-fill" :class="getWeatherIcon(condition.weather)"></i>
                {{ condition.weather }}
              </span>
              <span class="text-xs font-bold px-2 py-0.5 rounded border bg-pink-500/20 text-pink-300 border-pink-500/50 flex items-center gap-1">
                <i class="ph-fill" :class="getSeasonIcon(condition.season)"></i>
                {{ condition.season }}
              </span>
            </template>
          </div>
        </div>

        <!-- Track image -->
        <div class="rounded-lg overflow-hidden border border-slate-700 bg-slate-950">
          <img :src="`/assets/tracks/${track.id}.png`"
               class="w-full object-contain"
               :alt="track.location" />
        </div>

        <!-- Sim image -->
        <div class="rounded-lg overflow-hidden border border-slate-700 bg-slate-950">
          <div class="text-[10px] text-slate-500 uppercase font-bold tracking-wider px-2 pt-2">Simulation</div>
          <img :src="`/assets/tracks/${track.id}-sim.png`"
               class="w-full object-contain"
               :alt="`${track.location} simulation`" />
        </div>


      </div>
    </div>
  </div>
</template>
