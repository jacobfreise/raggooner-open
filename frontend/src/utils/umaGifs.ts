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

export const getRaceWinnerGif = (race: any, players: any[]): string | undefined => {
    // 1. Find the winner ID
    const winnerId = Object.keys(race.placements).find(pid => race.placements[pid] === 1);
    if (!winnerId) return undefined;

    // 2. Find the player object
    const winner = players.find(p => p.id === winnerId);
    if (!winner || !winner.uma) return undefined;

    // 3. Check for specific override first
    if (SPECIAL_CASE_MAP[winner.uma]) {
        return SPECIAL_CASE_MAP[winner.uma];
    }

    // 4. Generate the kebab-case filename
    // "Special Week" -> "special-week"
    const cleanName = winner.uma.trim().toLowerCase().replace(/\s+/g, '-');

    // Return the path
    return `/gifs/${cleanName}.gif`;
};