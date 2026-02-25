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

    /**
     * Central state machine: advances the tournament to the next phase.
     *
     * registration → draft (creates teams + draft order)
     * draft → ban (uma-ban format) or pick (uma-draft format)
     * ban / pick → active
     * active → completed (syncs player metadata)
     */
    const advancePhase = async () => {
        if (!tournament.value || isAdvancing.value) return;
        isAdvancing.value = true;

        try {
            const t = tournament.value;
            const format = t.format;
            const isSmallTournament = t.teams.length < 6;

            switch (t.status) {
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
                    const updates: Record<string, any> = { banTimerStart: null };

                    if (format?.id === 'uma-draft') {
                        updates.status = 'pick';
                        updates.draft = {
                            order: generateUmaDraftOrder(t),
                            currentIdx: 0
                        };
                    } else {
                        // Default: uma-ban format
                        updates.status = 'ban';
                    }

                    await secureUpdate(updates);
                    break;
                }

                case 'ban':
                case 'pick': {
                    await secureUpdate({
                        status: 'active',
                        stage: isSmallTournament ? 'finals' : 'groups',
                        banTimerStart: null
                    });
                    break;
                }

                case 'active': {
                    const completedAt = new Date().toISOString();
                    await secureUpdate({ status: 'completed', completedAt });

                    // Atomically claim and sync global player metadata
                    try {
                        await claimAndSyncMetadata(t, appId);
                    } catch (e) {
                        console.error('Failed to sync tournament metadata on completion:', e);
                    }
                    break;
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
                completedAt: null
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
