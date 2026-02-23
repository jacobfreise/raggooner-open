// Inside useGameLogic.ts or a new useTournamentFlow.ts

import type {Ref} from "vue";
import type {FirestoreUpdate, Tournament} from "../types.ts";
import {ref} from "vue";

type SecureUpdateFn = (data: FirestoreUpdate<Tournament> | Record<string, any>) => Promise<void>;

export function useGameLogic(
    tournament: Ref<Tournament | null>,
    secureUpdate: SecureUpdateFn,
    appId: string = 'default-app'
) {

    // --- STATE ---
    const initialStage = tournament.value?.stage === 'finals' ? 'finals' : 'groups';
    const currentView = ref<'groups' | 'finals'>(initialStage);

    const advancePhase = async () => {
        if (!tournament.value) return;

        console.log(appId);

        const currentStatus = tournament.value.status;
        const format = tournament.value.format;
        const isSmallTournament = tournament.value.teams.length < 6;

        let nextStatus = currentStatus;
        let nextStage = tournament.value.stage;

        // State Machine Logic
        if (currentStatus === 'registration') {
            nextStatus = 'draft';
        } else if (currentStatus === 'draft') {
            switch (format?.id) {
                case 'uma-ban':
                    nextStatus = 'ban'
                    break;
                case 'uma-pick':
                    nextStatus = 'pick';
                    break;
                default:
                    nextStatus = 'ban'
                    break;
            }
        } else if (currentStatus === 'ban' || currentStatus === 'pick') {
            nextStatus = 'active';
            nextStage = isSmallTournament ? 'finals' : 'groups';
        }

        // Perform the update
        await secureUpdate({
            status: nextStatus,
            stage: nextStage,
            banTimerStart: null // clean up timers if needed
        });

        // Update local view
        currentView.value = nextStage;
    };

    return {
        advancePhase,
        currentView
    };
}