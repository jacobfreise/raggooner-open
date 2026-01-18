import { ref, watch, type Ref } from 'vue';
import type { Tournament } from '../types';

export function useEasterEgg(tournament: Ref<Tournament | null>) {

    // --- CONFIG ---
    const HISHI_DURATION_MS = 8000;
    const TARGET_UMA = 'Hishi Akebono';
    const SOUND_FILE = 'Bono.mp3';

    // --- STATE ---
    const showHishiOverlay = ref(false);
    const playedEggIds = ref(new Set<string>());
    const isFirstLoad = ref(true);

    // Audio Instance
    const hishiSound = new Audio(SOUND_FILE);

    // --- ACTIONS ---
    const triggerHishiEffect = () => {
        hishiSound.currentTime = 0;
        hishiSound.volume = 0.8;
        hishiSound.play().catch(e => console.warn("Audio blocked:", e));

        showHishiOverlay.value = true;

        setTimeout(() => {
            showHishiOverlay.value = false;
        }, HISHI_DURATION_MS);
    };

    const isHishiWin = (race: any, players: any[]) => {
        const winnerId = Object.keys(race.placements).find(pid => race.placements[pid] == 1);
        if (!winnerId) return false;

        const winner = players.find(p => p.id === winnerId);
        return winner && winner.uma === TARGET_UMA;
    };

    const checkEasterEggs = () => {
        if (!tournament.value) return;

        tournament.value.races.forEach(race => {
            // 1. Skip if we've already "celebrated" this specific race
            if (playedEggIds.value.has(race.id)) return;

            // 2. Check for Hishi Win
            if (isHishiWin(race, tournament.value!.players)) {
                // 3. Trigger Effect
                triggerHishiEffect();

                // 4. MARK AS PLAYED HERE (Only after she actually wins)
                playedEggIds.value.add(race.id);
            }
        });
    };

    // --- WATCHER ---
    watch(
        () => tournament.value,
        (newVal) => {
            if (newVal) {
                if (isFirstLoad.value) {
                    // 🛑 ON REFRESH: Silently mark existing Hishi wins as "played"
                    // so we don't blast the user's ears on page load.
                    newVal.races.forEach(r => {
                        if (isHishiWin(r, newVal.players)) {
                            playedEggIds.value.add(r.id);
                        }
                    });
                    isFirstLoad.value = false;
                } else {
                    // ✅ ON UPDATE: Actually check for new wins
                    checkEasterEggs();
                }
            }
        },
        { deep: true }
    );

    return {
        showHishiOverlay
    };
}