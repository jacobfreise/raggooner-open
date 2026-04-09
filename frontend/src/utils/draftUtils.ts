import type {Team, Tournament} from "../types.ts";
import {TEAM_COLORS, getStagePreset} from "./constants.ts";

export function generateDraftStructure(tournament: Tournament) {
    const captains = Object.values(tournament.players).filter(p => p.isCaptain);
    const draftOrderCaptains = [...captains].sort(() => Math.random() - 0.5);

    const numTeams = captains.length;
    const preset = getStagePreset(numTeams);
    const firstStageName = preset[0]!.name;

    // Build a flat deck of group labels matching the first stage's group distribution
    let groupDeck: string[] = [];
    if (numTeams === 9) {
        groupDeck = ['A', 'A', 'A', 'B', 'B', 'B', 'C', 'C', 'C'];
    } else if (numTeams === 8) {
        groupDeck = ['A', 'A', 'A', 'A', 'B', 'B', 'B', 'B'];
    } else if (numTeams === 6) {
        groupDeck = ['A', 'A', 'A', 'B', 'B', 'B'];
    } else {
        groupDeck = Array(numTeams).fill('A');
    }

    // Shuffle groups
    groupDeck.sort(() => Math.random() - 0.5);

    const teams: Team[] = draftOrderCaptains.map((cap, index) => ({
        id: crypto.randomUUID(),
        captainId: cap.id,
        memberIds: [],
        name: `Team ${cap.name}`,
        stagePoints: {},
        stageGroups: { [firstStageName]: groupDeck[index]! },
        qualifiedStages: [firstStageName],
        color: TEAM_COLORS[index % TEAM_COLORS.length],
    }));

    const draftOrder: string[] = [];
    for (let i = 0; i < teams.length; i++) draftOrder.push(teams[i]!.id);
    for (let i = teams.length - 1; i >= 0; i--) draftOrder.push(teams[i]!.id);
    return {teams, draftOrder};
}

/**
 * Generate uma draft order from a completed player draft.
 * Reverses the forward order from the player draft, then builds a 3-round snake.
 * Example with 3 teams [A,B,C] player draft → uma draft: [C,B,A, A,B,C, C,B,A]
 */
export function generateUmaDraftOrder(tournament: Tournament): string[] {
    if (!tournament.draft?.order) return [];

    // Extract unique team IDs in forward order from the player draft order
    const seen = new Set<string>();
    const forwardOrder: string[] = [];
    for (const teamId of tournament.draft.order) {
        if (!seen.has(teamId)) {
            seen.add(teamId);
            forwardOrder.push(teamId);
        }
    }

    // Reverse for uma draft starting order
    const reversed = [...forwardOrder].reverse();

    // Build 3-round snake: reverse, forward, reverse
    const umaDraftOrder: string[] = [
        ...reversed,
        ...forwardOrder,
        ...reversed
    ];

    return umaDraftOrder;
}