<script setup lang="ts">
import { ref, computed, reactive } from 'vue';
import { UMA_DICT } from '../../utils/umaData';
import { useUmaRoller } from '../../composables/useUmaRoller';
import SlotReel from '../../components/shared/SlotReel.vue';
import UmaCard from '../../components/UmaCard.vue';

const { showRandomModal, slotReel, slotTranslateY, isRolling, roll } = useUmaRoller();

// ── Grade system ──
const GRADE_ORDER = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;
type Grade = typeof GRADE_ORDER[number];

// ── Aptitude filter state ──
// min/max are grade-order indices (not quality indices).
// min=A, max=C means grades A, B, C pass (the letters A–C in S→G order).
// Default S–G = all grades pass.
type AptRange = { min: Grade; max: Grade };

const apt = reactive<Record<string, AptRange>>({
    turf:        { min: 'A', max: 'G' },
    dirt:        { min: 'A', max: 'G' },
    sprint:      { min: 'A', max: 'G' },
    mile:        { min: 'A', max: 'G' },
    medium:      { min: 'A', max: 'G' },
    long:        { min: 'A', max: 'G' },
    frontRunner: { min: 'A', max: 'G' },
    paceChaser:  { min: 'A', max: 'G' },
    lateSurger:  { min: 'A', max: 'G' },
    endCloser:   { min: 'A', max: 'G' },
});

// Smart click: grades to the left of the range (or at min) move min;
// grades to the right (or at max) move max; grades inside are assigned
// to whichever endpoint is closer.
const handleGradeClick = (key: string, clickedIdx: number) => {
    const range = apt[key]!;
    const minIdx = GRADE_ORDER.indexOf(range.min);
    const maxIdx = GRADE_ORDER.indexOf(range.max);

    if (clickedIdx <= minIdx) {
        range.min = GRADE_ORDER[clickedIdx]!;
    } else if (clickedIdx >= maxIdx) {
        range.max = GRADE_ORDER[clickedIdx]!;
    } else {
        // Within range: move nearest endpoint
        if (clickedIdx - minIdx <= maxIdx - clickedIdx) {
            range.min = GRADE_ORDER[clickedIdx]!;
        } else {
            range.max = GRADE_ORDER[clickedIdx]!;
        }
    }
};

const resetSection = (keys: readonly string[]) => {
    keys.forEach(k => { apt[k]!.min = 'A'; apt[k]!.max = 'G'; });
};

const isFilterDefault = (keys: readonly string[]) =>
    keys.every(k => apt[k]!.min === 'A' && apt[k]!.max === 'G');

// ── Search ──
const umaSearch = ref('');

// ── Filter logic ──
function gradeInRange(grade: string, range: AptRange): boolean {
    const idx   = GRADE_ORDER.indexOf(grade as Grade);
    const minIdx = GRADE_ORDER.indexOf(range.min);
    const maxIdx = GRADE_ORDER.indexOf(range.max);
    return idx >= minIdx && idx <= maxIdx;
}

const allUmas = computed(() => Object.keys(UMA_DICT).sort());

const filteredCandidates = computed(() => {
    const q = umaSearch.value.toLowerCase().trim();
    return allUmas.value.filter(umaName => {
        if (q && !umaName.toLowerCase().includes(q)) return false;
        const data = UMA_DICT[umaName];
        if (!data) return false;
        const { surface, distance, style } = data.aptitudes;
        return (
            gradeInRange(surface.turf,      apt.turf!)        &&
            gradeInRange(surface.dirt,      apt.dirt!)        &&
            gradeInRange(distance.sprint,   apt.sprint!)      &&
            gradeInRange(distance.mile,     apt.mile!)        &&
            gradeInRange(distance.medium,   apt.medium!)      &&
            gradeInRange(distance.long,     apt.long!)        &&
            gradeInRange(style.frontRunner, apt.frontRunner!) &&
            gradeInRange(style.paceChaser,  apt.paceChaser!)  &&
            gradeInRange(style.lateSurger,  apt.lateSurger!)  &&
            gradeInRange(style.endCloser,   apt.endCloser!)
        );
    });
});

