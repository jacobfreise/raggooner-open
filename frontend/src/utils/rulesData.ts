export interface TournamentRule {
    text: string;
    isUnique?: boolean;
}

export function getTournamentRules(format: string | undefined): { unique: TournamentRule[], general: TournamentRule[] } {
    const isDraft = format === 'uma-draft';

    const general: TournamentRule[] = [
        { text: "Teams of 3 players." },
        { text: "5 races total per stage." },
        { text: "Points allocated by placement; team with most points wins." },
        { text: "Training: One run on the day of the tournament." },
        { text: "Borrows: Allowed." },
        { text: "Career Fail: No restarts allowed (bad luck)." },
        { text: "Restart Exception: Allowed if wrong scenario was selected (e.g. URA vs Aoharu)." },
        { text: "Schedule: Possible 30 min delay; duration approx. 2 hours." }
    ];

    const unique: TournamentRule[] = [];

    if (isDraft) {
        unique.push(
            { text: "NO bans for this tournament.", isUnique: true },
            { text: "Uma Snake Draft: Teams pick umas they wish to run.", isUnique: true },
            { text: "No duplicate umas allowed across the tournament.", isUnique: true },
            { text: "Prep Time: 50 minutes after draft to complete your ace.", isUnique: true },
            { text: "Penalties: 2 points/min deduction after limit (max 20).", isUnique: true },
            { text: "Late Arrival: NPC replacement after 10 minutes delay.", isUnique: true }
        );
    } else {
        unique.push(
            { text: "Ban System: Captains DM a single ban (overlap possible).", isUnique: true },
            { text: "Ban Timer: 5 minutes to submit your ban.", isUnique: true },
            { text: "Style Limit: Max 2 umas of the same style per team.", isUnique: true },
            { text: "Duplicate Limit: Max 2 of the same character per team.", isUnique: true },
            { text: "Prep Time: 55 minutes after ban phase to complete your ace.", isUnique: true },
            { text: "Group Stage: If 18+ players, winners advance to a 5-race Final.", isUnique: true }
        );
    }

    return { unique, general };
}
