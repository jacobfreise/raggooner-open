export interface Player {
    id: string;
    name: string;
    isCaptain: boolean;
    uma: string;
}

export interface Team {
    id: string;
    captainId: string;
    memberIds: string[];
    name: string;
    points: number;
    finalsPoints: number;
    group: 'A' | 'B';
    inFinals?: boolean;
}

export interface Race {
    id: string;
    stage: 'groups' | 'finals';
    group: 'A' | 'B';
    raceNumber: number;
    timestamp: string;
    placements: Record<string, number>; // playerId: position
}

export interface Tournament {
    id: string;
    name: string;
    status: 'registration' | 'draft' | 'active' | 'ban' | 'completed';
    stage: 'groups' | 'finals';
    players: Player[];
    teams: Team[];
    races: Race[];
    createdAt: string;
    draft?: {
        order: string[];
        currentIdx: number;
    };
}