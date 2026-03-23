<script setup lang="ts">
import { ref, computed } from 'vue';
import type { GlobalPlayer, RecentResult, SupportCardType } from '../types';
import { getUmaImagePath, UMA_LIST } from '../utils/umaData';
import { SUPPORT_CARD_DICT, SUPPORT_CARD_TYPE_META } from '../utils/supportCardData';
import PlayerAvatar from './shared/PlayerAvatar.vue';

const props = defineProps<{
    open: boolean;
    playerName: string;
    globalPlayer: GlobalPlayer | null;
}>();

const emit = defineEmits<{ close: [] }>();

// ── Tabs ──────────────────────────────────────────────────────────────────────
const activeTab = ref<'umas' | 'cards' | 'history'>('umas');

// ── Uma filters ───────────────────────────────────────────────────────────────
const umaFilter = ref('');
const showUnowned = ref(false);

const ownedUmas = computed(() => {
    const roster = props.globalPlayer?.roster ?? [];
    const q = umaFilter.value.toLowerCase();
    return roster
        .filter(name => name.toLowerCase().includes(q))
        .sort((a, b) => a.localeCompare(b));
});

const unownedUmas = computed(() => {
    if (!showUnowned.value) return [];
    const owned = new Set(props.globalPlayer?.roster ?? []);
    const q = umaFilter.value.toLowerCase();
    return UMA_LIST
        .map(u => u.name)
        .filter(name => !owned.has(name) && name.toLowerCase().includes(q))
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

// ── History helpers ───────────────────────────────────────────────────────────
const recentResults = computed<RecentResult[]>(() =>
    props.globalPlayer?.metadata?.recentResults ?? []
);

const ordinal = (n: number): string => {
    if (n <= 0) return '?';
    if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
    switch (n % 10) {
        case 1: return `${n}st`;
        case 2: return `${n}nd`;
        case 3: return `${n}rd`;
        default: return `${n}th`;
    }
};

const placementClass = (n: number): string => {
    if (n === 1) return 'text-amber-400';
    if (n === 2) return 'text-slate-300';
    if (n === 3) return 'text-orange-400';
    return 'text-slate-500';
};

const formatDate = (iso: string): string =>
    new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

const onOpen = () => {
    activeTab.value = 'umas';
    umaFilter.value = '';
    showUnowned.value = false;
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
                        <div class="flex items-center gap-3">
                            <PlayerAvatar :name="playerName" :avatar-url="globalPlayer?.avatarUrl" size="xl" />
                            <div>
                                <h2 class="text-lg font-bold text-white">{{ playerName }}</h2>
                                <p v-if="globalPlayer?.discordId" class="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                                    <i class="ph-fill ph-discord-logo text-[#5865F2]"></i>
                                    Linked profile
                                </p>
                                <p v-else class="text-xs text-slate-600 mt-0.5 italic">No linked profile</p>
                            </div>
                        </div>
                        <button @click="emit('close')"
                                class="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors">
                            <i class="ph-bold ph-x"></i>
                        </button>
                    </div>

                    <!-- No profile state -->
                    <div v-if="!globalPlayer || (!globalPlayer.roster?.length && !globalPlayer.supportCards?.length && !recentResults.length)"
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
                                <span class="text-[10px] opacity-70">({{ globalPlayer?.roster?.length ?? 0 }})</span>
                            </button>
                            <button @click="activeTab = 'cards'"
                                    class="flex-1 px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5"
                                    :class="activeTab === 'cards'
                                        ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5'
                                        : 'text-slate-500 hover:text-slate-300'">
                                <i class="ph-fill ph-cards"></i>
                                Support Cards
                                <span class="text-[10px] opacity-70">({{ globalPlayer?.supportCards?.length ?? 0 }})</span>
                            </button>
                            <button @click="activeTab = 'history'"
                                    class="flex-1 px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5"
                                    :class="activeTab === 'history'
                                        ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5'
                                        : 'text-slate-500 hover:text-slate-300'">
                                <i class="ph-fill ph-trophy"></i>
                                History
                                <span class="text-[10px] opacity-70">({{ recentResults.length }})</span>
                            </button>
                        </div>

                        <!-- ── Uma Tab ── -->
                        <div v-if="activeTab === 'umas'" class="flex-1 flex flex-col overflow-hidden">
                            <div class="px-4 py-3 border-b border-slate-800 shrink-0 space-y-2">
                                <input v-model="umaFilter"
                                       placeholder="Search umas…"
                                       class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500" />
                                <label class="flex items-center gap-2 cursor-pointer w-fit">
                                    <input type="checkbox" v-model="showUnowned" class="accent-indigo-500 w-3.5 h-3.5 cursor-pointer" />
                                    <span class="text-xs text-slate-400">Show unowned</span>
                                </label>
                            </div>

                            <div v-if="ownedUmas.length === 0 && unownedUmas.length === 0" class="flex-1 flex items-center justify-center text-slate-600 text-sm py-12">
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
                                    <div v-for="umaName in unownedUmas" :key="'u-' + umaName"
                                         class="relative rounded-lg overflow-hidden border border-slate-700/50 opacity-35">
                                        <img :src="getUmaImagePath(umaName)"
                                             :alt="umaName"
                                             class="w-full aspect-square object-cover object-top bg-slate-700 grayscale" />
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
                        <!-- ── History Tab ── -->
                        <div v-if="activeTab === 'history'" class="flex-1 flex flex-col overflow-hidden">
                            <div v-if="recentResults.length === 0"
                                 class="flex-1 flex flex-col items-center justify-center py-12 text-slate-600">
                                <i class="ph-bold ph-trophy text-4xl mb-3"></i>
                                <p class="text-sm">No tournament history yet.</p>
                            </div>

                            <div v-else class="flex-1 overflow-y-auto p-4 space-y-3">
                                <div v-for="result in recentResults" :key="result.tournamentId"
                                     class="bg-slate-800/80 border border-slate-700/60 rounded-xl p-4 space-y-3">

                                    <!-- Header row -->
                                    <div class="flex items-start justify-between gap-3">
                                        <div class="min-w-0">
                                            <div class="flex items-center gap-1.5 flex-wrap">
                                                <span v-if="result.isOfficial"
                                                      class="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-900/50 text-indigo-400 border border-indigo-500/30 shrink-0">
                                                    Official
                                                </span>
                                                <span class="font-bold text-white text-sm truncate">{{ result.tournamentName }}</span>
                                            </div>
                                            <div class="flex items-center gap-1.5 mt-1 text-xs text-slate-500 flex-wrap">
                                                <i class="ph-fill ph-users-three shrink-0"></i>
                                                <span>{{ result.teamName }}</span>
                                                <span>·</span>
                                                <span>{{ formatDate(result.playedAt) }}</span>
                                            </div>
                                        </div>
                                        <div class="shrink-0 text-right">
                                            <div class="text-xl font-black leading-none"
                                                 :class="placementClass(result.teamPlacement)">
                                                {{ ordinal(result.teamPlacement) }}
                                            </div>
                                            <div class="text-[10px] text-slate-600 mt-0.5">place</div>
                                        </div>
                                    </div>

                                    <!-- Stats grid -->
                                    <div class="grid grid-cols-3 gap-1.5 text-center">
                                        <div class="bg-slate-900/60 rounded-lg px-2 py-2">
                                            <div class="text-[10px] text-slate-500 mb-0.5">Races</div>
                                            <div class="text-sm font-bold text-white">{{ result.racesPlayed }}</div>
                                        </div>
                                        <div class="bg-slate-900/60 rounded-lg px-2 py-2">
                                            <div class="text-[10px] text-slate-500 mb-0.5">Wins</div>
                                            <div class="text-sm font-bold text-emerald-400">{{ result.raceWins }}</div>
                                        </div>
                                        <div class="bg-slate-900/60 rounded-lg px-2 py-2">
                                            <div class="text-[10px] text-slate-500 mb-0.5">Dominance</div>
                                            <div class="text-sm font-bold text-indigo-400">{{ result.dominancePct.toFixed(1) }}%</div>
                                        </div>
                                        <div class="bg-slate-900/60 rounded-lg px-2 py-2">
                                            <div class="text-[10px] text-slate-500 mb-0.5">Avg Pts</div>
                                            <div class="text-sm font-bold text-white">{{ result.avgPoints.toFixed(1) }}</div>
                                        </div>
                                        <div class="bg-slate-900/60 rounded-lg px-2 py-2">
                                            <div class="text-[10px] text-slate-500 mb-0.5">Avg Pos</div>
                                            <div class="text-sm font-bold text-white">{{ result.avgPlacement.toFixed(1) }}</div>
                                        </div>
                                        <div class="bg-slate-900/60 rounded-lg px-2 py-2 flex flex-col items-center overflow-hidden">
                                            <div class="text-[10px] text-slate-500 mb-0.5">Uma</div>
                                            <div v-if="result.umaPlayed" class="flex items-center gap-1 w-full justify-center">
                                                <img :src="getUmaImagePath(result.umaPlayed)"
                                                     :alt="result.umaPlayed"
                                                     class="w-5 h-5 object-cover object-top rounded shrink-0" />
                                                <span class="text-xs font-bold text-white truncate">{{ result.umaPlayed }}</span>
                                            </div>
                                            <span v-else class="text-sm font-bold text-slate-600">—</span>
                                        </div>
                                    </div>
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
