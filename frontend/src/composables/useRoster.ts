import { ref, computed, type Ref } from 'vue';
import {arrayUnion, deleteField} from 'firebase/firestore';
import type { Tournament, Player, Wildcard, FirestoreUpdate } from '../types';
import { UMAS } from '../utils/constants';
import {getPlayerName, getPlayerUma} from "../utils/utils.ts";


type SecureUpdateFn = (data: FirestoreUpdate<Tournament> | Record<string, any>) => Promise<void>;

// UMA Editing State
const showUmaModal = ref(false);

export function useRoster(
    tournament: Ref<Tournament | null>,
    secureUpdate: SecureUpdateFn,
    isAdmin: Ref<boolean>
) {
    // --- STATE ---
    const newPlayerName = ref('');

    // Wildcard State
    const showWildcardModal = ref(false);
    const wildcardTargetGroup = ref<'A' | 'B' | 'C' | 'Finals' | ''>('');

    // --- COMPUTED: VALIDATION ---
    const validTeamCount = computed(() => {
        if (!tournament.value) return false;
        const playerValues = Object.values(tournament.value.players);
        const caps = playerValues.filter(p => p.isCaptain).length;
        return caps >= 3 && caps <= 9 && caps !== 7;
    });

    const validTotalPlayers = computed(() => {
        if (!tournament.value) return false;
        const playerValues = Object.values(tournament.value.players);
        const caps = playerValues.filter(p => p.isCaptain).length;
        return playerValues.length === (caps * 3);
    });

    const canStartDraft = computed(() => validTeamCount.value && validTotalPlayers.value);

    // --- HELPERS ---
    const getUmaList = (playerId?: string) => {
        if (tournament.value?.format === 'uma-draft' && playerId) {
            const team = tournament.value.teams.find(t =>
                t.captainId === playerId || t.memberIds.includes(playerId)
            );

            // If the player is on a team, restrict them to the team's pool, minus Umas already taken by teammates
            if (team) {
                const otherTeammatesIds = [team.captainId, ...team.memberIds].filter(id => id !== playerId);
                const umasUsedByTeammates = new Set(
                    otherTeammatesIds.map(id => tournament.value!.players[id]?.uma).filter(uma => !!uma)
                );

                return (team.umaPool || [])
                    .filter(uma => !umasUsedByTeammates.has(uma))
                    .sort();
            }

            // If the player is NOT on a team (i.e. they are a Wildcard), they skip this block
            // and fall through to the return statement below, getting the full list of Umas.
        }

        // Return full sorted list of Umas for Classic format AND Wildcard players
        return [...UMAS].sort();
    };

    // --- ACTIONS ---

    const addPlayer = async (globalPlayer?: { id: string; name: string }) => {
        if (!tournament.value) return;

        const player: Player = {
            id: globalPlayer?.id || crypto.randomUUID(),
            name: globalPlayer?.name || newPlayerName.value,
            isCaptain: false,
            uma: ''
        };

        if (!globalPlayer) {
            if (!newPlayerName.value) return;
            newPlayerName.value = '';
        }

        await secureUpdate({
            [`players.${player.id}`]: player,
            playerIds: arrayUnion(player.id)
        });

    };

    const removePlayer = async (pid: string) => {
        if (!tournament.value || !isAdmin.value) return;

        const remainingIds = Object.keys(tournament.value.players).filter(id => id !== pid);
        await secureUpdate({
            [`players.${pid}`]: deleteField(),
            playerIds: remainingIds
        });
    };

    const toggleCaptain = async (playerId: string) => {
        if (!tournament.value || !isAdmin.value) return;

        const current = tournament.value.players[playerId];
        if (!current) return;

        await secureUpdate({
            [`players.${playerId}.isCaptain`]: !current.isCaptain
        });
    };

    // --- WILDCARD LOGIC ---
    const openWildcardModal = (group: 'A' | 'B' | 'C' | 'Finals') => {
        if (!isAdmin.value) return;
        wildcardTargetGroup.value = group;
        showWildcardModal.value = true;
    };

    const addWildcard = async (globalPlayer: { id: string; name: string }) => {
        if (!tournament.value || !wildcardTargetGroup.value) return;

        // 1. Create the Player entry (uses global player ID)
        const newPlayer: Player = {
            id: globalPlayer.id,
            name: globalPlayer.name,
            isCaptain: false,
            uma: ''
        };

        // 2. Create the Wildcard Entry
        const newWildcard: Wildcard = {
            playerId: newPlayer.id,
            group: wildcardTargetGroup.value as any
        };

        // 3. Update Firestore
        await secureUpdate({
            [`players.${newPlayer.id}`]: newPlayer,
            playerIds: arrayUnion(newPlayer.id),
            wildcards: arrayUnion(newWildcard)
        });

        // Reset
        showWildcardModal.value = false;
    };

    // --- UMA EDITING ---
    const submitUmaForPlayer = async (playerId: string, uma: string) => {
        if (!tournament.value) return;

        try {
            await secureUpdate({
                [`players.${playerId}.uma`]: uma
            });
        } catch (error) {
            console.error("Failed to update Uma:", error);
            alert("Failed to sync character selection. Please try again.");
        }
    };

    const closeUmaModal = () => {
        showUmaModal.value = false;
    }

    const getPlayerColor = (playerId: string) => {
        if (!tournament.value) return '#e2e8f0';

        // Check Team
        const team = tournament.value.teams.find(t =>
            t.captainId === playerId || t.memberIds.includes(playerId)
        );
        if (team) return team.color;

        // Check Wildcard
        const isWildcard = tournament.value.wildcards?.some(w => w.playerId === playerId);
        if (isWildcard) return '#94a3b8';

        //71 85 105
        return '#475569';
    };

    const getPlayerNameOrUma = (id: string, showName: boolean) => showName ? getPlayerName(tournament.value, id) : getPlayerUma(tournament.value, id);

    return {
        // State
        newPlayerName,
        showWildcardModal,
        wildcardTargetGroup,
        showUmaModal,
        // Computed
        validTeamCount,
        validTotalPlayers,
        canStartDraft,
        // Helpers
        getUmaList,
        // Actions
        addPlayer,
        removePlayer,
        toggleCaptain,
        openWildcardModal,
        addWildcard,
        submitUmaForPlayer,
        closeUmaModal,
        getPlayerColor,
        getPlayerNameOrUma,
    };
}