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

// export interface Tournament {
//     id: string;
//     name: string;
//     password?: string;
//     status: 'registration' | 'draft' | 'active' | 'ban' | 'completed';
//     stage: 'groups' | 'finals';
//     players: Player[];
//     wildcards?: Wildcard[];
//     teams: Team[];
//     races: Race[];
//     bans?: string[];
//     createdAt: string;
//     draft?: {
//         order: string[];
//         currentIdx: number;
//     };
//     isSecured?: boolean;
//     usePlacementTiebreaker?: boolean;
//     pointsSystem?: Record<number, number>;
//     banTimerStart?: string;
// }

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


// -------------------------------------------------------
// Neue Datenstruktur nach Migration
// -------------------------------------------------------

export interface Season {
    id: string;
    name: string;                   // z.B. "Season 1", "Winter 2024"
    startDate: string;              // ISO timestamp
    endDate?: string;               // ISO timestamp
    tournamentIds: string[];        // Referenzen zu Turnieren
    description?: string;
}

export interface GlobalPlayer {
    id: string;
    name: string;
    aliases?: string[];
    createdAt: string;
    metadata: {
        totalTournaments: number;
        totalRaces: number;
        lastPlayed?: string;
        opponentsFaced?: number;
        opponentsBeaten?: number;
        seasons?: {
            [seasonId: string]: {
                opponentsFaced: number;
                opponentsBeaten: number;
            }
        }
    }
}

export interface Season {
    id: string;
    name: string;
    startDate: string;
    endDate?: string;
    tournamentIds: string[];
}


export interface Tournament {
    id: string;
    name: string;
    seasonId?: string;
    password?: string;
    status: 'registration' | 'draft' | 'active' | 'ban' | 'completed';
    stage: 'groups' | 'finals';
    playerIds: string[];
    players: Player[];
    wildcards?: Wildcard[];
    teams: Team[];
    races: Record<string, Race>;
    bans?: string[];
    createdAt: string;
    completedAt?: string;
    draft?: {
        order: string[];
        currentIdx: number;
    };
    isSecured?: boolean;
    usePlacementTiebreaker?: boolean;
    pointsSystem?: Record<number, number>;
    banTimerStart?: string;
}


// UMAS not yet used
export type AptitudeGrade = 'G' | 'F' | 'E' | 'D' | 'C' | 'B' | 'A' | 'S';

export interface SurfaceAptitude {
    turf: AptitudeGrade;
    dirt: AptitudeGrade;
}

export interface DistanceAptitude {
    sprint: AptitudeGrade;
    mile: AptitudeGrade;
    medium: AptitudeGrade;
    long: AptitudeGrade;
}

export interface StyleAptitude {
    frontRunner: AptitudeGrade; // Nige (Runner)
    paceChaser: AptitudeGrade;  // Senkou (Leader)
    lateSurger: AptitudeGrade;  // Sashi (Betweener)
    endCloser: AptitudeGrade;   // Oikomi (Chaser)
}

export interface UmaData {
    id: string;           // A URL/DB safe slug (e.g., 'special-week')
    name: string;         // The display name you currently use
    releaseDate: string;  // ISO string 'YYYY-MM-DD'
    aptitudes: {
        surface: SurfaceAptitude;
        distance: DistanceAptitude;
        style: StyleAptitude;
    };
    stars: number;
    // Future fields can go here (e.g., rarity, iconUrl, growthRates)
}