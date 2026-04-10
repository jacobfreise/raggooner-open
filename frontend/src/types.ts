import {FieldValue} from "firebase/firestore";

export type UserRole = 'superadmin' | 'admin' | 'tournament_creator' | 'player';

export interface Player {
    id: string;
    name: string;
    isCaptain: boolean;
    uma: string;
    // NOT stored in Firestore. TournamentView's onSnapshot handler calls
    // recalculateTournamentScores() and writes the result back into data.players
    // before setting tournament.value, so all live consumers (HoF, export, game UI)
    // receive correct values. The analytics pipeline also recalculates independently
    // via deriveFromTournaments(). The Cloud Function computes these from races
    // directly for recentResults. Do not add Firestore writes for these fields.
    totalPoints?: number;
    stagePoints?: Record<string, number>; // keyed by stage name, e.g. { groups: 42, finals: 18 }
}

export interface Wildcard {
    playerId: string;
    stage: string;  // stage name, e.g. 'semifinals'
    group: string;  // group label within that stage, e.g. 'A'
    points?: number;
}

export interface PointAdjustment {
    id: string;
    reason: string;
    amount: number; // Positive for bonus, negative for penalty
    stage: string;  // stage name, e.g. 'groups', 'semifinals', 'finals'
}

export interface Team {
    id: string;
    captainId: string;
    memberIds: string[];
    name: string;
    stagePoints: Record<string, number>;   // points per stage, e.g. { groups: 42, finals: 18 }
    stageGroups: Record<string, string>;   // group per stage, e.g. { groups: 'A', semifinals: 'B' }
    qualifiedStages: string[];             // stages this team has qualified into
    adjustments?: PointAdjustment[];
    color?: string;
    umaPool?: string[];
}

export interface Race {
    id: string;
    stage: string;  // stage name, e.g. 'groups', 'quarterfinals', 'finals'
    group: string;  // group label, e.g. 'A', 'B'
    raceNumber: number;
    timestamp: string;
    placements: Record<string, number>; // playerId: position
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
    winner: Player | Team;
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
    // Returns: { player: Player | Team, value: string | number }
    calculate: (tournament: Tournament) => FameResult[];
}

// -------------------------------------------------------
// Neue Datenstruktur nach Migration
// -------------------------------------------------------

export interface Season {
    id: string;
    name: string;                   // z.B. "Season 1", "Winter 2024"
    startDate: string;              // ISO timestamp
    endDate?: string;               // ISO timestamp
    tournamentIds: string[];
    description?: string;
}

export type SupportCardType = 'speed' | 'stamina' | 'power' | 'guts' | 'wit' | 'group' | 'pal';

export interface ProfileSupportCard {
    cardId: string;       // key into SUPPORT_CARD_DICT
    limitBreak: number;   // 0–4
}

export interface RecentResult {
    tournamentId: string;
    tournamentName: string;
    teamName: string;
    teamRank: number;        // rank within the relevant stage (1 = best finalist, or 1 = best non-finalist)
    teamInFinals: boolean;   // true → rank is among finalists; false → rank is among non-finalists (groups)
    isOfficial: boolean;
    seasonId?: string;
    playedAt: string;
    racesPlayed: number;
    raceWins: number;
    avgPoints: number;
    avgPlacement: number;
    dominancePct: number;
    umaPlayed?: string;
}

export interface GlobalPlayer {
    id: string;
    name: string;
    aliases?: string[];
    createdAt: string;
    firebaseUid?: string;           // Linked Firebase Auth UID
    discordId?: string;             // Discord User ID (e.g. "123456789012345678")
    avatarUrl?: string;             // Discord CDN avatar URL
    roster?: string[];              // Uma names owned by this player (keys of UMA_DICT)
    supportCards?: ProfileSupportCard[];
    metadata: {
        totalTournaments: number;
        totalRaces: number;
        lastPlayed?: string;
        opponentsFaced?: number;
        opponentsBeaten?: number;
        recentResults?: RecentResult[];
        seasons?: {
            [seasonId: string]: {
                opponentsFaced: number;
                opponentsBeaten: number;
            }
        }
    }
}

