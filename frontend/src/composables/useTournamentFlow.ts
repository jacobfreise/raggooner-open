import {ref, type Ref} from "vue";
import type {FirestoreUpdate, Tournament} from "../types.ts";
import { generateUmaDraftOrder } from "../utils/draftUtils";

type SecureUpdateFn = (data: FirestoreUpdate<Tournament> | Record<string, any>) => Promise<void>;

export function useTournamentFlow(
    tournament: Ref<Tournament | null>,
    secureUpdate: SecureUpdateFn
) {

    const isAdvancing = ref(false);

    const advancePhase = async () => {
        if (!tournament.value || isAdvancing.value) return;
        isAdvancing.value = true;

        try {
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
                    case 'uma-draft':
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

            // No-op if status wouldn't actually change
            if (nextStatus === currentStatus && nextStage === tournament.value.stage) return;

            const updates: Record<string, any> = {
                status: nextStatus,
                stage: nextStage,
                banTimerStart: null
            };

            if (currentStatus === 'draft' && nextStatus === 'pick') {
                updates.draft = {
                    order: generateUmaDraftOrder(tournament.value),
                    currentIdx: 0
                };
            }

            await secureUpdate(updates);
        } finally {
            isAdvancing.value = false;
        }
    };

    return {
        advancePhase,
        isAdvancing
    };
}
