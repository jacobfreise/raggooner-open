export interface Player {
    id: string;
    name: string;
    isCaptain: boolean;
    uma: string;
}

export interface Wildcard {
    playerId: string;
    group: 'A' | 'B' | 'C' | 'Finals';
}

export interface Team {
    id: string;
    captainId: string;
    memberIds: string[];
    name: string;
    points: number;
    finalsPoints: number;
    group: 'A' | 'B' | 'C';
    inFinals?: boolean;
    color?: string;
}

export interface Race {
    id: string;
    stage: 'groups' | 'finals';
    group: 'A' | 'B' | 'C';
    raceNumber: number;
    timestamp: string;
    placements: Record<string, number>; // playerId: position
}

export interface Tournament {
    id: string;
    name: string;
    password?: string;
    status: 'registration' | 'draft' | 'active' | 'ban' | 'completed';
    stage: 'groups' | 'finals';
    players: Player[];
    wildcards?: Wildcard[];
    teams: Team[];
    races: Race[];
    bans?: string[];
    createdAt: string;
    draft?: {
        order: string[];
        currentIdx: number;
    };
    isSecured?: boolean;
    usePlacementTiebreaker?: boolean;
}