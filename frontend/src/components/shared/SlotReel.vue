<script setup lang="ts">
import { watch } from 'vue';
import { playLocalSfx } from '../../composables/useVoicelines';

const props = defineProps<{
    visible: boolean;
    items: string[];
    translateY: number;
    label: string;
    highlight: string;
}>();

const TOTAL_TICKS  = 40;
const DURATION     = 4000;
const ANIM_DELAY   = 100;

const invertCubicBezier = (yTarget: number, x1: number, y1: number, x2: number, y2: number): number => {
    let lo = 0, hi = 1;
    for (let iter = 0; iter < 60; iter++) {
        const u = (lo + hi) / 2;
        const by = 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u;
        if (by < yTarget) lo = u; else hi = u;
    }
    const u = (lo + hi) / 2;
    return 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u;
};

let pendingTimers: ReturnType<typeof setTimeout>[] = [];

watch(() => props.visible, (visible) => {
    if (visible) {
        pendingTimers.forEach(clearTimeout);
        pendingTimers = [];

        for (let i = 1; i <= TOTAL_TICKS; i++) {
            const t = invertCubicBezier(i / TOTAL_TICKS, 0.15, 0.85, 0.15, 1);
            pendingTimers.push(
                setTimeout(() => playLocalSfx('/assets/sound-effects/sfx-button-hover.mp3'),
                    t * DURATION + ANIM_DELAY)
            );
        }
    } else {
        pendingTimers.forEach(clearTimeout);
        pendingTimers = [];
        playLocalSfx('/assets/sound-effects/pling.mp3');
    }
});
</script>

<template>
    <Teleport to="body">
        <div v-if="visible" class="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md">
            <h2 class="text-3xl font-bold text-white mb-8 animate-pulse text-center">
                {{ label }} <span class="text-indigo-400">{{ highlight }}</span>...
            </h2>

            <div class="relative w-80 h-[240px] bg-slate-900 border-4 border-slate-700 rounded-xl overflow-hidden shadow-[0_0_50px_rgba(99,102,241,0.3)]">
                <div class="absolute top-[80px] left-0 w-full h-[80px] border-y-2 border-indigo-500 bg-indigo-500/20 z-20 shadow-[inset_0_0_20px_rgba(99,102,241,0.5)] pointer-events-none"></div>

                <div class="w-full flex flex-col transition-transform duration-[4000ms] ease-[cubic-bezier(0.15,0.85,0.15,1)]"
                     :style="{ transform: `translateY(${translateY}px)` }">
                    <div v-for="(item, idx) in items" :key="idx"
                         class="h-[80px] flex items-center justify-center text-xl font-black text-white uppercase tracking-widest text-center px-4 shrink-0">
                        {{ item }}
                    </div>
                </div>

                <div class="absolute top-0 left-0 w-full h-[80px] bg-gradient-to-b from-slate-950 to-transparent z-10 pointer-events-none"></div>
                <div class="absolute bottom-0 left-0 w-full h-[80px] bg-gradient-to-t from-slate-950 to-transparent z-10 pointer-events-none"></div>
            </div>
        </div>
    </Teleport>
</template>
