<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { Tournament, FirestoreUpdate, Condition } from '../types';
import { useTournamentFlow } from '../composables/useTournamentFlow';
import { useTrackRoller, GROUNDS, WEATHERS, SEASONS, GROUND_WEATHER_MAP, WEATHER_GROUND_MAP, WEATHER_SEASON_MAP, SEASON_WEATHER_MAP } from '../composables/useTrackRoller';
import SlotReel from './shared/SlotReel.vue';

const props = defineProps<{
  tournament: Tournament;
  isAdmin: boolean;
  secureUpdate: (data: FirestoreUpdate<Tournament> | Record<string, any>) => Promise<void>;
}>();

const { advancePhase } = useTournamentFlow(
    computed(() => props.tournament) as any,
    props.secureUpdate
);

const {
    SURFACES, DISTANCES,
    allTracks,
    surfaceFilters, distanceFilters, directionFilters, locationFilters, maxPlayersFilters,
    groundFilters, weatherFilters, seasonFilters,
    allLocations, allMaxPlayers,
    filteredTracks, validConditionCombos,
    toggleFilter, toggleAll,
    showWeightsModal, openWeightsModal, saveWeights, weightPercent,
    draftGroundWeights, draftWeatherWeights, draftSeasonWeights, draftSurfaceWeights, draftDistanceWeights,
    conflictingDimensions, trackCombinationFallback, conditionCombinationFallback,
    trackFallbackDescription, conditionFallbackDescription, hasAnyWarning, rollableTrackCount,
    isRolling, rollerTrack, rollerCondition, rollerSettled,
    showRandomModal, slotReel, slotTranslateY,
    rollRandom,
    getWeatherIcon, getSeasonIcon, getSurfaceBadgeClass, getDirectionIcon,
} = useTrackRoller();

const rollerImageMode = ref<'gametora' | 'sim'>('gametora');

const confirmRolledTrack = async () => {
  if (!rollerTrack.value || !rollerCondition.value) return;
  await selectTrack(rollerTrack.value.id, rollerCondition.value);
};

// ── Manual Browse ──
const searchQuery = ref('');
const browseTracks = computed(() => {
  const raw = searchQuery.value.toLowerCase().trim();
  if (!raw) return allTracks.value;
  const keywords = raw.split(/\s+/).filter(Boolean);
  return allTracks.value.filter(t => {
    const haystack = `${t.location} ${t.id} ${t.distanceType} ${t.surface} ${t.distance} ${t.direction}`.toLowerCase();
    return keywords.every(kw => haystack.includes(kw));
  });
});

// Manual condition selection state (start with no selection)
const manualGround = ref<Condition['ground'] | null>(null);
const manualWeather = ref<Condition['weather'] | null>(null);
const manualSeason = ref<Condition['season'] | null>(null);

// Which options are available given current selections
const availableWeathers = computed(() => {
  let weathers = [...WEATHERS];
  if (manualGround.value) weathers = weathers.filter(w => (GROUND_WEATHER_MAP[manualGround.value!] || []).includes(w));
  if (manualSeason.value) weathers = weathers.filter(w => (SEASON_WEATHER_MAP[manualSeason.value!] || []).includes(w));
  return weathers;
});
const availableGrounds = computed(() => {
  let grounds = [...GROUNDS];
  if (manualWeather.value) grounds = grounds.filter(g => (WEATHER_GROUND_MAP[manualWeather.value!] || []).includes(g));
  return grounds;
});
const availableSeasons = computed(() => {
  let seasons = [...SEASONS];
  if (manualWeather.value) seasons = seasons.filter(s => (WEATHER_SEASON_MAP[manualWeather.value!] || []).includes(s));
  return seasons;
});

const isManualConditionComplete = computed(() => manualGround.value && manualWeather.value && manualSeason.value);

// Browse filters & pagination
const browseLocation = ref('');
const browsePage = ref(0);
const BROWSE_PAGE_SIZE = 9;

const browseFiltered = computed(() => {
  let tracks = browseTracks.value;
  if (browseLocation.value) {
    tracks = tracks.filter(t => t.location === browseLocation.value);
  }
  return tracks;
});

const totalBrowsePages = computed(() => Math.max(1, Math.ceil(browseFiltered.value.length / BROWSE_PAGE_SIZE)));

