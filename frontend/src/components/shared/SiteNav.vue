<script setup lang="ts">
import { useRoute } from 'vue-router';

const route = useRoute();

const nav = [
    { to: '/',          icon: 'ph-fill ph-flag-checkered', label: 'Play',      sub: 'Tournaments' },
    { to: '/analytics', icon: 'ph-fill ph-chart-line-up',  label: 'Analytics', sub: 'Global Stats' },
    { to: '/tools',     icon: 'ph-fill ph-wrench',          label: 'Tools',     sub: 'Rollers' },
];

function isActive(to: string) {
    if (to === '/') return route.path === '/';
    return route.path.startsWith(to);
}
</script>

<template>
    <div class="max-w-3xl mx-auto grid grid-cols-3 gap-4 mt-4 mb-12 border-b border-slate-800 pb-12 animate-fade-in">
        <router-link
            v-for="item in nav"
            :key="item.to"
            :to="item.to"
            class="group rounded-xl p-4 flex items-center gap-3 transition-colors border"
            :class="isActive(item.to)
                ? 'bg-indigo-600 border-indigo-500 shadow-lg shadow-indigo-500/20 cursor-default pointer-events-none'
                : 'bg-slate-800 border-slate-700 hover:border-indigo-500 hover:bg-slate-750 cursor-pointer'"
        >
            <i :class="[item.icon, 'text-2xl', isActive(item.to) ? 'text-white' : 'text-indigo-400 group-hover:text-indigo-300']"></i>
            <div>
                <div class="text-sm font-bold uppercase tracking-widest"
                     :class="isActive(item.to) ? 'text-white' : 'text-white group-hover:text-indigo-100'">
                    {{ item.label }}
                </div>
                <div class="text-[10px]"
                     :class="isActive(item.to) ? 'text-indigo-200' : 'text-slate-400'">
                    {{ item.sub }}
                </div>
            </div>
        </router-link>
    </div>
</template>
