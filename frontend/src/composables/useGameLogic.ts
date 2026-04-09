import {ref, computed, type Ref, watch} from 'vue';
import type {Tournament, Team, Race, FirestoreUpdate, Player, PointAdjustment} from '../types';
import { POINTS_SYSTEM as DEFAULT_POINTS } from '../utils/constants';
import {compareTeams, getPlayerUma, getPlayerName, raceKey, recalculateTournamentScores, getCurrentStageName, getLastStageName, isAtLastStage} from '../utils/utils';
import {
    arrayRemove,
    arrayUnion,
} from 'firebase/firestore';

type SecureUpdateFn = (data: FirestoreUpdate<Tournament> | Record<string, any>) => Promise<void>;

const currentView = ref<string>('');
const saving = ref(false);

export function useGameLogic(
    tournament: Ref<Tournament | null>,
    secureUpdate: SecureUpdateFn
) {

    watch(() => tournament.value?.currentStageIndex, () => {
        if (tournament.value) {
            currentView.value = getCurrentStageName(tournament.value);
        }
    }, { immediate: true });

    // Tiebreaker / Progression State
    const showTieBreakerModal = ref(false);
    const tiedTeams = ref<Team[]>([]);
    const guaranteedIds = ref<string[]>([]);
    const tiebreakersNeeded = ref(0);

    // --- HELPERS (Internal) ---
    const getRaceCount = (group: string) => {
        if (!tournament.value) return 0;
        return Object.values(tournament.value.races).filter(r => r.stage === currentView.value && r.group === group).length;
    };

    const getPointsForPos = (pos: number) => {
        if (!tournament.value) return 0;
        const system = tournament.value.pointsSystem || DEFAULT_POINTS;
        return system[pos] || 0;
    };

    const getRoundPoints = (playerId: string) => {
        if (!tournament.value) return 0;
        let points = 0;
        Object.values(tournament.value.races)
            .filter(r => r.stage === currentView.value)
            .forEach(race => {
                const placement = race.placements[playerId];
                if (placement) points += getPointsForPos(placement); // USE HELPER
            });
        return points;
    };

    // --- NEW: POINTS & STATS ---
    const getTotalPoints = (playerId: string) => {
        if (!tournament.value) return 0;
        let points = 0;
        Object.values(tournament.value.races).forEach(race => {
            const placement = race.placements[playerId];
            if (placement) points += getPointsForPos(placement);
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
        return Object.values(tournament.value.players).sort((a, b) =>
            getTotalPoints(b.id) - getTotalPoints(a.id)
        );
    });

    const sortedTeamsA = computed<Team[]>(() => {
        if (!tournament.value) return [];
        const stageName = currentView.value;
        const teams = tournament.value.teams.filter(t => t.stageGroups[stageName] === 'A');
        return teams.sort((a, b) => compareTeams(a, b, true, tournament.value!, stageName));
    });

    const sortedTeamsB = computed<Team[]>(() => {
        if (!tournament.value) return [];
        const stageName = currentView.value;
        const teams = tournament.value.teams.filter(t => t.stageGroups[stageName] === 'B');
        return teams.sort((a, b) => compareTeams(a, b, true, tournament.value!, stageName));
    });

    const sortedTeamsC = computed<Team[]>(() => {
        if (!tournament.value) return [];
        const stageName = currentView.value;
        const teams = tournament.value.teams.filter(t => t.stageGroups[stageName] === 'C');
        return teams.sort((a, b) => compareTeams(a, b, true, tournament.value!, stageName));
    });

    const sortedFinalsTeams = computed<Team[]>(() => {
        if (!tournament.value) return [];
        const lastStage = getLastStageName(tournament.value);
        return tournament.value.teams
            .filter(t => t.qualifiedStages.includes(lastStage))
            .sort((a, b) => compareTeams(a, b, true, tournament.value!, lastStage));
    });

    const sortedRaces = computed<Race[]>(() => {
        if (!tournament.value || !tournament.value.races) return [];
        return Object.values(tournament.value.races).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    });

    // --- COMPUTED: PROGRESSION ---
    const canAdvanceToFinals = computed(() => {
        if (!tournament.value) return false;
        if (isAtLastStage(tournament.value)) return false;

        const currentStage = tournament.value.stages[tournament.value.currentStageIndex]!;
        return currentStage.groups.every(g => getRaceCount(g) >= currentStage.racesRequired);
    });

    const canEndTournament = computed(() => {
        if (!tournament.value) return false;
        if (tournament.value.status === 'completed') return false;
        const lastStage = getLastStageName(tournament.value);
        const lastStageConfig = tournament.value.stages[tournament.value.stages.length - 1]!;
        const lastStageRaces = Object.values(tournament.value.races).filter(r => r.stage === lastStage).length;
        return lastStageRaces >= lastStageConfig.racesRequired;
    });

    const canShowFinals = computed(() => tournament.value && isAtLastStage(tournament.value));

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

    const projectedProgression = computed(() => {
        if (!tournament.value) return { tied: [], safe: [], needed: 0 };

        const teamCount = tournament.value.teams.length;
        const safeIds: string[] = []; // Using local array for easier checks
        const tiedSet = new Set<string>();
        let needed = 0;

        // --- SCENARIO 1: 9 Teams (3 Groups, 1 Winner each) ---
        if (teamCount === 9) {
            const groups = [
                { list: sortedTeamsA.value, name: 'A' },
                { list: sortedTeamsB.value, name: 'B' },
                { list: sortedTeamsC.value, name: 'C' }
            ];

            groups.forEach(g => {
                const top = g.list[0]!;
                const runner = g.list[1]!;
                if (compareTeams(top, runner, false, tournament.value!) === 0) {
                    tiedSet.add(top.id);
                    tiedSet.add(runner.id);
                    if (g.list[2] && compareTeams(top, g.list[2], false, tournament.value!) === 0) {
                        tiedSet.add(g.list[2].id);
                    }
                    needed++;
                } else {
                    safeIds.push(top.id);
                }
            });
        }

        // --- SCENARIO 2: 8 Teams (2 Groups, 2 Winners each) ---
        else if (teamCount === 8) {
            const groups = [sortedTeamsA, sortedTeamsB];
            groups.forEach(list => {
                const first = list.value[0]!;
                const second = list.value[1]!;
                const third = list.value[2]!;

                if (compareTeams(second, third, false, tournament.value!) === 0) {
                    if (compareTeams(first, second, false, tournament.value!) === 0) {
                        // 1, 2, 3 tied
                        tiedSet.add(first.id);
                        tiedSet.add(second.id);
                        tiedSet.add(third.id);
                        if (list.value[3] && compareTeams(first, list.value[3], false, tournament.value!) === 0) {
                            tiedSet.add(list.value[3].id);
                        }
                        needed += 2;
                    } else {
                        // 1 Safe. 2, 3 tied
                        safeIds.push(first.id);
                        tiedSet.add(second.id);
                        tiedSet.add(third.id);
                        if (list.value[3] && compareTeams(second, list.value[3], false, tournament.value!) === 0) {
                            tiedSet.add(list.value[3].id);
                        }
                        needed += 1;
                    }
                } else {
                    safeIds.push(first.id);
                    safeIds.push(second.id);
                }
            });
        }

        // --- SCENARIO 3: 6 Teams (2 Groups, 1 Winner each + 1 Wildcard) ---
        else {
            let slotsAvailable = 0;
            const wildCardPool: Team[] = [];

            // 1. Analyze Group A Winner
            const topA = sortedTeamsA.value[0]!;
            const runA = sortedTeamsA.value[1]!;
            const thirdA = sortedTeamsA.value[2]; // Get the 3rd team

            if (compareTeams(topA, runA, false, tournament.value!) === 0) {
                // Tie for 1st detected
                tiedSet.add(topA.id);
                tiedSet.add(runA.id);
                wildCardPool.push(topA, runA);

                // FIX 2: Check if 3rd team is also part of this tie
                if (thirdA && compareTeams(topA, thirdA, false, tournament.value!) === 0) {
                    tiedSet.add(thirdA.id);
                    wildCardPool.push(thirdA);
                }

                slotsAvailable++;
            } else {
                safeIds.push(topA.id);
                wildCardPool.push(runA);

                if (thirdA && compareTeams(runA, thirdA, false, tournament.value!) === 0) {
                    wildCardPool.push(thirdA);
                }
            }

            // 2. Analyze Group B Winner
            const topB = sortedTeamsB.value[0]!;
            const runB = sortedTeamsB.value[1]!;
            const thirdB = sortedTeamsB.value[2]; // Get the 3rd team

            if (compareTeams(topB, runB, false, tournament.value!) === 0) {
                // Tie for 1st detected
                tiedSet.add(topB.id);
                tiedSet.add(runB.id);
                wildCardPool.push(topB, runB);

                // FIX 2: Check if 3rd team is also part of this tie
                if (thirdB && compareTeams(topB, thirdB, false, tournament.value!) === 0) {
                    tiedSet.add(thirdB.id);
                    wildCardPool.push(thirdB);
                }

                slotsAvailable++;
            } else {
                safeIds.push(topB.id);
                wildCardPool.push(runB);

                if (thirdB && compareTeams(runB, thirdB, false, tournament.value!) === 0) {
                    wildCardPool.push(thirdB);
                }
            }

            // 3. Analyze Wildcard Pool
            slotsAvailable++; // Add the 1 dedicated wildcard slot

            // Sort pool to find the best scores (Descending)
            wildCardPool.sort((a, b) => compareTeams(a, b, false, tournament.value!));

            // Logic to handle pool boundary
            if (wildCardPool.length > slotsAvailable) {
                const lastQualifier = wildCardPool[slotsAvailable - 1]!;
                const firstLoser = wildCardPool[slotsAvailable]!;

                // Check if the "Cutoff Line" is blurry (Tie between last in and first out)
                if (compareTeams(lastQualifier, firstLoser, false, tournament.value!) === 0) {
                    // TIE BOUNDARY HIT
                    wildCardPool.forEach(p => {
                        const comparison = compareTeams(p, lastQualifier, false, tournament.value!);

                        if (comparison < 0) {
                            // This team is BETTER than the tie boundary -> They are SAFE
                            if (tiedSet.has(p.id)) tiedSet.delete(p.id);
                            if (!safeIds.includes(p.id)) safeIds.push(p.id);
                            slotsAvailable--;
                        } else if (comparison === 0) {
                            // This team is TIED at the boundary -> They are in the TIEBREAKER
                            tiedSet.add(p.id);
                        }
                    });

                    needed = slotsAvailable;
                } else {
                    // CLEAR BOUNDARY
                    for(let i=0; i<slotsAvailable; i++) {
                        const p = wildCardPool[i]!;
                        if (tiedSet.has(p.id)) tiedSet.delete(p.id);
                        if (!safeIds.includes(p.id)) safeIds.push(p.id);
                    }
                    tiedSet.clear()
                    needed = 0;
                }
            } else {
                // Everyone fits
                wildCardPool.forEach(p => {
                    if (tiedSet.has(p.id)) tiedSet.delete(p.id);
                    if (!safeIds.includes(p.id)) safeIds.push(p.id);
                });
                needed = 0;
            }
        }

        // Final Cleanup: ensure Safe IDs are not in Tied Set
        safeIds.forEach(id => {
            if (tiedSet.has(id)) tiedSet.delete(id);
        });

        const tiedTeamsList = tournament.value.teams.filter(t => tiedSet.has(t.id));
        return { tied: tiedTeamsList, safe: safeIds, needed };
    })

    // --- ACTIONS: PROGRESSION / TIEBREAKERS ---
    const getTiedCandidates = (): { tied: Team[], safe: string[], needed: number } => {
        return projectedProgression.value;
    };

    // 3. NEW: Helper for UI to check status
    const getProgressionStatus = (teamId: string): 'safe' | 'tied' | 'none' => {
        const team = tournament.value?.teams.find(t => t.id === teamId);
        if (!team) return 'none';

        const points = team.stagePoints[currentView.value] ?? 0;
        if (points === 0) return 'none';

        const isPastCurrentStage = tournament.value
            ? isAtLastStage(tournament.value) || tournament.value.status === 'completed'
            : false;

        if (isPastCurrentStage && tournament.value && currentView.value !== getLastStageName(tournament.value)) {
            const nextStageName = tournament.value.stages[tournament.value.currentStageIndex]?.name ?? '';
            return team.qualifiedStages.includes(nextStageName) ? 'safe' : 'none';
        }

        if (projectedProgression.value.safe.includes(teamId)) return 'safe';
        if (projectedProgression.value.tied.some(t => t.id === teamId)) return 'tied';
        return 'none';
    };

    const finalizeFinals = async (finalIds: string[]) => {
        if (!tournament.value) return;
        const nextStageIndex = tournament.value.currentStageIndex + 1;
        const nextStage = tournament.value.stages[nextStageIndex]!;
        const nextStageGroup = nextStage.groups[0] ?? 'A'; // default all advancers to first group for now

        const updatedTeams = tournament.value.teams.map(t => {
            const isAdvancing = finalIds.includes(t.id);
            return {
                ...t,
                qualifiedStages: isAdvancing ? [...t.qualifiedStages, nextStage.name] : t.qualifiedStages,
                stageGroups: isAdvancing
                    ? { ...t.stageGroups, [nextStage.name]: nextStageGroup }
                    : t.stageGroups,
            };
        });

        await secureUpdate({ teams: updatedTeams, currentStageIndex: nextStageIndex });

        showTieBreakerModal.value = false;
        currentView.value = nextStage.name;
    };

    const advanceToFinals = async () => {
        if (!tournament.value) return;
        const { tied, safe, needed } = getTiedCandidates();

        if (tied.length > 0) {
            tiebreakersNeeded.value = needed;

            tiedTeams.value = [...tied];
            guaranteedIds.value = [...safe];

            showTieBreakerModal.value = true;
            return;
        }
        await finalizeFinals(safe);
    };

    const resolveManually = (winner: Team) => {
        if (!guaranteedIds.value.includes(winner.id)) {
            guaranteedIds.value.push(winner.id);
            tiebreakersNeeded.value--;
        } else {
            guaranteedIds.value.splice(guaranteedIds.value.indexOf(winner.id), 1);
            tiebreakersNeeded.value++;
        }
    };

    const confirmTiebreakerSelection = async () => {
        if (!tournament.value) return;

        // Double-check we have the right amount
        if (tiebreakersNeeded.value === 0) {
            saving.value = true; // Show loading state if you have one
            try {
                // Finalize using the IDs the user manually selected
                await finalizeFinals([...guaranteedIds.value]);
            } finally {
                saving.value = false;
            }
        }
    };

    const cancelTieBreaker = () => {
        showTieBreakerModal.value = false;

        // Reset state to avoid "ghost" selections next time it opens
        tiedTeams.value = [];
        guaranteedIds.value = [];
        tiebreakersNeeded.value = 0;
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
        const stagePriority: Record<string, number> = Object.fromEntries(
            tournament.value.stages.map((s, i) => [s.name, i + 1])
        );

        const relevantRaces = Object.values(tournament.value.races)
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
                points: pos ? (getPointsForPos(pos) || 0) : 0,
                stage: race.stage
            };
        });
    };

    const activeStagePlayers = (targetGroup: string): Player[] => {
        if (!tournament.value) return [];
        const t = tournament.value;
        const lastStage = getLastStageName(t);
        const stageName = currentView.value;

        let targetTeams: Team[] = [];
        if (stageName === lastStage || targetGroup === lastStage) {
            targetTeams = t.teams
                .filter(tm => tm.qualifiedStages.includes(lastStage))
                .sort((a, b) => (b.stagePoints[lastStage] ?? 0) - (a.stagePoints[lastStage] ?? 0));
        } else if (targetGroup) {
            targetTeams = t.teams
                .filter(tm => tm.stageGroups[stageName] === targetGroup)
                .sort((a, b) => (b.stagePoints[stageName] ?? 0) - (a.stagePoints[stageName] ?? 0));
        }

        let players: {id: string, name: string, isCaptain: boolean, uma: string}[] = [];
        targetTeams.forEach(t => {
            players.push({ id: t.captainId, name: getPlayerName(tournament.value, t.captainId), isCaptain: true, uma: getPlayerUma(tournament.value, t.captainId) });
            t.memberIds.forEach(mid => players.push({ id: mid, name: getPlayerName(tournament.value, mid), isCaptain: false, uma: getPlayerUma(tournament.value, mid) }));
        });

        // B. NEW: Get Wildcards for this Group
        const groupWildcards = (tournament.value.wildcards || [])
            .filter(w => w.stage === currentView.value && w.group === targetGroup)
            .map(w => tournament.value!.players[w.playerId])
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


    // --- NEW: HELPERS ---
    const isAdvancing = (teamId: string) => {
        if (!tournament.value || !advancingTeamIds.value.has(teamId)) return false;
        const team = tournament.value.teams.find(t => t.id === teamId);
        return (team?.stagePoints[currentView.value] ?? 0) > 0;
    };

    // --- 3. NEW FEATURE: Add Penalty/Bonus ---
    const addTeamAdjustment = async (teamId: string, amount: number, reason: string) => {
        if (!tournament.value) return;
        saving.value = true;

        const stage = currentView.value; // 'groups' or 'finals'

        const adjustment: PointAdjustment = {
            id: crypto.randomUUID(),
            amount,
            reason,
            stage
        };

        const teamsWithAdj = tournament.value.teams.map(t => {
            if (t.id === teamId) {
                return { ...t, adjustments: [...(t.adjustments || []), adjustment] };
            }
            return t;
        });

        // Recalculate so team.points / team.finalsPoints reflect the new adjustment immediately
        const { teams: scoredTeams } = recalculateTournamentScores({
            ...tournament.value,
            teams: teamsWithAdj
        });

        try {
            await secureUpdate({ teams: scoredTeams });
        } catch(e) {
            console.error(e);
        } finally {
            saving.value = false;
        }
    };

    // NEW: Remove Adjustment
    const removeTeamAdjustment = async (teamId: string, adjustmentId: string) => {
        if (!tournament.value) return;
        saving.value = true;

        const teamsWithoutAdj = tournament.value.teams.map(t => {
            if (t.id === teamId && t.adjustments) {
                return { ...t, adjustments: t.adjustments.filter(a => a.id !== adjustmentId) };
            }
            return t;
        });

        // Recalculate so team.points / team.finalsPoints reflect the removed adjustment immediately
        const { teams: scoredTeams } = recalculateTournamentScores({
            ...tournament.value,
            teams: teamsWithoutAdj
        });

        try {
            await secureUpdate({ teams: scoredTeams });
        } catch(e) {
            console.error("Error removing adjustment:", e);
        } finally {
            saving.value = false;
        }
    };

    const winningTeams = computed(() => {
        if (!tournament.value || sortedFinalsTeams.value.length === 0) return [];

        const topTeam = sortedFinalsTeams.value[0]!;
        const lastStage = getLastStageName(tournament.value);

        return sortedFinalsTeams.value.filter(t =>
            compareTeams(topTeam, t, false, tournament.value!, lastStage) === 0
        );
    });

    /**
     * Returns the "Visual Rank Index" for a team.
     * If Team A (idx 0) and Team B (idx 1) are tied, this returns 0 for both.
     * This ensures both get the "Gold" color.
     */
    const getVisualRankIndex = (index: number, sortedList: Team[]) => {
        if (index <= 0) return 0;

        const currentTeam = sortedList[index]!;
        const prevTeam = sortedList[index - 1]!;

        // We use compareTeams with `useIdFallback = false`.
        // If it returns 0, they are perfectly tied regarding points and placements.
        const isTied = compareTeams(currentTeam, prevTeam, false, tournament.value!, currentView.value) === 0;

        if (isTied) {
            // Recursively get the rank of the previous team
            // (handles 3-way ties: A=B=C -> all get A's rank)
            return getVisualRankIndex(index - 1, sortedList);
        }

        return index;
    };

    // --- TAP-TO-RANK RACE EDITING ---
    const editingRaceKey = ref<string | null>(null);
    const entryMap = ref<Record<number, string>>({});

    const toggleEditRace = (stage: string, group: string, raceNum: number) => {
        if (!tournament.value) return;
        const key = raceKey(stage, group, raceNum);
        if (editingRaceKey.value === key) {
            editingRaceKey.value = null;
            entryMap.value = {};
        } else {
            editingRaceKey.value = key;
            const existingRace = tournament.value.races[key];
            const initialMap: Record<number, string> = {};
            if (existingRace?.placements) {
                Object.entries(existingRace.placements).forEach(([pid, pos]) => {
                    initialMap[pos] = pid;
                });
            }
            entryMap.value = initialMap;
        }
    };

    const handleTapToRank = (playerId: string) => {
        const existingRank = Object.keys(entryMap.value).find(
            (key) => entryMap.value[parseInt(key)] === playerId
        );

        if (existingRank) {
            delete entryMap.value[parseInt(existingRank)];
        } else {
            let nextRank = 1;
            while (entryMap.value[nextRank]) {
                nextRank++;
            }
            entryMap.value[nextRank] = playerId;
        }
    };

    // --- DROPDOWN RACE INPUT (old method) ---
    const updateRacePlacement = async (group: string, raceNumber: number, position: number, playerId: string) => {
        if (!tournament.value) return;
        saving.value = true;
        const stage = currentView.value;
        const key = raceKey(stage, group, raceNumber);

        const existingRace = tournament.value.races[key];
        const raceData: Race = existingRace
            ? { ...existingRace }
            : {
                id: crypto.randomUUID(),
                stage,
                group: group as any,
                raceNumber,
                timestamp: new Date().toISOString(),
                placements: {}
            };

        const newPlacements = { ...raceData.placements };

        // Remove player from any old position
        if (playerId) {
            for (const pid of Object.keys(newPlacements)) {
                if (pid === playerId) delete newPlacements[pid];
            }
        }
        // Remove anyone currently at this position
        for (const [pid, pos] of Object.entries(newPlacements)) {
            if (pos === position) delete newPlacements[pid];
        }
        // Place the player at the new position
        if (playerId) {
            newPlacements[playerId] = position;
        }

        raceData.placements = newPlacements;
        raceData.timestamp = new Date().toISOString();

        const { teams: scoredTeams } = recalculateTournamentScores({
            ...tournament.value,
            races: { ...tournament.value.races, [key]: raceData }
        });

        try {
            await secureUpdate({
                [`races.${key}`]: raceData,
                teams: scoredTeams,
            });
        } catch (e) {
            console.error(e);
        } finally {
            saving.value = false;
        }
    };

    // --- TAP-TO-RANK RACE INPUT (new method) ---
    const saveTapResults = async (group: string, raceNumber: number) => {
        if (!tournament.value) return;
        if (saving.value) return;
        saving.value = true;

        const backupEntryMap = { ...entryMap.value };
        const stage = currentView.value;
        const key = raceKey(stage, group, raceNumber);

        const placements: Record<string, number> = {};
        Object.entries(entryMap.value).forEach(([rank, pid]) => {
            placements[pid] = parseInt(rank);
        });

        const raceData: Race = {
            id: tournament.value.races[key]?.id || crypto.randomUUID(),
            stage,
            group: group as any,
            raceNumber,
            timestamp: new Date().toISOString(),
            placements
        };

        editingRaceKey.value = null;

        const { teams: scoredTeams } = recalculateTournamentScores({
            ...tournament.value,
            races: { ...tournament.value.races, [key]: raceData }
        });

        try {
            await secureUpdate({
                [`races.${key}`]: raceData,
                teams: scoredTeams,
            });

            entryMap.value = {};
        } catch (e) {
            console.error(e);
            editingRaceKey.value = key;
            entryMap.value = backupEntryMap;

            alert("An error occurred while saving. Results were not saved!");
        } finally {
            saving.value = false;
        }
    };

    return {
        // State
        currentView,
        saving,
        showTieBreakerModal,
        tiedTeams,
        guaranteedIds,
        tiebreakersNeeded,
        editingRaceKey,
        entryMap,
        // Computed
        sortedTeamsA,
        sortedTeamsB,
        sortedTeamsC,
        sortedFinalsTeams,
        sortedRaces,
        canAdvanceToFinals,
        canEndTournament,
        canShowFinals,
        sortedPlayers,
        winningTeams,
        projectedProgression,
        // Actions
        advanceToFinals,
        resolveManually,
        getRoundPoints,
        getRaceCount,
        activeStagePlayers,
        getTotalPoints,
        getGroupWildcards,
        getRaceResults,
        getRaceResultsForPlayer,
        isBanned,
        isAdvancing,
        toggleBan,
        getVisualRankIndex,
        getProgressionStatus,
        addTeamAdjustment,
        removeTeamAdjustment,
        confirmTiebreakerSelection,
        cancelTieBreaker,
        toggleEditRace,
        handleTapToRank,
        saveTapResults,
        updateRacePlacement
    };
}