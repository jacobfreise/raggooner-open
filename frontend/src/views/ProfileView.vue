<script setup lang="ts">
defineOptions({ inheritAttrs: false });
import { ref, computed } from 'vue';
import { useAuth } from '../composables/useAuth';
import { UMA_LIST, getUmaImagePath } from '../utils/umaData';
import {
    SUPPORT_CARD_LIST,
    SUPPORT_CARD_DICT,
    SUPPORT_CARD_TYPE_META,
    type SupportCard,
} from '../utils/supportCardData';
import type { ProfileSupportCard, SupportCardType } from '../types';
import SiteHeader from '../components/shared/SiteHeader.vue';
import SiteNav from '../components/shared/SiteNav.vue';
import PlayerAvatar from '../components/shared/PlayerAvatar.vue';

const { user, linkedPlayer, updatePlayerProfile } = useAuth();

// ── Uma Roster ────────────────────────────────────────────────────────────────

const umaSearch = ref('');
const savingRoster = ref(false);

const filteredUmas = computed(() =>
    UMA_LIST.filter(u => u.name.toLowerCase().includes(umaSearch.value.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name))
);

const ownedUmas = computed<Set<string>>(() =>
    new Set(linkedPlayer.value?.roster ?? [])
);

const toggleUma = async (umaName: string) => {
    if (!linkedPlayer.value) return;
    savingRoster.value = true;
    const current = new Set(linkedPlayer.value.roster ?? []);
    if (current.has(umaName)) current.delete(umaName);
    else current.add(umaName);
    try {
        await updatePlayerProfile({ roster: [...current] });
    } finally {
        savingRoster.value = false;
    }
};

// ── Support Cards ─────────────────────────────────────────────────────────────

const savingCards = ref(false);

const ownedCards = computed<ProfileSupportCard[]>(() =>
    linkedPlayer.value?.supportCards ?? []
);

// Cards not yet owned (so we don't add duplicates)
const availableToAdd = computed<SupportCard[]>(() => {
    const ownedIds = new Set(ownedCards.value.map(c => c.cardId));
    return SUPPORT_CARD_LIST
        .filter(c => !ownedIds.has(c.id))
        .sort((a, b) => a.name.localeCompare(b.name));
});

// Add card form state
const showAddCard = ref(false);
const addCardId = ref('');
const addCardLb = ref(0);

const openAddCard = () => {
    addCardId.value = availableToAdd.value[0]?.id ?? '';
    addCardLb.value = 0;
    showAddCard.value = true;
};

const confirmAddCard = async () => {
    if (!addCardId.value || !linkedPlayer.value) return;
    savingCards.value = true;
    const updated: ProfileSupportCard[] = [
        ...ownedCards.value,
        { cardId: addCardId.value, limitBreak: addCardLb.value },
    ];
    try {
        await updatePlayerProfile({ supportCards: updated });
        showAddCard.value = false;
    } finally {
        savingCards.value = false;
    }
};

const removeCard = async (cardId: string) => {
    if (!linkedPlayer.value) return;
    savingCards.value = true;
    const updated = ownedCards.value.filter(c => c.cardId !== cardId);
    try {
        await updatePlayerProfile({ supportCards: updated });
    } finally {
        savingCards.value = false;
    }
};

