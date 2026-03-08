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
        audio: '/Bono.mp3',
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
        check: (race, players) => {
            const winnerId = Object.keys(race.placements)
                .find(pid => race.placements[pid] == 1);
            if (!winnerId) return false;
            const winner = players.find(p => p.id === winnerId);
            if (!winner) return false;
            return winner.uma.toLowerCase().includes('special week') && winner.name.toLowerCase().includes('dedratermi');
        },
        audio: '/special-week-agemasen.mp3',
        volume: 0.7,
        duration: 1000,
        visual: {
            text: 'AGEMASEN!',
            overlayClass: 'flex-col gap-12 bg-black/50 backdrop-blur-sm',
            image: '/special-week-agemasen.gif',
            imageClass: 'w-[500px] h-auto rounded-xl shadow-2xl animate-bounce'
        }
    },
    {
        id: 'flawless_victory',
        // Trigger: A team sweeps 1-2-3 in ALL races (Triggers only at the very end)
        check: (currentRace, _players, tournament) => {
            // --- 1. TIMING CHECK: Is this the absolute last race? ---
            const isSmallTournament = tournament.teams.length < 6;

            // Helper to sort races: Groups (1) < Finals (2), then by Race Number
            const stageOrder: Record<string, number> = { 'groups': 1, 'finals': 2 };

            const sortedRaces = Object.values(tournament.races)
                .sort((a, b) => {
                const sA = stageOrder[a.stage?.toLowerCase()] || 99;
                const sB = stageOrder[b.stage?.toLowerCase()] || 99;
                if (sA !== sB) return sA - sB;
                return a.raceNumber - b.raceNumber;
            });

            const finalsRaces = sortedRaces.filter(r => {
                return isSmallTournament ? true : r.stage === 'finals';
            })

            // Only fire when all races are over!
            if (finalsRaces.length < 5) return false;

            const lastRace = sortedRaces[sortedRaces.length - 1];

            // If the current race being checked isn't the last one, ignore it.
            // This prevents the egg from firing 5 times in a row.
            if (currentRace.id !== lastRace?.id) return false;


            // --- 2. IDENTIFY THE TEAM ---

            // Who got 1, 2, 3 in this final race?
            const p1 = Object.keys(currentRace.placements).find(pid => currentRace.placements[pid] === 1);
            const p2 = Object.keys(currentRace.placements).find(pid => currentRace.placements[pid] === 2);
            const p3 = Object.keys(currentRace.placements).find(pid => currentRace.placements[pid] === 3);

            if (!p1 || !p2 || !p3) return false;

            // Find the team these players belong to
            // (We only need to check p1's team, then verify p2/p3 are in it)
            const winningTeam = tournament.teams.find(t =>
                t.captainId === p1 || t.memberIds.includes(p1)
            );

            if (!winningTeam) return false;

            const roster = [winningTeam.captainId, ...winningTeam.memberIds];

            // Verify p2 and p3 are also on this team
            if (!roster.includes(p2) || !roster.includes(p3)) return false;


            // --- 3. HISTORY CHECK: Did they sweep EVERY previous race? ---

            // Filter for only races this team played in
            const teamRaces = Object.values(tournament.races).filter(r =>
                r.placements[winningTeam.captainId] !== undefined
                || winningTeam.memberIds.some(member => r.placements[member] !== undefined)
            );

            // If they just played 1 race (e.g. just started), maybe don't trigger "Flawless" yet?
            if (teamRaces.length < 5) return false;

            // Check every single race for the 1-2-3 sweep
            const isFlawless = teamRaces.every(r => {
                const rP1 = Object.keys(r.placements).find(pid => r.placements[pid] === 1);
                const rP2 = Object.keys(r.placements).find(pid => r.placements[pid] === 2);
                const rP3 = Object.keys(r.placements).find(pid => r.placements[pid] === 3);

                // Check if 1, 2, and 3 exist AND are in the roster
                return (
                    rP1 && roster.includes(rP1) &&
                    rP2 && roster.includes(rP2) &&
                    rP3 && roster.includes(rP3)
                );
            });

            return isFlawless;
        },
        audio: '/flawless-victory.mp3', // A majestic sound
        volume: 1.0,
        duration: 4000,
        visual: {
            text: 'FLAWLESS VICTORY',
            overlayClass: 'flex-col gap-6 bg-amber-500/20 backdrop-blur-md border-y-8 border-amber-400',
            image: '/victory.gif',
            imageClass: 'w-64 h-64 drop-shadow-[0_0_50px_rgba(251,191,36,0.8)]'
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

export function useSumpfranzeEgg() {
    const isShowingSumpfranzeEgg = ref(false);
    const currentStep = ref(0);
    const position = ref({ top: '50%', left: '50%' });
    const timeLeft = ref(4);
    let timerInterval: any = null;
    let moveInterval: any = null;

    const jokes = [
        "Are you absolutely sure? This choice is... questionable.",
        "Sumpfranze? Really? There are better players out there, you know.",
        "System warning: Selecting Sumpfranze may lead to immediate loss.",
        "Netanyahu will find your house if you click confirm",
        "Final warning: Click the button to seal your fate. If you can catch it!"
    ];

    const reset = () => {
        isShowingSumpfranzeEgg.value = false;
        currentStep.value = 0;
        clearInterval(timerInterval);
        clearInterval(moveInterval);
    };

    const nextStep = (onComplete: () => void) => {
        if (currentStep.value < jokes.length - 1) {
            currentStep.value++;
            timeLeft.value = 4;
            updatePosition();
            if (currentStep.value === jokes.length - 1) {
                startMoving();
            }
        } else {
            reset();
            onComplete();
        }
    };

    const updatePosition = () => {
        const top = Math.random() * 60 + 20; // 20% to 80%
        const left = Math.random() * 60 + 20; // 20% to 80%
        position.value = { top: `${top}%`, left: `${left}%` };
    };

    const startMoving = () => {
        moveInterval = setInterval(() => {
            const top = parseFloat(position.value.top) + (Math.random() * 16 - 8);
            const left = parseFloat(position.value.left) + (Math.random() * 16 - 8);
            position.value = { 
                top: `${Math.max(10, Math.min(90, top))}%`, 
                left: `${Math.max(10, Math.min(90, left))}%` 
            };
        }, 100);
    };

    const triggerSumpfranzeEgg = (onFail: () => void) => {
        isShowingSumpfranzeEgg.value = true;
        currentStep.value = 0;
        timeLeft.value = 4;
        updatePosition();

        timerInterval = setInterval(() => {
            timeLeft.value -= 0.1;
            if (timeLeft.value <= 0) {
                reset();
                onFail();
            }
        }, 100);
    };

    return {
        isShowingSumpfranzeEgg,
        currentStep,
        position,
        timeLeft,
        jokes,
        triggerSumpfranzeEgg,
        nextStep,
        reset
    };
}

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

        Object.values(tournament.value.races).forEach(race => {
            EGG_LIST.forEach(egg => {
                // Create unique key: This specific race + this specific egg
                const historyKey = `${race.id}_${egg.id}`;

                // Skip if already played
                if (playedHistory.value.has(historyKey)) return;

                // Check condition
                if (egg.check(race, Object.values(tournament.value!.players), tournament.value!)) {
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
        () => tournament.value?.id, // Watch the ID, not just the object
        (newId, oldId) => {
            // 1. If we switched tournaments (or closed one), RESET everything
            if (newId !== oldId) {
                playedHistory.value.clear();
                isFirstLoad.value = true;
                activeVisualEgg.value = null; // Clear any lingering overlays
            }

            // 2. If we have a valid tournament, run the logic
            if (tournament.value) {
                if (isFirstLoad.value) {
                    processRaces(true); // Silent catch-up
                    isFirstLoad.value = false;
                } else {
                    processRaces(false); // Loud updates
                }
            }
        },
        { immediate: true } // Run immediately in case data is already there
    );

    // You also need a separate watcher for DEEP changes (live updates within the SAME tournament)
    watch(
        () => tournament.value,
        (newVal) => {
            // Only run if we are NOT in the middle of a first-load reset
            // and we actually have data
            if (newVal && !isFirstLoad.value) {
                processRaces(false);
            }
        },
        { deep: true }
    );

    return {
        activeVisualEgg
    };
}