// ── Grade color helpers ──
const gradeActiveClass: Record<Grade, string> = {
    A: 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300',
    B: 'bg-sky-500/20 border-sky-500/60 text-sky-300',
    C: 'bg-indigo-500/20 border-indigo-500/60 text-indigo-300',
    D: 'bg-slate-600/20 border-slate-500/60 text-slate-300',
    E: 'bg-slate-700/20 border-slate-600/40 text-slate-400',
    F: 'bg-slate-800/20 border-slate-700/40 text-slate-500',
    G: 'bg-slate-900/40 border-slate-700/30 text-slate-600',
};

const hoverTarget = ref<{ key: string; idx: number } | null>(null);

// ── Result ──
const lastResult = ref<string | null>(null);

const rollRandom = () => {
    if (filteredCandidates.value.length === 0 || isRolling.value) return;
    lastResult.value = null;
    roll(filteredCandidates.value, (winner) => { lastResult.value = winner; });
};

// Helper to get a grade for an uma by aptitude key
const getGrade = (umaName: string, key: string): Grade | null => {
    const data = UMA_DICT[umaName];
    if (!data) return null;
    const { surface, distance, style } = data.aptitudes;
    return (surface[key as keyof typeof surface] ??
            distance[key as keyof typeof distance] ??
            style[key as keyof typeof style] ?? null) as Grade | null;
};

// ── Section definitions ──
const SURFACE_KEYS  = ['turf', 'dirt'] as const;
const DISTANCE_KEYS = ['sprint', 'mile', 'medium', 'long'] as const;
const STYLE_KEYS    = ['frontRunner', 'paceChaser', 'lateSurger', 'endCloser'] as const;
const ALL_KEYS      = [...SURFACE_KEYS, ...DISTANCE_KEYS, ...STYLE_KEYS] as const;

const LABELS: Record<string, string> = {
    turf: 'Turf', dirt: 'Dirt',
    sprint: 'Sprint', mile: 'Mile', medium: 'Medium', long: 'Long',
    frontRunner: 'Front Runner', paceChaser: 'Pace Chaser',
    lateSurger: 'Late Surger', endCloser: 'End Closer',
};
</script>

