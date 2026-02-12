import type {Tournament, Team, Player, Race, Wildcard} from '../types';

export const generateDiscordReport = (t: Tournament): string => {
    const lines: string[] = [];
    const playerMap = new Map(t.players.map(p => [p.id, p]));

    // ==========================================
    // HEADER with Embed-style formatting
    // ==========================================
    lines.push('```');
    lines.push('═══════════════════════════════════════');
    lines.push(`   🏆 ${t.name.toUpperCase()}`);
    lines.push('═══════════════════════════════════════');
    lines.push('```');
    lines.push('');

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
            lines.push(buildStageSection(
                `${groupEmojis[groupName]} Group ${groupName}`,
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
    // FINALS
    // ==========================================
    const finalsRaces = t.races
        .filter(r => r.stage === 'finals')
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const finalsTeams = t.teams.filter(team => team.inFinals);
    const finalsWildcards = t.wildcards?.filter(w => w.group === 'Finals') || [];

    if (finalsRaces.length > 0 && (finalsTeams.length > 0 || finalsWildcards.length > 0)) {
        lines.push(buildStageSection(
            '🏁 Finals',
            'Finals',
            finalsTeams,
            finalsRaces,
            t.wildcards || [],
            playerMap
        ));
        lines.push('');
    }

    // ==========================================
    // BANS
    // ==========================================
    if (t.bans && t.bans.length > 0) {
        lines.push('```');
        lines.push('🚫 BANNED CHARACTERS');
        lines.push('───────────────────');

        const banCounts = countFrequencies(t.bans);
        Object.entries(banCounts)
            .sort((a, b) => b[1] - a[1]) // Sort by frequency
            .forEach(([name, count]) => {
                const bar = '█'.repeat(count);
                lines.push(`${bar} ${name}${count > 1 ? ` (×${count})` : ''}`);
            });

        lines.push('```');
        lines.push('');
    }

    // ==========================================
    // FOOTER
    // ==========================================
    lines.push('```');
    lines.push(`Tournament ID: ${t.id}`);
    lines.push('```');

    return lines.join('\n');
};

/**
 * Builds a stage section with improved formatting
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
    const currentStage = groupIdentifier === 'Finals' ? 'finals' : 'groups';

    // ✅ Section Header
    sectionLines.push('```ansi');
    sectionLines.push(`\x1b[1;36m${title}\x1b[0m`);
    sectionLines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    sectionLines.push('```');

    // ✅ Prepare Teams
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

    // ✅ Team Rankings with podium emojis
    const medalEmojis = ['🥇', '🥈', '🥉'];
    let currentRank = 1;

    rankedTeams.forEach((team, index) => {
        if (index > 0 && team.totalScore < rankedTeams[index - 1]!.totalScore) {
            currentRank = index + 1;
        }

        const medal = currentRank <= 3 ? medalEmojis[currentRank - 1] : '▪️';
        const rankString = getOrdinal(currentRank);

        // Team Header
        sectionLines.push(`${medal} **${rankString}: ${team.name}** — **${team.totalScore} pts**`);

        // Adjustments (if any)
        if (team.relevantAdjustments.length > 0) {
            const adjText = team.relevantAdjustments
                .map(adj => {
                    const icon = adj.amount > 0 ? '⬆️' : '⬇️';
                    return `${icon} ${adj.amount > 0 ? '+' : ''}${adj.amount} (${adj.reason})`;
                })
                .join(' • ');
            sectionLines.push(`   _${adjText}_`);
        }

        // Players with individual scores
        const playerLines = team.fullRosterIds.map(pid => {
            const p = playerMap.get(pid);
            const score = currentStage === 'finals' ? (p?.finalsPoints || 0) : (p?.groupPoints || 0);
            const isCaptain = pid === team.captainId;
            const icon = isCaptain ? '👑' : '  ';
            return `${icon} ${p?.name || 'Unknown'} (${score})`;
        });

        sectionLines.push('```');
        playerLines.forEach(line => sectionLines.push(line));
        sectionLines.push('```');

        // UMAs in compact format
        const umasText = team.fullRosterIds
            .map(pid => playerMap.get(pid)?.uma || '?')
            .join(' • ');
        sectionLines.push(`> ${umasText}`);
        sectionLines.push('');
    });

    // ✅ Wildcards
    const activeWildcards = wildcards.filter(w => w.group === groupIdentifier);

    if (activeWildcards.length > 0) {
        sectionLines.push('**👻 Wildcards:**');

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
            sectionLines.push(`• ${w.name} **(${w.score})** — ${w.uma}`);
        });
        sectionLines.push('');
    }

    // ✅ Race Winners in compact table
    if (races.length > 0) {
        sectionLines.push('**🏇 Race Winners:**');
        sectionLines.push('```');

        races.forEach((race, index) => {
            const winnerId = Object.keys(race.placements).find(pid => race.placements[pid] === 1);
            const winner = winnerId ? playerMap.get(winnerId) : null;

            // Format: "R1  Special Week        (Haru Urara)"
            const raceName = `R${index + 1}`.padEnd(4);
            const playerName = (winner?.name || 'Unknown').padEnd(20);
            const umaName = winner?.uma ? `(${winner.uma})` : '';

            sectionLines.push(`${raceName}${playerName}${umaName}`);
        });

        sectionLines.push('```');
    }

    return sectionLines.join('\n');
};

// ==========================================
// ALTERNATIVE: Compact "One-Line" Format
// ==========================================
export const generateCompactDiscordReport = (t: Tournament): string => {
    const lines: string[] = [];

    lines.push(`🏆 **${t.name}**`);
    lines.push('');

    // Process each stage
    const stages = [
        { name: 'Group A', emoji: '🔵', filter: (r: Race) => r.stage === 'groups' && r.group === 'A' },
        { name: 'Group B', emoji: '🔴', filter: (r: Race) => r.stage === 'groups' && r.group === 'B' },
        { name: 'Group C', emoji: '🟢', filter: (r: Race) => r.stage === 'groups' && r.group === 'C' },
        { name: 'Finals', emoji: '🏁', filter: (r: Race) => r.stage === 'finals' }
    ];

    stages.forEach(stage => {
        const stageRaces = t.races.filter(stage.filter);
        if (stageRaces.length === 0) return;

        const stageTeams = stage.name === 'Finals'
            ? t.teams.filter(team => team.inFinals)
            : t.teams.filter(team => team.group === stage.name.split(' ')[1]);

        if (stageTeams.length === 0) return;

        const sorted = [...stageTeams].sort((a, b) => {
            const scoreA = stage.name === 'Finals' ? a.finalsPoints : a.points;
            const scoreB = stage.name === 'Finals' ? b.finalsPoints : b.points;
            return scoreB - scoreA;
        });

        lines.push(`${stage.emoji} **${stage.name}**`);

        sorted.slice(0, 3).forEach((team, idx) => {
            const medal = ['🥇', '🥈', '🥉'][idx];
            const score = stage.name === 'Finals' ? team.finalsPoints : team.points;
            lines.push(`${medal} ${team.name} — ${score} pts`);
        });

        lines.push('');
    });

    return lines.join('\n');
};

// ==========================================
// HELPERS
// ==========================================
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