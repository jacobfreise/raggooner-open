import {ref, type Ref} from "vue";
import type {FirestoreUpdate, Tournament} from "../types";
import { generateDraftStructure, generateUmaDraftOrder } from "../utils/draftUtils";
import { claimAndSyncMetadata, claimAndUnsyncMetadata } from "../utils/metadataSync";

type SecureUpdateFn = (data: FirestoreUpdate<Tournament> | Record<string, any>) => Promise<void>;

export function useTournamentFlow(
    tournament: Ref<Tournament | null>,
    secureUpdate: SecureUpdateFn,
    appId: string = 'default-app'
) {

    const isAdvancing = ref(false);

    const advancePhase = async () => {
        if (!tournament.value || isAdvancing.value) return;
        isAdvancing.value = true;

        try {
            const t = tournament.value;
            const formatId = t.format || 'uma-ban'; // Fallback to ban format
            const isSmallTournament = t.teams.length < 6;

            // ==========================================
            // FORMAT: DRAFT PICK (Registration -> Player Draft -> Uma Ban -> Uma Draft -> Active -> Completed)
            // ==========================================
            if (formatId === 'uma-draft') {
                switch (t.status) {
                    case 'track-selection': {
                        await secureUpdate({ status: 'registration' });
                        break;
                    }
                    case 'registration': {
                        const { teams, draftOrder } = generateDraftStructure(t);
                        await secureUpdate({
                            status: 'draft',
                            teams,
                            draft: { order: draftOrder, currentIdx: 0 }
                        });
                        break;
                    }
                    case 'draft': {
                        // Don't overwrite draft.order — ban phase doesn't need it,
                        // and the original player draft order is needed to generate
                        // the reversed uma draft order in the next transition.
                        await secureUpdate({
                            status: 'ban',
                            banTimerStart: new Date().toISOString()
                        });
                        break;
                    }
                    case 'ban': {
                        const now = new Date().toISOString();
                        await secureUpdate({
                            status: 'pick',
                            draft: { order: generateUmaDraftOrder(t), currentIdx: 0 },
                            banTimerStart: null,
                            draftPhaseTimerStart: now,
                            draftLastPickTime: now
                        });
                        break;
                    }
                    case 'pick': {
                        await secureUpdate({
                            status: 'active',
                            stage: isSmallTournament ? 'finals' : 'groups',
                            banTimerStart: null,
                            activeTimerStart: new Date().toISOString(),
                            activeTimerStopped: false
                        });
                        break;
                    }
                    case 'active': {
                        await secureUpdate({
                            status: 'completed',
                            completedAt: new Date().toISOString()
                        });
                        try {
                            await claimAndSyncMetadata(t, appId);
                        } catch (e) {
                            console.error('Failed to sync tournament metadata on completion:', e);
                        }
                        break;
                    }
                }
            }

            // ==========================================
            // FORMAT: BLIND PICK (Registration -> Player Draft -> Uma Ban -> Active -> Completed)
            // ==========================================
            else {
                switch (t.status) {
                    case 'track-selection': {
                        await secureUpdate({ status: 'registration' });
                        break;
                    }
                    case 'registration': {
                        const { teams, draftOrder } = generateDraftStructure(t);
                        await secureUpdate({
                            status: 'draft',
                            teams,
                            draft: { order: draftOrder, currentIdx: 0 }
                        });
                        break;
                    }
                    case 'draft': {
                        await secureUpdate({
                            status: 'ban',
                            banTimerStart: new Date().toISOString()
                        });
                        break;
                    }
                    case 'ban': {
                        await secureUpdate({
                            status: 'active',
                            stage: isSmallTournament ? 'finals' : 'groups',
                            banTimerStart: null,
                            activeTimerStart: new Date().toISOString(),
                            activeTimerStopped: false
                        });
                        break;
                    }
                    case 'active': {
                        await secureUpdate({ status: 'completed', completedAt: new Date().toISOString() });
                        try {
                            await claimAndSyncMetadata(t, appId);
                        } catch (e) {
                            console.error('Failed to sync tournament metadata on completion:', e);
                        }
                        break;
                    }
                }
            }

        } finally {
            isAdvancing.value = false;
        }
    };

    /**
     * Reopen a completed tournament: unsync metadata first, then revert status.
     * Order matters — metadata must be unsynced before status changes to avoid
     * a window where the tournament is active but metadata is still synced.
     */
    const reopenTournament = async () => {
        if (!tournament.value || isAdvancing.value) return;
        if (tournament.value.status !== 'completed') return;

        isAdvancing.value = true;
        try {
            // Unsync metadata BEFORE changing status
            await claimAndUnsyncMetadata(tournament.value, appId);

            await secureUpdate({
                status: 'active',
                completedAt: null,
                activeTimerStart: new Date().toISOString(),
                activeTimerStopped: false
            });
        } catch (e) {
            console.error('Failed to reopen tournament:', e);
            alert('Failed to reverse tournament completion. Check console.');
        } finally {
            isAdvancing.value = false;
        }
    };

    return {
        advancePhase,
        reopenTournament,
        isAdvancing
    };
}