export interface TournamentFormat {
    id: string;
    name: string;
    description: string;
}


export interface TournamentCreator {
    uid: string;
    playerId?: string;   // GlobalPlayer doc ID, if the creator has a linked player
    displayName?: string;
    avatarUrl?: string;
}

export interface StageConfig {
    name: string;                  // e.g. 'groups', 'quarterfinals', 'semifinals', 'finals'
    label: string;                 // display name shown in UI
    groups: string[];              // group labels, e.g. ['A', 'B', 'C']
    racesRequired: number;         // races needed before advancement (typically 5)
    teamsAdvancingPerGroup: number; // qualifiers per group (0 = last stage / no advancement)
}

export interface Tournament {
    id: string;
    name: string;
    seasonId?: string;
    password?: string;
    format?: string;
    status: 'track-selection' | 'registration' | 'draft' | 'active' | 'ban' | 'pick' | 'completed';
    selectedTrack?: string;
    selectedCondition?: Condition;
    stages: StageConfig[];       // ordered list of stages, first = earliest
    currentStageIndex: number;   // index into stages[]
    playerIds: string[];
    players: Record<string, Player>;
    wildcards?: Wildcard[];
    teams: Team[];
    races: Record<string, Race>;
    bans?: string[];
    createdAt: string;
    createdBy?: TournamentCreator;
    completedAt?: string;
    playedAt?: string; // ISO UTC string, set when tournament enters active status
    scheduledTime?: string; // ISO UTC string
    isOfficial?: boolean;
    metadataSynced?: boolean;
    draft?: {
        order: string[];
        currentIdx: number;
    };
    isSecured?: boolean;
    selfSignupEnabled?: boolean; // this field should always be true, since every new tournament is password secured. there are a handful of old legacy tournaments, that were public.
    captainActionsEnabled?: boolean; // enables captain-specific gameplay mutations (e.g. race result reporting)
    usePlacementTiebreaker?: boolean;
    pointsSystem?: Record<number, number>;
    banTimerStart?: string;
    activeTimerStart?: string;
    activeTimerStopped?: boolean;
    activeTimerElapsed?: number;
    draftPhaseTimerStart?: string;
    draftLastPickTime?: string;
    umaDraftLimit?: number;
    allowSameGroupUmaDuplicates?: boolean;
}


export interface GlobalSettings {
    pointsSystem: Record<number, number>;
    announcementTemplate: {
        umaDraft: string;
        umaBan: string;
    };
    defaultSelfSignupEnabled: boolean;
    defaultCaptainActionsEnabled: boolean;
    defaultUsePlacementTiebreaker: boolean;
    defaultFormat: string;
    updatedAt?: string;
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
    characterId: number;  // Card ID from TerumiCharacterData.json (e.g., 100101)
}


// TRACK TYPES
export interface Track {
    id: string;
    location: 'Sapporo' | 'Tokyo' | 'Kyoto' | 'Niigata' | 'Hakodate' | 'Fukushima' | 'Nakayama' | 'Chukyo' | 'Hanshin'
    | 'Kokura' | 'Oi' | 'Kawasaki' | 'Funabashi' | 'Morioka';
    surface: 'Turf' | 'Dirt';
    distance: number;
    distanceType: 'Sprint' | 'Mile' | 'Medium' | 'Long'
    direction: 'left' | 'right' | 'straight'
    lane?: 'inner' | 'outer' | 'inout'
    maxPlayers: number;
}

export interface Condition {
    id: string;
    ground: 'Firm' | 'Good' | 'Soft' | 'Heavy';
    weather: 'Sunny' | 'Cloudy' | 'Rainy' | 'Snowy';
    season: 'Spring' | 'Summer' | 'Fall' | 'Winter';
}