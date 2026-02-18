// Map: "Exact Uma Name" -> "/path/to/gif.gif" (in your public folder)
// export const UMA_GIF_MAP: Record<string, string> = {
//     'Hishi Akebono': '/gifs/bono_spin.gif',
//     'Gold Ship': '/gifs/golshi_peace.gif',
//     'Special Week': '/gifs/rice-shower.gif',
//     'Tokai Teio': '/gifs/tokai-teio.gif',
//     'Anime Tokai Teio': '/gifs/tokai-teio.gif',
//     'Summer Special Week': '/gifs/summer-special-week.gif',
//     'Rice Shower': '/gifs/rice-shower.gif',
//     'Daitaku Helios': '/gifs/daitaku.gif',
//     'Kitasan Black': '/gifs/kitasan-black.gif',
//     'TM Opera O': '/gifs/tm-opera-o.gif',
//     'Agnes Tachyon': '/gifs/agnes-tachyon.gif',
//     'Fine Motion': '/gifs/fine-motion.gif',
//     'Oguri Cap': '/gifs/oguri-cap.gif',
//
//     // Add more as you find them...
// };

// Helper to safely get the gif (or undefined if none exists)
// export const getRaceWinnerGif = (race: any, players: any[]): string | undefined => {
//     // 1. Find the winner ID (placement 1)
//     const winnerId = Object.keys(race.placements).find(pid => race.placements[pid] === 1);
//     if (!winnerId) return undefined;
//
//     // 2. Find the player object
//     const winner = players.find(p => p.id === winnerId);
//     if (!winner || !winner.uma) return undefined;
//
//     // 3. Return the mapped GIF
//     return UMA_GIF_MAP[winner.uma];
// };

// src/utils/umaGifs.ts

// Optional: Keep this if you have weird filenames that don't match the rule
// e.g. "Silence Suzuka" -> "suzuka_scream.gif"
const SPECIAL_CASE_MAP: Record<string, string> = {
    // 'Gold Ship': '/gifs/golshi_peace.gif', // Custom override example
};
// src/utils/umaGifs.ts

// 1. Define a global version number.
// Whenever you upload new GIFs and redeploy, simply change this number (e.g. to '2', '3', etc.)
const GIF_VERSION = '3';

export const getRaceWinnerGif = (race: any, players: any[]): string | undefined => {
    const winnerId = Object.keys(race.placements).find(pid => race.placements[pid] === 1);
    if (!winnerId) return undefined;

    const winner = players.find(p => p.id === winnerId);
    if (!winner || !winner.uma) return undefined;

    // BASE PATH LOGIC
    let path: string;

    if (SPECIAL_CASE_MAP[winner.uma]) {
        path = SPECIAL_CASE_MAP[winner.uma]!;
    } else {
        const cleanName = winner.uma.trim().toLowerCase().replace(/\s+/g, '-');
        path = `/gifs/${cleanName}.gif`;
    }

    // 2. Append the version tag to the result
    return `${path}?v=${GIF_VERSION}`;
};