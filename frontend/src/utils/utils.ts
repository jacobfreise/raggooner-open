import type {Team, Tournament} from "../types.ts";

// Compare two teams (Returns positive if A is better, negative if B is better)
export const compareTeams = (a: Team, b: Team, useIdFallback = true, tournament: Tournament, isFinals?: boolean) => {
    const aPoints = isFinals ? a.finalsPoints : a.points;
    const bPoints = isFinals ? b.finalsPoints : b.points;

    // Priority 1: Points
    if (bPoints !== aPoints) {
        return bPoints - aPoints;
    }

    const useTiebreaker = tournament.usePlacementTiebreaker ?? true;

    if (useTiebreaker) {
        // Priority 2: Countback (Most 1sts, then 2nds, etc.)
        const placementsA = getTeamPlacements(a, tournament);
        const placementsB = getTeamPlacements(b, tournament);

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
const getTeamPlacements = (team: Team, tournament: Tournament) => {
    const counts: Record<number, number> = {};
    if (!tournament) return counts;

    // Get all members (Captain + Members)
    const roster = [team.captainId, ...team.memberIds];

    // Look at ONLY the races for this team's group
    const relevantRaces = tournament.races.filter(r =>
        r.stage === 'groups' && r.group === team.group
    );

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
export const getStatusColor = (status: string) => {
    switch (status) {
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
export const getPositionStyle = (pos?: number, stage?: string) => {
    if (!pos) return 'bg-slate-900 border-slate-800 text-slate-600';
    let style = 'bg-slate-800 border-slate-600 text-slate-400';
    if (pos === 1) style = 'bg-amber-500/10 border-amber-500 text-amber-500';
    if (pos === 2) style = 'bg-slate-300/10 border-slate-300 text-slate-300';
    if (pos === 3) style = 'bg-orange-700/10 border-orange-700 text-orange-600';

    if (stage === 'finals') {
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
    const stage = currentView;
    return tournament.races.find(r =>
        r.stage === stage &&
        r.group === group &&
        r.raceNumber === raceNumber
    );
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
    return tournament?.players.find(p => p.id === id)?.name || 'Unknown';
};

export const getPlayerUma = (tournament: Tournament | null, id: string) => {
    return tournament?.players.find(p => p.id === id)?.uma || '';
};