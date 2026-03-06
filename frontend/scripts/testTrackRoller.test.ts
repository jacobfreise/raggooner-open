import { describe, it } from 'vitest';
import { TRACK_DICT } from '../src/utils/trackData';

describe('Track Roller - IPF (Iterative Proportional Fitting)', () => {
  it('simulates IPF rolling for both Tracks and Conditions', () => {
    const rolls = 100000;

    // --- User Defined Weights ---
    const surfaceWeights: Record<string, number> = { Turf: 1, Dirt: 1 }; 
    const distanceWeights: Record<string, number> = { Sprint: 1, Mile: 1, Medium: 1, Long: 1 };
    
    const groundWeights: Record<string, number> = { Firm: 50, Good: 20, Soft: 20, Heavy: 10 };
    const weatherWeights: Record<string, number> = { Sunny: 1, Cloudy: 1, Rainy: 1, Snowy: 1 };
    const seasonWeights: Record<string, number> = { Spring: 1, Summer: 1, Fall: 1, Winter: 1 };

    // --- Constraints ---
    const allTracks = Object.values(TRACK_DICT);
    
    const WEATHER_GROUND_MAP: Record<string, string[]> = {
      Sunny: ['Firm', 'Good'],
      Cloudy: ['Firm', 'Good'],
      Rainy: ['Soft', 'Heavy'],
      Snowy: ['Good', 'Soft'],
    };
    const WEATHER_SEASON_MAP: Record<string, string[]> = {
      Sunny: ['Spring', 'Summer', 'Fall', 'Winter'],
      Cloudy: ['Spring', 'Summer', 'Fall', 'Winter'],
      Rainy: ['Spring', 'Summer', 'Fall', 'Winter'],
      Snowy: ['Winter'],
    };

    const normalize = (weights: Record<string, number>, allowed: string[]) => {
      const filtered = Object.fromEntries(Object.entries(weights).filter(([k]) => allowed.includes(k)));
      const total = Object.values(filtered).reduce((a, b) => a + b, 0);
      if (total === 0) return Object.fromEntries(allowed.map(k => [k, 1 / allowed.length]));
      return Object.fromEntries(Object.entries(filtered).map(([k, v]) => [k, v / total]));
    };

    // --- IPF for Conditions ---
    const validConditionCombos: { weather: string, ground: string, season: string }[] = [];
    for (const w in WEATHER_GROUND_MAP) {
      for (const g of WEATHER_GROUND_MAP[w]) {
        for (const s of WEATHER_SEASON_MAP[w]) {
          validConditionCombos.push({ weather: w, ground: g, season: s });
        }
      }
    }

    function computeConditionProbs() {
      const combos = validConditionCombos.map(c => ({ ...c, prob: 1 }));
      const weatherTarget = normalize(weatherWeights, Object.keys(weatherWeights));
      const groundTarget = normalize(groundWeights, Object.keys(groundWeights));
      const seasonTarget = normalize(seasonWeights, Object.keys(seasonWeights));

      for (let i = 0; i < 50; i++) {
        for (const w in weatherTarget) {
          const sum = combos.filter(c => c.weather === w).reduce((s, c) => s + c.prob, 0);
          if (sum > 0) combos.filter(c => c.weather === w).forEach(c => c.prob *= weatherTarget[w] / sum);
        }
        for (const g in groundTarget) {
          const sum = combos.filter(c => c.ground === g).reduce((s, c) => s + c.prob, 0);
          if (sum > 0) combos.filter(c => c.ground === g).forEach(c => c.prob *= groundTarget[g] / sum);
        }
        for (const s in seasonTarget) {
          const sum = combos.filter(c => c.season === s).reduce((s2, c) => s2 + c.prob, 0);
          if (sum > 0) combos.filter(c => c.season === s).forEach(c => c.prob *= seasonTarget[s] / sum);
        }
      }
      return combos;
    }

    // --- IPF for Tracks ---
    function computeTrackProbs() {
      const allowedSurfaces = [...new Set(allTracks.map(t => t.surface))];
      const allowedDistances = [...new Set(allTracks.map(t => t.distanceType))];
      const surfaceTarget = normalize(surfaceWeights, allowedSurfaces);
      const distanceTarget = normalize(distanceWeights, allowedDistances);

      const matrix: { surface: string; distanceType: string; prob: number }[] = [];
      for (const s of allowedSurfaces) {
        for (const d of allowedDistances) {
          if (allTracks.some(t => t.surface === s && t.distanceType === d)) {
            matrix.push({ surface: s, distanceType: d, prob: 1 });
          }
        }
      }

      for (let i = 0; i < 50; i++) {
        for (const s in surfaceTarget) {
          const sum = matrix.filter(m => m.surface === s).reduce((sum, m) => sum + m.prob, 0);
          if (sum > 0) matrix.filter(m => m.surface === s).forEach(m => m.prob *= surfaceTarget[s] / sum);
        }
        for (const d in distanceTarget) {
          const sum = matrix.filter(m => m.distanceType === d).reduce((sum, m) => sum + m.prob, 0);
          if (sum > 0) matrix.filter(m => m.distanceType === d).forEach(m => m.prob *= distanceTarget[d] / sum);
        }
      }
      return matrix;
    }

    const conditionProbs = computeConditionProbs();
    const trackProbs = computeTrackProbs();

    const counts: any = { 
        surfaces: {}, distances: {}, grounds: {}, weathers: {}, seasons: {}
    };

    function roll(probs: any[]) {
      let r = Math.random();
      for (const p of probs) {
        r -= p.prob;
        if (r <= 0) return p;
      }
      return probs[probs.length - 1];
    }

    for (let i = 0; i < rolls; i++) {
      const cp = roll(conditionProbs);
      counts.weathers[cp.weather] = (counts.weathers[cp.weather] || 0) + 1;
      counts.grounds[cp.ground] = (counts.grounds[cp.ground] || 0) + 1;
      counts.seasons[cp.season] = (counts.seasons[cp.season] || 0) + 1;

      const tp = roll(trackProbs);
      counts.surfaces[tp.surface] = (counts.surfaces[tp.surface] || 0) + 1;
      counts.distances[tp.distanceType] = (counts.distances[tp.distanceType] || 0) + 1;
    }

    function printBlock(title: string, catKey: string, targetMap: any) {
        console.log(`\n  [${title.toUpperCase()}]`);
        const totalW = Object.values(targetMap).reduce((a, b) => (a as number) + (b as number), 0) as number;
        Object.entries(counts[catKey]).sort().forEach(([k, v]: [any, any]) => {
            const actual = ((v / rolls) * 100).toFixed(1);
            const target = (((targetMap[k] || 0) / totalW) * 100).toFixed(1);
            console.log(`    ${k.padEnd(10)}: ${actual}% (Target: ${target}%)`);
        });
    }

    console.log(`\n=== IPF RESULTS (100,000 ROLLS) ===`);
    printBlock('Surface', 'surfaces', surfaceWeights);
    printBlock('Distance', 'distances', distanceWeights);
    printBlock('Ground', 'grounds', groundWeights);
    printBlock('Weather', 'weathers', weatherWeights);
    printBlock('Season', 'seasons', seasonWeights);
  });
});
