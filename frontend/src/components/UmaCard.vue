<script setup lang="ts">
import { computed } from 'vue';
import type { Team, UmaData } from '../types';
import { UMA_DICT, getUmaImagePath } from '../utils/umaData';

const props = defineProps<{
  umaName: string;
  isBanned?: boolean;
  ownerTeam?: Team;
  disabled?: boolean;
  highlightAptitude?: string; // 'turf', 'dirt', 'sprint', etc.
  showStats?: boolean;
  actionType?: 'ban' | 'pick';
  surfaceAptitude?: string; // e.g., 'turf'
  distanceAptitude?: string; // e.g., 'mile'
}>();

const umaData = computed<UmaData | null>(() => UMA_DICT[props.umaName] || null);

const imagePath = computed(() => getUmaImagePath(props.umaName));

const stars = computed(() => umaData.value?.stars || 1);

function getAptitudeGrade(aptKey: string): string {
  if (!umaData.value) return '?';
  const { surface, distance, style } = umaData.value.aptitudes;
  
  if (aptKey in surface) return surface[aptKey as keyof typeof surface];
  if (aptKey in distance) return distance[aptKey as keyof typeof distance];
  if (aptKey in style) return style[aptKey as keyof typeof style];
  
  return '?';
}

function gradeColor(grade: string): string {
  if (grade === 'S' || grade === 'A') return 'bg-emerald-500 text-white';
  if (grade === 'B' || grade === 'C') return 'bg-blue-500 text-white';
  if (grade === 'D' || grade === 'E') return 'bg-amber-500 text-white';
  return 'bg-red-500 text-white';
}


const highlightedGrade = computed(() => {
  if (!props.highlightAptitude) return null;
  return getAptitudeGrade(props.highlightAptitude);
});

const APT_LABELS: Record<string, string> = {
  turf: 'Trf', dirt: 'Drt',
  sprint: 'Spr', mile: 'Mil', medium: 'Med', long: 'Lng',
};

const trackAptitudes = computed(() => {
  const apts = [];
  if (props.surfaceAptitude) {
    const key = props.surfaceAptitude.toLowerCase();
    const grade = getAptitudeGrade(key);
    apts.push({ label: APT_LABELS[key] ?? props.surfaceAptitude.slice(0, 3), grade });
  }
  if (props.distanceAptitude) {
    const key = props.distanceAptitude.toLowerCase();
    const grade = getAptitudeGrade(key);
    apts.push({ label: APT_LABELS[key] ?? props.distanceAptitude.slice(0, 3), grade });
  }
  return apts;
});

// Determine status text
const statusLabel = computed(() => {
    if (props.isBanned) return 'BANNED';
    if (props.ownerTeam) return props.ownerTeam.name;
    return null;
});

</script>

<template>
  <div class="relative group rounded-xl transition-all duration-300 overflow-hidden border-2 h-full flex flex-col items-center text-center"
       :class="[
         isBanned 
           ? 'bg-red-950/20 border-red-500/40 grayscale-[0.5] opacity-80' 
           : ownerTeam 
             ? 'bg-slate-900 border-slate-700 opacity-90' 
             : 'bg-slate-800 border-slate-700 hover:border-indigo-500 hover:shadow-lg hover:shadow-indigo-500/20 hover:-translate-y-1',
         disabled && !ownerTeam && !isBanned ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
       ]"
       :style="ownerTeam ? { borderColor: ownerTeam.color + '60', boxShadow: `0 4px 20px -5px ${ownerTeam.color}30` } : {}">
    
    <!-- Status Overlay/Ribbon -->
    <div v-if="statusLabel" 
         class="absolute top-0 right-0 z-20 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest rounded-bl-lg shadow-sm max-w-full truncate"
         :class="isBanned ? 'bg-red-600 text-white' : ''"
         :style="ownerTeam ? { backgroundColor: ownerTeam.color, color: '#fff' } : {}">
      {{ statusLabel }}
    </div>

    <!-- Banned Diagonal Lines -->
    <div v-if="isBanned" class="absolute inset-0 opacity-10 pointer-events-none z-10 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMSIvPgo8cGF0aCBkPSJNLTEgMUwyIC0xTTEgOUw5IDFNOSA5TDEgMSIgc3Ryb2tlPSIjMDAwIiBzdHJva2Utd2lkdGg9IjIiLz4KPC9zdmc+')]"></div>

    <!-- Card Content -->
    <div class="p-3 flex flex-col items-center gap-2 relative z-10 w-full">
      <!-- Image Container -->
      <div class="relative">
        <img :src="imagePath" 
             :alt="umaName" 
             class="w-16 h-16 rounded-full object-cover border-2 border-slate-700 bg-slate-900 group-hover:border-indigo-400 transition-colors"
             :class="{ 'border-red-500/50': isBanned }"/>
        
        <!-- Action Icon (Floating on top right of image) -->
        <div v-if="!ownerTeam && !isBanned" 
             class="absolute -top-1 -right-1 w-6 h-6 rounded-full border-2 border-slate-900 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 text-white shadow-lg z-30"
             :class="actionType === 'ban' ? 'bg-red-600' : 'bg-indigo-600'">
          <i class="ph-bold text-xs" :class="actionType === 'ban' ? 'ph-prohibit' : 'ph-plus'"></i>
        </div>

        <!-- Stars Overlay -->
        <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 flex bg-slate-900/80 backdrop-blur-sm rounded-full px-1.5 py-0.5 border border-slate-700 shadow-sm">
          <i v-for="i in stars" :key="i" class="ph-fill ph-star text-[8px] text-amber-400"></i>
        </div>

        <!-- Highlighted Aptitude Grade -->
        <div v-if="highlightedGrade" 
             class="absolute -top-1 -left-1 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black border-2 border-slate-900 shadow-md z-20"
             :class="gradeColor(highlightedGrade)">
          {{ highlightedGrade }}
        </div>
      </div>

      <!-- Track Aptitudes -->
      <div v-if="trackAptitudes.length > 0" class="flex gap-1.5 justify-center -mt-1 mb-1">
        <div v-for="apt in trackAptitudes" :key="apt.label"
             class="flex items-center gap-0.5 rounded px-1.5 py-0.5"
             :class="gradeColor(apt.grade)">
          <span class="text-[8px] font-semibold leading-none opacity-80">{{ apt.label }}</span>
          <span class="text-[10px] font-black leading-none">{{ apt.grade }}</span>
        </div>
      </div>

      <!-- Name -->
      <div class="font-bold text-xs leading-tight line-clamp-2 min-h-[2rem] flex items-center justify-center px-1"
           :class="[
             isBanned ? 'text-red-300 line-through decoration-red-500/50' : 'text-slate-100 group-hover:text-white',
             ownerTeam ? 'text-white' : ''
           ]">
        {{ umaName }}
      </div>
    </div>

  </div>
</template>

<style scoped>
.grayscale-\[0\.5\] {
  filter: grayscale(0.5);
}
</style>