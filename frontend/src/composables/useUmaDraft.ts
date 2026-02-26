import {computed, ref, type Ref} from 'vue';
import type {FirestoreUpdate, Tournament} from '../types';
import {generateUmaDraftOrder} from '../utils/draftUtils';
import {UMAS} from '../utils/constants';

type SecureUpdateFn = (data: FirestoreUpdate<Tournament> | Record<string, any>) => Promise<void>;

export function useUmaDraft(
    tournament: Ref<Tournament | null>,
    secureUpdate: SecureUpdateFn,
    isAdmin: Ref<boolean>
) {

    const showRandomModal = ref(false);
    const slotReel = ref<string[]>([]);
    const slotTranslateY = ref(80);

    const startUmaDraft = async () => {
        if (!tournament.value) return;

        const umaDraftOrder = generateUmaDraftOrder(tournament.value);
        if (umaDraftOrder.length === 0) return;

        await secureUpdate({
            draft: {
                order: umaDraftOrder,
                currentIdx: 0
            }
        });
    };

    const startRandomUma = () => {
        const bannedUmas = new Set(tournament.value!.bans || []);
        const candidates = availableUmas.value.filter(uma => !bannedUmas.has(uma));
        if (candidates.length === 0 || !isAdmin.value) return;

        // 1. Pick the actual winner
        const winnerIdx = Math.floor(Math.random() * candidates.length);
        const winner = candidates[winnerIdx]!;

        // 2. Build the visual reel (40 items long)
        const targetIndex = 40;
        const reel: string[] = [];

        // Add decoys before the winner
        for (let i = 0; i < targetIndex; i++) {
            reel.push(candidates[Math.floor(Math.random() * candidates.length)]!);
        }

        // Slot the winner into the target stopping position
        reel.push(winner);

        // Add a few decoys at the bottom so the reel doesn't look empty when it stops
        for (let i = 0; i < 5; i++) {
            reel.push(candidates[Math.floor(Math.random() * candidates.length)]!);
        }

        slotReel.value = reel;
        slotTranslateY.value = 80; // Reset position to the top
        showRandomModal.value = true;

        // 3. Trigger the CSS transition shortly after mounting
        setTimeout(() => {
            // Each slot item is 80px tall. Translate up by (targetIndex * 80)
            slotTranslateY.value = 80 - (targetIndex * 80);
        }, 100);

        // 4. Wait for the 4s animation to finish + 500ms pause, then finalize
        setTimeout(async () => {
            showRandomModal.value = false;
            await pickUma(winner);
        }, 4500);
    };

    const currentPicker = computed(() => {
        if (!tournament.value?.draft) return null;
        const teamId = tournament.value.draft.order[tournament.value.draft.currentIdx];
        const team = tournament.value.teams.find(t => t.id === teamId);
        return team ?? null;
    });

    // Maps each drafted uma to the team that owns it
    const umaOwnerMap = computed(() => {
        const map = new Map<string, { teamName: string; teamColor: string }>();
        if (!tournament.value) return map;
        tournament.value.teams.forEach(t => {
            t.umaPool?.forEach(uma => {
                map.set(uma, { teamName: t.name, teamColor: t.color || '#94a3b8' });
            });
        });
        return map;
    });

    // All umas sorted
    const allUmas = computed(() => {
        if (!tournament.value) return [];
        return [...UMAS].sort();
    });

    // Only unpicked umas (used for random selection)
    const availableUmas = computed(() => {
        return allUmas.value.filter(uma => !umaOwnerMap.value.has(uma));
    });

    const remainingPicks = computed(() => {
        if (!tournament.value?.draft) return [];
        const draft = tournament.value.draft;

        return draft.order.slice(draft.currentIdx).map((teamId, index) => {
            const team = tournament.value!.teams.find(t => t.id === teamId);
            return {
                id: `${teamId}-${index}`,
                teamName: team?.name || 'Unknown',
                color: team?.color || '#94a3b8',
                isCurrent: index === 0
            };
        });
    });

    const isDraftComplete = computed(() => {
        if (!tournament.value?.draft) return false;
        return tournament.value.draft.currentIdx >= tournament.value.draft.order.length;
    });

    const pickUma = async (uma: string) => {
        if (!tournament.value?.draft || !isAdmin.value) return;

        const draft = tournament.value.draft;
        const currentTeamId = draft.order[draft.currentIdx];
        const teamIndex = tournament.value.teams.findIndex(t => t.id === currentTeamId);
        if (teamIndex === -1) return;

        const updatedTeams = [...tournament.value.teams];
        const updatedTeam = {...updatedTeams[teamIndex]!};
        updatedTeam.umaPool = [...(updatedTeam.umaPool || []), uma];
        updatedTeams[teamIndex] = updatedTeam;

        const nextIdx = draft.currentIdx + 1;

        await secureUpdate({
            teams: updatedTeams,
            'draft.currentIdx': nextIdx,
            draftLastPickTime: new Date().toISOString()
        });
    };

    const undoLastPick = async () => {
        if (!tournament.value?.draft || !isAdmin.value) return;

        const draft = tournament.value.draft;
        if (draft.currentIdx <= 0) return;

        const prevIdx = draft.currentIdx - 1;
        const teamId = draft.order[prevIdx];
        const teamIndex = tournament.value.teams.findIndex(t => t.id === teamId);
        if (teamIndex === -1) return;

        const team = tournament.value.teams[teamIndex]!;
        if (!team.umaPool || team.umaPool.length === 0) return;

        const updatedTeams = [...tournament.value.teams];
        const updatedTeam = {...team};
        updatedTeam.umaPool = team.umaPool.slice(0, -1);
        updatedTeams[teamIndex] = updatedTeam;

        const updates: Record<string, any> = {
            teams: updatedTeams,
            'draft.currentIdx': prevIdx,
            draftLastPickTime: new Date().toISOString()
        };

        await secureUpdate(updates);
    };

    return {
        startUmaDraft,
        currentPicker,
        allUmas,
        availableUmas,
        umaOwnerMap,
        remainingPicks,
        isDraftComplete,
        pickUma,
        undoLastPick,
        startRandomUma,
        showRandomModal,
        slotReel,
        slotTranslateY
    };
}