<template>
    <div class="space-y-6 animate-fade-in">
        <div class="text-center">
            <h2 class="text-3xl font-black text-white mb-2">Uma Roller</h2>
            <p class="text-slate-400">Roll a random uma from the filtered roster.</p>
        </div>

        <div class="bg-slate-800/60 border border-slate-700 rounded-2xl p-6">
            <div class="flex flex-col lg:flex-row gap-6">

                <!-- ── Sidebar: Filters ── -->
                <div class="lg:w-72 shrink-0 space-y-5 lg:border-r lg:border-slate-700 lg:pr-6">

                    <!-- Search -->
                    <input v-model="umaSearch"
                           type="text"
                           placeholder="Search by name..."
                           class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all" />

                    <!-- Grade range legend -->
                    <div class="text-[10px] text-slate-600 leading-relaxed">
                        Click a grade to set the range boundary. Clicking outside the highlighted
                        range moves the nearest end; clicking inside shifts the closest endpoint.
                    </div>

                    <!-- Surface -->
                    <div>
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-xs text-slate-500 uppercase font-bold tracking-wider">Surface</span>
                            <button v-if="!isFilterDefault(SURFACE_KEYS)"
                                    @click="resetSection(SURFACE_KEYS)"
                                    class="text-[10px] text-slate-500 hover:text-indigo-400 transition-colors">Reset</button>
                        </div>
                        <div class="space-y-1.5">
                            <div v-for="key in SURFACE_KEYS" :key="key" class="flex items-center gap-2">
                                <span class="text-xs text-slate-300 w-6 shrink-0">{{ LABELS[key] }}</span>
                                <div class="flex flex-1 gap-px">
                                    <button v-for="(g, gIdx) in GRADE_ORDER" :key="g"
                                            @click="handleGradeClick(key, gIdx)"
                                            @mouseenter="hoverTarget = { key, idx: gIdx }"
                                            @mouseleave="hoverTarget = null"
                                            class="flex-1 h-6 rounded-sm text-[10px] font-black border transition-all"
                                            :class="[
                                                gIdx >= GRADE_ORDER.indexOf(apt[key]!.min) && gIdx <= GRADE_ORDER.indexOf(apt[key]!.max)
                                                    ? gradeActiveClass[g]
                                                    : 'text-slate-700 border-slate-800 hover:border-slate-600 hover:text-slate-500',
                                                hoverTarget?.key === key && hoverTarget?.idx === gIdx
                                                    ? 'scale-110 z-10'
                                                    : ''
                                            ]">
                                        {{ g }}
                                    </button>
                                </div>
                                <!-- Range label -->
                                <span class="text-[10px] text-slate-600 w-8 text-right shrink-0 font-mono">
                                    {{ apt[key]!.min === apt[key]!.max ? apt[key]!.min : `${apt[key]!.min}–${apt[key]!.max}` }}
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- Distance -->
                    <div>
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-xs text-slate-500 uppercase font-bold tracking-wider">Distance</span>
                            <button v-if="!isFilterDefault(DISTANCE_KEYS)"
                                    @click="resetSection(DISTANCE_KEYS)"
                                    class="text-[10px] text-slate-500 hover:text-indigo-400 transition-colors">Reset</button>
                        </div>
                        <div class="space-y-1.5">
                            <div v-for="key in DISTANCE_KEYS" :key="key" class="flex items-center gap-2">
                                <span class="text-xs text-slate-300 w-10 shrink-0">{{ LABELS[key] }}</span>
                                <div class="flex flex-1 gap-px">
                                    <button v-for="(g, gIdx) in GRADE_ORDER" :key="g"
                                            @click="handleGradeClick(key, gIdx)"
                                            @mouseenter="hoverTarget = { key, idx: gIdx }"
                                            @mouseleave="hoverTarget = null"
                                            class="flex-1 h-6 rounded-sm text-[10px] font-black border transition-all"
                                            :class="[
                                                gIdx >= GRADE_ORDER.indexOf(apt[key]!.min) && gIdx <= GRADE_ORDER.indexOf(apt[key]!.max)
                                                    ? gradeActiveClass[g]
                                                    : 'text-slate-700 border-slate-800 hover:border-slate-600 hover:text-slate-500',
                                                hoverTarget?.key === key && hoverTarget?.idx === gIdx
                                                    ? 'scale-110 z-10'
                                                    : ''
                                            ]">
                                        {{ g }}
                                    </button>
                                </div>
                                <span class="text-[10px] text-slate-600 w-8 text-right shrink-0 font-mono">
                                    {{ apt[key]!.min === apt[key]!.max ? apt[key]!.min : `${apt[key]!.min}–${apt[key]!.max}` }}
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- Style -->
                    <div>
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-xs text-slate-500 uppercase font-bold tracking-wider">Style</span>
                            <button v-if="!isFilterDefault(STYLE_KEYS)"
                                    @click="resetSection(STYLE_KEYS)"
                                    class="text-[10px] text-slate-500 hover:text-indigo-400 transition-colors">Reset</button>
                        </div>
                        <div class="space-y-1.5">
                            <div v-for="key in STYLE_KEYS" :key="key" class="flex items-center gap-2">
                                <span class="text-xs text-slate-300 w-[4.5rem] shrink-0 leading-tight">{{ LABELS[key] }}</span>
                                <div class="flex flex-1 gap-px">
                                    <button v-for="(g, gIdx) in GRADE_ORDER" :key="g"
                                            @click="handleGradeClick(key, gIdx)"
                                            @mouseenter="hoverTarget = { key, idx: gIdx }"
                                            @mouseleave="hoverTarget = null"
                                            class="flex-1 h-6 rounded-sm text-[10px] font-black border transition-all"
                                            :class="[
                                                gIdx >= GRADE_ORDER.indexOf(apt[key]!.min) && gIdx <= GRADE_ORDER.indexOf(apt[key]!.max)
                                                    ? gradeActiveClass[g]
                                                    : 'text-slate-700 border-slate-800 hover:border-slate-600 hover:text-slate-500',
                                                hoverTarget?.key === key && hoverTarget?.idx === gIdx
                                                    ? 'scale-110 z-10'
                                                    : ''
                                            ]">
                                        {{ g }}
                                    </button>
                                </div>
                                <span class="text-[10px] text-slate-600 w-8 text-right shrink-0 font-mono">
                                    {{ apt[key]!.min === apt[key]!.max ? apt[key]!.min : `${apt[key]!.min}–${apt[key]!.max}` }}
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- Reset all -->
                    <button v-if="!isFilterDefault(ALL_KEYS)"
                            @click="resetSection(ALL_KEYS)"
                            class="w-full text-xs text-slate-500 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg py-1.5 transition-colors">
                        Reset All Filters
                    </button>
                </div>

                <!-- ── Main: Result + Roll ── -->
                <div class="flex-1 flex flex-col items-center justify-center gap-6">

                    <!-- Result -->
                    <div class="min-h-[200px] flex items-center justify-center w-full">
                        <template v-if="lastResult">
                            <div class="text-center space-y-3 w-full max-w-sm">
                                <UmaCard :uma-name="lastResult" class="mx-auto" />
                                <p class="text-xl font-bold text-white">{{ lastResult }}</p>
                                <!-- Aptitude badges -->
                                <div class="space-y-1.5">
                                    <div v-for="(sectionKeys, sectionLabel) in { Surface: SURFACE_KEYS, Distance: DISTANCE_KEYS, Style: STYLE_KEYS }"
                                         :key="sectionLabel"
                                         class="flex items-center gap-1.5 flex-wrap justify-center">
                                        <span class="text-[10px] text-slate-600 uppercase tracking-wider w-12 text-right shrink-0">{{ sectionLabel }}</span>
                                        <span v-for="key in sectionKeys" :key="key"
                                              class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-bold"
                                              :class="gradeActiveClass[getGrade(lastResult, key) ?? 'G']">
                                            {{ LABELS[key] ?? key }}
                                            {{ getGrade(lastResult, key) ?? '?' }}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </template>
                        <template v-else>
                            <div class="text-slate-600 text-center">
                                <i class="ph-fill ph-horse text-6xl mb-3 block"></i>
                                <span class="text-sm">Press Roll to pick a random uma</span>
                            </div>
                        </template>
                    </div>

                    <!-- Roll button -->
                    <div class="flex flex-col items-center gap-2">
                        <button @click="rollRandom"
                                :disabled="isRolling || filteredCandidates.length === 0"
                                class="px-8 py-3 rounded-lg font-bold transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                :class="isRolling
                                  ? 'bg-indigo-700 text-indigo-200 cursor-wait'
                                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/30'">
                            <i class="ph-bold ph-shuffle" :class="{ 'animate-spin': isRolling }"></i>
                            <span>{{ isRolling ? 'Rolling...' : 'Roll' }}</span>
                            <span class="text-xs opacity-70">({{ filteredCandidates.length }})</span>
                        </button>
                        <span v-if="filteredCandidates.length === 0" class="text-xs text-amber-400 flex items-center gap-1">
                            <i class="ph-bold ph-warning"></i>
                            No umas match the current filters
                        </span>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <SlotReel :visible="showRandomModal" :items="slotReel" :translate-y="slotTranslateY" label="Rolling" highlight="Uma" />
</template>
