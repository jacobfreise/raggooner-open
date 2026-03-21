<script setup lang="ts">
import { inject, type Ref } from 'vue';
import { useAuth } from '../../composables/useAuth';

const openChangelog = inject<() => void>('openChangelog')!;
const hasNewUpdates = inject<Ref<boolean>>('hasNewUpdates')!;

const { user, linkedPlayer, loading, loginWithDiscord, logout, isDiscordUser } = useAuth();
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
                <!-- Discord Auth -->
                <div v-if="!loading" class="flex items-center">
                    <!-- Show Login button if NOT a Discord user (includes anonymous users) -->
                    <button v-if="!isDiscordUser" 
                            @click="loginWithDiscord"
                            class="flex items-center gap-2 bg-[#5865F2] hover:bg-[#4752C4] text-white px-4 py-1.5 rounded-lg text-sm font-bold transition-all shadow-lg shadow-indigo-900/20">
                        <i class="ph-fill ph-discord-logo text-lg"></i>
                        <span>Login with Discord</span>
                    </button>

                    <!-- Show Profile only for Discord users -->
                    <div v-else-if="user" class="flex items-center gap-3">
                        <div class="hidden md:flex flex-col items-end">
                            <span class="text-xs font-bold text-white leading-none">{{ user.displayName }}</span>
                            <span v-if="linkedPlayer" class="text-[10px] text-indigo-400 font-bold uppercase tracking-tighter">{{ linkedPlayer.name }}</span>
                            <span v-else class="text-[10px] text-amber-500 font-bold uppercase tracking-tighter italic">Not Linked</span>
                        </div>
                        
                        <div class="relative group">
                            <img v-if="user.photoURL" :src="user.photoURL" class="w-8 h-8 rounded-full border border-slate-700 cursor-pointer" alt="User" />
                            <div v-else class="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center cursor-pointer">
                                <i class="ph-bold ph-user text-slate-400"></i>
                            </div>

                            <!-- Dropdown Wrapper (Bridges the hover gap) -->
                            <div class="absolute right-0 top-full pt-2 w-48 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all transform translate-y-2 group-hover:translate-y-0 z-50">
                                <div class="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-1">
                                    <div class="px-3 py-2 border-b border-slate-800 md:hidden">
                                        <div class="text-xs font-bold text-white truncate">{{ user.displayName }}</div>
                                        <div v-if="linkedPlayer" class="text-[10px] text-indigo-400 font-bold truncate">{{ linkedPlayer.name }}</div>
                                    </div>
                                    <router-link to="/profile" class="w-full text-left px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all flex items-center gap-2">
                                        <i class="ph-bold ph-user"></i>
                                        Profile
                                    </router-link>
                                    <button @click="logout" class="w-full text-left px-3 py-2 text-sm text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all flex items-center gap-2">
                                        <i class="ph-bold ph-sign-out"></i>
                                        Logout
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="w-px h-6 bg-slate-700 mx-1"></div>

                <button @click="openChangelog" class="relative text-slate-400 hover:text-white transition-colors">
                    <i class="ph-bold ph-bell text-xl"></i>
                    <span v-if="hasNewUpdates" class="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-slate-900 animate-pulse"></span>
                </button>
            </div>
        </div>
    </header>
</template>
