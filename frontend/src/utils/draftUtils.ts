import type {Team, Tournament} from "../types.ts";
import {TEAM_COLORS} from "./constants.ts";

export function generateDraftStructure(tournament: Tournament) {
    const captains = Object.values(tournament.players).filter(p => p.isCaptain);
    const draftOrderCaptains = [...captains].sort(() => Math.random() - 0.5);

    let groupDeck: string[] = [];
    const numTeams = captains.length;

    // --- LOGIC UPDATE HERE ---
    if (numTeams === 9) {
        // 3 Groups of 3
        groupDeck = ['A', 'A', 'A', 'B', 'B', 'B', 'C', 'C', 'C'];
    } else if (numTeams === 8) {
        // 2 Groups of 4
        groupDeck = ['A', 'A', 'A', 'A', 'B', 'B', 'B', 'B'];
    } else if (numTeams === 6) {
        // 2 Groups of 3
        groupDeck = ['A', 'A', 'A', 'B', 'B', 'B'];
    } else {
        // Small tournament (Main Event)
        groupDeck = Array(numTeams).fill('A');
    }

    // Shuffle groups
    groupDeck.sort(() => Math.random() - 0.5);

    const teams: Team[] = draftOrderCaptains.map((cap, index) => ({
        id: crypto.randomUUID(),
        captainId: cap.id,
        memberIds: [],
        name: `Team ${cap.name}`,
        points: 0,
        finalsPoints: 0,
        group: groupDeck[index] as 'A' | 'B' | 'C',
        color: TEAM_COLORS[index % TEAM_COLORS.length],
        inFinals: numTeams < 6
    }));

    const draftOrder: string[] = [];
    for (let i = 0; i < teams.length; i++) draftOrder.push(teams[i]!.id);
    for (let i = teams.length - 1; i >= 0; i--) draftOrder.push(teams[i]!.id);
    return {teams, draftOrder};
}