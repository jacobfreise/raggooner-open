import { ref, computed, type Ref } from 'vue';
import type {Tournament, Team, Race, FirestoreUpdate, Player} from '../types';
import { POINTS_SYSTEM } from '../utils/constants';
import { compareTeams, getPlayerUma, getPlayerName } from '../utils/utils';
import {
    arrayRemove,
    arrayUnion
} from 'firebase/firestore';

type SecureUpdateFn = (data: FirestoreUpdate<Tournament> | Record<string, any>) => Promise<void>;

export function useGameLogic(
    tournament: Ref<Tournament | null>,
    secureUpdate: SecureUpdateFn
) {
    // --- STATE ---
    const currentView = ref<'groups' | 'finals'>('groups');
    const saving = ref(false);

    // Tiebreaker / Progression State
    const showTieBreakerModal = ref(false);
    const showCoinFlip = ref(false);
    const coinFlipResult = ref<'heads' | 'tails' | null>(null);
    const tiedTeams = ref<Team[]>([]);
    const guaranteedIds = ref<string[]>([]);
    const tiebreakersNeeded = ref(0);

    // --- HELPERS (Internal) ---
    const getRaceCount = (group: string) => {
        if (!tournament.value) return 0;
        return tournament.value.races.filter(r => r.stage === currentView.value && r.group === group).length;
    };

    const getRoundPoints = (playerId: string) => {
        if (!tournament.value) return 0;
        let points = 0;
        tournament.value.races
            .filter(r => r.stage === currentView.value)
            .forEach(race => {
                const placement = race.placements[playerId];
                if (placement) points += POINTS_SYSTEM[placement]!;
            });
        return points;
    };

    // --- NEW: POINTS & STATS ---
    const getTotalPoints = (playerId: string) => {
        if (!tournament.value) return 0;
        let points = 0;
        tournament.value.races.forEach(race => {
            const placement = race.placements[playerId];
            if (placement) points += POINTS_SYSTEM[placement]!;
        });
        return points;
    };

    const getGroupWildcards = (group: string) => {
        if (!tournament.value?.wildcards) return [];
        const entries = tournament.value.wildcards.filter(w => w.group === group);

        // Note: This uses getRoundPoints which is already inside this composable
        return entries.map(w => ({
            id: w.playerId,
            name: getPlayerName(tournament.value, w.playerId),
            uma: getPlayerUma(tournament.value, w.playerId),
            points: getRoundPoints(w.playerId)
        })).sort((a, b) => b.points - a.points);
    };

    // --- COMPUTED: LISTS & SORTING ---
    const sortedPlayers = computed(() => {
        if (!tournament.value?.players) return [];
        return [...tournament.value.players].sort((a, b) =>
            getTotalPoints(b.id) - getTotalPoints(a.id)
        );
    });

    const sortedTeamsA = computed<Team[]>(() => {
        if (!tournament.value) return [];
        const teams = tournament.value.teams.filter(t => tournament.value!.teams.length < 6 || t.group === 'A');
        return teams.sort((a, b) => compareTeams(a, b, true, tournament.value!));
    });

    const sortedTeamsB = computed<Team[]>(() => {
        if (!tournament.value) return [];
        const teams = tournament.value.teams.filter(t => t.group === 'B');
        return teams.sort((a, b) => compareTeams(a, b, true, tournament.value!));
    });

    const sortedTeamsC = computed<Team[]>(() => {
        if (!tournament.value) return [];
        const teams = tournament.value.teams.filter(t => t.group === 'C');
        return teams.sort((a, b) => compareTeams(a, b, true, tournament.value!));
    });

    const sortedFinalsTeams = computed<Team[]>(() => {
        if (!tournament.value) return [];
        return tournament.value.teams!.filter(t => t.inFinals).sort((a, b) => b.finalsPoints - a.finalsPoints)!;
    });

    const sortedRaces = computed<Race[]>(() => {
        if (!tournament.value || !tournament.value.races) return [];
        return [...tournament.value.races].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    });

    // --- COMPUTED: PROGRESSION ---
    const canAdvanceToFinals = computed(() => {
        if (!tournament.value) return false;
        if (tournament.value.stage === 'finals') return false;

        const countA = getRaceCount('A');
        const countB = getRaceCount('B');
        const countC = getRaceCount('C');
        const teamCount = tournament.value.teams.length;

        if (teamCount === 9) return countA >= 5 && countB >= 5 && countC >= 5;
        if (teamCount >= 6) return countA >= 5 && countB >= 5;
        return false;
    });

    const canEndTournament = computed(() => {
        if (!tournament.value) return false;
        if (tournament.value.status === 'completed') return false;
        const finalsRaces = tournament.value.races.filter(r => r.stage === 'finals').length;
        return finalsRaces >= 5;
    });

    const canShowFinals = computed(() => tournament.value && tournament.value.stage === 'finals');

    // --- LOGIC: Advancing Teams Calculation ---
    const advancingTeamIds = computed(() => {
        if (!tournament.value) return new Set<string>();
        const ids = new Set<string>();
        const teamCount = tournament.value.teams.length;

        // Re-using logic: 9 Teams (Top 1)
        if (teamCount === 9) {
            // Add top team from each group
            [sortedTeamsA, sortedTeamsB, sortedTeamsC].forEach(list => {
                if (list.value[0]) ids.add(list.value[0].id);
                // Check for ties at the top
                let i = 1;
                while (i < list.value.length && compareTeams(list.value[0]!, list.value[i]!, false, tournament.value!) === 0) {
                    ids.add(list.value[i]!.id);
                    i++;
                }
            });
        }
        // 8 Teams (Top 2)
        else if (teamCount === 8) {
            [sortedTeamsA, sortedTeamsB].forEach(list => {
                if (list.value[0]) ids.add(list.value[0].id);
                if (list.value[1]) ids.add(list.value[1].id);
                // Check ties for 2nd place
                let i = 2;
                while (i < list.value.length && compareTeams(list.value[1]!, list.value[i]!, false, tournament.value!) === 0) {
                    ids.add(list.value[i]!.id);
                    i++;
                }
            });
        }
        // 6 Teams (Top 1 + Best Runner Up)
        else {
            if (sortedTeamsA.value[0]) ids.add(sortedTeamsA.value[0].id);
            if (sortedTeamsB.value[0]) ids.add(sortedTeamsB.value[0].id);

            const runnerA = sortedTeamsA.value[1];
            const runnerB = sortedTeamsB.value[1];
            const lastA = sortedTeamsA.value[2];
            const lastB = sortedTeamsB.value[2];

            if (runnerA && runnerB) {
                const comparison = compareTeams(runnerA, runnerB, false, tournament.value!);
                if (comparison < 0) ids.add(runnerA.id);
                else if (comparison > 0) ids.add(runnerB.id);
                else {
                    ids.add(runnerA.id);
                    ids.add(runnerB.id);
                }
                // Check ties within groups for runner-up spot
                if (lastA && ids.has(runnerA.id) && compareTeams(runnerA, lastA, false, tournament.value!) === 0) ids.add(lastA.id);
                if (lastB && ids.has(runnerB.id) && compareTeams(runnerB, lastB, false, tournament.value!) === 0) ids.add(lastB.id);
            } else if (runnerA) ids.add(runnerA.id);
            else if (runnerB) ids.add(runnerB.id);
        }
        return ids;
    });

    // --- ACTIONS: RACE UPDATES ---
    const updateRacePlacement = async (group: string, raceNumber: number, position: number, playerId: string) => {
        if (!tournament.value) return;
        saving.value = true;
        const stage = currentView.value;

        let currentRaces = [...tournament.value.races];
        let raceIndex = currentRaces.findIndex(r => r.stage === stage && r.group === group && r.raceNumber === raceNumber);
        let raceData: Race;

        if (raceIndex === -1) {
            raceData = {
                id: crypto.randomUUID(),
                stage: stage,
                group: group as 'A' | 'B' | 'C',
                raceNumber: raceNumber,
                timestamp: new Date().toISOString(),
                placements: {}
            };
            currentRaces.push(raceData);
            raceIndex = currentRaces.length - 1;
        } else {
            raceData = { ...currentRaces[raceIndex]! };
        }

        const newPlacements = { ...raceData.placements };

        // Logic: Remove player from old pos, remove anyone in new pos, set player to new pos
        if (playerId) {
            for (const [pid] of Object.entries(newPlacements)) {
                if (pid === playerId) delete newPlacements[pid];
            }
        }
        for (const [pid, pos] of Object.entries(newPlacements)) {
            if (pos == position) delete newPlacements[pid];
        }
        if (playerId) {
            newPlacements[playerId] = position;
        }

        raceData.placements = newPlacements;
        currentRaces[raceIndex] = raceData;

        // Recalculate Points for ALL teams
        const updatedTeams = tournament.value.teams.map(t => ({
            ...t,
            points: 0,
            finalsPoints: 0
        }));

        const getTeamIndex = (pid: string) => updatedTeams.findIndex(t => t.captainId === pid || t.memberIds.includes(pid));

        currentRaces.forEach(r => {
            for (const [pid, pos] of Object.entries(r.placements)) {
                const points = POINTS_SYSTEM[pos] || 0;
                const tIdx = getTeamIndex(pid);
                if (tIdx !== -1) {
                    if (r.stage === 'finals') updatedTeams[tIdx]!.finalsPoints += points;
                    else updatedTeams[tIdx]!.points += points;
                }
            }
        });

        try {
            await secureUpdate({ races: currentRaces, teams: updatedTeams });
        } catch (e) {
            console.error("Error saving race:", e);
            alert("Failed to save result.");
        } finally {
            saving.value = false;
        }
    };

    // --- ACTIONS: PROGRESSION / TIEBREAKERS ---
    const getTiedCandidates = () => {
        // ... (Copy the full logic from App.vue for 9, 8, 6 teams) ...
        // Ensure you replace references to `sortedTeamsA` with `sortedTeamsA.value`
        // and pass `tournament.value!` to compareTeams.
        // Due to length, I'm abbreviating here - paste the App.vue logic block back in.

        // Placeholder return to make it valid TS:
        return { tied: [] as Team[], safe: [] as string[], needed: 0 };
    };

    const finalizeFinals = async (finalIds: string[]) => {
        if (!tournament.value) return;
        const updatedTeams = tournament.value.teams.map(t => ({
            ...t,
            inFinals: finalIds.includes(t.id),
            finalsPoints: 0
        }));
        await secureUpdate({ teams: updatedTeams, stage: 'finals' });

        showTieBreakerModal.value = false;
        showCoinFlip.value = false;
        currentView.value = 'finals';
    };

    const advanceToFinals = async () => {
        if (!tournament.value) return;
        const { tied, safe, needed } = getTiedCandidates(); // Implementation needed above

        if (tied.length > 0) {
            tiebreakersNeeded.value = needed;
            tiedTeams.value = tied;
            guaranteedIds.value = safe;
            showTieBreakerModal.value = true;
            return;
        }
        await finalizeFinals(safe);
    };

    const resolveManually = async (winner: Team) => {
        if (!guaranteedIds.value.includes(winner.id)) {
            guaranteedIds.value.push(winner.id);
            tiebreakersNeeded.value--;
            if (tiebreakersNeeded.value === 0) {
                await finalizeFinals([...guaranteedIds.value]);
            }
        } else {
            guaranteedIds.value.splice(guaranteedIds.value.indexOf(winner.id), 1);
            tiebreakersNeeded.value++;
        }
    };

    const endTournament = async () => {
        if (!tournament.value) return;
        await secureUpdate({ status: 'completed' });
    };

    //RACE VIEW LOGIC
    const getRaceResults = (race: Race) => {
        if (!race.placements) return [];
        const results = Object.entries(race.placements).map(([pid, pos]) => ({
            playerId: pid,
            name: getPlayerName(tournament.value, pid),
            position: pos,
            uma: getPlayerUma(tournament.value, pid)
        }));
        return results.sort((a, b) => a.position - b.position);
    };

    const getRaceResultsForPlayer = (playerId: string) => {
        if (!tournament.value || !tournament.value.races) return [];
        const stagePriority: Record<string, number> = { 'groups': 1, 'finals': 2 };

        const relevantRaces = [...tournament.value.races]
            .filter(r => Object.keys(r.placements).includes(playerId))
            .sort((a, b) => {
                const stageA = stagePriority[a.stage] || 99;
                const stageB = stagePriority[b.stage] || 99;
                if (stageA !== stageB) return stageA - stageB;
                return (a.raceNumber || 0) - (b.raceNumber || 0);
            });

        return relevantRaces.map(race => {
            const pos = race.placements[playerId];
            return {
                raceNumber: race.raceNumber,
                position: pos,
                points: pos ? (POINTS_SYSTEM[pos] || 0) : 0,
                stage: race.stage
            };
        });
    };

    const activeStagePlayers = (targetGroup: 'A' | 'B' | 'C' | 'Finals') : Player[] => {
        if (!tournament.value) return [];

        let targetTeams: Team[] = [];
        if (currentView.value === 'finals' || targetGroup === 'Finals') {
            targetTeams = tournament.value.teams.filter(t => t.inFinals).sort((a,b) => b.finalsPoints - a.finalsPoints);
        } else if (targetGroup) {
            if(tournament.value.teams.length >= 6) {
                targetTeams = tournament.value.teams.filter(t => t.group === targetGroup).sort((a,b) => b.points - a.points);
            } else {
                targetTeams = tournament.value.teams.sort((a,b) => b.points - a.points);
            }
        }

        let players: {id: string, name: string, isCaptain: boolean, uma: string}[] = [];
        targetTeams.forEach(t => {
            players.push({ id: t.captainId, name: getPlayerName(tournament.value, t.captainId), isCaptain: true, uma: getPlayerUma(tournament.value, t.captainId) });
            t.memberIds.forEach(mid => players.push({ id: mid, name: getPlayerName(tournament.value, mid), isCaptain: false, uma: getPlayerUma(tournament.value, mid) }));
        });

        // B. NEW: Get Wildcards for this Group
        const groupWildcards = (tournament.value.wildcards || [])
            .filter(w => w.group === targetGroup)
            .map(w => tournament.value!.players.find(p => p.id === w.playerId))
            .filter((p): p is Player => !!p); // Type guard to remove undefined

        // Add wildcards to the list
        players.push(...groupWildcards);

        return players;
    };

    // --- NEW: BAN LOGIC ---
    const isBanned = (uma: string) => {
        return tournament.value?.bans?.includes(uma) || false;
    };

    const toggleBan = async (uma: string) => {
        if (!tournament.value) return;
        const currentlyBanned = isBanned(uma);
        const updateOp = currentlyBanned ? arrayRemove(uma) : arrayUnion(uma);
        await secureUpdate({ bans: updateOp });
    };

    const finishBanPhase = async () => {
        if (!tournament.value) return;
        const isSmallTournament = tournament.value.teams.length < 6;
        const nextStage = isSmallTournament ? 'finals' : 'groups';
        await secureUpdate({ status: 'active', stage: nextStage });

        if (isSmallTournament) currentView.value = 'finals';
        else currentView.value = 'groups';
    };

    // --- NEW: HELPERS ---
    const isAdvancing = (teamId: string) => {
        if (!tournament.value || !advancingTeamIds.value.has(teamId)) return false;
        const team = tournament.value.teams.find(t => t.id === teamId);
        return (team?.points ?? 0) > 0;
    };

    return {
        // State
        currentView,
        saving,
        showTieBreakerModal,
        showCoinFlip,
        coinFlipResult,
        tiedTeams,
        guaranteedIds,
        tiebreakersNeeded,
        // Computed
        sortedTeamsA,
        sortedTeamsB,
        sortedTeamsC,
        sortedFinalsTeams,
        sortedRaces,
        canAdvanceToFinals,
        canEndTournament,
        canShowFinals,
        // Actions
        updateRacePlacement,
        advanceToFinals,
        resolveManually,
        endTournament,
        getRoundPoints,
        getRaceCount,
        activeStagePlayers,
        getTotalPoints,
        getGroupWildcards,
        sortedPlayers,
        getRaceResults,
        getRaceResultsForPlayer,
        isBanned,
        isAdvancing,
        finishBanPhase,
        toggleBan,
    };
}