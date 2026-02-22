import type {Tournament, Team, Player, Race, Wildcard} from '../types';

export const generateDiscordReport = (t: Tournament, shortened = false): string => {
    const lines: string[] = [];
    const playerMap = new Map(Object.values(t.players).map(p => [p.id, p]));

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
        const groupRaces = Object.values(t.races)
            .filter(r => r.stage === 'groups' && r.group === groupName)
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        const groupTeams = t.teams.filter(team => team.group === groupName);
        const groupWildcards = t.wildcards?.filter(w => w.group === groupName) || [];

        if (groupRaces.length > 0 && (groupTeams.length > 0 || groupWildcards.length > 0)) {
            lines.push(buildCompactStageSection(
                `${groupEmojis[groupName]}Group  ${groupName}`,
                groupName,
                groupTeams,
                groupRaces,
                t.wildcards || [],
                playerMap,
                shortened
            ));
        }
    });

    // ==========================================
    // FINALS
    // ==========================================
    const finalsRaces = Object.values(t.races)
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
            playerMap,
            shortened
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
    playerMap: Map<string, Player>,
    shortened = false
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

        const qMark = (currentStage === 'groups' && team.inFinals) ? ' ✅' : (currentStage === 'groups' && !team.inFinals) ? ' ❌' : '';

        // Main line: Medal Team — Points
        lines.push(`${medal} **${team.name}**${qMark} — **${team.totalScore}**`);

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
            return `${icon} ${p?.name || 'Unknown'} ${uma} ${score}`;
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

        // Collect winner info first to determine padding
        const winners = races.map(race => {
            const winnerId = Object.keys(race.placements).find(pid => race.placements[pid] === 1);
            const winner = winnerId ? playerMap.get(winnerId) : null;
            return { name: winner?.name || '?', uma: winner?.uma || '?' };
        });

        const padWidth = shortened
            ? 12
            : Math.max(...winners.map(w => w.name.length)) +1;

        winners.forEach((w, idx) => {
            const name = shortened
                ? w.name.substring(0, 12).padEnd(padWidth)
                : w.name.padEnd(padWidth);
            const uma = shortened ? w.uma.substring(0, 19) : w.uma;
            lines.push(`${idx + 1}. ${name} ${uma}`);
        });
        lines.push('```');
    }

    return lines.join('\n');
};

// ==========================================
// ALTERNATIVE: Split into multiple messages
// ==========================================
export const generateDiscordReportSplit = (t: Tournament, shortened = false): string[] => {
    const messages: string[] = [];
    const playerMap = new Map(Object.values(t.players).map(p => [p.id, p]));

    // Message 1: Header + Groups
    const msg1: string[] = [];
    msg1.push('```');
    msg1.push(`🏆 ${t.name.toUpperCase()}`);
    msg1.push('```');

    const groupNames = ['A', 'B', 'C'] as const;
    const groupEmojis = { A: '🔵', B: '🔴', C: '🟢' };

    groupNames.forEach(groupName => {
        const groupRaces = Object.values(t.races).filter(r => r.stage === 'groups' && r.group === groupName);
        const groupTeams = t.teams.filter(team => team.group === groupName);

        if (groupRaces.length > 0 && groupTeams.length > 0) {
            msg1.push(buildCompactStageSection(
                `${groupEmojis[groupName]} ${groupName}`,
                groupName,
                groupTeams,
                groupRaces,
                t.wildcards || [],
                playerMap,
                shortened
            ));
        }
    });

    messages.push(msg1.join('\n'));

    // Message 2: Finals (if exists)
    const finalsRaces = Object.values(t.races).filter(r => r.stage === 'finals');
    const finalsTeams = t.teams.filter(team => team.inFinals);

    if (finalsRaces.length > 0 && finalsTeams.length > 0) {
        const msg2: string[] = [];
        msg2.push(buildCompactStageSection(
            '🏁 Finals',
            'Finals',
            finalsTeams,
            finalsRaces,
            t.wildcards || [],
            playerMap,
            shortened
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
// ALTERNATIVE: Split into 3 messages
// ==========================================
export const generateDiscordReportSplit3 = (t: Tournament, shortened = false): string[] => {
    const messages: string[] = [];
    const playerMap = new Map(Object.values(t.players).map(p => [p.id, p]));

    const groupEmojis = { A: '🔵', B: '🔴', C: '🟢' };

    // Message 1: Header + Group A
    const msg1: string[] = [];
    msg1.push('```');
    msg1.push(`🏆 ${t.name.toUpperCase()}`);
    msg1.push('```');

    const groupARaces = Object.values(t.races).filter(r => r.stage === 'groups' && r.group === 'A');
    const groupATeams = t.teams.filter(team => team.group === 'A');
    if (groupARaces.length > 0 && groupATeams.length > 0) {
        msg1.push(buildCompactStageSection(
            `${groupEmojis.A} A`,
            'A',
            groupATeams,
            groupARaces,
            t.wildcards || [],
            playerMap,
            shortened
        ));
    }
    messages.push(msg1.join('\n'));

    // Message 2: Group B (+ Group C if exists)
    const msg2: string[] = [];
    (['B', 'C'] as const).forEach(groupName => {
        const groupRaces = Object.values(t.races).filter(r => r.stage === 'groups' && r.group === groupName);
        const groupTeams = t.teams.filter(team => team.group === groupName);
        if (groupRaces.length > 0 && groupTeams.length > 0) {
            msg2.push(buildCompactStageSection(
                `${groupEmojis[groupName]} ${groupName}`,
                groupName,
                groupTeams,
                groupRaces,
                t.wildcards || [],
                playerMap,
                shortened
            ));
        }
    });
    if (msg2.length > 0) {
        messages.push(msg2.join('\n'));
    }

    // Message 3: Finals + Bans
    const finalsRaces = Object.values(t.races).filter(r => r.stage === 'finals');
    const finalsTeams = t.teams.filter(team => team.inFinals);

    if (finalsRaces.length > 0 && finalsTeams.length > 0) {
        const msg3: string[] = [];
        msg3.push(buildCompactStageSection(
            '🏁 Finals',
            'Finals',
            finalsTeams,
            finalsRaces,
            t.wildcards || [],
            playerMap,
            shortened
        ));

        if (t.bans && t.bans.length > 0) {
            const banCounts = countFrequencies(t.bans);
            const banList = Object.entries(banCounts)
                .map(([name, count]) => count > 1 ? `${name}(×${count})` : name)
                .join(', ');
            msg3.push(`🚫 **Bans:** ${banList}`);
        }

        messages.push(msg3.join('\n'));
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