import type { Tournament, Team, Player, Race } from '../types'; // Adjust path if needed

// 🛠️ CONFIG: Adjust this to match your game's scoring rules
const POINTS_SYSTEM: Record<number, number> = {
    1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2,
    10: 1, 11: 0, 12: 0, 13: 0, 14: 0, 15: 0, 16: 0, 17: 0, 18: 0
};

export const generateDiscordReport = (t: Tournament): string => {
    const lines: string[] = [];

    // Create a map of ID -> Player Object for easy lookup
    const playerMap = new Map(t.players.map(p => [p.id, p]));

    // --- Header ---
    lines.push(`**🏆 Tournament Results: ${t.name}**`);
    lines.push('');

    // ==========================================
    // 1. GROUP STAGE (A & B)
    // ==========================================
    const groupNames = ['A', 'B'] as const;

    groupNames.forEach(groupName => {
        // Filter Races for this Group
        const groupRaces = t.races
            .filter(r => r.stage === 'groups' && r.group === groupName)
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        // Filter Teams for this Group
        const groupTeams = t.teams.filter(team => team.group === groupName);

        // Only generate this section if data exists
        if (groupRaces.length > 0 && groupTeams.length > 0) {
            lines.push(buildStageSection(`Group ${groupName}`, groupTeams, groupRaces, playerMap));
            lines.push('');
        }
    });

    // ==========================================
    // 2. FINALS STAGE
    // ==========================================
    const finalsRaces = t.races
        .filter(r => r.stage === 'finals')
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const finalsTeams = t.teams.filter(team => team.inFinals);

    if (finalsRaces.length > 0 && finalsTeams.length > 0) {
        lines.push(buildStageSection('Finals', finalsTeams, finalsRaces, playerMap));
        lines.push('');
    }

    // ==========================================
    // 3. BANS
    // ==========================================
    if (t.bans && t.bans.length > 0) {
        const banCounts = countFrequencies(t.bans);
        const banString = Object.entries(banCounts)
            .map(([name, count]) => count > 1 ? `${name} (${count})` : name)
            .join(', ');

        lines.push(`**🚫 Bans:** ${banString}`);
    }
    lines.push(`Tournament ID: ${t.id}`);

    return lines.join('\n');
};

/**
 * ------------------------------------------------------------------
 * HELPER: Builds a specific section (Rankings + Race Winners)
 * ------------------------------------------------------------------
 */
const buildStageSection = (
    title: string,
    teams: Team[],
    races: Race[],
    playerMap: Map<string, Player>
): string => {
    const sectionLines: string[] = [];

    sectionLines.push(`**${title}:**`);

    // 1. Calculate Scores specific to ONLY these races
    const scopedPlayerScores = calculatePlayerScoresForRaces(races);

    // 2. Calculate Team Scores & Sort
    const rankedTeams = teams.map(team => {
        // Combine Captain + Members into one roster
        let fullRosterIds = [team.captainId, ...team.memberIds];

        fullRosterIds.sort((idA, idB) => {
            const scoreA = scopedPlayerScores[idA] || 0;
            const scoreB = scopedPlayerScores[idB] || 0;
            return scoreB - scoreA;
        });

        // Sum up points for the whole team based on scoped scores
        const teamRoundScore = fullRosterIds.reduce((sum, pid) => {
            return sum + (scopedPlayerScores[pid] || 0);
        }, 0);

        return { ...team, teamRoundScore, fullRosterIds };
    }).sort((a, b) => b.teamRoundScore - a.teamRoundScore);

    // 3. Generate Ranking Text
    rankedTeams.forEach((team, index) => {
        const rank = getOrdinal(index + 1);

        // Generate text for the full roster
        const membersText = team.fullRosterIds.map(pid => {
            const p = playerMap.get(pid);
            const score = scopedPlayerScores[pid] || 0;
            return p ? `${p.name} (${score})` : 'Unknown';
        }).join(', ');

        const umasText = team.fullRosterIds.map(pid => {
            const p = playerMap.get(pid);
            return p ? (p.uma || 'Unknown') : 'Unknown';
        }).join(', ');

        sectionLines.push(`**${rank}:**  ${team.name} - **${team.teamRoundScore} Points**`)
        sectionLines.push(`${membersText}`);
        sectionLines.push(`> Umas - ${umasText}`);
    });

    sectionLines.push('');

    // 4. Generate Race Winners Text
    sectionLines.push(`**Race Winners:**`);
    races.forEach((race, index) => {
        // Find the player ID who has placement: 1
        const winnerId = Object.keys(race.placements).find(pid => race.placements[pid] === 1);

        if (winnerId) {
            const winner = playerMap.get(winnerId);
            sectionLines.push(`Race ${index + 1}: ${winner?.name || 'Unknown'} - ${winner?.uma || 'Unknown'}`);
        } else {
            sectionLines.push(`Race ${index + 1}: No Winner Recorded`);
        }
    });

    return sectionLines.join('\n');
};

// --- Low Level Helpers ---

// Calculates scores ONLY based on the array of races provided
const calculatePlayerScoresForRaces = (races: Race[]): Record<string, number> => {
    const scores: Record<string, number> = {};

    races.forEach(race => {
        Object.entries(race.placements).forEach(([playerId, position]) => {
            const points = POINTS_SYSTEM[position] || 0;
            scores[playerId] = (scores[playerId] || 0) + points;
        });
    });

    return scores;
};

const getOrdinal = (n: number): string => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0])!;
};

const countFrequencies = (arr: string[]): Record<string, number> => {
    return arr.reduce((acc, curr) => {
        acc[curr] = (acc[curr] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);
};