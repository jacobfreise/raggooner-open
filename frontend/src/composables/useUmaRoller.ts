import { ref } from 'vue';

export function useUmaRoller() {
    const showRandomModal = ref(false);
    const slotReel = ref<string[]>([]);
    const slotTranslateY = ref(80);
    const isRolling = ref(false);

    const roll = (candidates: string[], onResult: (winner: string) => void) => {
        if (candidates.length === 0) return;

        isRolling.value = true;

        const winnerIdx = Math.floor(Math.random() * candidates.length);
        const winner = candidates[winnerIdx]!;

        const targetIndex = 40;
        const reel: string[] = [];
        for (let i = 0; i < targetIndex; i++) {
            reel.push(candidates[Math.floor(Math.random() * candidates.length)]!);
        }
        reel.push(winner);
        for (let i = 0; i < 5; i++) {
            reel.push(candidates[Math.floor(Math.random() * candidates.length)]!);
        }

        slotReel.value = reel;
        slotTranslateY.value = 80;
        showRandomModal.value = true;

        setTimeout(() => {
            slotTranslateY.value = 80 - (targetIndex * 80);
        }, 100);

        setTimeout(() => {
            showRandomModal.value = false;
            isRolling.value = false;
            onResult(winner);
        }, 4500);
    };

    return { showRandomModal, slotReel, slotTranslateY, isRolling, roll };
}
