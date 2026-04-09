import { computed, type Ref } from 'vue';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { useAuth } from './useAuth';
import type { Team, Tournament } from '../types';
import { getCurrentStageName, isAtLastStage } from '../utils/utils';

export function useCaptainActions(tournament: Ref<Tournament | null>, appId: string = 'default-app') {
    const { linkedPlayer } = useAuth();

    // The team captained by the currently logged-in Discord user (null if not a captain).
    const captainTeam = computed((): Team | null => {
        if (!tournament.value || !linkedPlayer.value) return null;
        return tournament.value.teams.find((t) => t.captainId === linkedPlayer.value!.id) ?? null;
    });

    // True when the tournament has captain actions enabled and the user captains a team.
    const isCaptain = computed(() =>
        (tournament.value?.captainActionsEnabled ?? false) && captainTeam.value !== null
    );

    // True when it is this captain's turn in the player draft.
    const isMyPlayerDraftTurn = computed(() => {
        if (!isCaptain.value || !captainTeam.value || !tournament.value?.draft) return false;
        const { order, currentIdx } = tournament.value.draft;
        return order[currentIdx] === captainTeam.value.id;
    });

    // True when it is this captain's turn in the uma draft.
    const isMyUmaDraftTurn = computed(() => {
        if (!isCaptain.value || !captainTeam.value || !tournament.value?.draft) return false;
        const { order, currentIdx } = tournament.value.draft;
        return order[currentIdx] === captainTeam.value.id;
    });

    // Returns true when the captain can submit race results for a given group.
    // Last stage: captain's team must have qualified.
    // Earlier stages: captain's team must be in that group.
    const canCaptainEditGroup = (group: string): boolean => {
        if (!isCaptain.value || !captainTeam.value || !tournament.value) return false;
        const stageName = getCurrentStageName(tournament.value);
        if (isAtLastStage(tournament.value)) {
            return captainTeam.value.qualifiedStages.includes(stageName);
        }
        return captainTeam.value.stageGroups[stageName] === group;
    };

    // --- Cloud function callers ---

    const draftPlayerFn = httpsCallable(functions, 'captainDraftPlayer');
    const pickUmaFn = httpsCallable(functions, 'captainPickUma');
    const submitUmaFn = httpsCallable(functions, 'captainSubmitUma');
    const saveTapFn = httpsCallable(functions, 'captainSaveTapResults');
    const updatePlacementFn = httpsCallable(functions, 'captainUpdateRacePlacement');

    const captainDraftPlayer = async (targetPlayerId: string): Promise<void> => {
        if (!tournament.value) return;
        await draftPlayerFn({ tournamentId: tournament.value.id, appId, targetPlayerId });
    };

    const captainPickUma = async (umaId: string): Promise<void> => {
        if (!tournament.value) return;
        await pickUmaFn({ tournamentId: tournament.value.id, appId, umaId });
    };

    const captainSubmitUma = async (playerId: string, umaId: string): Promise<void> => {
        if (!tournament.value) return;
        await submitUmaFn({ tournamentId: tournament.value.id, appId, playerId, umaId });
    };

    const captainSaveTapResults = async (
        group: string,
        raceNumber: number,
        placements: Record<string, number>
    ): Promise<void> => {
        if (!tournament.value) return;
        await saveTapFn({ tournamentId: tournament.value.id, appId, group, raceNumber, placements });
    };

    const captainUpdateRacePlacement = async (
        group: string,
        raceNumber: number,
        position: number,
        playerId: string
    ): Promise<void> => {
        if (!tournament.value) return;
        await updatePlacementFn({
            tournamentId: tournament.value.id,
            appId,
            group,
            raceNumber,
            position,
            playerId,
        });
    };

    return {
        captainTeam,
        isCaptain,
        isMyPlayerDraftTurn,
        isMyUmaDraftTurn,
        canCaptainEditGroup,
        captainDraftPlayer,
        captainPickUma,
        captainSubmitUma,
        captainSaveTapResults,
        captainUpdateRacePlacement,
    };
}