const updateLimitBreak = async (cardId: string, lb: number) => {
    if (!linkedPlayer.value) return;
    savingCards.value = true;
    const updated = ownedCards.value.map(c =>
        c.cardId === cardId ? { ...c, limitBreak: lb } : c
    );
    try {
        await updatePlayerProfile({ supportCards: updated });
    } finally {
        savingCards.value = false;
    }
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const typeMeta = (type: SupportCardType) => SUPPORT_CARD_TYPE_META[type];

const sortedOwnedCards = computed(() =>
    [...ownedCards.value].sort((a, b) => {
        const ca = SUPPORT_CARD_DICT[a.cardId];
        const cb = SUPPORT_CARD_DICT[b.cardId];
        if (!ca || !cb) return 0;
        if (ca.type !== cb.type) return ca.type.localeCompare(cb.type);
        return ca.name.localeCompare(cb.name);
    })
);
</script>

<template>
    <div v-bind="$attrs" class="w-full flex flex-col">
    <SiteHeader />
    <div class="flex-grow p-4 md:p-6 max-w-7xl mx-auto w-full">
        <SiteNav />
    </div>
    <div class="max-w-[1200px] mx-auto px-4 md:px-8 pb-6">

        <!-- Not logged in -->
        <div v-if="!user" class="bg-slate-800 border border-slate-700 rounded-xl p-12 text-center">
            <i class="ph-fill ph-discord-logo text-5xl text-[#5865F2] mb-4"></i>
            <p class="text-slate-400">Login with Discord to view your profile.</p>
        </div>

        <!-- Logged in but not linked -->
        <div v-else-if="!linkedPlayer" class="bg-slate-800 border border-slate-700 rounded-xl p-12 text-center">
            <i class="ph-bold ph-link-break text-5xl text-slate-600 mb-4"></i>
            <p class="text-slate-400">Link your account to a player first.</p>
        </div>

        <!-- Full profile -->
        <template v-else>

            <!-- Header card -->
            <div class="bg-slate-800 border border-slate-700 rounded-xl p-6 mb-6 flex items-center gap-5">
                <PlayerAvatar
                    :name="linkedPlayer.name"
                    :avatar-url="linkedPlayer.avatarUrl ?? user.photoURL"
                    size="xl"
                    class="border-2 border-slate-600"
                />
                <div>
                    <div class="text-xl font-bold text-white">{{ linkedPlayer.name }}</div>
                    <div class="text-sm text-slate-400 flex items-center gap-1.5 mt-0.5">
                        <i class="ph-fill ph-discord-logo text-[#5865F2]"></i>
                        {{ user.displayName }}
                    </div>
                    <div class="flex gap-4 mt-2 text-xs text-slate-500">
                        <span><span class="text-white font-bold">{{ linkedPlayer.metadata.totalTournaments }}</span> tournaments</span>
                        <span><span class="text-white font-bold">{{ linkedPlayer.metadata.totalRaces }}</span> races</span>
                        <span><span class="inline-block min-w-[2ch] text-right tabular-nums text-white font-bold">{{ linkedPlayer.roster?.length ?? 0 }}</span> umas</span>
                        <span><span class="text-white font-bold">{{ linkedPlayer.supportCards?.length ?? 0 }}</span> support cards</span>
                    </div>
                </div>
            </div>

            <!-- ── Uma Roster ─────────────────────────────────────────── -->
            <div class="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden mb-6">
                <div class="px-5 py-4 border-b border-slate-700 bg-slate-900 flex items-center justify-between gap-4">
                    <div>
                        <h2 class="font-bold text-white uppercase tracking-wider text-sm">Uma Roster</h2>
                        <p class="text-xs text-slate-500 mt-0.5"><span class="inline-block min-w-[2ch] text-right tabular-nums">{{ ownedUmas.size }}</span> / {{ UMA_LIST.length }} umas owned</p>
                    </div>
                    <input
                        v-model="umaSearch"
                        placeholder="Search…"
                        class="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-48"
                    />
                </div>

                <div class="p-4 grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2">
                    <button
                        v-for="uma in filteredUmas"
                        :key="uma.id"
                        @click="toggleUma(uma.name)"
                        :disabled="savingRoster"
                        class="relative rounded-lg overflow-hidden border-2 transition-[border-color,box-shadow,opacity] duration-150 group"
                        :class="ownedUmas.has(uma.name)
                            ? 'border-indigo-500 shadow-md shadow-indigo-500/20'
                            : 'border-slate-700 opacity-40 hover:opacity-70 hover:border-slate-500'"
                    >
                        <img
                            :src="getUmaImagePath(uma.name)"
                            :alt="uma.name"
                            class="w-full aspect-square object-cover object-top bg-slate-700"
                        />
                        <div class="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-transparent to-transparent"></div>
                        <div class="absolute bottom-0 left-0 right-0 px-1 pb-1">
                            <p class="text-[9px] text-white font-bold leading-tight truncate text-center drop-shadow">{{ uma.name }}</p>
                        </div>
                        <!-- Owned checkmark -->
                        <div v-if="ownedUmas.has(uma.name)" class="absolute top-1 right-1 w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center shadow">
                            <i class="ph-bold ph-check text-[8px] text-white"></i>
                        </div>
                    </button>
                </div>
            </div>

            <!-- ── Support Cards ──────────────────────────────────────── -->
            <div class="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                <div class="px-5 py-4 border-b border-slate-700 bg-slate-900 flex items-center justify-between">
                    <div>
                        <h2 class="font-bold text-white uppercase tracking-wider text-sm">Support Cards</h2>
                        <p class="text-xs text-slate-500 mt-0.5">{{ ownedCards.length }} cards owned</p>
                    </div>
                    <button
                        v-if="!showAddCard && availableToAdd.length > 0"
                        @click="openAddCard"
                        class="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-colors"
                    >
                        <i class="ph-bold ph-plus"></i>
                        Add Card
                    </button>
                </div>

                <!-- Add card form -->
                <div v-if="showAddCard" class="px-5 py-4 border-b border-slate-700 bg-slate-900/50 flex flex-wrap items-end gap-3">
                    <div class="flex flex-col gap-1">
                        <label class="text-xs text-slate-400 font-bold uppercase tracking-wider">Card</label>
                        <select
                            v-model="addCardId"
                            class="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                        >
                            <option v-for="card in availableToAdd" :key="card.id" :value="card.id">
                                {{ card.name }} ({{ SUPPORT_CARD_TYPE_META[card.type].label }})
                            </option>
                        </select>
                    </div>
                    <div class="flex flex-col gap-1">
                        <label class="text-xs text-slate-400 font-bold uppercase tracking-wider">Limit Break</label>
                        <div class="flex gap-1">
                            <button
                                v-for="lb in [0,1,2,3,4]"
                                :key="lb"
                                @click="addCardLb = lb"
                                class="w-8 h-8 rounded-lg text-xs font-bold border transition-colors"
                                :class="addCardLb === lb
                                    ? 'bg-indigo-600 border-indigo-500 text-white'
                                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'"
                            >{{ lb }}</button>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button
                            @click="confirmAddCard"
                            :disabled="savingCards || !addCardId"
                            class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors"
                        >Add</button>
                        <button
                            @click="showAddCard = false"
                            class="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-bold rounded-lg transition-colors"
                        >Cancel</button>
                    </div>
                </div>

                <!-- Card list -->
                <div v-if="sortedOwnedCards.length > 0" class="divide-y divide-slate-700">
                    <div
                        v-for="entry in sortedOwnedCards"
                        :key="entry.cardId"
                        class="flex items-center gap-4 px-5 py-3 hover:bg-slate-700/30 transition-colors"
                    >
                        <template v-if="SUPPORT_CARD_DICT[entry.cardId]" v-for="card in [SUPPORT_CARD_DICT[entry.cardId]!]">
                            <!-- Type badge -->
                            <span
                                class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded w-16 text-center shrink-0"
                                :class="[typeMeta(card.type).color, typeMeta(card.type).bg]"
                            >{{ typeMeta(card.type).label }}</span>

                            <!-- Name + rarity -->
                            <div class="flex-1 min-w-0">
                                <span class="text-sm font-bold text-white">{{ card.name }}</span>
                                <span class="ml-2 text-xs text-slate-500">{{ card.rarity }}</span>
                            </div>

                            <!-- Limit break selector -->
                            <div class="flex gap-1 shrink-0">
                                <button
                                    v-for="lb in [0,1,2,3,4]"
                                    :key="lb"
                                    @click="updateLimitBreak(entry.cardId, lb)"
                                    :disabled="savingCards"
                                    class="w-7 h-7 rounded text-xs font-bold border transition-colors"
                                    :class="entry.limitBreak === lb
                                        ? 'bg-indigo-600 border-indigo-500 text-white'
                                        : 'bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300'"
                                >{{ lb }}</button>
                            </div>

                            <!-- Remove -->
                            <button
                                @click="removeCard(entry.cardId)"
                                :disabled="savingCards"
                                class="ml-2 text-slate-600 hover:text-red-400 transition-colors shrink-0"
                            >
                                <i class="ph-bold ph-x"></i>
                            </button>
                        </template>
                    </div>
                </div>

                <div v-else-if="!showAddCard" class="px-5 py-10 text-center text-slate-600 text-sm">
                    No support cards added yet.
                </div>
            </div>

        </template>
    </div>
    </div>
</template>
