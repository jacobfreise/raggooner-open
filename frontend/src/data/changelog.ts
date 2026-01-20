export interface ChangeLogEntry {
    version: string;
    date: string;
    title: string;
    // Categories: 'new' | 'fix' | 'improvement'
    changes: { type: 'new' | 'fix' | 'improvement'; text: string }[];
}

export const APP_VERSION = '1.2.1'; // Update this manually when you deploy

export const changelogData: ChangeLogEntry[] = [
    {
        version: '1.2.1',
        date: '2026-01-19',
        title: 'Penalties/Bonuses and adjustable Points System',
        changes: [
            { type: 'improvement', text: 'Redesigned tiebreaker modal for much more visual clarity!' },
        ]
    },
    {
        version: '1.2.0',
        date: '2026-01-19',
        title: 'Penalties/Bonuses and adjustable Points System',
        changes: [
            { type: 'new', text: 'Added ability to add penalties or bonuses to teams at any stage!' },
            { type: 'improvement', text: 'Don\'t dynamically recalculate points all the time, but save and read them to/from db!' },
            { type: 'new', text: 'Add ability to manually adjust the points system for the current tournament. The standard values are applied if not adjusted.' },
        ]
    },
    {
        version: '1.1.1',
        date: '2026-01-19',
        title: 'Tiebreakers, the bane of my existence',
        changes: [
            { type: 'fix', text: 'Hopefully fixed 6 team tiebreaker logic for the last time!' },
            { type: 'improvement', text: 'Only show advancing teams when at least 1 race was done, so when teams have points!' },
        ]
    },
    {
        version: '1.1.0',
        date: '2026-01-19',
        title: 'The Big Refactor',
        changes: [
            { type: 'new', text: 'Added this Patch Notes menu to track updates!' },
            { type: 'new', text: 'Added distinct amber and question mark indicators for teams currently in a tiebreaker.' },
            { type: 'new', text: 'Added a footer with credits and direct Discord profile linking.' },
            { type: 'new', text: 'Added more functionality to the admin panel.' },
            { type: 'improvement', text: 'Massive code improvements by refactoring code. Users hopefully won\'t notice anything, but the dev might not get cancer.'},
            { type: 'fix', text: 'Fixed critical tiebreaker calculation logic for 6-team tournaments.' },
        ]
    },
    {
        version: '1.0.0',
        date: '1900-01-01',
        title: 'Ascending from Stone Age',
        changes: [
            { type: 'new', text: 'Created first draft of the tool that\'s revolutionizing Racc Opens.' }
        ]
    }
];