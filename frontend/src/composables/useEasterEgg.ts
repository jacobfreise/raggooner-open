// composables/useEasterEgg.ts
import { ref, watch, type Ref } from 'vue';
import type { Tournament, EggConfig } from '../types';

// --- CONFIGURATION ---
const EGG_LIST: EggConfig[] = [
    {
        id: 'hishi_win',
        // Trigger: Hishi Akebono wins
        check: (race, players) => {
            const winnerId = Object.keys(race.placements).find(pid => race.placements[pid] == 1);
            if (!winnerId) return false;
            const winner = players.find(p => p.id === winnerId);
            return winner?.uma === 'Hishi Akebono';
        },
        audio: 'Bono.mp3',
        volume: 0.8,
        duration: 8000,
        visual: {
            overlayClass: 'hishi-overlay', // The red flash overlay
            rootClass: 'hishi-quake',      // The screen shake effect
            text: 'BONO!'
        }
    },
    {
        id: 'dedra_spechonky',
        // Example: Gold Ship gets last place (Audio Only)
        check: (race, players) => {
            const winnerId = Object.keys(race.placements)
                .find(pid => race.placements[pid] == 1);
            if (!winnerId) return false;
            const winner = players.find(p => p.id === winnerId);
            return winner?.uma.toLowerCase().includes('special week') && winner?.name.toLowerCase().includes('dedratermi');
        },
        audio: 'special-week-agemasen.mp3',
        volume: 0.7,
        duration: 1000,
        visual: {
            text: 'AGEMASEN!',
            overlayClass: 'flex-col gap-12 bg-black/50 backdrop-blur-sm',
            image: '/special-week-agemasen.gif',
            imageClass: 'w-[500px] h-auto rounded-xl shadow-2xl animate-bounce'
        }
    }
];



// --- HELPERS ---
// Helper: Calculate total participants for a specific race context
// const getRacerCount = (race: any, t: Tournament): number => {
//     // 1. Filter teams based on the race stage/group
//     let relevantTeams = [];
//
//     if (race.stage === 'finals') {
//         relevantTeams = t.teams.filter(team => team.inFinals);
//     } else {
//         // Groups A, B, C
//         relevantTeams = t.teams.filter(team => team.group === race.group);
//     }
//
//     // 2. Sum Players (1 Captain + N Members per team)
//     const teamPlayerCount = relevantTeams.reduce((sum, team) => {
//         return sum + 1 + (team.memberIds?.length || 0);
//     }, 0);
//
//     // 3. Add Wildcards for this specific group
//     // Note: Ensure your wildcard group names match your race group names ('A', 'B', 'Finals')
//     const targetGroup = race.stage === 'finals' ? 'Finals' : race.group;
//     const wildcardCount = t.wildcards?.filter(w => w.group === targetGroup).length || 0;
//
//     return teamPlayerCount + wildcardCount;
// };

export function useEasterEgg(tournament: Ref<Tournament | null>) {
    // --- STATE ---
    // Holds the config of the CURRENTLY playing visual egg (if any)
    const activeVisualEgg = ref<EggConfig | null>(null);

    // Tracks played eggs so they don't repeat. Format: "raceId_eggId"
    const playedHistory = ref(new Set<string>());

    const isFirstLoad = ref(true);

    // --- ACTIONS ---
    const playAudio = (file: string, vol: number = 0.5) => {
        const audio = new Audio(file);
        audio.volume = vol;
        audio.play().catch(e => console.warn("Egg Audio blocked:", e));
    };

    const triggerEgg = (egg: EggConfig) => {
        // 1. Play Audio (if exists)
        if (egg.audio) {
            playAudio(egg.audio, egg.volume);
        }

        // 2. Show Visuals (if exists)
        if (egg.visual) {
            // Set the current egg as active so the template can render it
            activeVisualEgg.value = egg;

            // Auto-hide after duration
            setTimeout(() => {
                // Only clear if we are still showing THIS egg
                // (prevents clearing a newer egg if they overlap quickly)
                if (activeVisualEgg.value?.id === egg.id) {
                    activeVisualEgg.value = null;
                }
            }, egg.duration || 3000);
        }
    };

    const processRaces = (forceSilent: boolean) => {
        if (!tournament.value) return;

        tournament.value.races.forEach(race => {
            EGG_LIST.forEach(egg => {
                // Create unique key: This specific race + this specific egg
                const historyKey = `${race.id}_${egg.id}`;

                // Skip if already played
                if (playedHistory.value.has(historyKey)) return;

                // Check condition
                if (egg.check(race, tournament.value!.players, tournament.value!)) {
                    // Mark as played
                    playedHistory.value.add(historyKey);

                    // Trigger effects (unless it's the first silent load)
                    if (!forceSilent) {
                        triggerEgg(egg);
                    }
                }
            });
        });
    };

    // --- WATCHER ---
    watch(
        () => tournament.value,
        (newVal) => {
            if (newVal) {
                if (isFirstLoad.value) {
                    // Pass true to mark existing conditions as "played" without noise
                    processRaces(true);
                    isFirstLoad.value = false;
                } else {
                    // Pass false to actually play new occurrences
                    processRaces(false);
                }
            }
        },
        { deep: true }
    );

    return {
        activeVisualEgg
    };
}