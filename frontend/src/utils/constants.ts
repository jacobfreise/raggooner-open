// Constants
import type { StageConfig, TournamentFormat, UserRole } from '../types.ts';

export type Permission =
    | 'create_official_tournament'   // can mark a tournament as official
    | 'bypass_tournament_password'   // auto-login to any tournament without a password
    | 'manage_users'                 // can view and edit roles in /admin/users
    | 'promote_to_admin'             // can promote users up to admin
    | 'promote_to_superadmin'        // can promote users to superadmin (superadmin only)
    | 'unlink_player'                // can unlink a player's Discord account
    | 'view_superadmin_panel'        // can see the superadmin side panel
    | 'post_to_discord';             // can post announcements and results to Discord

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
    superadmin: [
        'create_official_tournament',
        'bypass_tournament_password',
        'manage_users',
        'promote_to_admin',
        'promote_to_superadmin',
        'unlink_player',
        'view_superadmin_panel',
        'post_to_discord',
    ],
    admin: [
        'create_official_tournament',
        'bypass_tournament_password',
        'manage_users',
        'promote_to_admin',
        'post_to_discord',
    ],
    tournament_creator: [
        'create_official_tournament',
        'post_to_discord',
    ],
    player: [],
};

export const hasPermission = (role: UserRole | null | undefined, permission: Permission): boolean =>
    role ? (ROLE_PERMISSIONS[role] ?? []).includes(permission) : false;

export const POINTS_SYSTEM: Record<number, number> = {
    1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2,
    10: 1, 11: 0, 12: 0, 13: 0, 14: 0, 15: 0, 16: 0, 17: 0, 18: 0
};

export const TEAM_COLORS = [
    '#ef4444', // Red
    '#60a5fa', // Blue
    '#4ade80', // Green
    '#facc15', // Yellow
    '#c084fc', // Purple
    '#ff7fc1', // Pink
    '#2dd4bf', // Teal
    '#fb923c', // Orange
    '#a3e635', // Lime
    '#818cf8', // Indigo
    '#22d3ee', // Cyan
    '#f43f5e', // Rose
];

// ---------------------------------------------------------------------------
// Stage presets — ordered from first stage to last (finals)
// teamsAdvancingPerGroup: 0 means this is the final stage (no advancement)
// ---------------------------------------------------------------------------

// 2 groups of 3, top 1 per group + best runner-up wildcard → 3-team finals
export const STAGE_PRESET_6: StageConfig[] = [
    { name: 'groups', label: 'Group Stage', groups: ['A', 'B'], racesRequired: 5, teamsAdvancingPerGroup: 1 },
    { name: 'finals', label: 'Finals',      groups: ['A'],       racesRequired: 5, teamsAdvancingPerGroup: 0 },
];

// 2 groups of 4, top 2 per group → 4-team finals
export const STAGE_PRESET_8: StageConfig[] = [
    { name: 'groups', label: 'Group Stage', groups: ['A', 'B'], racesRequired: 5, teamsAdvancingPerGroup: 2 },
    { name: 'finals', label: 'Finals',      groups: ['A'],       racesRequired: 5, teamsAdvancingPerGroup: 0 },
];

// 3 groups of 3, top 1 per group → 3-team finals
export const STAGE_PRESET_9: StageConfig[] = [
    { name: 'groups', label: 'Group Stage', groups: ['A', 'B', 'C'], racesRequired: 5, teamsAdvancingPerGroup: 1 },
    { name: 'finals', label: 'Finals',       groups: ['A'],            racesRequired: 5, teamsAdvancingPerGroup: 0 },
];

// Small tournament (< 6 teams): single finals stage, no groups
export const STAGE_PRESET_SMALL: StageConfig[] = [
    { name: 'finals', label: 'Finals', groups: ['A'], racesRequired: 5, teamsAdvancingPerGroup: 0 },
];

