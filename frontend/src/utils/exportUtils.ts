import type {Tournament, Team, Player, Race, Wildcard} from '../types';

export const generateDiscordReport = (t: Tournament): string => {
    const lines: string[] = [];
    const playerMap = new Map(t.players.map(p => [p.id, p]));

    // ==========================================
    // HEADER - Ultra compact
    // ==========================================
    lines.push('```');
    lines.push(`🏆 ${t.name.toUpperCase()}`);
    lines.push('```');

    // ==========================================
    // GROUP STAGES
    // ==========================================
    const groupNames = ['A', 'B', 'C'] as const;
    const groupEmojis = { A: '🔵', B: '🔴', C: '🟢' };

    groupNames.forEach(groupName => {
        const groupRaces = t.races
            .filter(r => r.stage === 'groups' && r.group === groupName)
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        const groupTeams = t.teams.filter(team => team.group === groupName);
        const groupWildcards = t.wildcards?.filter(w => w.group === groupName) || [];

        if (groupRaces.length > 0 && (groupTeams.length > 0 || groupWildcards.length > 0)) {
            lines.push(buildCompactStageSection(
                `${groupEmojis[groupName]} ${groupName}`,
                groupName,
                groupTeams,
                groupRaces,
                t.wildcards || [],
                playerMap
            ));
        }
    });

    // ==========================================
    // FINALS
    // ==========================================
    const finalsRaces = t.races
        .filter(r => r.stage === 'finals')
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const finalsTeams = t.teams.filter(team => team.inFinals);
    const finalsWildcards = t.wildcards?.filter(w => w.group === 'Finals') || [];

    if (finalsRaces.length > 0 && (finalsTeams.length > 0 || finalsWildcards.length > 0)) {
        lines.push(buildCompactStageSection(
            '🏁 Finals',
            'Finals',
            finalsTeams,
            finalsRaces,
            t.wildcards || [],
            playerMap
        ));
    }

    // ==========================================
    // BANS - Compact
    // ==========================================
    if (t.bans && t.bans.length > 0) {
        const banCounts = countFrequencies(t.bans);
        const banList = Object.entries(banCounts)
            .map(([name, count]) => count > 1 ? `${name}(×${count})` : name)
            .join(', ');
        lines.push(`🚫 **Bans:** ${banList}`);
    }

    return lines.join('\n');
};

/**
 * Compact stage section - saves ~40% characters
 */
