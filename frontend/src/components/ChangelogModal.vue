<script setup lang="ts">
import { changelogData } from '../data/changelog';

const props = defineProps<{
  lastSeenVersion: string
}>();

defineEmits(['close']);

// Semantic Version comparison logic
const isVersionNew = (versionToCheck: string) => {
  const v1Parts = versionToCheck.split('.').map(Number);
  const v2Parts = props.lastSeenVersion.split('.').map(Number);

  for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
    const p1 = v1Parts[i] || 0;
    const p2 = v2Parts[i] || 0;
    if (p1 > p2) return true; // It's newer!
    if (p1 < p2) return false; // It's older
  }
  return false; // Exact same version
};

const getBadgeColor = (type: string) => {
  switch (type) {
    case 'new': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    case 'fix': return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
    case 'improvement': return 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30';
    default: return 'bg-slate-700 text-slate-400';
  }
};
</script>

<template>
  <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" @click="$emit('close')">
    <div class="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full max-h-[80vh] flex flex-col shadow-2xl" @click.stop>

      <div class="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
        <div>
          <h2 class="text-2xl font-bold text-white flex items-center gap-2">
            <i class="ph-fill ph-scroll text-indigo-500"></i> Patch Notes
          </h2>
          <p class="text-xs text-slate-500 mt-1">What's new in Raccoon Open</p>
        </div>
        <button @click="$emit('close')" class="text-slate-500 hover:text-white transition-colors">
          <i class="ph-bold ph-x text-xl"></i>
        </button>
      </div>

      <div class="overflow-y-auto p-6 space-y-8">
        <div v-for="entry in changelogData" :key="entry.version" class="relative pl-6 border-l-2 border-slate-800">

          <div class="absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 transition-all"
               :class="isVersionNew(entry.version)
                 ? 'bg-emerald-500 border-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.8)]'
                 : 'bg-slate-800 border-slate-600'">
          </div>

          <div class="mb-2">
            <div class="flex items-center gap-3 mb-1">
              <span class="text-lg font-bold transition-colors"
                    :class="isVersionNew(entry.version) ? 'text-emerald-400' : 'text-white'">
                {{ entry.version }}
              </span>
              <span class="text-xs font-mono text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                {{ entry.date }}
              </span>
              <span v-if="isVersionNew(entry.version)"
                    class="text-[10px] uppercase font-bold tracking-wider text-emerald-900 bg-emerald-400 px-1.5 py-0.5 rounded shadow-sm">
                New
              </span>
            </div>

            <div class="text-sm font-bold"
                 :class="isVersionNew(entry.version) ? 'text-emerald-300' : 'text-indigo-400'">
              {{ entry.title }}
            </div>
          </div>

          <ul class="space-y-2 mt-3">
            <li v-for="(change, idx) in entry.changes" :key="idx" class="flex items-start gap-3 text-sm"
                :class="isVersionNew(entry.version) ? 'text-slate-200' : 'text-slate-400'">
              <span class="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold border shrink-0 mt-0.5"
                    :class="getBadgeColor(change.type)">
                {{ change.type }}
              </span>
              <span class="leading-relaxed">{{ change.text }}</span>
            </li>
          </ul>
        </div>
      </div>

      <div class="p-4 border-t border-slate-800 bg-slate-900/50 text-center">
        <button @click="$emit('close')" class="text-slate-400 hover:text-white text-sm font-bold transition-colors">
          Close
        </button>
      </div>

    </div>
  </div>
</template>