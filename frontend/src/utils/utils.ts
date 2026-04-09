import type {Player, Race, Team, Tournament, Wildcard} from "../types.ts";
import {POINTS_SYSTEM as DEFAULT_POINTS, getStagePreset} from "./constants.ts";

export const raceKey = (stage: string, group: string, raceNumber: number) =>
    `${stage}-${group}-${raceNumber}`;

// --- Stage helpers ---
export const getCurrentStage = (t: Tournament) => t.stages[t.currentStageIndex];
export const getCurrentStageName = (t: Tournament): string => getCurrentStage(t)?.name ?? '';
export const getLastStageName = (t: Tournament): string => t.stages[t.stages.length - 1]?.name ?? '';
export const getFirstStageName = (t: Tournament): string => t.stages[0]?.name ?? '';
export const isAtLastStage = (t: Tournament): boolean => t.currentStageIndex >= t.stages.length - 1;

export const migratePlayers = (players: any): Record<string, Player> => {
    if (!players) return {};
    if (Array.isArray(players)) {
        const map: Record<string, Player> = {};
        for (const player of players) {
            map[player.id] = player;
        }
        return map;
    }
    return players as Record<string, Player>;
};

export const migrateRaces = (races: any): Record<string, Race> => {
    if (!races) return {};
    if (Array.isArray(races)) {
        const map: Record<string, Race> = {};
        for (const race of races) {
            const key = raceKey(race.stage, race.group, race.raceNumber);
            map[key] = race;
        }
        return map;
    }
    return races as Record<string, Race>;
};

/**
 * Lazy migration: converts old-schema Firestore documents to the new N-stage schema.
 * Safe to call on already-migrated documents — all transforms are idempotent.
 *
 * Old → New mappings:
 *   tournament.stage ('groups'|'finals') → currentStageIndex
 *   tournament missing stages             → stages derived from team count
 *   team.points                           → stagePoints['groups']
 *   team.finalsPoints                     → stagePoints['finals']
 *   team.group                            → stageGroups['groups']
 *   team.inFinals                         → qualifiedStages includes 'finals'
 */
export const migrateTournament = (data: any): Tournament => {
    // --- stages / currentStageIndex ---
    if (!data.stages || !Array.isArray(data.stages) || data.stages.length === 0) {
        data.stages = getStagePreset(data.teams?.length ?? 0);
    }
    if (data.currentStageIndex == null) {
        // Map legacy `tournament.stage` string to index
        const stageNames = (data.stages as Array<{name: string}>).map((s) => s.name);
        const legacyStage: string = data.stage ?? 'groups';
        const idx = stageNames.indexOf(legacyStage);
        data.currentStageIndex = idx >= 0 ? idx : 0;
    }

    // --- teams ---
    if (Array.isArray(data.teams)) {
        data.teams = data.teams.map((team: any) => {
            // stagePoints
            if (!team.stagePoints) {
                team.stagePoints = {};
            }
            if (team.points != null && team.stagePoints['groups'] == null) {
                team.stagePoints['groups'] = team.points;
            }
            if (team.finalsPoints != null && team.stagePoints['finals'] == null) {
                team.stagePoints['finals'] = team.finalsPoints;
            }

            // stageGroups
            if (!team.stageGroups) {
                team.stageGroups = {};
            }
            if (team.group != null && team.stageGroups['groups'] == null) {
                team.stageGroups['groups'] = team.group;
            }

            // qualifiedStages
            if (!team.qualifiedStages) {
                team.qualifiedStages = [];
                // All teams are at minimum in the first stage
                const firstStage = (data.stages as Array<{name: string}>)[0]?.name;
                if (firstStage && !team.qualifiedStages.includes(firstStage)) {
                    team.qualifiedStages.push(firstStage);
                }
                if (team.inFinals) {
                    const lastStage = (data.stages as Array<{name: string}>)[data.stages.length - 1]?.name;
                    if (lastStage && !team.qualifiedStages.includes(lastStage)) {
                        team.qualifiedStages.push(lastStage);
                    }
                }
            }

            // Ensure finals stageGroups when inFinals
            if (team.inFinals && !team.stageGroups['finals']) {
                team.stageGroups['finals'] = 'A';
            }

            return team;
        });
    }

    return data as Tournament;
};

// Compare two teams (Returns positive if A is better, negative if B is better)
// stageName: the stage to compare points on. Defaults to the tournament's current stage.
export const compareTeams = (a: Team, b: Team, useIdFallback = true, tournament: Tournament, stageName?: string) => {
    const stage = stageName ?? getCurrentStageName(tournament);
    const aPoints = a.stagePoints[stage] ?? 0;
    const bPoints = b.stagePoints[stage] ?? 0;

    // Priority 1: Points
    if (bPoints !== aPoints) {
        return bPoints - aPoints;
    }

    const useTiebreaker = tournament.usePlacementTiebreaker ?? true;

    if (useTiebreaker) {
        // Priority 2: Countback (Most 1sts, then 2nds, etc.)
        const placementsA = getTeamPlacements(a, tournament, stage);
        const placementsB = getTeamPlacements(b, tournament, stage);

        for (let i = 1; i <= 18; i++) {
            const countA = placementsA[i] || 0;
            const countB = placementsB[i] || 0;
            if (countB !== countA) {
                return countB - countA;
            }
        }
    }

    // Priority 3: Fallback (Only if requested)
    if (useIdFallback) {
        return a.id.localeCompare(b.id);
    }

    return 0; // It is a perfect statistical tie
};

