import {computed, ref, type Ref} from 'vue';
import type {FirestoreUpdate, Player, Team, Tournament} from '../types';
import {getPlayerName} from "../utils/utils.ts";

type SecureUpdateFn = (data: FirestoreUpdate<Tournament> | Record<string, any>) => Promise<void>;

export function useDraft(
    tournament: Ref<Tournament | null>,
    secureUpdate: SecureUpdateFn,
    isAdmin: Ref<boolean>
) {
    // --- STATE: Random Wheel ---
    const showRandomModal = ref(false);
    const randomWheelRotation = ref(0);
    const randomCandidates = ref<Player[]>([]);
    const randomWinner = ref<Player | null>(null);

    // --- COMPUTED ---
    const remainingPicks = computed(() => {
        if (!tournament.value || !tournament.value.draft) return [];
        const draft = tournament.value.draft;

        // Slice from the current index to the end to get ALL remaining picks
        return draft.order.slice(draft.currentIdx).map((teamId, index) => {
            const team = tournament.value!.teams.find(t => t.id === teamId);
            return {
                id: `${teamId}-${index}`, // Unique key because a team picks multiple times
                captainName: team ? getPlayerName(tournament.value!, team.captainId) : 'Unknown',
                color: team?.color || '#94a3b8', // Fallback to slate-400 if no color is set
                isCurrent: index === 0
            };
        });
    });

    const availablePlayers = computed(() => {
        if (!tournament.value) return [];
        const assignedIds = new Set<string>();
        tournament.value.teams.forEach(t => t.memberIds.forEach(m => assignedIds.add(m)));
        return Object.values(tournament.value.players).filter(p => !p.isCaptain && !assignedIds.has(p.id));
    });

    const currentDrafter = computed(() => {
        if (!tournament.value?.draft) return null;
        const teamId = tournament.value.draft.order[tournament.value.draft.currentIdx];
        const team = tournament.value.teams.find(t => t.id === teamId);

        const capName = tournament.value.players[team?.captainId || '']?.name || 'Unknown';
        return team ? { ...team, name: capName, teamName: team.name } : null;
    });

    // const draftPreview = computed(() => {
    //     if (!tournament.value?.draft) return [];
    //     const d = tournament.value.draft;
    //     return d.order.slice(d.currentIdx, d.currentIdx + 10);
    // });

    const isDraftComplete = computed(() => {
        if (!tournament.value?.draft) return false;
        return tournament.value.draft.currentIdx >= tournament.value.draft.order.length;
    });

    const getRandomWheelGradient = computed(() => {
        const count = randomCandidates.value.length;
        if (count === 0) return '';
        const slice = 100 / count;
        const colors = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#ec4899'];

        const stops = randomCandidates.value.map((_, i) => {
            const color = colors[i % colors.length];
            return `${color} ${i * slice}% ${(i + 1) * slice}%`;
        });
        return `conic-gradient(from 0deg, ${stops.join(', ')})`;
    });

    // --- ACTIONS ---

    const draftPlayer = async (player: Player) => {
        // 1. Guard Clause
        if (!tournament.value || !tournament.value.draft) return;

        const t = tournament.value;
        // FIX 2: Create a local reference with ! assertion since we passed the guard
        const draft = t.draft!;

        const currentTeamId = draft.order[draft.currentIdx];
        const teamIndex = t.teams.findIndex(tm => tm.id === currentTeamId);

        // Safety check if team isn't found
        if (teamIndex === -1) return;

        const updatedTeams = [...t.teams];

        // FIX 3: Cast as Team to handle loose types & spread
        const updatedTeam = { ...updatedTeams[teamIndex] } as Team;

        // FIX 4: Handle memberIds possibly being undefined with || []
        updatedTeam.memberIds = [...(updatedTeam.memberIds || []), player.id];
        updatedTeams[teamIndex] = updatedTeam;

        const nextIdx = draft.currentIdx + 1;

        const updates: Record<string, any> = {
            teams: updatedTeams,
            'draft.currentIdx': nextIdx
        };

        await secureUpdate(updates);
    };

    const undoLastPick = async () => {
        if (!tournament.value || !tournament.value.draft || !isAdmin.value) return;

        const t = tournament.value;
        const draft = t.draft!; // FIX 2 again

        const currentIdx = draft.currentIdx;
        if (currentIdx <= 0) return;

        const prevIdx = currentIdx - 1;
        const teamId = draft.order[prevIdx];
        const teamIndex = t.teams.findIndex(tm => tm.id === teamId);

        if (teamIndex === -1) return;

        const team = t.teams[teamIndex] as Team; // Cast for safety

        if (!team || !team.memberIds || team.memberIds.length === 0) return;

        const updatedTeams = [...t.teams];
        const updatedTeam = { ...team };

        // Remove last member
        updatedTeam.memberIds = team.memberIds.slice(0, -1);
        updatedTeams[teamIndex] = updatedTeam;

        const updates: Record<string, any> = {
            teams: updatedTeams,
            'draft.currentIdx': prevIdx,
            status: 'draft'
        };

        await secureUpdate(updates);
    };

    // --- RANDOM WHEEL LOGIC ---
    const startRandomDraft = () => {
        const candidates = availablePlayers.value;
        if (candidates.length === 0) return;

        const winnerIndex = Math.floor(Math.random() * candidates.length);
        const winner = candidates[winnerIndex];

        // Check if winner exists to satisfy TS
        if (!winner) return;

        randomWinner.value = winner;

        let wheelSet: Player[] = [];
        if (candidates.length > 12) {
            const others = candidates.filter(p => p.id !== winner.id);
            const decoys = others.sort(() => 0.5 - Math.random()).slice(0, 11);
            wheelSet = [...decoys, winner].sort(() => 0.5 - Math.random());
        } else {
            wheelSet = [...candidates].sort(() => 0.5 - Math.random());
        }

        randomCandidates.value = wheelSet;
        showRandomModal.value = true;
        randomWheelRotation.value = 0;

        setTimeout(() => {
            spinRandomWheel(winner, wheelSet);
        }, 300);
    };

    const spinRandomWheel = (winner: Player, wheelSet: Player[]) => {
        const winnerIdx = wheelSet.findIndex(p => p.id === winner.id);
        const sliceSize = 360 / wheelSet.length;
        const targetAngle = (winnerIdx * sliceSize) + (sliceSize / 2);

        const spins = 5 + Math.floor(Math.random() * 3);
        randomWheelRotation.value = (spins * 360) + (360 - targetAngle);

        setTimeout(async () => {
            showRandomModal.value = false;
            await draftPlayer(winner);
        }, 5000);
    };

    return {
        showRandomModal,
        randomWheelRotation,
        randomCandidates,
        availablePlayers,
        currentDrafter,
        remainingPicks,
        isDraftComplete,
        getRandomWheelGradient,
        draftPlayer,
        undoLastPick,
        startRandomDraft
    };
}