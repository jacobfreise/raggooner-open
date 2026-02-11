import {FieldValue} from "firebase/firestore";

export interface Player {
    id: string;
    name: string;
    isCaptain: boolean;
    uma: string;
    totalPoints?: number;
    groupPoints?: number;
    finalsPoints?: number;
}

export interface Wildcard {
    playerId: string;
    group: 'A' | 'B' | 'C' | 'Finals';
    points?: number;
}

export interface PointAdjustment {
    id: string;
    reason: string;
    amount: number; // Positive for bonus, negative for penalty
    stage: 'groups' | 'finals';
}

export interface Team {
    id: string;
    captainId: string;
    memberIds: string[];
    name: string;
    points: number;
    finalsPoints: number;
    adjustments?: PointAdjustment[];
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
    pointsSystem?: Record<number, number>;
    banTimerStart?: string;
}

export type FirestoreUpdate<T> = {
    [K in keyof T]?: T[K] | FieldValue;
};

export interface EggConfig {
    id: string;                    // Unique key for this egg
    check: (race: any, players: any[], tournament: Tournament) => boolean; // Logic to determine if egg triggers
    audio?: string;                // Path to sound file (optional)
    volume?: number;               // 0.0 to 1.0
    duration?: number;             // How long visuals stay on screen (ms)
    visual?: {
        overlayClass: string;  // Class for the popup/overlay (e.g. 'hishi-overlay')
        rootClass?: string;    // Class for the main app div (e.g. 'hishi-quake')
        text?: string;
        image?: string;       // Path to the file (e.g., '/gifs/dance.gif')
        imageClass?: string;
    }
}

export interface FameResult {
    player: Player | Team;
    value: string | number;
    subtext: string;
}

export type TieHandling =
    | { type: 'allow-ties' }           // Return all tied winners
    | { type: 'no-winner-on-tie' }     // Return null if tied
    | { type: 'tiebreaker', fn: (a: FameResult, b: FameResult, tournament: Tournament) => number }; // Custom tiebreaker


export interface FameCategory {
    id: string;
    title: string;
    description: string;
    isTeam?: boolean;
    icon: string; // Phosphor icon class
    color: string; // Tailwind text color class
    gradient?: string;
    tieHandling: TieHandling;
    // The magic: Function returns the player(s) who won this category
    // Returns: { player: Player, value: string | number }
    calculate: (tournament: Tournament) => FameResult[];
}

export interface PlayerStats {
    player: Player;
    value: number;
    subtext: string;
    metadata?: Record<string, any>; // e.g., { golds: 3, silvers: 2 }
}

export interface TeamStats {
    team: Team;
    value: number;
    subtext: string;
    metadata?: Record<string, any>;
}