// 3-stage bracket: quarterfinals → semifinals → finals
export const STAGE_PRESET_3_STAGE: StageConfig[] = [
    { name: 'quarterfinals', label: 'Quarterfinals', groups: ['A', 'B', 'C', 'D'], racesRequired: 5, teamsAdvancingPerGroup: 1 },
    { name: 'semifinals',    label: 'Semifinals',    groups: ['A', 'B'],            racesRequired: 5, teamsAdvancingPerGroup: 2 },
    { name: 'finals',        label: 'Finals',        groups: ['A'],                 racesRequired: 5, teamsAdvancingPerGroup: 0 },
];

function generateStageNames(numStages: number): string[] {
    if (numStages === 1) return ['finals'];
    if (numStages === 2) return ['groups', 'finals'];
    const names: string[] = [];
    for (let i = 1; i <= numStages - 2; i++) names.push(`round${i}`);
    names.push('semifinals', 'finals');
    return names;
}

function generateStageLabels(numStages: number): string[] {
    if (numStages === 1) return ['Finals'];
    if (numStages === 2) return ['Group Stage', 'Finals'];
    const labels: string[] = [];
    for (let i = 1; i <= numStages - 2; i++) labels.push(`Round ${i}`);
    labels.push('Semifinals', 'Finals');
    return labels;
}

/**
 * Builds a balanced multi-stage bracket for the given team and group sizes.
 * Returns null if numTeams cannot form a valid balanced bracket for teamsPerGroup.
 *
 * Advancement rules:
 *   2 groups of 4: top 2 per group  (teamsAdvancingPerGroup: 2)
 *   2 groups of 3: top 1 per group + wildcard runner-up  (teamsAdvancingPerGroup: 1)
 *   3+ groups:     top 1 per group  (teamsAdvancingPerGroup: 1)
 */
export function buildBalancedBracket(numTeams: number, teamsPerGroup: number): StageConfig[] | null {
    if (numTeams <= 0 || teamsPerGroup < 2) return null;
    if (numTeams % teamsPerGroup !== 0) return null;

    const chain: number[] = [];
    let current = numTeams;

    while (current > teamsPerGroup) {
        if (current % teamsPerGroup !== 0) return null;
        chain.push(current);
        const numGroups = current / teamsPerGroup;
        if (teamsPerGroup === 3 && numGroups === 2) {
            current = 3;  // 1 + 1 + wildcard runner-up
        } else if (teamsPerGroup === 4 && numGroups === 2) {
            current = 4;  // top 2 + top 2
        } else {
            current = numGroups;  // top 1 per group
        }
    }
    chain.push(current);
    if (current % teamsPerGroup !== 0) return null; // finals size must be divisible by group size

    const numStages = chain.length;
    const names = generateStageNames(numStages);
    const labels = generateStageLabels(numStages);
    const groupLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    return chain.map((size, idx) => {
        const isLast = idx === numStages - 1;
        const numGroups = size / teamsPerGroup;
        const groups = groupLetters.slice(0, numGroups).split('');
        const teamsAdvancingPerGroup = isLast ? 0
            : (teamsPerGroup === 4 && numGroups === 2) ? 2
            : 1;

        return {
            name: names[idx]!,
            label: labels[idx]!,
            groups,
            racesRequired: 5,
            teamsAdvancingPerGroup,
        };
    });
}

export const getStagePreset = (numTeams: number): StageConfig[] => {
    if (numTeams === 9) return STAGE_PRESET_9;
    if (numTeams === 8) return STAGE_PRESET_8;
    if (numTeams === 6) return STAGE_PRESET_6;
    if (numTeams <= 3) return STAGE_PRESET_SMALL;
    return buildBalancedBracket(numTeams, 3)
        ?? buildBalancedBracket(numTeams, 4)
        ?? STAGE_PRESET_SMALL;
};

export const TOURNAMENT_FORMATS: Record<string, TournamentFormat> = {
    'uma-ban': {
        id: 'uma-ban',
        name:
            'Blind Pick',
        description:
            'Classic Tournament format with Uma bans and blind picks.'
    },
    'uma-draft': {
        id: 'uma-draft',
        name:
            'Draft Pick',
        description:
            'Classic Tournament format with Uma draft picks instead of blind picks.'
    }
}
