// Constants
import type { TournamentFormat, UserRole } from '../types.ts';

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