// 1. Get placement counts for a specific team (e.g. {1: 3, 2: 1, 3: 0})
const getTeamPlacements = (team: Team, tournament: Tournament, stageName?: string) => {
    const counts: Record<number, number> = {};
    if (!tournament) return counts;

    const stage = stageName ?? getCurrentStageName(tournament);
    const isLastStage = stage === getLastStageName(tournament);
    const teamGroup = team.stageGroups[stage];

    // For the last stage use all races in that stage; for earlier stages filter by group
    const relevantRaces = Object.values(tournament.races).filter(r =>
        isLastStage ? r.stage === stage : (r.stage === stage && r.group === teamGroup)
    );

    const roster = [team.captainId, ...(team.memberIds || [])];
    relevantRaces.forEach(race => {
        roster.forEach(pid => {
            const pos = race.placements[pid];
            if (pos) {
                counts[pos] = (counts[pos] || 0) + 1;
            }
        });
    });

    return counts;
};

export const recalculateTournamentScores = (t: Tournament): { teams: Team[], players: Record<string, Player>, wildcards: Wildcard[] } => {
    const activePointsSystem = t.pointsSystem || DEFAULT_POINTS;

    // 1. Clone to avoid mutation issues; reset stagePoints
    const teams = t.teams.map(team => ({
        ...team,
        stagePoints: {} as Record<string, number>,
        adjustments: team.adjustments || []
    }));

    const players: Record<string, Player> = Object.fromEntries(
        Object.entries(t.players).map(([k, p]) => [k, {
            ...p,
            totalPoints: 0,
            stagePoints: {} as Record<string, number>
        }])
    );

    const wildcards = t.wildcards ? t.wildcards.map(wildcard => ({
        ...wildcard,
        points: 0
    })) : [];

    // Helper to find indices
    const findTeamIdx = (pid: string) => teams.findIndex(team => team.captainId === pid || team.memberIds.includes(pid));
    const findWildcardIdx = (wid: string) => wildcards.findIndex(wc => wc.playerId === wid);

    // 2. Process ALL Races
    Object.values(t.races).forEach(race => {
        const stageName = race.stage;

        Object.entries(race.placements).forEach(([pid, pos]) => {
            const numericPos = Number(pos);
            const points = activePointsSystem[numericPos] || 0;

            // Update Team
            const tIdx = findTeamIdx(pid);
            if (tIdx !== -1) {
                const team = teams[tIdx]!;
                team.stagePoints[stageName] = (team.stagePoints[stageName] ?? 0) + points;
            }

            // Update Player
            const player = players[pid];
            if (player) {
                player.totalPoints = (player.totalPoints || 0) + points;
                player.stagePoints = player.stagePoints || {};
                player.stagePoints[stageName] = (player.stagePoints[stageName] ?? 0) + points;
            }

            // Update Wildcard
            const wIdx = findWildcardIdx(pid);
            if (wIdx !== -1) {
                wildcards[wIdx]!.points = (wildcards[wIdx]!.points || 0) + points;
            }
        });
    });

    // 3. Process Adjustments (Penalties/Bonuses)
    teams.forEach(team => {
        if (team.adjustments) {
            team.adjustments.forEach(adj => {
                team.stagePoints[adj.stage] = (team.stagePoints[adj.stage] ?? 0) + adj.amount;
            });
        }
    });

    return { teams, players, wildcards };
};

export const getStatusColor = (status: string) => {
    switch (status) {
        case 'track-selection':
            return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50';
        case 'registration':
            return 'bg-green-500/20 text-green-300 border-green-500/50';
        case 'active':
            return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50';
        case 'draft':
            return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50';
        default:
            return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
    }
};
export const getPositionStyle = (pos?: number, stage?: string, lastStageName?: string) => {
    if (!pos) return 'bg-slate-900 border-slate-800 text-slate-600';
    let style = 'bg-slate-800 border-slate-600 text-slate-400';
    if (pos === 1) style = 'bg-amber-500/10 border-amber-500 text-amber-500';
    if (pos === 2) style = 'bg-slate-300/10 border-slate-300 text-slate-300';
    if (pos === 3) style = 'bg-orange-700/10 border-orange-700 text-orange-600';

    if (stage && stage === lastStageName) {
        style += ' ring-2 ring-amber-500/30';
    }
    return style;
};
export const getRankColor = (idx: number) => {
    if (idx === 0) return 'border-amber-400';
    if (idx === 1) return 'border-slate-400';
    if (idx === 2) return 'border-orange-700';
    return 'border-slate-700';
};
const findRace = (group: string,
                  raceNumber: number,
                  tournament: null | Tournament,
                  currentView: String) => {
    if (!tournament) return undefined;
    const stage = currentView as string;
    const key = raceKey(stage, group, raceNumber);
    return tournament.races[key];
};
export const getPlayerAtPosition = (group: any,
                                    raceNumber: number,
                                    position: number,
                                    tournament: null | Tournament,
                                    currentView: String) => {
    const race = findRace(group, raceNumber, tournament, currentView);
    if (!race || !race.placements) return "";
    const entry = Object.entries(race.placements).find(([_, pos]) => pos == position);
    return entry ? entry[0] : "";
};
export const getRaceTimestamp = (group: any,
                                 raceNumber: number,
                                 tournament: null | Tournament,
                                 currentView: String) => {
    const race = findRace(group, raceNumber, tournament, currentView);
    if (!race) return "Not Started";
    return new Date(race.timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
}

export const getPlayerName = (tournament: Tournament | null, id: string) => {
    return tournament?.players[id]?.name || 'Unknown';
};

export const getPlayerUma = (tournament: Tournament | null, id: string) => {
    return tournament?.players[id]?.uma || '';
};
