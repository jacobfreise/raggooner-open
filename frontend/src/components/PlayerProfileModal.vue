<script setup lang="ts">
import { ref, computed } from 'vue';
import type { GlobalPlayer, SupportCardType } from '../types';
import { getUmaImagePath } from '../utils/umaData';
import { SUPPORT_CARD_DICT, SUPPORT_CARD_TYPE_META } from '../utils/supportCardData';

const props = defineProps<{
    open: boolean;
    playerName: string;
    globalPlayer: GlobalPlayer | null;
}>();

const emit = defineEmits<{ close: [] }>();

// ── Tabs ──────────────────────────────────────────────────────────────────────
const activeTab = ref<'umas' | 'cards'>('umas');

// ── Uma filters ───────────────────────────────────────────────────────────────
const umaFilter = ref('');

const ownedUmas = computed(() => {
    const roster = props.globalPlayer?.roster ?? [];
    const q = umaFilter.value.toLowerCase();
    return roster
        .filter(name => name.toLowerCase().includes(q))
        .sort((a, b) => a.localeCompare(b));
});

// ── Support card filters ───────────────────────────────────────────────────────
const cardTypeFilter = ref<SupportCardType | null>(null);
const cardMinLb = ref(0);

const filteredCards = computed(() => {
    const cards = props.globalPlayer?.supportCards ?? [];
    return cards.filter(c => {
        if (cardTypeFilter.value !== null) {
            const meta = SUPPORT_CARD_DICT[c.cardId];
            if (!meta || meta.type !== cardTypeFilter.value) return false;
        }
        return c.limitBreak >= cardMinLb.value;
    }).sort((a, b) => {
        const ca = SUPPORT_CARD_DICT[a.cardId];
        const cb = SUPPORT_CARD_DICT[b.cardId];
        if (!ca || !cb) return 0;
        if (ca.type !== cb.type) return ca.type.localeCompare(cb.type);
        return ca.name.localeCompare(cb.name);
    });
});

const ALL_TYPES: SupportCardType[] = ['speed', 'stamina', 'power', 'guts', 'wit', 'group', 'pal'];

const toggleTypeFilter = (type: SupportCardType) => {
    cardTypeFilter.value = cardTypeFilter.value === type ? null : type;
};

const onOpen = () => {
    activeTab.value = 'umas';
    umaFilter.value = '';
    cardTypeFilter.value = null;
    cardMinLb.value = 0;
};

// Reset state whenever the modal opens
import { watch } from 'vue';
watch(() => props.open, (val) => { if (val) onOpen(); });
</script>

