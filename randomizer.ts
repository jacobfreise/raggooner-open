type Weather = 'Sunny' | 'Cloudy' | 'Rainy' | 'Snowy';
type Ground = 'Firm' | 'Good' | 'Soft' | 'Heavy';
type Season = 'Spring' | 'Summer' | 'Fall' | 'Winter';

const WEATHER_GROUND_MAP: Record<Weather, Ground[]> = {
    Sunny: ['Firm', 'Good'],
    Cloudy: ['Firm', 'Good'],
    Rainy: ['Soft', 'Heavy'],
    Snowy: ['Good', 'Soft'],
};

const WEATHER_SEASON_MAP: Record<Weather, Season[]> = {
    Sunny: ['Spring', 'Summer', 'Fall', 'Winter'],
    Cloudy: ['Spring', 'Summer', 'Fall', 'Winter'],
    Rainy: ['Spring', 'Summer', 'Fall', 'Winter'],
    Snowy: ['Winter'],
};

const WEATHER_WEIGHTS: Record<Weather, number> = {
    Sunny: 2,
    Cloudy: 2,
    Rainy: 2,
    Snowy: 1,
};

const GROUND_WEIGHTS: Record<Ground, number> = {
    Firm: 50,
    Good: 20,
    Soft: 20,
    Heavy: 10,
};

const SEASON_WEIGHTS: Record<Season, number> = {
    Spring: 1,
    Summer: 1,
    Fall: 1,
    Winter: 1,
};

type Combo = {
    weather: Weather;
    ground: Ground;
    season: Season;
    prob: number;
};

function normalizeWeights<T extends string>(weights: Record<T, number>) {
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    const result: Record<string, number> = {};
    for (const k in weights) result[k] = weights[k] / total;
    return result as Record<T, number>;
}

function generateValidCombos(): Combo[] {
    const combos: Combo[] = [];

    for (const weather of Object.keys(WEATHER_GROUND_MAP) as Weather[]) {
        for (const ground of WEATHER_GROUND_MAP[weather]) {
            for (const season of WEATHER_SEASON_MAP[weather]) {
                combos.push({
                    weather,
                    ground,
                    season,
                    prob: 1,
                });
            }
        }
    }

    return combos;
}

function ipfAdjust(combos: Combo[], iterations = 200) {
    const weatherTarget = normalizeWeights(WEATHER_WEIGHTS);
    const groundTarget = normalizeWeights(GROUND_WEIGHTS);
    const seasonTarget = normalizeWeights(SEASON_WEIGHTS);

    for (let i = 0; i < iterations; i++) {

        // adjust weather
        for (const weather of Object.keys(weatherTarget) as Weather[]) {
            const sum = combos
                .filter(c => c.weather === weather)
                .reduce((s, c) => s + c.prob, 0);

            const factor = weatherTarget[weather] / sum;

            combos
                .filter(c => c.weather === weather)
                .forEach(c => (c.prob *= factor));
        }

        // adjust ground
        for (const ground of Object.keys(groundTarget) as Ground[]) {
            const sum = combos
                .filter(c => c.ground === ground)
                .reduce((s, c) => s + c.prob, 0);

            if (sum === 0) continue;

            const factor = groundTarget[ground] / sum;

            combos
                .filter(c => c.ground === ground)
                .forEach(c => (c.prob *= factor));
        }

        // adjust season
        for (const season of Object.keys(seasonTarget) as Season[]) {
            const sum = combos
                .filter(c => c.season === season)
                .reduce((s, c) => s + c.prob, 0);

            if (sum === 0) continue;

            const factor = seasonTarget[season] / sum;

            combos
                .filter(c => c.season === season)
                .forEach(c => (c.prob *= factor));
        }
    }

    // final normalization
    const total = combos.reduce((s, c) => s + c.prob, 0);
    combos.forEach(c => (c.prob /= total));
}

function weightedPick(combos: Combo[]): Combo {
    let r = Math.random();

    for (const c of combos) {
        r -= c.prob;
        if (r <= 0) return c;
    }

    return combos[combos.length - 1];
}

function runSimulation(iterations: number) {
    const combos = generateValidCombos();

    ipfAdjust(combos);

    const weatherCount: Record<string, number> = {};
    const groundCount: Record<string, number> = {};
    const seasonCount: Record<string, number> = {};
    const comboCount: Record<string, number> = {};

    for (let i = 0; i < iterations; i++) {
        const result = weightedPick(combos);

        weatherCount[result.weather] = (weatherCount[result.weather] || 0) + 1;
        groundCount[result.ground] = (groundCount[result.ground] || 0) + 1;
        seasonCount[result.season] = (seasonCount[result.season] || 0) + 1;

        const key = `${result.weather}-${result.ground}-${result.season}`;
        comboCount[key] = (comboCount[key] || 0) + 1;
    }

    console.log('\nWeather distribution');
    console.table(weatherCount);

    console.log('\nGround distribution');
    console.table(groundCount);

    console.log('\nSeason distribution');
    console.table(seasonCount);

    console.log('\nCombination distribution');
    console.table(comboCount);
}

runSimulation(100000);