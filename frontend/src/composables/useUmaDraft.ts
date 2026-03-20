import {computed, type Ref} from 'vue';
import type {FirestoreUpdate, Tournament} from '../types';
import {generateUmaDraftOrder} from '../utils/draftUtils';
import {UMA_DICT} from '../utils/umaData';
import {useUmaRoller} from './useUmaRoller';

type SecureUpdateFn = (data: FirestoreUpdate<Tournament> | Record<string, any>) => Promise<void>;

export function useUmaDraft(
    tournament: Ref<Tournament | null>,
    secureUpdate: SecureUpdateFn,
    isAdmin: Ref<boolean>
) {

    const { showRandomModal, slotReel, slotTranslateY, roll } = useUmaRoller();

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
        roll(candidates, (winner) => pickUma(winner));
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
        return Object.keys(UMA_DICT).sort();
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
