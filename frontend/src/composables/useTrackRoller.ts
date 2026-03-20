import { ref, computed, watch } from 'vue';
import type { Track, Condition } from '../types';
import { TRACK_DICT } from '../utils/trackData';

export const SURFACES = ['Turf', 'Dirt'] as const;
export const DISTANCES = ['Sprint', 'Mile', 'Medium', 'Long'] as const;
export const GROUNDS: Condition['ground'][] = ['Firm', 'Good', 'Soft', 'Heavy'];
export const WEATHERS: Condition['weather'][] = ['Sunny', 'Cloudy', 'Rainy', 'Snowy'];
export const SEASONS: Condition['season'][] = ['Spring', 'Summer', 'Fall', 'Winter'];

export const WEATHER_GROUND_MAP: Record<string, Condition['ground'][]> = {
    Sunny: ['Firm', 'Good'],
    Cloudy: ['Firm', 'Good'],
    Rainy: ['Soft', 'Heavy'],
    Snowy: ['Good', 'Soft'],
};
export const GROUND_WEATHER_MAP: Record<string, Condition['weather'][]> = {
    Firm: ['Sunny', 'Cloudy'],
    Good: ['Sunny', 'Cloudy', 'Snowy'],
    Soft: ['Rainy', 'Snowy'],
    Heavy: ['Rainy'],
};
export const WEATHER_SEASON_MAP: Record<string, Condition['season'][]> = {
    Sunny: ['Spring', 'Summer', 'Fall', 'Winter'],
    Cloudy: ['Spring', 'Summer', 'Fall', 'Winter'],
    Rainy: ['Spring', 'Summer', 'Fall', 'Winter'],
    Snowy: ['Winter'],
};
export const SEASON_WEATHER_MAP: Record<string, string[]> = {
    Spring: ['Sunny', 'Cloudy', 'Rainy'],
    Summer: ['Sunny', 'Cloudy', 'Rainy'],
    Fall: ['Sunny', 'Cloudy', 'Rainy'],
    Winter: ['Sunny', 'Cloudy', 'Rainy', 'Snowy'],
};

const FILTERS_KEY = 'raggooner-roll-filters';
const WEIGHTS_KEY = 'raggooner-roll-weights';

const randomFrom = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;

