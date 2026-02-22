import { ref, computed, type Ref } from 'vue';
import {arrayUnion} from 'firebase/firestore';
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
    const appId = 'default-app';

    // Wildcard State
    const showWildcardModal = ref(false);
    const wildcardTargetGroup = ref<'A' | 'B' | 'C' | 'Finals' | ''>('');

    // --- COMPUTED: VALIDATION ---
    const validTeamCount = computed(() => {
        if (!tournament.value) return false;
        const caps = tournament.value.players.filter(p => p.isCaptain).length;
        return caps >= 3 && caps <= 9 && caps !== 7;
    });

    const validTotalPlayers = computed(() => {
        if (!tournament.value) return false;
        const caps = tournament.value.players.filter(p => p.isCaptain).length;
        return tournament.value.players.length === (caps * 3);
    });

    const canStartDraft = computed(() => validTeamCount.value && validTotalPlayers.value);

    // --- HELPERS ---
    const getUmaList = () => [...UMAS].sort();

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
            players: arrayUnion(player),
            playerIds: arrayUnion(player.id)
        });

    };

    const removePlayer = async (pid: string) => {
        if (!tournament.value || !isAdmin.value) return;

        const newPlayers = tournament.value.players.filter(p => p.id !== pid);
        await secureUpdate({
            players: newPlayers,
            playerIds: newPlayers.map(p => p.id)
        });
    };

    const toggleCaptain = async (playerId: string) => {
        if (!tournament.value || !isAdmin.value) return;

        const newPlayers = tournament.value.players.map(p => {
            if (p.id === playerId) {
                return { ...p, isCaptain: !p.isCaptain };
            }
            return p;
        });

        await secureUpdate({
            players: newPlayers
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
            players: arrayUnion(newPlayer),
            playerIds: arrayUnion(newPlayer.id),
            wildcards: arrayUnion(newWildcard)
        });

        // Reset
        showWildcardModal.value = false;
    };

    // --- UMA EDITING ---
    const submitUmas = async () => {
        if (!tournament.value) return;

        try {
            // 1. Clone the players array for the tournament doc update
            const newPlayers = tournament.value.players.map(p => ({...p}));

            // 2. Update the main tournament document using your existing helper
            await secureUpdate({
                players: newPlayers
            });

        } catch (error) {
            console.error("Failed to update Umas:", error);
            alert("Failed to sync character selections. Please try again.");
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

        return '#e2e8f0';
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
        submitUmas,
        closeUmaModal,
        getPlayerColor,
        getPlayerNameOrUma,
    };
}