const buildCompactStageSection = (
    title: string,
    groupIdentifier: string,
    teams: Team[],
    races: Race[],
    wildcards: Wildcard[],
    playerMap: Map<string, Player>
): string => {
    const lines: string[] = [];
    const currentStage = groupIdentifier === 'Finals' ? 'finals' : 'groups';

    // Header
    lines.push(`**${title}**`);

    // Prepare Teams
    const rankedTeams = teams.map(team => {
        const totalScore = currentStage === 'finals' ? (team.finalsPoints || 0) : team.points;
        let fullRosterIds = [team.captainId, ...team.memberIds];

        fullRosterIds.sort((idA, idB) => {
            const playerA = playerMap.get(idA);
            const playerB = playerMap.get(idB);
            const scoreA = currentStage === 'finals' ? (playerA?.finalsPoints || 0) : (playerA?.groupPoints || 0);
            const scoreB = currentStage === 'finals' ? (playerB?.finalsPoints || 0) : (playerB?.groupPoints || 0);
            return scoreB - scoreA;
        });

        const relevantAdjustments = team.adjustments?.filter(adj => adj.stage === currentStage) || [];

        return { ...team, totalScore, fullRosterIds, relevantAdjustments };
    }).sort((a, b) => b.totalScore - a.totalScore);

    // Rankings - Compact format
    const medals = ['🥇', '🥈', '🥉'];
    let currentRank = 1;

    rankedTeams.forEach((team, index) => {
        if (index > 0 && team.totalScore < rankedTeams[index - 1]!.totalScore) {
            currentRank = index + 1;
        }

        const medal = currentRank <= 3 ? medals[currentRank - 1] : `${currentRank}.`;

        // Main line: Medal Team — Points
        lines.push(`${medal} **${team.name}** — **${team.totalScore}**`);

        // Adjustments (inline, compact)
        if (team.relevantAdjustments.length > 0) {
            const adjText = team.relevantAdjustments
                .map(adj => `${adj.amount > 0 ? '+' : ''}${adj.amount} ${adj.reason}`)
                .join(', ');
            lines.push(`_${adjText}_`);
        }

        // ✅ Players: Name (Uma) Pts — all in ONE line
        // Players with individual scores
        const playerLines = team.fullRosterIds.map(pid => {
            const p = playerMap.get(pid);
            const score = currentStage === 'finals' ? (p?.finalsPoints || 0) : (p?.groupPoints || 0);
            const isCaptain = pid === team.captainId;
            const icon = isCaptain ? '👑' : '  ';
            const uma = p?.uma ? `(${p.uma})` : '';
            return `${icon} ${p?.name || 'Unknown'}${uma} ${score}`;
        });

        lines.push('```');
        playerLines.forEach(line => lines.push(line));
        lines.push('```');
    });

    // Wildcards - Ultra compact
    const activeWildcards = wildcards.filter(w => w.group === groupIdentifier);
    if (activeWildcards.length > 0) {
        const wcText = activeWildcards
            .map(w => {
                const p = playerMap.get(w.playerId);
                const score = w.points || p?.totalPoints || 0;
                return `${p?.name || '?'}(${p?.uma || '?'}) ${score}`;
            })
            .join(' • ');
        lines.push(`👻 ${wcText}`);
    }

    // Race Winners - Compact table
    if (races.length > 0) {
        lines.push('**🏇 Race Winners:**');
        lines.push('```');
        races.forEach((race, idx) => {
            const winnerId = Object.keys(race.placements).find(pid => race.placements[pid] === 1);
            const winner = winnerId ? playerMap.get(winnerId) : null;
            const name = (winner?.name || '?').substring(0, 12).padEnd(12);
            const uma = (winner?.uma || '?').substring(0, 18);
            lines.push(`${idx + 1}. ${name} ${uma}`);
        });
        lines.push('```');
    }

    return lines.join('\n');
};

// ==========================================
// ALTERNATIVE: Split into multiple messages
// ==========================================
export const generateDiscordReportSplit = (t: Tournament): string[] => {
    const messages: string[] = [];
    const playerMap = new Map(t.players.map(p => [p.id, p]));

    // Message 1: Header + Groups
    const msg1: string[] = [];
    msg1.push('```');
    msg1.push(`🏆 ${t.name.toUpperCase()}`);
    msg1.push('```');

    const groupNames = ['A', 'B', 'C'] as const;
    const groupEmojis = { A: '🔵', B: '🔴', C: '🟢' };

    groupNames.forEach(groupName => {
        const groupRaces = t.races.filter(r => r.stage === 'groups' && r.group === groupName);
        const groupTeams = t.teams.filter(team => team.group === groupName);

        if (groupRaces.length > 0 && groupTeams.length > 0) {
            msg1.push(buildCompactStageSection(
                `${groupEmojis[groupName]} ${groupName}`,
                groupName,
                groupTeams,
                groupRaces,
                t.wildcards || [],
                playerMap
            ));
        }
    });

    messages.push(msg1.join('\n'));

    // Message 2: Finals (if exists)
    const finalsRaces = t.races.filter(r => r.stage === 'finals');
    const finalsTeams = t.teams.filter(team => team.inFinals);

    if (finalsRaces.length > 0 && finalsTeams.length > 0) {
        const msg2: string[] = [];
        msg2.push(buildCompactStageSection(
            '🏁 Finals',
            'Finals',
            finalsTeams,
            finalsRaces,
            t.wildcards || [],
            playerMap
        ));

        // Bans
        if (t.bans && t.bans.length > 0) {
            const banCounts = countFrequencies(t.bans);
            const banList = Object.entries(banCounts)
                .map(([name, count]) => count > 1 ? `${name}(×${count})` : name)
                .join(', ');
            msg2.push(`🚫 **Bans:** ${banList}`);
        }

        messages.push(msg2.join('\n'));
    }

    return messages;
};

// ==========================================
// HELPERS
// ==========================================
const countFrequencies = (arr: string[]): Record<string, number> => {
    return arr.reduce((acc, curr) => {
        acc[curr] = (acc[curr] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);
};