export function useTrackRoller() {
    const allTracks = computed(() => Object.values(TRACK_DICT).map(t => ({ ...t })));

    // ── Filters ──
    const _savedFilters = (() => { try { return JSON.parse(localStorage.getItem(FILTERS_KEY) ?? '{}'); } catch { return {}; } })();

    const loadSet = <T extends string>(saved: T[] | null | undefined, defaults: T[]): Set<T> => {
        if (!saved) return new Set(defaults);
        const valid = saved.filter(v => defaults.includes(v));
        return valid.length > 0 ? new Set(valid) : new Set(defaults);
    };

    const surfaceFilters = ref<Set<string>>(loadSet(_savedFilters.surface, ['Turf', 'Dirt']));
    const distanceFilters = ref<Set<string>>(loadSet(_savedFilters.distance, ['Sprint', 'Mile', 'Medium', 'Long']));
    const directionFilters = ref<Set<string>>(loadSet(_savedFilters.direction, ['left', 'right', 'straight']));
    const maxPlayersFilters = ref<Set<number>>(new Set());
    const groundFilters = ref<Set<string>>(loadSet(_savedFilters.ground, [...GROUNDS]));
    const weatherFilters = ref<Set<string>>(loadSet(_savedFilters.weather, [...WEATHERS]));
    const seasonFilters = ref<Set<string>>(loadSet(_savedFilters.season, [...SEASONS]));

    const allLocations = computed(() => [...new Set(allTracks.value.map(t => t.location))].sort());
    const locationFilters = ref<Set<string>>(new Set());

    // Initialize location and maxPlayers filters from saved or defaults
    const initDerivedFilters = () => {
        const savedLoc = _savedFilters.location as string[] | undefined;
        const validLoc = savedLoc ? savedLoc.filter(l => (allLocations.value as string[]).includes(l)) : [];
        locationFilters.value = validLoc.length > 0 ? new Set(validLoc) : new Set(allLocations.value);

        const allMaxP = [...new Set(allTracks.value.map(t => t.maxPlayers))].sort((a, b) => a - b);
        const savedMP = _savedFilters.maxPlayers as number[] | undefined;
        const validMP = savedMP ? savedMP.filter(n => allMaxP.includes(n)) : [];
        maxPlayersFilters.value = validMP.length > 0 ? new Set(validMP) : new Set(allMaxP);
    };
    initDerivedFilters();

    const allMaxPlayers = computed(() =>
        [...new Set(allTracks.value.map(t => t.maxPlayers))].sort((a, b) => a - b)
    );

    const toggleFilter = (set: Set<string>, value: string) => {
        if (set.has(value)) set.delete(value);
        else set.add(value);
    };

    const toggleAll = (set: Set<string>, allValues: string[]) => {
        if (set.size === allValues.length) set.clear();
        else allValues.forEach(v => set.add(v));
    };

    const filteredTracks = computed(() =>
        allTracks.value.filter(t =>
            surfaceFilters.value.has(t.surface) &&
            distanceFilters.value.has(t.distanceType) &&
            directionFilters.value.has(t.direction) &&
            locationFilters.value.has(t.location) &&
            maxPlayersFilters.value.has(t.maxPlayers)
        )
    );

    const filteredGrounds = computed(() => GROUNDS.filter(g => groundFilters.value.has(g)));
    const filteredWeathers = computed(() => WEATHERS.filter(w => weatherFilters.value.has(w)));
    const filteredSeasons = computed(() => SEASONS.filter(s => seasonFilters.value.has(s)));

    const saveFilters = () => {
        try {
            localStorage.setItem(FILTERS_KEY, JSON.stringify({
                surface: [...surfaceFilters.value],
                distance: [...distanceFilters.value],
                direction: [...directionFilters.value],
                maxPlayers: [...maxPlayersFilters.value],
                ground: [...groundFilters.value],
                weather: [...weatherFilters.value],
                season: [...seasonFilters.value],
                location: [...locationFilters.value],
            }));
        } catch { /* storage unavailable */ }
    };

    watch(
        [surfaceFilters, distanceFilters, directionFilters, maxPlayersFilters, groundFilters, weatherFilters, seasonFilters, locationFilters],
        saveFilters,
        { deep: true }
    );

    // ── Weights ──
    const _savedWeights = (() => { try { return JSON.parse(localStorage.getItem(WEIGHTS_KEY) ?? '{}'); } catch { return {}; } })();

    const groundWeights = ref<Record<Condition['ground'], number>>(_savedWeights.ground ?? { Firm: 50, Good: 20, Soft: 20, Heavy: 10 });
    const weatherWeights = ref<Record<Condition['weather'], number>>(_savedWeights.weather ?? { Sunny: 1, Cloudy: 1, Rainy: 1, Snowy: 1 });
    const seasonWeights = ref<Record<Condition['season'], number>>(_savedWeights.season ?? { Spring: 1, Summer: 1, Fall: 1, Winter: 1 });
    const surfaceWeights = ref<Record<string, number>>(_savedWeights.surface ?? { Turf: 1, Dirt: 1 });
    const distanceWeights = ref<Record<string, number>>(_savedWeights.distance ?? { Sprint: 1, Mile: 1, Medium: 1, Long: 1 });

    const showWeightsModal = ref(false);
    const draftGroundWeights = ref({ ...groundWeights.value });
    const draftWeatherWeights = ref({ ...weatherWeights.value });
    const draftSeasonWeights = ref({ ...seasonWeights.value });
    const draftSurfaceWeights = ref({ ...surfaceWeights.value });
    const draftDistanceWeights = ref({ ...distanceWeights.value });

    const openWeightsModal = () => {
        draftGroundWeights.value = { ...groundWeights.value };
        draftWeatherWeights.value = { ...weatherWeights.value };
        draftSeasonWeights.value = { ...seasonWeights.value };
        draftSurfaceWeights.value = { ...surfaceWeights.value };
        draftDistanceWeights.value = { ...distanceWeights.value };
        showWeightsModal.value = true;
    };

    const saveWeights = () => {
        groundWeights.value = { ...draftGroundWeights.value };
        weatherWeights.value = { ...draftWeatherWeights.value };
        seasonWeights.value = { ...draftSeasonWeights.value };
        surfaceWeights.value = { ...draftSurfaceWeights.value };
        distanceWeights.value = { ...draftDistanceWeights.value };
        try {
            localStorage.setItem(WEIGHTS_KEY, JSON.stringify({
                ground: groundWeights.value,
                weather: weatherWeights.value,
                season: seasonWeights.value,
                surface: surfaceWeights.value,
                distance: distanceWeights.value,
            }));
        } catch { /* storage unavailable */ }
        showWeightsModal.value = false;
    };

    const weightPercent = (weights: Record<string, number>, key: string): number => {
        const total = Object.values(weights).reduce((s, v) => s + (v || 0), 0);
        return total === 0 ? 0 : Math.round(((weights[key] || 0) / total) * 100);
    };

    // ── IPF Probability Matrix ──
    const normalize = (weights: Record<string, number>, allowed: string[]) => {
        const filtered = Object.fromEntries(Object.entries(weights).filter(([k]) => allowed.includes(k)));
        const total = Object.values(filtered).reduce((a, b) => a + b, 0);
        if (total === 0) return Object.fromEntries(allowed.map(k => [k, 1 / allowed.length]));
        return Object.fromEntries(Object.entries(filtered).map(([k, v]) => [k, v / total]));
    };

    const validConditionCombos = computed(() => {
        const combos: { weather: string; ground: string; season: string }[] = [];
        for (const w of filteredWeathers.value) {
            const validGrounds = (WEATHER_GROUND_MAP[w] || []).filter(g => filteredGrounds.value.includes(g));
            const validSeasons = (WEATHER_SEASON_MAP[w] || []).filter(s => filteredSeasons.value.includes(s));
            for (const g of validGrounds) {
                for (const s of validSeasons) {
                    combos.push({ weather: w, ground: g, season: s });
                }
            }
        }
        return combos;
    });

    const conditionProbs = computed(() => {
        const combos = validConditionCombos.value.map(c => ({ ...c, prob: 1 }));
        if (combos.length === 0) return [];

        const weatherTarget = normalize(weatherWeights.value, filteredWeathers.value);
        const groundTarget = normalize(groundWeights.value, filteredGrounds.value);
        const seasonTarget = normalize(seasonWeights.value, filteredSeasons.value);

        for (let i = 0; i < 50; i++) {
            for (const w in weatherTarget) {
                const sum = combos.filter(c => c.weather === w).reduce((s, c) => s + c.prob, 0);
                if (sum > 0) {
                    const factor = weatherTarget[w]! / sum;
                    combos.filter(c => c.weather === w).forEach(c => c.prob *= factor);
                }
            }
            for (const g in groundTarget) {
                const sum = combos.filter(c => c.ground === g).reduce((s, c) => s + c.prob, 0);
                if (sum > 0) {
                    const factor = groundTarget[g]! / sum;
                    combos.filter(c => c.ground === g).forEach(c => c.prob *= factor);
                }
            }
            for (const s in seasonTarget) {
                const sum = combos.filter(c => c.season === s).reduce((s, c) => s + c.prob, 0);
                if (sum > 0) {
                    const factor = seasonTarget[s]! / sum;
                    combos.filter(c => c.season === s).forEach(c => c.prob *= factor);
                }
            }
        }

        const total = combos.reduce((s, c) => s + c.prob, 0);
        combos.forEach(c => c.prob /= total);
        return combos;
    });

    const trackProbs = computed(() => {
        const tracks = filteredTracks.value;
        if (tracks.length === 0) return [];

        const allowedSurfaces = [...new Set(tracks.map(t => t.surface))];
        const allowedDistances = [...new Set(tracks.map(t => t.distanceType))];
        const surfaceTarget = normalize(surfaceWeights.value, allowedSurfaces);
        const distanceTarget = normalize(distanceWeights.value, allowedDistances);

        const matrix: { surface: string; distanceType: string; prob: number }[] = [];
        for (const s of allowedSurfaces) {
            for (const d of allowedDistances) {
                const hasTrack = tracks.some(t => t.surface === s && t.distanceType === d);
                if (hasTrack) matrix.push({ surface: s, distanceType: d, prob: 1 });
            }
        }

        for (let i = 0; i < 50; i++) {
            for (const s in surfaceTarget) {
                const sum = matrix.filter(m => m.surface === s).reduce((sum, m) => sum + m.prob, 0);
                if (sum > 0) {
                    const factor = surfaceTarget[s]! / sum;
                    matrix.filter(m => m.surface === s).forEach(m => m.prob *= factor);
                }
            }
            for (const d in distanceTarget) {
                const sum = matrix.filter(m => m.distanceType === d).reduce((sum, m) => sum + m.prob, 0);
                if (sum > 0) {
                    const factor = distanceTarget[d]! / sum;
                    matrix.filter(m => m.distanceType === d).forEach(m => m.prob *= factor);
                }
            }
        }

        const total = matrix.reduce((s, m) => s + m.prob, 0);
        matrix.forEach(m => m.prob /= total);
        return matrix;
    });

    const rollCondition = (): { weather: string; ground: string; season: string } => {
        const combos = conditionProbs.value;
        if (combos.length === 0) return { weather: 'Sunny', ground: 'Firm', season: 'Spring' };
        let r = Math.random();
        for (const c of combos) {
            r -= c.prob;
            if (r <= 0) return c;
        }
        return combos[combos.length - 1]!;
    };

    const rollTrack = (): Track => {
        const matrix = trackProbs.value;
        const tracks = filteredTracks.value;
        if (matrix.length === 0 || tracks.length === 0) return tracks[0]!;
        let r = Math.random();
        let selected = matrix[matrix.length - 1]!;
        for (const m of matrix) {
            r -= m.prob;
            if (r <= 0) { selected = m; break; }
        }
        const matchingTracks = tracks.filter(t => t.surface === selected.surface && t.distanceType === selected.distanceType);
        return randomFrom(matchingTracks);
    };

    // ── Conflict detection ──
    const groundWeightConflict = computed(() => filteredGrounds.value.length > 0 && filteredGrounds.value.every(g => (groundWeights.value[g] ?? 0) === 0));
    const weatherWeightConflict = computed(() => filteredWeathers.value.length > 0 && filteredWeathers.value.every(w => (weatherWeights.value[w] ?? 0) === 0));
    const seasonWeightConflict = computed(() => filteredSeasons.value.length > 0 && filteredSeasons.value.every(s => (seasonWeights.value[s] ?? 0) === 0));
    const surfaceWeightConflict = computed(() => surfaceFilters.value.size > 0 && [...surfaceFilters.value].every(s => (surfaceWeights.value[s] ?? 0) === 0));
    const distanceWeightConflict = computed(() => distanceFilters.value.size > 0 && [...distanceFilters.value].every(d => (distanceWeights.value[d] ?? 0) === 0));

    const conflictingDimensions = computed(() => {
        const dims: string[] = [];
        if (surfaceWeightConflict.value) dims.push('Surface');
        if (distanceWeightConflict.value) dims.push('Distance');
        if (groundWeightConflict.value) dims.push('Ground');
        if (weatherWeightConflict.value) dims.push('Weather');
        if (seasonWeightConflict.value) dims.push('Season');
        return dims;
    });

    const trackCombinationFallback = computed(() => {
        const tracks = filteredTracks.value;
        if (tracks.length === 0) return false;
        return tracks.every(t => {
            const sw = surfaceWeightConflict.value ? 1 : (surfaceWeights.value[t.surface] ?? 0);
            const dw = distanceWeightConflict.value ? 1 : (distanceWeights.value[t.distanceType] ?? 0);
            return sw * dw === 0;
        });
    });

    const conditionCombinationFallback = computed(() => {
        const combos = validConditionCombos.value;
        if (combos.length === 0) return false;
        return combos.every(c => {
            const gw = groundWeightConflict.value ? 1 : (groundWeights.value[c.ground as Condition['ground']] ?? 0);
            const ww = weatherWeightConflict.value ? 1 : (weatherWeights.value[c.weather as Condition['weather']] ?? 0);
            const sw = seasonWeightConflict.value ? 1 : (seasonWeights.value[c.season as Condition['season']] ?? 0);
            return gw * ww * sw === 0;
        });
    });

    const trackFallbackDescription = computed(() => {
        const weightedSurfaces = [...surfaceFilters.value].filter(s => surfaceWeightConflict.value || (surfaceWeights.value[s] ?? 0) > 0);
        const weightedDistances = [...distanceFilters.value].filter(d => distanceWeightConflict.value || (distanceWeights.value[d] ?? 0) > 0);
        return `${weightedSurfaces.join('/')} × ${weightedDistances.join('/')}`;
    });

    const conditionFallbackDescription = computed(() => {
        const wg = GROUNDS.filter(g => groundWeightConflict.value || (groundWeights.value[g] ?? 0) > 0).join('/');
        const ww = WEATHERS.filter(w => weatherWeightConflict.value || (weatherWeights.value[w] ?? 0) > 0).join('/');
        const ws = SEASONS.filter(s => seasonWeightConflict.value || (seasonWeights.value[s] ?? 0) > 0).join('/');
        return `${wg} × ${ww} × ${ws}`;
    });

    const hasAnyWarning = computed(() =>
        conflictingDimensions.value.length > 0 || trackCombinationFallback.value || conditionCombinationFallback.value
    );

    const rollableTrackCount = computed(() => {
        if (trackCombinationFallback.value) return filteredTracks.value.length;
        return filteredTracks.value.filter(t => {
            const sw = surfaceWeightConflict.value ? 1 : (surfaceWeights.value[t.surface] ?? 0);
            const dw = distanceWeightConflict.value ? 1 : (distanceWeights.value[t.distanceType] ?? 0);
            return sw * dw > 0;
        }).length;
    });

    // ── Random Roller ──
    const isRolling = ref(false);
    const rollerTrack = ref<Track | null>(null);
    const rollerCondition = ref<Condition | null>(null);
    const rollerSettled = ref(false);
    const showRandomModal = ref(false);
    const slotReel = ref<string[]>([]);
    const slotTranslateY = ref(80);

    const getTrackDisplayString = (t: Track) => {
        const parts = [t.location, `${t.distance}m`];
        if (t.surface === 'Dirt') parts.push('Dirt');
        if (t.id.includes('inner')) parts.push('Inner');
        if (t.id.includes('outer')) parts.push('Outer');
        return parts.join(' ');
    };

    const rollRandom = () => {
        const candidates = filteredTracks.value;
        const combos = validConditionCombos.value;
        if (candidates.length === 0 || combos.length === 0) return;

        isRolling.value = true;
        rollerSettled.value = false;

        const winner = rollTrack();
        const combo = rollCondition();

        const targetIndex = 40;
        const reel: string[] = [];
        for (let i = 0; i < targetIndex; i++) {
            reel.push(getTrackDisplayString(candidates[Math.floor(Math.random() * candidates.length)]!));
        }
        reel.push(getTrackDisplayString(winner));
        for (let i = 0; i < 5; i++) {
            reel.push(getTrackDisplayString(candidates[Math.floor(Math.random() * candidates.length)]!));
        }

        slotReel.value = reel;
        slotTranslateY.value = 80;
        showRandomModal.value = true;

        const animStartDelay = 100;
        const duration = 4000;

        setTimeout(() => {
            slotTranslateY.value = 80 - (targetIndex * 80);
        }, animStartDelay);

        setTimeout(() => {
            showRandomModal.value = false;
            isRolling.value = false;
            rollerTrack.value = winner;
            rollerCondition.value = {
                id: '',
                ground: combo.ground as Condition['ground'],
                weather: combo.weather as Condition['weather'],
                season: combo.season as Condition['season'],
            };
            rollerSettled.value = true;
        }, duration + 500);
    };

    // ── Display helpers ──
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

    const getSurfaceBadgeClass = (surface: string) =>
        surface === 'Turf'
            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
            : 'bg-amber-500/20 text-amber-300 border-amber-500/50';

    const getDirectionIcon = (dir: string) =>
        dir === 'left' ? 'ph-arrow-arc-left' : (dir === 'straight' ? 'ph-arrow-right' : 'ph-arrow-arc-right');

    return {
        // Constants
        SURFACES, DISTANCES, GROUNDS, WEATHERS, SEASONS,
        // Track list
        allTracks,
        // Filters
        surfaceFilters, distanceFilters, directionFilters, locationFilters, maxPlayersFilters,
        groundFilters, weatherFilters, seasonFilters,
        allLocations, allMaxPlayers,
        filteredTracks, filteredGrounds, filteredWeathers, filteredSeasons,
        validConditionCombos,
        toggleFilter, toggleAll,
        // Weights
        groundWeights, weatherWeights, seasonWeights, surfaceWeights, distanceWeights,
        showWeightsModal, openWeightsModal, saveWeights, weightPercent,
        draftGroundWeights, draftWeatherWeights, draftSeasonWeights, draftSurfaceWeights, draftDistanceWeights,
        // Warnings
        conflictingDimensions, trackCombinationFallback, conditionCombinationFallback,
        trackFallbackDescription, conditionFallbackDescription, hasAnyWarning, rollableTrackCount,
        // Roller state
        isRolling, rollerTrack, rollerCondition, rollerSettled,
        showRandomModal, slotReel, slotTranslateY,
        rollRandom,
        // Display helpers
        getTrackDisplayString, getWeatherIcon, getSeasonIcon, getSurfaceBadgeClass, getDirectionIcon,
    };
}
