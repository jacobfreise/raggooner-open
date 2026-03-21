<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
    name: string;
    avatarUrl?: string | null;
    size?: 'sm' | 'md' | 'lg' | 'xl';
}>();

const imgError = ref(false);
</script>

<template>
    <div
        class="rounded-full shrink-0 flex items-center justify-center font-bold bg-slate-700 text-slate-300 overflow-hidden"
        :class="{
            'w-6 h-6 text-[9px]':  size === 'sm',
            'w-8 h-8 text-xs':     size === 'md' || !size,
            'w-10 h-10 text-sm':   size === 'lg',
            'w-16 h-16 text-xl':   size === 'xl',
        }"
    >
        <img
            v-if="avatarUrl && !imgError"
            :src="avatarUrl"
            :alt="name"
            class="w-full h-full object-cover"
            @error="imgError = true"
        />
        <span v-else>{{ name.charAt(0).toUpperCase() }}</span>
    </div>
</template>
