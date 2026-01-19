export interface ChangeLogEntry {
    version: string;
    date: string;
    title: string;
    // Categories: 'new' | 'fix' | 'improvement'
    changes: { type: 'new' | 'fix' | 'improvement'; text: string }[];
}

export const APP_VERSION = '1.1.0'; // Update this manually when you deploy

export const changelogData: ChangeLogEntry[] = [
    {
        version: '1.1.0',
        date: '2026-01-19',
        title: 'The Big Refactor',
        changes: [
            { type: 'improvement', text: 'Massive code improvements by refactoring code. Users hopefully won\'t notice anything, but the dev might not get cancer.'},
            { type: 'new', text: 'Added more functionality to the admin panel.' },
            { type: 'fix', text: 'Fixed a bug where 6-team tournaments calculated wildcards incorrectly.' }
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