<template>
    <Teleport to="body">
        <Transition name="modal">
            <div v-if="open"
                 class="fixed inset-0 z-[200] flex items-center justify-center p-4"
                 @click.self="emit('close')">

                <!-- Backdrop -->
                <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="emit('close')"></div>

                <!-- Panel -->
                <div class="relative z-10 w-full max-w-lg max-h-[85vh] flex flex-col bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">

                    <!-- Header -->
                    <div class="flex items-center justify-between px-5 py-4 border-b border-slate-700 shrink-0">
                        <div>
                            <h2 class="text-lg font-bold text-white">{{ playerName }}</h2>
                            <p v-if="globalPlayer?.discordId" class="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                                <i class="ph-fill ph-discord-logo text-[#5865F2]"></i>
                                Linked profile
                            </p>
                            <p v-else class="text-xs text-slate-600 mt-0.5 italic">No linked profile</p>
                        </div>
                        <button @click="emit('close')"
                                class="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors">
                            <i class="ph-bold ph-x"></i>
                        </button>
                    </div>

                    <!-- No profile state -->
                    <div v-if="!globalPlayer || (!globalPlayer.roster?.length && !globalPlayer.supportCards?.length)"
                         class="flex-1 flex flex-col items-center justify-center py-16 text-slate-600">
                        <i class="ph-bold ph-user-circle text-5xl mb-3"></i>
                        <p class="text-sm">No profile data available.</p>
                    </div>

                    <!-- Tabs + content -->
                    <template v-else>
                        <!-- Tab bar -->
                        <div class="flex border-b border-slate-700 shrink-0">
                            <button @click="activeTab = 'umas'"
                                    class="flex-1 px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5"
                                    :class="activeTab === 'umas'
                                        ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5'
                                        : 'text-slate-500 hover:text-slate-300'">
                                <i class="ph-fill ph-horse"></i>
                                Umas
                                <span class="text-[10px] opacity-70">({{ globalPlayer.roster?.length ?? 0 }})</span>
                            </button>
                            <button @click="activeTab = 'cards'"
                                    class="flex-1 px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5"
                                    :class="activeTab === 'cards'
                                        ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5'
                                        : 'text-slate-500 hover:text-slate-300'">
                                <i class="ph-fill ph-cards"></i>
                                Support Cards
                                <span class="text-[10px] opacity-70">({{ globalPlayer.supportCards?.length ?? 0 }})</span>
                            </button>
                        </div>

                        <!-- ── Uma Tab ── -->
                        <div v-if="activeTab === 'umas'" class="flex-1 flex flex-col overflow-hidden">
                            <div class="px-4 py-3 border-b border-slate-800 shrink-0">
                                <input v-model="umaFilter"
                                       placeholder="Search umas…"
                                       class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500" />
                            </div>

                            <div v-if="ownedUmas.length === 0" class="flex-1 flex items-center justify-center text-slate-600 text-sm py-12">
                                {{ umaFilter ? 'No umas match your search.' : 'No umas in roster.' }}
                            </div>

                            <div v-else class="flex-1 overflow-y-auto p-4">
                                <div class="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2">
                                    <div v-for="umaName in ownedUmas" :key="umaName"
                                         class="relative rounded-lg overflow-hidden border border-indigo-500/40 shadow-sm shadow-indigo-500/10">
                                        <img :src="getUmaImagePath(umaName)"
                                             :alt="umaName"
                                             class="w-full aspect-square object-cover object-top bg-slate-700" />
                                        <div class="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-transparent to-transparent"></div>
                                        <p class="absolute bottom-0 left-0 right-0 text-[9px] text-white font-bold text-center pb-0.5 px-0.5 truncate drop-shadow">
                                            {{ umaName }}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- ── Support Cards Tab ── -->
                        <div v-if="activeTab === 'cards'" class="flex-1 flex flex-col overflow-hidden">
                            <!-- Filters -->
                            <div class="px-4 py-3 border-b border-slate-800 space-y-3 shrink-0">
                                <!-- Type filter -->
                                <div class="flex flex-wrap gap-1.5">
                                    <button v-for="type in ALL_TYPES" :key="type"
                                            @click="toggleTypeFilter(type)"
                                            class="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded transition-colors"
                                            :class="cardTypeFilter === type
                                                ? [SUPPORT_CARD_TYPE_META[type].color, SUPPORT_CARD_TYPE_META[type].bg, 'ring-1 ring-current']
                                                : 'text-slate-500 bg-slate-800 hover:text-slate-300'">
                                        {{ SUPPORT_CARD_TYPE_META[type].label }}
                                    </button>
                                </div>

                                <!-- Min LB slider -->
                                <div class="flex items-center gap-3">
                                    <span class="text-xs text-slate-500 shrink-0 w-16">Min LB: <span class="text-white font-bold">{{ cardMinLb }}</span></span>
                                    <input type="range" min="0" max="4" step="1"
                                           v-model.number="cardMinLb"
                                           class="flex-1 accent-indigo-500 cursor-pointer" />
                                    <div class="flex gap-0.5 shrink-0">
                                        <div v-for="i in 4" :key="i"
                                             class="w-2 h-2 rounded-full transition-colors"
                                             :class="i <= cardMinLb ? 'bg-indigo-400' : 'bg-slate-700'"></div>
                                    </div>
                                </div>
                            </div>

                            <div v-if="filteredCards.length === 0" class="flex-1 flex items-center justify-center text-slate-600 text-sm py-12">
                                No support cards match the filters.
                            </div>

                            <div v-else class="flex-1 overflow-y-auto divide-y divide-slate-800">
                                <div v-for="entry in filteredCards" :key="entry.cardId"
                                     class="flex items-center gap-3 px-4 py-2.5">
                                    <template v-if="SUPPORT_CARD_DICT[entry.cardId]" v-for="card in [SUPPORT_CARD_DICT[entry.cardId]!]">
                                        <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded shrink-0 w-14 text-center"
                                              :class="[SUPPORT_CARD_TYPE_META[card.type].color, SUPPORT_CARD_TYPE_META[card.type].bg]">
                                            {{ SUPPORT_CARD_TYPE_META[card.type].label }}
                                        </span>
                                        <span class="text-sm font-bold text-white flex-1 min-w-0 truncate">{{ card.name }}</span>
                                        <span class="text-xs text-slate-600 shrink-0">{{ card.rarity }}</span>
                                        <!-- LB dots -->
                                        <div class="flex gap-0.5 shrink-0">
                                            <div v-for="i in 4" :key="i"
                                                 class="w-2 h-2 rounded-full"
                                                 :class="i <= entry.limitBreak ? 'bg-indigo-400' : 'bg-slate-700'"></div>
                                        </div>
                                    </template>
                                </div>
                            </div>
                        </div>
                    </template>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
.modal-enter-active, .modal-leave-active { transition: opacity 0.15s, transform 0.15s; }
.modal-enter-from, .modal-leave-to { opacity: 0; transform: scale(0.97); }
</style>