const pagedTracks = computed(() => {
  const start = browsePage.value * BROWSE_PAGE_SIZE;
  return browseFiltered.value.slice(start, start + BROWSE_PAGE_SIZE);
});

// Reset page when filters change
watch([searchQuery, browseLocation], () => { browsePage.value = 0; });

// ── Selection ──
const isSelecting = ref(false);

const selectTrack = async (trackId: string, condition: Condition) => {
  if (!props.isAdmin || isSelecting.value) return;
  isSelecting.value = true;
  try {
    await props.secureUpdate({
      selectedTrack: trackId,
      selectedCondition: { ...condition, id: `${condition.season}-${condition.weather}-${condition.ground}`.toLowerCase() },
    });
    await advancePhase();
  } finally {
    isSelecting.value = false;
  }
};

const selectTrackManual = async (trackId: string) => {
  if (!manualGround.value || !manualWeather.value || !manualSeason.value) return;
  await selectTrack(trackId, {
    id: trackId,
    ground: manualGround.value,
    weather: manualWeather.value,
    season: manualSeason.value,
  });
};

// ── View mode ──
const trackSelectionMode = ref<'browse' | 'roller'>('browse');
</script>

<template>
  <div class="space-y-8 animate-fade-in">
    <div class="text-center">
      <h2 class="text-3xl font-black text-white mb-2">Track Selection</h2>
      <p class="text-slate-400">{{ isAdmin ? 'Choose a track and conditions for this tournament.' : 'Waiting for admin to select a track...' }}</p>
    </div>

    <template v-if="isAdmin">
      <!-- Mode switch -->
      <div class="flex items-center justify-center">
        <div class="flex bg-slate-900 rounded-lg border border-slate-700 p-0.5">
          <button @click="trackSelectionMode = 'roller'"
                  class="px-4 py-2 rounded-md text-sm font-bold transition-colors flex items-center gap-2"
                  :class="trackSelectionMode === 'roller'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'">
            <i class="ph-fill ph-dice-three"></i>
            Random Roller
          </button>
          <button @click="trackSelectionMode = 'browse'"
                  class="px-4 py-2 rounded-md text-sm font-bold transition-colors flex items-center gap-2"
                  :class="trackSelectionMode === 'browse'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'">
            <i class="ph-fill ph-magnifying-glass"></i>
            Browse Tracks
          </button>
        </div>
      </div>

      <!-- ═══ RANDOM ROLLER — sidebar + main area ═══ -->
      <div v-if="trackSelectionMode === 'roller'" class="bg-slate-800/60 border border-slate-700 rounded-2xl p-6">
        <div class="flex flex-col lg:flex-row gap-6">
          <!-- Sidebar: Filters -->
          <div class="lg:w-56 shrink-0 space-y-4 lg:border-r lg:border-slate-700 lg:pr-6">
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <label class="text-xs text-slate-500 uppercase font-bold tracking-wider">Surface</label>
                <button @click="toggleAll(surfaceFilters, ['Turf', 'Dirt'])" class="text-[10px] text-slate-500 hover:text-indigo-400 transition-colors">
                  {{ surfaceFilters.size === 2 ? 'None' : 'All' }}
                </button>
              </div>
              <div class="flex flex-wrap gap-1.5">
                <button v-for="s in ['Turf', 'Dirt']" :key="s"
                        @click="toggleFilter(surfaceFilters, s)"
                        class="px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors"
                        :class="surfaceFilters.has(s)
                          ? 'bg-indigo-600/30 border-indigo-500/50 text-indigo-300'
                          : 'bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-600'">
                  {{ s }}
                </button>
              </div>
            </div>

            <div>
              <div class="flex items-center justify-between mb-1.5">
                <label class="text-xs text-slate-500 uppercase font-bold tracking-wider">Distance</label>
                <button @click="toggleAll(distanceFilters, ['Sprint', 'Mile', 'Medium', 'Long'])" class="text-[10px] text-slate-500 hover:text-indigo-400 transition-colors">
                  {{ distanceFilters.size === 4 ? 'None' : 'All' }}
                </button>
              </div>
              <div class="flex flex-wrap gap-1.5">
                <button v-for="d in ['Sprint', 'Mile', 'Medium', 'Long']" :key="d"
                        @click="toggleFilter(distanceFilters, d)"
                        class="px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors"
                        :class="distanceFilters.has(d)
                          ? 'bg-indigo-600/30 border-indigo-500/50 text-indigo-300'
                          : 'bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-600'">
                  {{ d }}
                </button>
              </div>
            </div>

            <div>
              <div class="flex items-center justify-between mb-1.5">
                <label class="text-xs text-slate-500 uppercase font-bold tracking-wider">Direction</label>
                <button @click="toggleAll(directionFilters, ['left', 'right', 'straight'])" class="text-[10px] text-slate-500 hover:text-indigo-400 transition-colors">
                  {{ directionFilters.size === 3 ? 'None' : 'All' }}
                </button>
              </div>
              <div class="flex flex-wrap gap-1.5">
                <button v-for="dir in ['left', 'right', 'straight']" :key="dir"
                        @click="toggleFilter(directionFilters, dir)"
                        class="px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors"
                        :class="directionFilters.has(dir)
                          ? 'bg-indigo-600/30 border-indigo-500/50 text-indigo-300'
                          : 'bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-600'">
                  <i class="ph-bold" :class="getDirectionIcon(dir)"></i>
                  {{ dir === 'left' ? 'Left' : (dir === 'straight' ? 'Straight' : 'Right') }}
                </button>
              </div>
            </div>

            <div>
              <div class="flex items-center justify-between mb-1.5">
                <label class="text-xs text-slate-500 uppercase font-bold tracking-wider">Location</label>
                <button @click="toggleAll(locationFilters, allLocations)" class="text-[10px] text-slate-500 hover:text-indigo-400 transition-colors">
                  {{ locationFilters.size === allLocations.length ? 'None' : 'All' }}
                </button>
              </div>
              <div class="flex flex-wrap gap-1.5">
                <button v-for="loc in allLocations" :key="loc"
                        @click="toggleFilter(locationFilters, loc)"
                        class="px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors"
                        :class="locationFilters.has(loc)
                          ? 'bg-indigo-600/30 border-indigo-500/50 text-indigo-300'
                          : 'bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-600'">
                  {{ loc }}
                </button>
              </div>
            </div>

            <div>
              <div class="flex items-center justify-between mb-1.5">
                <label class="text-xs text-slate-500 uppercase font-bold tracking-wider">Max Players</label>
                <button @click="maxPlayersFilters.size === allMaxPlayers.length ? maxPlayersFilters.clear() : allMaxPlayers.forEach(n => maxPlayersFilters.add(n))" class="text-[10px] text-slate-500 hover:text-indigo-400 transition-colors">
                  {{ maxPlayersFilters.size === allMaxPlayers.length ? 'None' : 'All' }}
                </button>
              </div>
              <div class="flex flex-wrap gap-1.5">
                <button v-for="n in allMaxPlayers" :key="n"
                        @click="maxPlayersFilters.has(n) ? maxPlayersFilters.delete(n) : maxPlayersFilters.add(n)"
                        class="px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors"
                        :class="maxPlayersFilters.has(n)
                          ? 'bg-indigo-600/30 border-indigo-500/50 text-indigo-300'
                          : 'bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-600'">
                  {{ n }}
                </button>
              </div>
            </div>

            <div class="border-t border-slate-700 pt-4">
              <div class="flex items-center justify-between mb-1.5">
                <label class="text-xs text-slate-500 uppercase font-bold tracking-wider">Ground</label>
                <button @click="toggleAll(groundFilters, GROUNDS)" class="text-[10px] text-slate-500 hover:text-indigo-400 transition-colors">
                  {{ groundFilters.size === GROUNDS.length ? 'None' : 'All' }}
                </button>
              </div>
              <div class="flex flex-wrap gap-1.5">
                <button v-for="g in GROUNDS" :key="g"
                        @click="toggleFilter(groundFilters, g)"
                        class="px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors"
                        :class="groundFilters.has(g)
                          ? 'bg-indigo-600/30 border-indigo-500/50 text-indigo-300'
                          : 'bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-600'">
                  {{ g }}
                </button>
              </div>
            </div>

            <div>
              <div class="flex items-center justify-between mb-1.5">
                <label class="text-xs text-slate-500 uppercase font-bold tracking-wider">Weather</label>
                <button @click="toggleAll(weatherFilters, WEATHERS)" class="text-[10px] text-slate-500 hover:text-indigo-400 transition-colors">
                  {{ weatherFilters.size === WEATHERS.length ? 'None' : 'All' }}
                </button>
              </div>
              <div class="flex flex-wrap gap-1.5">
                <button v-for="w in WEATHERS" :key="w"
                        @click="toggleFilter(weatherFilters, w)"
                        class="px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors"
                        :class="weatherFilters.has(w)
                          ? 'bg-indigo-600/30 border-indigo-500/50 text-indigo-300'
                          : 'bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-600'">
                  <i class="ph-fill" :class="getWeatherIcon(w)"></i>
                  {{ w }}
                </button>
              </div>
            </div>

            <div>
              <div class="flex items-center justify-between mb-1.5">
                <label class="text-xs text-slate-500 uppercase font-bold tracking-wider">Season</label>
                <button @click="toggleAll(seasonFilters, SEASONS)" class="text-[10px] text-slate-500 hover:text-indigo-400 transition-colors">
                  {{ seasonFilters.size === SEASONS.length ? 'None' : 'All' }}
                </button>
              </div>
              <div class="flex flex-wrap gap-1.5">
                <button v-for="s in SEASONS" :key="s"
                        @click="toggleFilter(seasonFilters, s)"
                        class="px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors"
                        :class="seasonFilters.has(s)
                          ? 'bg-indigo-600/30 border-indigo-500/50 text-indigo-300'
                          : 'bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-600'">
                  <i class="ph-fill" :class="getSeasonIcon(s)"></i>
                  {{ s }}
                </button>
              </div>
            </div>
          </div>

          <!-- Main: Roller Display -->
          <div class="flex-1 flex flex-col items-center gap-4">
            <!-- Image mode toggle -->
            <div class="flex items-center bg-slate-900 rounded-lg border border-slate-700 p-0.5">
              <button @click="rollerImageMode = 'gametora'"
                      class="px-3 py-1.5 rounded-md text-xs font-bold transition-colors"
                      :class="rollerImageMode === 'gametora'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-white'">
                Gametora
              </button>
              <button @click="rollerImageMode = 'sim'"
                      class="px-3 py-1.5 rounded-md text-xs font-bold transition-colors"
                      :class="rollerImageMode === 'sim'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-white'">
                Simulator
              </button>
            </div>

            <div class="relative w-full aspect-[16/10] bg-slate-900 rounded-xl border-2 overflow-hidden flex items-center justify-center"
                 :class="isRolling ? 'border-indigo-500 shadow-lg shadow-indigo-500/20' : rollerSettled ? 'border-emerald-500 shadow-lg shadow-emerald-500/20' : 'border-slate-700'">

              <template v-if="rollerTrack">
                <img :src="rollerImageMode === 'sim' ? `/assets/tracks/${rollerTrack.id}-sim.png` : `/assets/tracks/${rollerTrack.id}.png`"
                     :key="`${rollerTrack.id}-${rollerImageMode}`"
                     class="w-full h-full object-contain transition-opacity duration-75"
                     :class="isRolling ? 'opacity-80' : 'opacity-100'"
                     alt="Track" />
                <div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                  <div class="flex items-center justify-between">
                    <div>
                      <span class="text-white font-bold text-lg">{{ rollerTrack.location }}</span>
                      <span class="text-slate-400 text-sm ml-2">{{ rollerTrack.distance }}m</span>
                    </div>
                  </div>
                </div>
              </template>

              <template v-else>
                <div class="text-slate-600 text-center">
                  <i class="ph-fill ph-dice-three text-5xl mb-2 block"></i>
                  <span class="text-sm">Press Roll to pick a random track</span>
                </div>
              </template>
            </div>

            <!-- Rolled track info + conditions display -->
            <div v-if="rollerTrack && (isRolling || rollerSettled)"
                 class="flex flex-wrap items-center justify-center gap-2 transition-opacity"
                 :class="isRolling ? 'opacity-60' : 'opacity-100'">
              <span class="text-xs font-bold px-2.5 py-1 rounded-lg border bg-slate-800 text-slate-300 border-slate-600">
                {{ rollerTrack.distance }}m
              </span>
              <span class="text-xs font-bold px-2.5 py-1 rounded-lg border" :class="getSurfaceBadgeClass(rollerTrack.surface)">
                {{ rollerTrack.surface }}
              </span>
              <span class="text-xs font-bold px-2.5 py-1 rounded-lg border bg-indigo-500/20 text-indigo-300 border-indigo-500/50">
                {{ rollerTrack.distanceType }}
              </span>
              <span class="text-xs font-bold px-2.5 py-1 rounded-lg border bg-slate-800 text-slate-300 border-slate-600 flex items-center gap-1">
                <i class="ph-bold" :class="getDirectionIcon(rollerTrack.direction)"></i>
                {{ rollerTrack.direction === 'left' ? 'Left' : (rollerTrack.direction === 'straight' ? 'Straight' : 'Right') }}
              </span>
              <span class="text-xs font-bold px-2.5 py-1 rounded-lg border bg-slate-800 text-slate-300 border-slate-600 flex items-center gap-1">
                <i class="ph-bold ph-users"></i>
                {{ rollerTrack.maxPlayers }}
              </span>
              <template v-if="rollerCondition">
                <span class="text-xs font-bold px-2.5 py-1 rounded-lg border bg-orange-500/20 text-orange-300 border-orange-500/50">
                  {{ rollerCondition.ground }}
                </span>
                <span class="text-xs font-bold px-2.5 py-1 rounded-lg border bg-sky-500/20 text-sky-300 border-sky-500/50 flex items-center gap-1">
                  <i class="ph-fill" :class="getWeatherIcon(rollerCondition.weather)"></i>
                  {{ rollerCondition.weather }}
                </span>
                <span class="text-xs font-bold px-2.5 py-1 rounded-lg border bg-pink-500/20 text-pink-300 border-pink-500/50 flex items-center gap-1">
                  <i class="ph-fill" :class="getSeasonIcon(rollerCondition.season)"></i>
                  {{ rollerCondition.season }}
                </span>
              </template>
            </div>

            <div class="flex flex-col items-center gap-2">
            <div class="flex gap-3 items-center">
              <button @click="openWeightsModal"
                      title="Roll weights"
                      class="relative px-3 py-3 rounded-lg border bg-slate-900 transition-colors flex items-center"
                      :class="hasAnyWarning ? 'border-amber-500/60 text-amber-400 hover:border-amber-400' : 'border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'">
                <i class="ph-bold ph-gear"></i>
                <span v-if="hasAnyWarning" class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-slate-900"></span>
              </button>

              <button @click="rollRandom"
                      :disabled="isRolling || filteredTracks.length === 0 || validConditionCombos.length === 0"
                      class="w-36 justify-center px-6 py-3 rounded-lg font-bold transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      :class="isRolling
                        ? 'bg-indigo-700 text-indigo-200 cursor-wait'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/30'">
                <i class="ph-bold ph-shuffle" :class="{ 'animate-spin': isRolling }"></i>
                <span>{{ isRolling ? 'Rolling...' : 'Roll' }}</span>
                <span class="text-xs opacity-70">({{ rollableTrackCount }})</span>
              </button>

              <button @click="confirmRolledTrack"
                      :disabled="!rollerSettled || !rollerTrack || isSelecting"
                      class="w-36 justify-center px-6 py-3 rounded-lg font-bold transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed bg-emerald-600 text-white shadow-lg shadow-emerald-900/30"
                      :class="!rollerSettled || !rollerTrack ? '' : 'hover:bg-emerald-500'">
                <i class="ph-bold ph-check-circle"></i>
                Confirm
              </button>
            </div>

            <div v-if="hasAnyWarning" class="text-xs text-amber-400 space-y-1">
              <p v-if="conflictingDimensions.length > 0" class="flex items-center gap-1.5">
                <i class="ph-bold ph-warning shrink-0"></i>
                Rolling uniformly for {{ conflictingDimensions.join(', ') }} — all weights are 0
              </p>
              <p v-if="trackCombinationFallback" class="flex items-center gap-1.5">
                <i class="ph-bold ph-warning shrink-0"></i>
                No filtered tracks match {{ trackFallbackDescription }} — rolling uniformly across all filtered tracks
              </p>
              <p v-if="conditionCombinationFallback" class="flex items-center gap-1.5">
                <i class="ph-bold ph-warning shrink-0"></i>
                No valid condition exists for {{ conditionFallbackDescription }} — rolling uniformly across all filtered conditions
              </p>
            </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ═══ MANUAL BROWSE ═══ -->
      <div v-else class="bg-slate-800/60 border border-slate-700 rounded-2xl p-6 space-y-4">
        <!-- Condition selectors for manual pick -->
        <div class="flex flex-wrap gap-4 bg-slate-900 rounded-lg p-3 border border-slate-700">
          <div>
            <label class="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1 block">Weather</label>
            <div class="flex gap-1">
              <button v-for="w in WEATHERS" :key="w"
                      @click="manualWeather = manualWeather === w ? null : w"
                      :disabled="!availableWeathers.includes(w)"
                      class="px-2 py-1 rounded text-xs font-bold border transition-colors flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed"
                      :class="manualWeather === w
                        ? 'bg-sky-500/30 border-sky-500/50 text-sky-300'
                        : 'bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-600'">
                <i class="ph-fill" :class="getWeatherIcon(w)"></i>
                {{ w }}
              </button>
            </div>
          </div>
          <div>
            <label class="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1 block">Ground</label>
            <div class="flex gap-1">
              <button v-for="g in GROUNDS" :key="g"
                      @click="manualGround = manualGround === g ? null : g"
                      :disabled="!availableGrounds.includes(g)"
                      class="px-2 py-1 rounded text-xs font-bold border transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      :class="manualGround === g
                        ? 'bg-orange-500/30 border-orange-500/50 text-orange-300'
                        : 'bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-600'">
                {{ g }}
              </button>
            </div>
          </div>
          <div>
            <label class="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1 block">Season</label>
            <div class="flex gap-1">
              <button v-for="s in SEASONS" :key="s"
                      @click="manualSeason = manualSeason === s ? null : s"
                      :disabled="!availableSeasons.includes(s)"
                      class="px-2 py-1 rounded text-xs font-bold border transition-colors flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed"
                      :class="manualSeason === s
                        ? 'bg-pink-500/30 border-pink-500/50 text-pink-300'
                        : 'bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-600'">
                <i class="ph-fill" :class="getSeasonIcon(s)"></i>
                {{ s }}
              </button>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <span v-if="!isManualConditionComplete" class="text-[10px] text-amber-500 flex items-center gap-1">
              <i class="ph-bold ph-warning"></i> Select all conditions to pick a track
            </span>
            <button v-if="manualWeather || manualGround || manualSeason"
                    @click="manualWeather = null; manualGround = null; manualSeason = null"
                    class="text-[10px] text-slate-500 hover:text-indigo-400 transition-colors flex items-center gap-1">
              <i class="ph-bold ph-x"></i> Clear
            </button>
          </div>
        </div>

        <div class="flex flex-col sm:flex-row gap-3">
          <select v-model="browseLocation"
                  class="bg-slate-900 border border-slate-700 rounded-lg p-3 text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all appearance-none cursor-pointer">
          <option value="">All Locations</option>
          <option v-for="loc in allLocations" :key="loc" :value="loc">{{ loc }}</option>
        </select>
          <input v-model="searchQuery"
                 type="text"
                 placeholder="Search by distance, surface..."
                 class="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-3 text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all" />
        </div>

        <div v-if="browseFiltered.length === 0" class="text-center py-8 text-slate-500">
          No tracks match your filters.
        </div>

        <template v-else>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div v-for="track in pagedTracks" :key="track.id"
                 @click="isManualConditionComplete && selectTrackManual(track.id)"
                 class="group relative bg-slate-900 border border-slate-700 rounded-xl overflow-hidden transition-all duration-200"
                 :class="isManualConditionComplete
                   ? 'cursor-pointer hover:border-indigo-500/50 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-indigo-500/10'
                   : 'opacity-60 cursor-not-allowed'">

              <!-- Track Image: swaps to sim on hover -->
              <div class="aspect-[16/10] bg-slate-950 overflow-hidden relative">
                <img :src="`/assets/tracks/${track.id}.png`"
                     class="absolute inset-0 w-full h-full object-contain transition-opacity duration-300 group-hover:opacity-0"
                     :alt="track.location" />
                <img :src="`/assets/tracks/${track.id}-sim.png`"
                     class="absolute inset-0 w-full h-full object-contain transition-opacity duration-300 opacity-0 group-hover:opacity-100"
                     :alt="`${track.location} sim`" />
              </div>

              <!-- Track Info -->
              <div class="p-3 space-y-2">
                <div class="flex items-center justify-between">
                  <span class="font-bold text-white text-sm">{{ track.location }}</span>
                  <i class="ph-bold text-slate-500" :class="getDirectionIcon(track.direction)"></i>
                </div>
                <div class="flex flex-wrap gap-1.5">
                  <span class="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-slate-800 text-slate-300 border-slate-600">
                    {{ track.distance }}m
                  </span>
                  <span class="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-indigo-500/20 text-indigo-300 border-indigo-500/50">
                    {{ track.distanceType }}
                  </span>
                  <span class="text-[10px] font-bold px-1.5 py-0.5 rounded border" :class="getSurfaceBadgeClass(track.surface)">
                    {{ track.surface }}
                  </span>
                  <span class="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-slate-700/50 text-slate-300 border-slate-600/50 flex items-center gap-0.5">
                    <i class="ph-bold ph-users text-[8px]"></i>
                    {{ track.maxPlayers }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Pagination -->
          <div v-if="totalBrowsePages > 1" class="flex items-center justify-center gap-2 pt-2">
            <button @click="browsePage = Math.max(0, browsePage - 1)"
                    :disabled="browsePage === 0"
                    class="px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600">
              <i class="ph-bold ph-caret-left"></i>
            </button>
            <span class="text-xs text-slate-400 font-mono">
              {{ browsePage + 1 }} / {{ totalBrowsePages }}
            </span>
            <button @click="browsePage = Math.min(totalBrowsePages - 1, browsePage + 1)"
                    :disabled="browsePage >= totalBrowsePages - 1"
                    class="px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600">
              <i class="ph-bold ph-caret-right"></i>
            </button>
          </div>
        </template>
      </div>
    </template>

    <!-- Non-admin waiting view -->
    <div v-else class="text-center py-16">
      <i class="ph-fill ph-map-trifold text-6xl text-slate-600 mb-4 block"></i>
      <p class="text-slate-500">The admin is selecting a track for this tournament.</p>
    </div>
  </div>

  <!-- Random Drum Roll Modal -->
  <SlotReel :visible="showRandomModal" :items="slotReel" :translate-y="slotTranslateY" label="Rolling" highlight="Track" />

  <Teleport to="body">
    <!-- Roll Weights Modal -->
    <div v-if="showWeightsModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" @click.self="showWeightsModal = false">
      <div class="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-96 flex flex-col max-h-[80vh]">
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-slate-700 shrink-0">
          <h3 class="font-bold text-white">Roll Weights</h3>
          <button @click="showWeightsModal = false" class="text-slate-400 hover:text-white transition-colors">
            <i class="ph-bold ph-x"></i>
          </button>
        </div>

        <!-- Scrollable body -->
        <div class="overflow-y-auto px-6 py-4 space-y-6">

          <!-- Surface -->
          <div>
            <h4 class="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-3">Surface</h4>
            <div class="space-y-2">
              <div v-for="s in SURFACES" :key="s" class="flex items-center gap-3">
                <span class="text-sm text-slate-300 w-16">{{ s }}</span>
                <input type="number" min="0"
                       :value="draftSurfaceWeights[s]"
                       @input="draftSurfaceWeights[s] = Math.max(0, parseInt(($event.target as HTMLInputElement).value) || 0)"
                       class="w-14 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-sm text-center focus:outline-none focus:border-indigo-500 transition-colors" />
                <span class="text-xs text-slate-500 w-7 text-right">{{ weightPercent(draftSurfaceWeights, s) }}%</span>
                <div class="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div class="h-full bg-indigo-500 rounded-full transition-all duration-200" :style="{ width: `${weightPercent(draftSurfaceWeights, s)}%` }"></div>
                </div>
              </div>
            </div>
          </div>

          <!-- Distance -->
          <div>
            <h4 class="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-3">Distance</h4>
            <div class="space-y-2">
              <div v-for="d in DISTANCES" :key="d" class="flex items-center gap-3">
                <span class="text-sm text-slate-300 w-16">{{ d }}</span>
                <input type="number" min="0"
                       :value="draftDistanceWeights[d]"
                       @input="draftDistanceWeights[d] = Math.max(0, parseInt(($event.target as HTMLInputElement).value) || 0)"
                       class="w-14 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-sm text-center focus:outline-none focus:border-indigo-500 transition-colors" />
                <span class="text-xs text-slate-500 w-7 text-right">{{ weightPercent(draftDistanceWeights, d) }}%</span>
                <div class="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div class="h-full bg-indigo-500 rounded-full transition-all duration-200" :style="{ width: `${weightPercent(draftDistanceWeights, d)}%` }"></div>
                </div>
              </div>
            </div>
          </div>

          <!-- Ground -->
          <div>
            <h4 class="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-3">Ground</h4>
            <div class="space-y-2">
              <div v-for="g in GROUNDS" :key="g" class="flex items-center gap-3">
                <span class="text-sm text-slate-300 w-16">{{ g }}</span>
                <input type="number" min="0"
                       :value="draftGroundWeights[g]"
                       @input="draftGroundWeights[g] = Math.max(0, parseInt(($event.target as HTMLInputElement).value) || 0)"
                       class="w-14 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-sm text-center focus:outline-none focus:border-indigo-500 transition-colors" />
                <span class="text-xs text-slate-500 w-7 text-right">{{ weightPercent(draftGroundWeights, g) }}%</span>
                <div class="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div class="h-full bg-indigo-500 rounded-full transition-all duration-200" :style="{ width: `${weightPercent(draftGroundWeights, g)}%` }"></div>
                </div>
              </div>
            </div>
          </div>

          <!-- Weather -->
          <div>
            <h4 class="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-3">Weather</h4>
            <div class="space-y-2">
              <div v-for="w in WEATHERS" :key="w" class="flex items-center gap-3">
                <span class="text-sm text-slate-300 w-16">{{ w }}</span>
                <input type="number" min="0"
                       :value="draftWeatherWeights[w]"
                       @input="draftWeatherWeights[w] = Math.max(0, parseInt(($event.target as HTMLInputElement).value) || 0)"
                       class="w-14 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-sm text-center focus:outline-none focus:border-indigo-500 transition-colors" />
                <span class="text-xs text-slate-500 w-7 text-right">{{ weightPercent(draftWeatherWeights, w) }}%</span>
                <div class="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div class="h-full bg-indigo-500 rounded-full transition-all duration-200" :style="{ width: `${weightPercent(draftWeatherWeights, w)}%` }"></div>
                </div>
              </div>
            </div>
          </div>

          <!-- Season -->
          <div>
            <h4 class="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-3">Season</h4>
            <div class="space-y-2">
              <div v-for="s in SEASONS" :key="s" class="flex items-center gap-3">
                <span class="text-sm text-slate-300 w-16">{{ s }}</span>
                <input type="number" min="0"
                       :value="draftSeasonWeights[s]"
                       @input="draftSeasonWeights[s] = Math.max(0, parseInt(($event.target as HTMLInputElement).value) || 0)"
                       class="w-14 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-sm text-center focus:outline-none focus:border-indigo-500 transition-colors" />
                <span class="text-xs text-slate-500 w-7 text-right">{{ weightPercent(draftSeasonWeights, s) }}%</span>
                <div class="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div class="h-full bg-indigo-500 rounded-full transition-all duration-200" :style="{ width: `${weightPercent(draftSeasonWeights, s)}%` }"></div>
                </div>
              </div>
            </div>
          </div>

        </div>

        <!-- Footer -->
        <div class="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-700 shrink-0">
          <button @click="showWeightsModal = false"
                  class="px-3 py-1.5 text-xs font-bold border border-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors">
            Cancel
          </button>
          <button @click="saveWeights"
                  class="px-3 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors">
            Save
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
