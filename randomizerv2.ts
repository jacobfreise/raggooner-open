type Weather = 'Sunny' | 'Cloudy' | 'Rainy' | 'Snowy';
type Ground = 'Firm' | 'Good' | 'Soft' | 'Heavy';
type Season = 'Spring' | 'Summer' | 'Fall' | 'Winter';

type Combo = {
    weather: Weather;
    ground: Ground;
    season: Season;
    prob: number;
};

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

function normalize<T extends string>(weights: Record<T, number>) {
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    const result: Record<string, number> = {};
    for (const k in weights) result[k] = weights[k] / total;
    return result as Record<T, number>;
}

function generateCombos(): Combo[] {
    const combos: Combo[] = [];

    for (const weather in WEATHER_GROUND_MAP) {
        const w = weather as Weather;

        for (const ground of WEATHER_GROUND_MAP[w]) {
            for (const season of WEATHER_SEASON_MAP[w]) {
                combos.push({
                    weather: w,
                    ground,
                    season,
                    prob: 1
                });
            }
        }
    }

    return combos;
}

function computeDistribution(): Combo[] {

    const combos = generateCombos();

    const weatherTarget = normalize(WEATHER_WEIGHTS);
    const groundTarget = normalize(GROUND_WEIGHTS);
    const seasonTarget = normalize(SEASON_WEIGHTS);

    const iterations = 200;

    for (let i = 0; i < iterations; i++) {

        // weather adjustment
        for (const w in weatherTarget) {
            const sum = combos
                .filter(c => c.weather === w)
                .reduce((s, c) => s + c.prob, 0);

            const factor = weatherTarget[w as Weather] / sum;

            combos
                .filter(c => c.weather === w)
                .forEach(c => c.prob *= factor);
        }

        // ground adjustment
        for (const g in groundTarget) {
            const sum = combos
                .filter(c => c.ground === g)
                .reduce((s, c) => s + c.prob, 0);

            if (sum === 0) continue;

            const factor = groundTarget[g as Ground] / sum;

            combos
                .filter(c => c.ground === g)
                .forEach(c => c.prob *= factor);
        }

        // season adjustment
        for (const s in seasonTarget) {
            const sum = combos
                .filter(c => c.season === s)
                .reduce((s2, c) => s2 + c.prob, 0);

            if (sum === 0) continue;

            const factor = seasonTarget[s as Season] / sum;

            combos
                .filter(c => c.season === s)
                .forEach(c => c.prob *= factor);
        }
    }

    // normalize final probabilities
    const total = combos.reduce((s, c) => s + c.prob, 0);
    combos.forEach(c => c.prob /= total);

    return combos;
}

function buildSampler(combos: Combo[]) {

    const cumulative: number[] = [];
    let sum = 0;

    for (const c of combos) {
        sum += c.prob;
        cumulative.push(sum);
    }

    return function roll(): Combo {

        const r = Math.random();

        let low = 0;
        let high = cumulative.length - 1;

        while (low < high) {
            const mid = (low + high) >> 1;

            if (r <= cumulative[mid]) high = mid;
            else low = mid + 1;
        }

        return combos[low];
    };
}

// ---------- initialize randomizer ----------

const combos = computeDistribution();
const rollConditions = buildSampler(combos);

// ---------- simulation test ----------

function runSimulation(iterations: number) {

    const weatherCount: Record<string, number> = {};
    const groundCount: Record<string, number> = {};
    const seasonCount: Record<string, number> = {};

    for (let i = 0; i < iterations; i++) {

        const r = rollConditions();

        weatherCount[r.weather] = (weatherCount[r.weather] || 0) + 1;
        groundCount[r.ground] = (groundCount[r.ground] || 0) + 1;
        seasonCount[r.season] = (seasonCount[r.season] || 0) + 1;
    }

    console.log("\nWeather distribution");
    console.table(weatherCount);

    console.log("\nGround distribution");
    console.table(groundCount);

    console.log("\nSeason distribution");
    console.table(seasonCount);
}

runSimulation(100000);