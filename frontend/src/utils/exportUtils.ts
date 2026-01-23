import type {Tournament, Team, Player, Race, Wildcard} from '../types';

export const generateDiscordReport = (t: Tournament): string => {
    const lines: string[] = [];

    // Create a map of ID -> Player Object for easy lookup
    const playerMap = new Map(t.players.map(p => [p.id, p]));

    // --- Header ---
    lines.push(`**🏆 Tournament Results: ${t.name}**`);
    lines.push('');

    // ==========================================
    // 1. GROUP STAGE (A & B & C)
    // ==========================================
    const groupNames = ['A', 'B', 'C'] as const;

    groupNames.forEach(groupName => {
        // Filter Races for this Group
        const groupRaces = t.races
            .filter(r => r.stage === 'groups' && r.group === groupName)
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        // Filter Teams for this Group
        const groupTeams = t.teams.filter(team => team.group === groupName);

        // Check for wildcards in this group
        const groupWildcards = t.wildcards?.filter(w => w.group === groupName) || [];

        const hasParticipants = groupTeams.length > 0 || groupWildcards.length > 0;

        if (groupRaces.length > 0 && hasParticipants) {
            lines.push(buildStageSection(
                `Group ${groupName}`,
                groupName,
                groupTeams,
                groupRaces,
                t.wildcards || [],
                playerMap
            ));
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

    const finalsWildcards = t.wildcards?.filter(w => w.group === 'Finals') || [];
    const hasFinalsParticipants = finalsTeams.length > 0 || finalsWildcards.length > 0;

    if (finalsRaces.length > 0 && hasFinalsParticipants) {
        lines.push(buildStageSection(
            'Finals',
            'Finals',
            finalsTeams,
            finalsRaces,
            t.wildcards || [],
            playerMap
        ));
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
    groupIdentifier: string,
    teams: Team[],
    races: Race[],
    wildcards: Wildcard[],
    playerMap: Map<string, Player>
): string => {
    const sectionLines: string[] = [];

    sectionLines.push(`**${title}:**`);

    const currentStage = groupIdentifier === 'Finals' ? 'finals' : 'groups';

    // Prepare Teams for Sorting (Using stored points on Team object)
    const rankedTeams = teams.map(team => {
        // Use stored values as source of truth for Team Score
        const totalScore = currentStage === 'finals' ? (team.finalsPoints || 0) : team.points;

        // Sort roster by their stored individual points
        let fullRosterIds = [team.captainId, ...team.memberIds];

        fullRosterIds.sort((idA, idB) => {
            const playerA = playerMap.get(idA);
            const playerB = playerMap.get(idB);

            const scoreA = currentStage === 'finals' ? (playerA?.finalsPoints || 0) : (playerA?.groupPoints || 0);
            const scoreB = currentStage === 'finals' ? (playerB?.finalsPoints || 0) : (playerB?.groupPoints || 0);

            return scoreB - scoreA;
        });

        // Filter adjustments for display text only
        const relevantAdjustments = team.adjustments?.filter(adj => adj.stage === currentStage) || [];

        return {
            ...team,
            totalScore,
            fullRosterIds,
            relevantAdjustments
        };
    }).sort((a, b) => b.totalScore - a.totalScore);

    // Generate Ranking Text
    let currentRank = 1;

    rankedTeams.forEach((team, index) => {
        // Tie handling logic based on stored totalScore
        if (index > 0) {
            const prevTeam = rankedTeams[index - 1];
            if (team.totalScore < prevTeam!.totalScore) {
                currentRank = index + 1;
            }
        } else {
            currentRank = 1;
        }

        const rankString = getOrdinal(currentRank);

        // Generate text for roster using stored Player points
        const membersText = team.fullRosterIds.map(pid => {
            const p = playerMap.get(pid);
            // Dynamic access based on stage
            const score = currentStage === 'finals' ? (p?.finalsPoints || 0) : (p?.groupPoints || 0);
            return p ? `${p.name} (${score})` : 'Unknown';
        }).join(', ');

        const umasText = team.fullRosterIds.map(pid => {
            const p = playerMap.get(pid);
            return p ? (p.uma || 'Unknown') : 'Unknown';
        }).join(', ');

        // Main Line
        sectionLines.push(`**${rankString}:** ${team.name} - **${team.totalScore} Points**`);

        // Adjustments Line
        if (team.relevantAdjustments.length > 0) {
            const adjText = team.relevantAdjustments
                .map(adj => `${adj.amount > 0 ? '+' : ''}${adj.amount} (${adj.reason})`)
                .join(', ');
            sectionLines.push(`_Adjustments: ${adjText}_`);
        }

        sectionLines.push(`${membersText}`);
        sectionLines.push(`> Umas - ${umasText}`);
    });

    // 4. Generate Wildcard Text
    const activeWildcards = wildcards.filter(w => w.group === groupIdentifier);

    if (activeWildcards.length > 0) {
        sectionLines.push('');
        sectionLines.push(`**👻 Wildcards:**`);

        const sortedWildcards = activeWildcards.map(w => {
            const p = playerMap.get(w.playerId);
            const score = w.points || p?.totalPoints || 0;
            return {
                name: p?.name || 'Unknown',
                uma: p?.uma || 'Unknown',
                score: score
            };
        }).sort((a, b) => b.score - a.score);

        sortedWildcards.forEach(w => {
            sectionLines.push(`${w.name} (${w.score}) - ${w.uma}`);
        });
    }

    sectionLines.push('');

    // 5. Generate Race Winners Text
    sectionLines.push(`**🏁 Race Winners:**`);
    races.forEach((race, index) => {
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