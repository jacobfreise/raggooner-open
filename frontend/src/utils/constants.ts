// Constants
import type {TournamentFormat} from "../types.ts";

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

export const SUPERADMIN_UIDS = [
    'JrBubSUpmlNqYV4Gi7TsYY7yRqzO',
    'mehTFP5BuqdrT6mw4xqnaNrHSMk1', 'j7kIBg1mIXO5m824GeBQmXYfb6q2', 'LCwXSR9TZUPqdpv8qM7qD3y7m0uh', 'JXs2aov8XqTfnB9XLOVHVNzw3psv'
];
