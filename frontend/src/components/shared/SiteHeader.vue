<script setup lang="ts">
import { inject, type Ref } from 'vue';

const openChangelog = inject<() => void>('openChangelog')!;
const hasNewUpdates = inject<Ref<boolean>>('hasNewUpdates')!;
</script>

<template>
    <header class="border-b border-slate-700 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
        <div class="max-w-[1800px] mx-auto px-4 h-16 md:px-8 flex items-center justify-between">
            <router-link to="/" class="flex items-center gap-2 text-indigo-500 hover:text-indigo-400 transition-colors z-10">
                <i class="ph-fill ph-flag-checkered text-3xl"></i>
                <span class="text-2xl font-bold text-white heading tracking-widest hidden sm:block">Raccoon Open</span>
                <span class="text-2xl font-bold text-white heading tracking-widest sm:hidden">RO</span>
            </router-link>
            <div class="flex items-center gap-4 z-10">
                <button @click="openChangelog" class="relative text-slate-400 hover:text-white transition-colors">
                    <i class="ph-bold ph-bell text-xl"></i>
                    <span v-if="hasNewUpdates" class="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-slate-900 animate-pulse"></span>
                </button>
            </div>
        </div>
    </header>
</template>
