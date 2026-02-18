<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref} from 'vue';
import type {FameCategory, FameResult, Player, Team, Tournament} from '../types';
import {POINTS_SYSTEM} from "../utils/constants.ts";
import {compareTeams} from "../utils/utils.ts"; // Import your types

const props = defineProps<{
  tournament: Tournament;
}>();

// Cycle Duration for category display
const CYCLE_DURATION = 10000


// Helper function for Olympic-style comparison
const compareStats = (
    a: { count: number; g: number; s: number; b: number },
    b: { count: number; g: number; s: number; b: number }
): number => {
  // Returns: positive if a > b, negative if b > a, 0 if equal

  if (a.count !== b.count) return a.count - b.count;
  if (a.g !== b.g) return a.g - b.g;
  if (a.s !== b.s) return a.s - b.s;
  return a.b - b.b;
}

// --- 2. The Configuration (Add new stats here!) ---
const categories: FameCategory[] = [
  {
    id: 'flawless_victory',
    title: 'The Flawless', // or "The Trifecta"
    description: 'Achieved a perfect 1-2-3 finish in every single race played',
    isTeam: true,
    icon: 'ph-airplane-tilt', // Represents formation flying
    color: 'text-cyan-400',
    gradient: 'from-cyan-500/20',
    tieHandling: { type: 'no-winner-on-tie' },
    calculate: (t: Tournament) => {
      let winner: Team | null = null;
      let maxRaces = 0;

      for (const team of t.teams) {
        // 1. Basic Eligibility: Must have at least 3 players (Captain + 2 Members)
        const roster = [team.captainId, ...team.memberIds];
        if (roster.length < 3) continue;

        let isFlawless = true;
        let raceCount = 0;

        // 2. Check every race
        for (const r of t.races) {
          // Check if this team played this race (look for captain)
          if (r.placements[team.captainId] === undefined) continue;

          raceCount++;

          // 3. Identify who got 1st, 2nd, 3rd
          const p1 = Object.keys(r.placements).find(key => r.placements[key] === 1);
          const p2 = Object.keys(r.placements).find(key => r.placements[key] === 2);
          const p3 = Object.keys(r.placements).find(key => r.placements[key] === 3);

          // 4. Verify all three exist AND belong to this team
          if (!p1 || !p2 || !p3) {
            isFlawless = false;
            break;
          }
          if (!roster.includes(p1) || !roster.includes(p2) || !roster.includes(p3)) {
            isFlawless = false;
            break;
          }
        }

        // 5. Must have played at least 1 race and been flawless
        if (isFlawless && raceCount > 0) {
          // If multiple teams are flawless (impossible?), tie-break by race count
          if (raceCount > maxRaces) {
            maxRaces = raceCount;
            winner = team;
          }
        }
      }

      if (!winner) return [];

      const captain = t.players.find(p => p.id === winner!.captainId);
      if (!captain) return [];

      return [{
        player: { ...captain, name: winner.name },
        value: '100%',
        subtext: 'Podium Lockouts'
      }];
    }
  },
  {
    id: 'mvp',
    title: 'The MVP',
    description: 'Highest total points across all stages',
    icon: 'ph-trophy',
    color: 'text-yellow-400', // Gold for the winner
    gradient: 'from-yellow-500/20',
    tieHandling: { type: 'allow-ties' },
    calculate: (t: Tournament) => {
      const maxPts = Math.max(...t.players.map(p => p.totalPoints || 0));

      if (maxPts < 25 || t.races.length < 3) return [];

      return t.players
          .filter(p => (p.totalPoints || 0) === maxPts)
          .map(p => ({
            player: p,
            value: maxPts,
            subtext: 'Total Pts'
          }));
    }
  },
  {
    id: 'inevitable',
    title: 'The Inevitable',
    description: 'Finished Top 3 in every single race participated',
    icon: 'ph-medal',
    color: 'text-yellow-500',
    gradient: 'from-yellow-600/20',
    tieHandling: { type: 'allow-ties' },
    calculate: (t: Tournament) => {
      const candidates: Array<{ player: Player; stats: { count: number; g: number; s: number; b: number } }> = [];

      // 1. Collect all valid candidates
      t.players.forEach(p => {
        let g = 0, s = 0, b = 0, count = 0, valid = true;

        for (const r of t.races) {
          const pos = r.placements[p.id];
          if (pos === undefined) continue;

          count++;

          if (pos === 1) g++;
          else if (pos === 2) s++;
          else if (pos === 3) b++;
          else {
            valid = false;
            break;
          }
        }

        // Only add if valid and meets minimum
        if (valid && count >= 3) {
          candidates.push({ player: p, stats: { count, g, s, b } });
        }
      });

      if (candidates.length === 0) return [];

      // 2. Find the best stats using Olympic comparison
      let bestStats = candidates[0]!.stats;

      candidates.forEach(c => {
        const comparison = compareStats(c.stats, bestStats);
        if (comparison > 0) {
          bestStats = c.stats;
        }
      });

      // 3. Return ALL players with the best stats
      return candidates
          .filter(c => compareStats(c.stats, bestStats) === 0)
          .map(c => ({
            player: c.player,
            value: `${c.stats.g}G ${c.stats.s}S ${c.stats.b}B`,
            subtext: `in ${c.stats.count} Race${c.stats.count === 1 ? '' : 's'}`
          }));
    }
  },
  {
    id: 'clutcher',
    title: 'The Clutcher',
    description: 'Biggest performance boost in Finals vs Groups',
    icon: 'ph-snowflake', // "Ice in their veins"
    color: 'text-cyan-400',
    gradient: 'from-cyan-500/20',
    tieHandling: { type: 'allow-ties' },
    calculate: (t: Tournament) => {
      let maxImprovement = -999;
      let winners: Player[] = [];

      t.players.forEach(p => {
        // 1. Get Placements for each stage
        const groupPlaces = t.races
            .filter(r => r.stage === 'groups' && r.placements[p.id] !== undefined)
            .map(r => r.placements[p.id]!);

        const finalsPlaces = t.races
            .filter(r => r.stage === 'finals' && r.placements[p.id] !== undefined)
            .map(r => r.placements[p.id]!);

        // Must have played at least 1 race in BOTH stages to qualify
        if (groupPlaces.length === 0 || finalsPlaces.length === 0) return [];

        // 2. Calculate Averages
        const groupAvg = groupPlaces.reduce((a,b)=>a+b,0) / groupPlaces.length;
        const finalsAvg = finalsPlaces.reduce((a,b)=>a+b,0) / finalsPlaces.length;

        // 3. Calculate Improvement (Positive = Lower/Better placement number)
        // e.g. Group 6.0 - Finals 2.0 = +4.0 Improvement
        const diff = groupAvg - finalsAvg;

        if (diff > maxImprovement && diff > 0 && diff >= 2.5) {
          // Case A: We found a NEW highest score
          if (diff > maxImprovement) {
            maxImprovement = diff;
            winners = [p]; // Reset the array with this new leader
          }
              // Case B: We found a TIE for the highest score
          // (Using a small epsilon 0.0001 to handle floating point math inconsistencies)
          else if (Math.abs(diff - maxImprovement) < 0.0001) {
            winners.push(p); // Add this player to the existing list
          }
        }
      });

      if (winners.length === 0) return [];

      return winners.map(w => {
        return {
          player: w,
          value: `+${maxImprovement.toFixed(1)}`,
          subtext: 'avg Place Improv.'
        }
      });
    }
  },
  {
    id: 'choker',
    title: 'The Group Stage Merchant',
    description: 'Biggest performance drop-off in Finals',
    icon: 'ph-skull', // or ph-warning-circle
    color: 'text-rose-500', // Distinct red for "Danger"
    gradient: 'from-rose-600/20',
    tieHandling: { type: "allow-ties" },
    calculate: (t: Tournament) => {

      const performances = t.players.map(p => {
        const groupPlaces = t.races
            .filter(r => r.stage === 'groups' && r.placements[p.id] !== undefined)
            .map(r => r.placements[p.id]!);

        const finalsPlaces = t.races
            .filter(r => r.stage === 'finals' && r.placements[p.id] !== undefined)
            .map(r => r.placements[p.id]!);

        if (groupPlaces.length === 0 || finalsPlaces.length === 0) return {player: p, performance: 0};

        const groupAvg = groupPlaces.reduce((a,b)=>a+b,0) / groupPlaces.length;
        const finalsAvg = finalsPlaces.reduce((a,b)=>a+b,0) / finalsPlaces.length;

        // 3. Calculate Dropoff (Positive = Higher/Worse placement number)
        // e.g. Finals 8.0 - Group 2.0 = +6.0 Dropoff
        const dropoff = finalsAvg - groupAvg;

        return { player: p, performance: dropoff }
      });
      const maxPer = Math.max(...performances.map(p => p.performance))

      if (!maxPer || maxPer < 2.5) return [];

      return performances
          .filter(per => per.performance === maxPer)
          .map(per => {
            return {
              player: per.player,
              value: `-${per.performance.toFixed(1)}`,
              subtext: 'avg Place Drop'
            }
          });
    }
  },
  {
    id: 'volatility',
    title: 'The Coinflip',
    description: 'Most inconsistent placements (High Variance)',
    icon: 'ph-coin-vertical',
    color: 'text-purple-400',
    gradient: 'from-violet-500/20',
    tieHandling: { type: "allow-ties" },
    calculate: (t: Tournament) => {
      let maxDev = 0;

      const variances = t.players.map(p => {
        // 1. Get all placements for this player
        const places: number[] = [];
        t.races.forEach(r => {
          if (r.placements[p.id]) places.push(r.placements[p.id]!);
        });

        if (places.length < 3) return {player: p, value: 0}; // Need data for deviation

        // 2. Calculate Standard Deviation
        const mean = places.reduce((a, b) => a + b, 0) / places.length;
        const variance = places.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / places.length;
        const stdDev = Math.sqrt(variance);

        if (stdDev > maxDev) {
          maxDev = stdDev;
        }
        return {player: p, value: stdDev}
      });

      if (maxDev < 3.5) return [];

      return variances
          .filter(v => v.value === maxDev)
          .map(v => {
                return {
                  player: v.player,
                  value: maxDev.toFixed(2),
                  subtext: 'Std Dev'
                }
              });
    }
  },
  {
    id: 'metronome',
    title: 'The Metronome', // or 'The Machine'
    description: 'Most consistent placements (Low Variance)',
    icon: 'ph-wave-sine', // Represents the frequency/consistency
    color: 'text-indigo-400',
    gradient: 'from-indigo-500/20',
    tieHandling: { type: "allow-ties" },
    calculate: (t: Tournament) => {
      let minStdDev = 999;

      const variances = t.players.map(p => {
        // 1. Get all placements for this player
        const places: number[] = [];
        t.races.forEach(r => {
          if (r.placements[p.id]) places.push(r.placements[p.id]!);
        });

        if (places.length < 3) return {player: p, value: 0}; // Need data for deviation

        // 2. Calculate Standard Deviation
        const mean = places.reduce((a, b) => a + b, 0) / places.length;
        const variance = places.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / places.length;
        const stdDev = Math.sqrt(variance);

        if (stdDev < minStdDev) {
          minStdDev = stdDev;
        }
        return {player: p, value: stdDev}
      });

      if (variances.length === 0 || minStdDev > 1.5) return [];

      return variances
          .filter(v => v.value === minStdDev)
          .map(v => {
            return {
              player: v.player,
              value: minStdDev.toFixed(2),
              subtext: 'Std Dev'
            }
          });
    }
  },
  {
    id: 'the_yoyo',
    title: 'The YOYO',
    description: 'Most immediate jumps between Top 3 and Bottom 3',
    icon: 'ph-arrows-vertical',
    color: 'text-fuchsia-400',
    gradient: 'from-fuchsia-500/20',
    tieHandling: { type: "allow-ties" },
    calculate: (t: Tournament) => {
      let maxYoyos = 0;

      const yoyos = t.players.map(p => {
        // 1. Get ONLY the races this player actually raced in
        const myRaces = t.races.filter(r => r.placements[p.id] !== undefined);

        // 2. Sort them Chronologically: Groups First, then by Race Number
        myRaces.sort((a, b) => {
          // If stages are different, 'groups' always comes before 'finals'
          if (a.stage !== b.stage) {
            return a.stage === 'groups' ? -1 : 1;
          }
          // If stages are the same, sort by race number (1, 2, 3...)
          return a.raceNumber - b.raceNumber;
        });

        // 3. Calculate Yoyos
        let yoyoCount = 0;
        let lastZone: 'top' | 'bottom' | 'mid' | null = null;

        myRaces.forEach(r => {
          const pos = r.placements[p.id]!;

          // Determine Field Size (e.g. 12)
          // We use 'max' to find the last place position, even if someone disconnected
          const placements = Object.values(r.placements);
          if (placements.length === 0) return;
          const fieldSize = Math.max(...placements);

          // skip small lobbies
          if (fieldSize < 6) return;

          // Determine Current Zone
          let currentZone: 'top' | 'bottom' | 'mid' = 'mid';

          if (pos <= 3) {
            currentZone = 'top';
          } else if (pos >= fieldSize - 2) {
            // Dynamic Bottom 3:
            // 12 players -> pos 10, 11, 12
            // 9 players -> pos 7, 8, 9
            currentZone = 'bottom';
          }

          // Check for YOYO (Direct swap between Top and Bottom)
          // We ignore 'mid' to ensure it's a violent swing
          if ((lastZone === 'top' && currentZone === 'bottom') || (lastZone === 'bottom' && currentZone === 'top')) {
            yoyoCount++;
          }

          // Update state
          // Note: We update lastZone even if it was 'mid', because
          // 1st -> 6th -> 12th is a slide, NOT a Yoyo.
          lastZone = currentZone;
        });

        if (yoyoCount > maxYoyos) {
          maxYoyos = yoyoCount;
        }
        return {player: p, value: yoyoCount};
      });

      if (yoyos.length === 0 || maxYoyos < 3) return [];

      return yoyos
          .filter(v => v.value === maxYoyos)
          .map(v => {
            return {
              player: v.player,
              value: maxYoyos,
              subtext: 'Whiplashes'
            };
          });
    }
  },
  {
    id: 'the_anchor',
    title: 'The Anchor',
    description: 'Most last place finishes',
    icon: 'ph-anchor',
    color: 'text-slate-500', // Grey for shame
    gradient: 'from-zinc-500/20',
    tieHandling: { type: "allow-ties" },
    calculate: (t: Tournament) => {
      const lastCounts: Record<string, number> = {};

      t.races.forEach(race => {
        // Find the worst position in this specific race
        const positions = Object.values(race.placements);
        if (positions.length === 0) return;
        const lastPlace = Math.max(...positions);

        // Find who got it
        const victimId = Object.keys(race.placements).find(
            pid => race.placements[pid] === lastPlace
        );
        if (victimId) {
          lastCounts[victimId] = (lastCounts[victimId] || 0) + 1;
        }
      });

      // Find max
      let maxLasts = 0;

      Object.entries(lastCounts).forEach(([_, count]) => {
        if (count > maxLasts) {
          maxLasts = count;
        }
      });

      if (maxLasts < 3) return [];

      return Object.entries(lastCounts)
          .filter(([_, count]) => {
            return count === maxLasts
          })
          .map(([playerId, count]): FameResult | null => {
            const player = t.players.find(p => p.id === playerId);
            if (!player) return null;

            return {
              player: player,
              value: count,
              subtext: 'Last Places'
            }
          })
          .filter((r): r is FameResult => r !== null);
    }
  },
  {
    id: 'bridesmaid',
    title: 'Always the Bridesmaid',
    description: 'Most 2nd place finishes',
    icon: 'ph-heart-break',
    color: 'text-pink-400',
    gradient: 'from-pink-500/20',
    tieHandling: { type: "allow-ties" },
    calculate: (t: Tournament) => {
      const seconds: Record<string, number> = {};

      t.races.forEach(r => {
        Object.entries(r.placements).forEach(([pid, pos]) => {
          if (pos === 2) {
            seconds[pid] = (seconds[pid] || 0) + 1;
          }
        });
      });

      let maxSeconds = 0;

      Object.entries(seconds).forEach(([_, count]) => {
        if (count > maxSeconds) {
          maxSeconds = count;
        }
      });

      if (maxSeconds < 3) return [];

      return Object.entries(seconds)
          .filter(([_, count]) => {
            return count === maxSeconds
          })
          .map(([playerId, count]): FameResult | null => {
            const player = t.players.find(p => p.id === playerId);
            if (!player) return null;

            return {
              player: player,
              value: count,
              subtext: 'Silvers'
            }
          })
          .filter((r): r is FameResult => r !== null);
    }
  },
  {
    id: 'the_npc',
    title: 'The NPC',
    description: 'Closest to the exact middle of the pack',
    icon: 'ph-robot',
    color: 'text-gray-400',
    gradient: 'from-gray-500/20',
    tieHandling: { type: "allow-ties" },
    calculate: (t: Tournament) => {
      // 1. Set Cutoff: Deviation must be <= 1.0 position to qualify
      let bestDev = 1.3;
      let winner: Player | null = null;
      let winnerAvgMiddle = 0;

      t.players.forEach(p => {
        let totalDev = 0;
        let totalMiddle = 0;
        let raceCount = 0;

        t.races.forEach(r => {
          const pos = r.placements[p.id];
          // Skip if player didn't race
          if (pos === undefined) return [];

          // Get all positions to find the true "Last Place"
          const allPositions = Object.values(r.placements);
          if (allPositions.length === 0) return [];

          // CHANGE: Field size is now determined by the highest placement number
          const fieldSize = Math.max(...allPositions);

          // Calculate the specific middle for this race (e.g. Max 12 -> Middle 6.5)
          const mid = (fieldSize + 1) / 2;

          // Calculate how far this player was from that middle
          totalDev += Math.abs(pos - mid);
          totalMiddle += mid;
          raceCount++;
        });

        // Minimum 3 races to qualify
        if (raceCount < 3) return [];

        const avgDev = totalDev / raceCount;

        // Check if this is the new lowest deviation (closer to 0 is better)
        if (avgDev < bestDev) {
          bestDev = avgDev;
          winner = p;
          winnerAvgMiddle = totalMiddle / raceCount;
        }
      });

      if (!winner) return [];

      return [{
        player: winner,
        // e.g. "0.50 Dev"
        value: `${bestDev.toFixed(2)} Dev`,
        // e.g. "from Middle 6.5"
        subtext: `from Middle ${winnerAvgMiddle.toFixed(1)}`
      }];
    }
  },
  {
    id: 'rising_star',
    title: 'The Rising Star',
    description: 'Best improvement trend across the entire tournament',
    icon: 'ph-chart-line-up',
    color: 'text-green-400',
    gradient: 'from-green-500/20',
    tieHandling: {type: "allow-ties"},
    calculate: (t: Tournament) => {
      let bestSlope = 0; // We are looking for the most NEGATIVE number
      let winner: Player | null = null;

      // Helper for stage order
      const stageOrder: Record<string, number> = { 'groups': 1, 'finals': 2 };

      t.players.forEach(p => {
        // 1. Get Chronological Races
        const myRaces = t.races
            .filter(r => r.placements[p.id] !== undefined)
            .sort((a, b) => {
              const sA = stageOrder[a.stage.toLowerCase()] || 99;
              const sB = stageOrder[b.stage.toLowerCase()] || 99;
              return sA !== sB ? sA - sB : a.raceNumber - b.raceNumber;
            });

        // Minimum 4 races needed to establish a trend line
        const n = myRaces.length;
        if (n < 4) return [];

        // 2. Prepare Data Points for Linear Regression
        // x = Race Index (0, 1, 2...), y = Placement
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

        myRaces.forEach((r, index) => {
          const x = index;
          const y = r.placements[p.id]!;

          sumX += x;
          sumY += y;
          sumXY += (x * y);
          sumXX += (x * x);
        });

        // 3. Calculate Slope (m)
        // Formula: (N * ΣXY - ΣX * ΣY) / (N * ΣX² - (ΣX)²)
        const numerator = (n * sumXY) - (sumX * sumY);
        const denominator = (n * sumXX) - (sumX * sumX);

        if (denominator === 0) return []; // Avoid division by zero

        const slope = numerator / denominator;

        // 4. Check for best improvement (Most negative slope wins)
        // We set a threshold (e.g. -0.5) to ensure it's actual improvement, not just noise
        if (slope < bestSlope && slope < -0.5) {
          bestSlope = slope;
          winner = p;
        }
      });

      if (!winner) return [];

      return [{
        player: winner,
        value: Math.abs(bestSlope).toFixed(2), // Show as positive number for display
        subtext: 'Places / Race' // e.g. "1.50 Places / Race"
      }];
    }
  },
  {
    id: 'hard_carry',
    title: 'The Carry',
    description: 'Highest % contribution to team score',
    icon: 'ph-backpack',
    color: 'text-rose-400',
    gradient: 'from-rose-500/20',
    tieHandling: { type: "allow-ties" },
    calculate: (t: Tournament) => {
      let maxPct = 0;
      let winners: Player[] = [];

      t.teams.forEach(team => {
        // Calculate total team points across all stages
        const teamTotalPoints = (team.points || 0) + (team.finalsPoints || 0);
        if (teamTotalPoints === 0) return; // Avoid division by zero

        // Find all members of this specific team
        const members = t.players.filter(p =>
            p.id === team.captainId || team.memberIds.includes(p.id)
        );

        members.forEach(p => {
          // 1. Safeguard: Must have participated in at least 3 races
          const racesPlayed = t.races.filter(r => r.placements[p.id] !== undefined).length;
          if (racesPlayed < 3) return;

          const points = p.totalPoints || 0;
          const pct = points / teamTotalPoints;

          // 2. Track highest percentage (allowing ties safely)
          if (Math.abs(pct - maxPct) < 0.0001) {
            winners.push(p);
          } else if (pct > maxPct) {
            maxPct = pct;
            winners = [p];
          }
        });
      });

      // 3. Threshold: Only award if they carried at least 70% of the team
      if (maxPct < 0.7 || winners.length === 0) return [];

      // 4. Map all tied players to the output format
      return winners.map(w => ({
        player: w,
        value: (maxPct * 100).toFixed(0) + '%',
        subtext: 'of Team Pts'
      }));
    }
  },
  {
    id: 'most_wins',
    title: 'The Speedster',
    description: 'Most 1st place finishes in races',
    icon: 'ph-crown',
    color: 'text-amber-400',
    gradient: 'from-amber-500/20',
    tieHandling: {type: "allow-ties"},
    calculate: (t) => {
      const MIN_WINS_THRESHOLD = 3;

      const wins: Record<string, number> = {};
      let maxWins = 0;

      // 1. Iterate over every race history
      t.races.forEach(race => {
        // placements is { "playerId": position }
        // We want to find the ID where position === 1
        const winnerId = Object.keys(race.placements).find(
            pid => race.placements[pid] === 1
        );

        if (winnerId) {
          wins[winnerId] = (wins[winnerId] || 0) + 1;
          if (wins[winnerId] > maxWins) {
            maxWins = wins[winnerId];
          }
        }
      });

      if (maxWins < MIN_WINS_THRESHOLD) return [];

      return t.players
          .filter(p => wins[p.id] === maxWins)
          .map(p => {
            return {
              player: p,
              value: maxWins,
              subtext: 'Victories'
            }
          })
    }
  },
  {
    id: 'machine',
    title: 'The Machine',
    description: 'Best average placement',
    icon: 'ph-trend-up',
    color: 'text-emerald-400',
    gradient: 'from-emerald-500/20',
    tieHandling: {type: "allow-ties"},
    calculate: (t) => {
      let bestAvg = 3.5; // cutoff for showing the category
      let candidates: Player[] = [];

      t.players.forEach(p => {
        const places = t.races
            .map(r => r.placements[p.id])
            .filter(pos => pos !== undefined);

        if (places.length < 3) return;
        const avg = places.reduce((a,b)=>a+b,0) / places.length;

        if (Math.abs(avg - bestAvg) < 0.0001) {
          candidates.push(p);
        } else if (avg < bestAvg) {
          bestAvg = avg;
          candidates = [p];
        }
      });

      return candidates
          .map(p => {
            return {
              player: p,
              value: bestAvg.toFixed(2),
              subtext: 'Avg Place'
            }
          });
    }
  },
  {
    id: 'pacifist',
    title: 'The Pacifist',
    description: 'Best average placement... with ZERO wins',
    icon: 'ph-hand-peace',
    color: 'text-blue-400',
    gradient: 'from-blue-500/20',
    tieHandling: {type: "allow-ties"},
    calculate: (t) => {
      const stats: Record<string, { sum: number, count: number, wins: number }> = {};

      // 1. Aggregate stats from races
      t.races.forEach(race => {
        Object.entries(race.placements).forEach(([pid, pos]) => {
          if (!stats[pid]) stats[pid] = { sum: 0, count: 0, wins: 0 };
          stats[pid].sum += pos;
          stats[pid].count += 1;
          if (pos === 1) stats[pid].wins += 1;
        });
      });

      // 2. Filter for 0 wins and find best average
      let bestAvg = 3.51;
      let candidates: Player[] = [];

      Object.entries(stats).forEach(([pid, stat]) => {
        if (stat.wins === 0 && stat.count >= 3) { // Min 3 races to qualify
          const avg = stat.sum / stat.count;
          const p = t.players.find(player => player.id === pid);
          if (!p) return;

          if (Math.abs(avg - bestAvg) < 0.0001) {
            candidates.push(p);
          } else if (avg < bestAvg) {
            bestAvg = avg;
            candidates = [p];
          }
        }
      });

      return candidates
          .map(p => {
            return {
              player: p,
              value: bestAvg.toFixed(1),
              subtext: 'Avg Place'
            };
          });
    }
  },
  {
    id: 'liability',
    title: 'The Liability',
    description: 'Lowest % contribution to team score',
    icon: 'ph-warning-octagon', // A warning sign fits perfectly
    color: 'text-orange-400',
    gradient: 'from-orange-500/20',
    tieHandling: {type: "allow-ties"},
    calculate: (t: Tournament) => {
      let minPct = 1.0; // Start at 100% and go down
      let liability: Player | null = null;

      t.teams.forEach(team => {
        const teamTotal = (team.points || 0) + (team.finalsPoints || 0);
        if (teamTotal === 0) return; // Skip teams with 0 points

        // Identify team members
        const members = t.players.filter(p =>
            p.id === team.captainId || team.memberIds.includes(p.id)
        );

        members.forEach(p => {
          // 1. Check Race Count (Don't shame people who haven't played yet)
          const racesPlayed = t.races.filter(r => r.placements[p.id] !== undefined).length;
          if (racesPlayed < 3) return;

          // 2. Calculate Percentage
          const pPoints = (p.totalPoints || 0);
          const pct = pPoints / teamTotal;

          // 3. Find the lowest
          if (pct < minPct) {
            minPct = pct;
            liability = p;
          }
        });
      });

      // Safety check: if minPct is still >10%, nobody qualified
      if (!liability || minPct > 0.1) return [];

      return [{
        player: liability,
        value: (minPct * 100).toFixed(1) + '%',
        subtext: 'of team pts'
      }];
    }
  },
  {
    id: 'team_podiums',
    title: 'The Podium Hogs',
    description: 'Most combined Top 3 finishes (Must secure >50% of all available podium slots)',
    isTeam: true,
    icon: 'ph-ranking',
    color: 'text-amber-400',
    gradient: 'from-amber-500/20',
    tieHandling: {type: "allow-ties"},
    calculate: (t: Tournament) => {
      let maxTotal = 0;
      let bestTeam: Team | null = null;
      let bestStats = { g: 0, s: 0, b: 0 };

      // THRESHOLD: Must capture at least 50% of available podiums (Avg 1.5 per race)
      const THRESHOLD_RATIO = 0.5;

      for (const team of t.teams) {
        let g = 0, s = 0, b = 0;
        let racesParticipated = 0;
        const roster = [team.captainId, ...team.memberIds];

        // 1. Analyze every race
        for (const r of t.races) {
          // Check if ANY team member participated in this race
          const participated = roster.some(pid => r.placements[pid] !== undefined);
          if (!participated) continue;

          racesParticipated++;

          // Count Podiums
          roster.forEach(pid => {
            const pos = r.placements[pid];
            if (pos === 1) g++;
            else if (pos === 2) s++;
            else if (pos === 3) b++;
          });
        }

        if (racesParticipated < 3) continue;

        const totalPodiums = g + s + b;

        // 2. Calculate Capacity (3 podium spots per race)
        const totalSlots = racesParticipated * 3;

        // Safety: Avoid division by zero
        if (totalSlots === 0) continue;

        const ratio = totalPodiums / totalSlots;

        // 3. APPLY FILTER: Disqualify if they didn't hog enough
        if (ratio < THRESHOLD_RATIO) continue;

        // 4. Determine Winner (Standard "Most Podiums" logic applies to survivors)
        if (totalPodiums > maxTotal) {
          maxTotal = totalPodiums;
          bestTeam = team;
          bestStats = { g, s, b };
        }
        else if (totalPodiums === maxTotal && totalPodiums > 0) {
          // Tie-breaker: Gold Count
          if (g > bestStats.g) {
            bestTeam = team;
            bestStats = { g, s, b };
          }
        }
      }

      if (!bestTeam) return [];

      const captain = t.players.find(p => p.id === bestTeam!.captainId);
      if (!captain) return [];

      return [{
        player: { ...captain, name: bestTeam.name },
        value: `${bestStats.g}G ${bestStats.s}S ${bestStats.b}B`,
        subtext: 'Team Total'
      }];
    }
  },
  {
    id: 'one_two_punch',
    title: 'The 1-2 Punch',
    description: 'Most races finishing 1st and 2nd together',
    isTeam: true,
    icon: 'ph-hand-fist', // Or ph-lightning
    color: 'text-rose-500',
    gradient: 'from-rose-600/20',
    tieHandling: {type: "allow-ties"},
    calculate: (t: Tournament) => {
      let maxCount = 0;
      let winners: Team[] = [];

      for (const team of t.teams) {
        let count = 0;
        const roster = [team.captainId, ...team.memberIds];

        t.races.forEach(r => {
          // Check if this team owns position 1 AND position 2
          const pos1Player = Object.keys(r.placements).find(key => r.placements[key] === 1);
          const pos2Player = Object.keys(r.placements).find(key => r.placements[key] === 2);

          if (pos1Player && pos2Player &&
              roster.includes(pos1Player) && roster.includes(pos2Player)) {
            count++;
          }
        });

        if (count > maxCount) {
          maxCount = count;
          winners = [team];
        } else if (count === maxCount) {
          winners.push(team);
        }
      }

      if (maxCount < 2) return [];

      return winners.map(winner => {
        return {
          player: winner,
          value: `${maxCount}x`,
          subtext: 'Perfect Races'
        }
      });
    }
  },
  {
    id: 'mods',
    title: 'MODS',
    description: 'Most races finishing 6th and 7th together',
    isTeam: true,
    icon: 'ph-hammer', // Or ph-lightning
    color: 'text-rose-500',
    gradient: 'from-rose-600/20',
    tieHandling: {type: "allow-ties"},
    calculate: (t: Tournament) => {
      let maxCount = 0;
      let winners: Team[] = [];

      for (const team of t.teams) {
        let count = 0;
        const roster = [team.captainId, ...team.memberIds];

        t.races.forEach(r => {
          // Check if this team owns position 1 AND position 2
          const pos1Player = Object.keys(r.placements).find(key => r.placements[key] === 6);
          const pos2Player = Object.keys(r.placements).find(key => r.placements[key] === 7);

          if (pos1Player && pos2Player &&
              roster.includes(pos1Player) && roster.includes(pos2Player)) {
            count++;
          }
        });

        if (count > maxCount) {
          maxCount = count;
          winners = [team];
        } else if (count === maxCount) {
          winners.push(team);
        }
      }

      if (maxCount < 3) return [];

      return winners.map(winner => {
        return {
          player: winner,
          value: `${maxCount}x`,
          subtext: 'SHOOT THESE GUYS IMMEDIATELY'
        }
      });
    }
  },
  {
    id: 'phalanx',
    title: 'The Power of Friendship',
    description: 'Smallest point gap between teammates. Weighted by total pts and # of races.',
    isTeam: true,
    icon: 'ph-shield-check',
    color: 'text-teal-400',
    gradient: 'from-teal-500/20',
    tieHandling: { type: "allow-ties" },
    calculate: (t: Tournament) => {
      let minGap = Infinity;
      let maxTeamTotal = 0;
      let winners: Team[] = [];

      for (const team of t.teams) {
        const roster = [team.captainId, ...team.memberIds];

        // 1. Safeguard check
        let qualifies = true;
        const teamRacesPlayed = t.races.filter(r =>
            roster.some(pid => r.placements[pid] !== undefined)
        ).length;

        for (const pid of roster) {
          const playerRacesPlayed = t.races.filter(r => r.placements[pid] !== undefined).length;
          if (playerRacesPlayed < 3 || playerRacesPlayed < teamRacesPlayed) {
            qualifies = false;
            break;
          }
        }

        if (!qualifies) continue;

        // 2. Get total points for each member
        const memberPoints = roster.map(pid => {
          const p = t.players.find(pl => pl.id === pid);
          return p?.totalPoints || 0;
        });

        if (memberPoints.length < 2) continue;

        const teamTotal = memberPoints.reduce((a, b) => a + b, 0);
        if (teamTotal < 20) continue;

        // 3. Calculate Gap
        const max = Math.max(...memberPoints);
        const min = Math.min(...memberPoints);
        const gap = max - min;

        // --- THE HYBRID CUTOFF ---
        // Base drift of 3 pts per race + 10% of their total points
        const dynamicCutoff = Math.round((teamRacesPlayed * 3) + Math.ceil(teamTotal * 0.05));

        // 4. Threshold Check
        if (gap > dynamicCutoff) continue;

        // 5. Determine Winners
        if (gap < minGap) {
          minGap = gap;
          maxTeamTotal = teamTotal;
          winners = [team];
        } else if (gap === minGap) {
          if (teamTotal > maxTeamTotal) {
            maxTeamTotal = teamTotal;
            winners = [team];
          } else if (teamTotal === maxTeamTotal) {
            winners.push(team);
          }
        }
      }

      if (winners.length === 0) return [];

      return winners.map(winner => {
        const captain = t.players.find(p => p.id === winner.captainId);
        const displayPlayer = captain ? { ...captain, name: winner.name } : winner;

        return {
          player: displayPlayer,
          value: `${minGap} pts`,
          subtext: 'Spread'
        };
      });
    }
  },
  {
    id: 'high_rollers',
    title: 'High Rollers',
    description: 'Highest team score achieved in a single race',
    isTeam: true,
    icon: 'ph-sketch-logo',
    color: 'text-fuchsia-400',
    gradient: 'from-fuchsia-500/20',
    tieHandling: {type: "allow-ties"},
    calculate: (t: Tournament) => {
      const SYSTEM = t.pointsSystem || POINTS_SYSTEM;

      let maxRaceScore = 0;
      // let winner: Team | null = null;
      let winners: Team[] = [];

      for (const team of t.teams) {
        const roster = [team.captainId, ...team.memberIds];

        for (const r of t.races) {
          let currentRaceScore = 0;

          for (const pid of roster) {
            const pos = r.placements[pid];
            if (pos) {
              currentRaceScore += (SYSTEM[pos] || 0);
            }
          }

          if (currentRaceScore < 50) continue;

          if (currentRaceScore === maxRaceScore && !winners.includes(team)) {
            winners.push(team);
          } else if (currentRaceScore > maxRaceScore) {
            maxRaceScore = currentRaceScore;
            // winner = team;
            winners = [team];
          }
        }
      }

      return winners.map(winner => {
        return {
          player: winner,
          value: `${maxRaceScore} pts`,
          subtext: 'Single Race'
        }
      });
    }
  },
  {
    id: 'comeback_kings',
    title: 'The Comeback Kings',
    description: 'Overcame a massive deficit in the last 2 races',
    icon: 'ph-heartbeat',
    color: 'text-emerald-400',
    gradient: 'from-emerald-500/20',
    tieHandling: {type: "allow-ties"},
    isTeam: true,
    calculate: (t: Tournament) => {
      const SYSTEM = t.pointsSystem || POINTS_SYSTEM;

      // 1. FILTER RACES
      const isBigTournament = t.teams.length >= 6;
      let relevantRaces = isBigTournament
          ? t.races.filter(r => r.stage === 'finals')
          : [...t.races];

      relevantRaces.sort((a, b) => a.raceNumber - b.raceNumber);

      // Need at least 3 races to have a "last 2 races" comeback context
      // (If only 2 races exist, you can't be "behind" entering the last 2, because you are at 0 pts)
      if (relevantRaces.length < 3) return [];

      // 2. IDENTIFY EVENTUAL WINNER
      const sortedTeams = t.teams
          .filter(t => t.inFinals)
          .sort((a, b) => compareTeams(a, b, true, t, true))!;

      const winnerId = sortedTeams[0]!.id;

      // 3. SNAPSHOT AT "CUTOFF" (Start of the last 2 races)
      const cutoffIndex = relevantRaces.length - 2;
      const racesBeforeCutoff = relevantRaces.slice(0, cutoffIndex);

      const snapshotScores: Record<string, number> = {};
      t.teams.forEach(tm => snapshotScores[tm.id] = 0);

      // Tally scores up to the cutoff
      racesBeforeCutoff.forEach(r => {
        Object.entries(r.placements).forEach(([pid, pos]) => {
          const team = t.teams.find(tm => tm.captainId === pid || tm.memberIds.includes(pid));
          if (team) snapshotScores[team.id] = (snapshotScores[team.id] || 0) + (SYSTEM[pos] || 0);
        });
      });

      // Who was leading THEN?
      const currentIds = Object.keys(snapshotScores);
      if (currentIds.length === 0) return [];

      const leaderAtCutoffId = currentIds.reduce((a, b) =>
          (snapshotScores[a] ?? 0) > (snapshotScores[b] ?? 0) ? a : b
      );

      const leaderScore = snapshotScores[leaderAtCutoffId] ?? 0;
      const winnerScore = snapshotScores[winnerId] ?? 0;

      const deficit = leaderScore - winnerScore;

      // Threshold: Must be behind by 30+ points entering the final 2 races
      if (deficit < 30) return [];

      const winnerTeam = t.teams.find(tm => tm.id === winnerId);
      if (!winnerTeam) return [];

      const captain = t.players.find(p => p.id === winnerTeam.captainId);
      if (!captain) return [];

      return [{
        player: { ...captain, name: winnerTeam.name },
        value: `${deficit} pts`,
        subtext: 'Deficit Overcome'
      }];
    }
  },
  {
    id: 'the_fumblers',
    title: 'The Fumblers',
    description: 'Blew a massive lead in the last 2 races',
    icon: 'ph-bomb',
    color: 'text-orange-500',
    gradient: 'from-orange-500/20',
    tieHandling: {type: "allow-ties"},
    isTeam: true,
    calculate: (t: Tournament) => {
      const SYSTEM = t.pointsSystem || POINTS_SYSTEM;

      // 1. FILTER RACES
      const isBigTournament = t.teams.length >= 6;
      let relevantRaces = isBigTournament
          ? t.races.filter(r => r.stage === 'finals')
          : [...t.races];

      relevantRaces.sort((a, b) => a.raceNumber - b.raceNumber);
      if (relevantRaces.length < 3) return [];

      // 2. IDENTIFY EVENTUAL WINNER (To ensure the fumbler actually lost)
      const sortedTeams = t.teams
          .filter(t => t.inFinals)
          .sort((a, b) => compareTeams(a, b, true, t, true))!;

      const championId = sortedTeams[0]!.id;

      // 3. SNAPSHOT AT "CUTOFF"
      const cutoffIndex = relevantRaces.length - 2;
      const racesBeforeCutoff = relevantRaces.slice(0, cutoffIndex);

      const snapshotScores: Record<string, number> = {};
      t.teams.forEach(tm => snapshotScores[tm.id] = 0);

      racesBeforeCutoff.forEach(r => {
        Object.entries(r.placements).forEach(([pid, pos]) => {
          const team = t.teams.find(tm => tm.captainId === pid || tm.memberIds.includes(pid));
          if (team) snapshotScores[team.id] = (snapshotScores[team.id] || 0) + (SYSTEM[pos] || 0);
        });
      });

      // Who was leading THEN?
      // We need to sort everyone to find 1st and 2nd place at that moment
      const sortedAtCutoff = Object.keys(snapshotScores).sort((a, b) =>
          (snapshotScores[b] ?? 0) - (snapshotScores[a] ?? 0)
      );

      const leaderId = sortedAtCutoff[0];
      const secondId = sortedAtCutoff[1];

      if (!leaderId || !secondId) return [];

      // IF the leader at the cutoff IS the eventual champion, they didn't fumble.
      if (leaderId === championId) return [];

      // Calculate the lead they had
      const lead = (snapshotScores[leaderId] ?? 0) - (snapshotScores[secondId] ?? 0);

      // Threshold: Must have been leading by 30+ points
      if (lead < 30) return [];

      const bottlerTeam = t.teams.find(tm => tm.id === leaderId);
      if (!bottlerTeam) return [];

      const captain = t.players.find(p => p.id === bottlerTeam.captainId);
      if (!captain) return [];

      return [{
        player: { ...captain, name: bottlerTeam.name },
        value: `${lead} pts`,
        subtext: 'Lead Blown'
      }];
    }
  }
];

const processCategoryResults = (
    category: FameCategory,
    rawResults: FameResult[],
    tournament: Tournament
): FameResult[] => {
  if (rawResults.length === 0) return [];
  if (rawResults.length === 1) return rawResults;

  const { tieHandling } = category;

  switch (tieHandling.type) {
    case 'allow-ties':
      // Return all tied winners
      return rawResults;

    case 'no-winner-on-tie':
      // Return empty array if there's a tie
      return [];

    case 'tiebreaker':
      // Sort by tiebreaker function and return top
      const sorted = [...rawResults].sort((a, b) =>
          tieHandling.fn(a, b, tournament)
      );

      // Check if top results are STILL tied after tiebreaker
      const topScore = tieHandling.fn(sorted[0]!, sorted[0]!, tournament);
      const winners = sorted.filter(r =>
          tieHandling.fn(r, sorted[0]!, tournament) === topScore
      );

      return winners.slice(0, 1); // Return only the winner(s)
  }
};

// --- 3. The Computation ---
// We map over categories and execute their logic
// const activeStats = computed(() => {
//   return categories.map(cat => {
//     const result = cat.calculate(props.tournament);
//     return { ...cat, result };
//   }).filter(item => item.result !== null); // Hide categories with no data
// });
const activeStats = computed(() => {
  return categories
      .map(cat => {
        const rawResults = cat.calculate(props.tournament);
        const processedResults = processCategoryResults(cat, rawResults, props.tournament);

        return {
          ...cat,
          results: processedResults,
          hasMultipleWinners: processedResults.length > 1
        };
      })
      .filter(item => item.results.length > 0); // Hide categories with no winners
});

// --- View State ---
const isGridView = ref(false); // Default to cycling view
const currentIndex = ref(0);
let cycleInterval: ReturnType<typeof setInterval> | null = null;

const startCycle = () => {
  if (cycleInterval) clearInterval(cycleInterval);
  cycleInterval = setInterval(() => {
    if (!isGridView.value && activeStats.value.length > 0) {
      currentIndex.value = (currentIndex.value + 1) % activeStats.value.length;
    }
  }, CYCLE_DURATION); // Change category every 10 seconds
};

const stopCycle = () => {
  if (cycleInterval) clearInterval(cycleInterval);
};

const toggleView = () => {
  isGridView.value = !isGridView.value;
  if (!isGridView.value) {
    currentIndex.value = 0; // Reset to start when switching back
    startCycle();
  } else {
    stopCycle();
  }
};

const goToNext = () => {
  stopCycle();
  currentIndex.value = (currentIndex.value + 1) % activeStats.value.length;
  startCycle();
};

const goToPrevious = () => {
  stopCycle();
  currentIndex.value = currentIndex.value === 0
      ? activeStats.value.length - 1
      : currentIndex.value - 1;
  startCycle();
};

const currentStat = computed(() => {
  if (activeStats.value.length === 0) return null;
  return activeStats.value[currentIndex.value];
});

// Lifecycle
onMounted(() => {
  startCycle();
});
onUnmounted(() => {
  stopCycle();
});

</script>

<!-- ========================================
     UPDATED TEMPLATE - Supports Multiple Winners
     ======================================== -->

<template>
  <div v-if="activeStats.length > 0" class="animate-fade-in">
    <div class="mt-12 pt-8 border-t border-slate-700">

      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div class="flex items-center gap-3">
          <div class="h-8 w-1.5 bg-amber-500 rounded-full shadow-[0_0_15px_rgba(245,158,11,0.6)]"></div>
          <div>
            <h2 class="text-xl font-bold text-white uppercase tracking-widest">Hall of Fame</h2>
            <p class="text-xs text-slate-400 font-medium">Tournament Records & Superlatives</p>
          </div>
        </div>

        <button @click="toggleView"
                class="flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-xs font-bold uppercase tracking-wider"
                :class="isGridView ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'">
          <i class="ph-bold" :class="isGridView ? 'ph-squares-four' : 'ph-monitor-play'"></i>
          <span class="hidden sm:inline">{{ isGridView ? 'Grid View' : 'Cycling View' }}</span>
        </button>
      </div>

      <div v-if="!isGridView && currentStat" class="relative overflow-hidden rounded-2xl border border-slate-700 bg-slate-800/50 p-6 sm:p-10 min-h-[300px] flex items-center justify-center">

        <div class="absolute inset-0 bg-gradient-to-br opacity-80 transition-all duration-1000 ease-in-out"
             :class="currentStat.gradient"></div>

        <i :class="[currentStat.icon, currentStat.color]"
           class="ph-fill absolute -right-10 -bottom-10 text-[16rem] opacity-10 transition-all duration-700 ease-out pointer-events-none transform -rotate-12"></i>

        <Transition name="fade-slide" mode="out-in">
          <div :key="currentStat.id" class="relative z-10 w-full max-w-2xl mx-auto flex flex-col items-center text-center">

            <div class="mb-6 h-20 w-20 rounded-2xl bg-slate-900 border border-slate-700 flex items-center justify-center shadow-lg">
              <i :class="[currentStat.icon, currentStat.color]" class="ph-fill text-4xl drop-shadow-lg"></i>
            </div>

            <h3 class="text-3xl sm:text-4xl font-black uppercase tracking-widest text-white mb-2 leading-tight">
              {{ currentStat.title }}
            </h3>

            <p class="text-sm sm:text-base font-medium text-slate-400 max-w-md mx-auto mb-10 leading-relaxed">
              {{ currentStat.description }}
            </p>

            <div class="w-full flex flex-col items-center gap-4">
              <div class="text-xs font-bold text-slate-500 uppercase tracking-[0.2em]">
                {{ currentStat.hasMultipleWinners ? 'Winners' : 'Winner' }}
              </div>

              <div class="flex flex-wrap justify-center gap-3 w-full">
                <div v-for="(result, idx) in currentStat.results" :key="idx"
                     class="flex items-center justify-between gap-4 px-5 py-3 rounded-xl bg-slate-900/80 border border-slate-700 shadow-sm min-w-[280px]">

                  <span class="text-lg font-bold text-white truncate">
                    {{ result.player.name }}
                  </span>

                  <div class="flex flex-col items-end">
                    <span class="text-sm font-black" :class="currentStat.color">
                      {{ result.value }}
                    </span>
                    <span class="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      {{ result.subtext }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </Transition>

        <div class="absolute inset-y-0 left-4 right-4 flex items-center justify-between pointer-events-none">
          <button
              @click="goToPrevious"
              class="pointer-events-auto h-10 w-10 rounded-full bg-slate-900/80 border border-slate-700
           hover:bg-slate-800 hover:border-indigo-500 transition-all text-white">
            <i class="ph-bold ph-caret-left"></i>
          </button>
          <button
              @click="goToNext"
              class="pointer-events-auto h-10 w-10 rounded-full bg-slate-900/80 border border-slate-700
           hover:bg-slate-800 hover:border-indigo-500 transition-all text-white">
            <i class="ph-bold ph-caret-right"></i>
          </button>
        </div>

<!--        Counter Indicator-->
        <div class="absolute top-4 right-4 flex gap-1.5">
          <div
              v-for="(stat, idx) in activeStats"
              :key="stat.id"
              class="h-1.5 rounded-full transition-all duration-300"
              :class="idx === currentIndex ? 'w-6 bg-indigo-500' : 'w-1.5 bg-slate-600'"
          ></div>
        </div>

<!--        Progress Bar -->
<!--        <div class="absolute bottom-0 left-0 h-1 bg-slate-700 w-full overflow-hidden">-->
<!--          <div :key="currentStat.id" class="h-full bg-indigo-500 animate-progress origin-left"></div>-->
<!--        </div>-->
      </div>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">

        <div v-for="stat in activeStats" :key="stat.id"
             class="group relative bg-slate-800 rounded-xl border border-slate-700 p-4 overflow-hidden hover:border-slate-600 transition-all hover:shadow-xl hover:-translate-y-1">

          <div class="absolute inset-0 bg-gradient-to-br to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"
               :class="stat.gradient"></div>

          <i :class="[stat.icon, stat.color]"
             class="ph-fill absolute -right-6 -bottom-6 text-9xl opacity-[0.08] group-hover:opacity-[0.13] group-hover:scale-110 group-hover:rotate-12 transition-all duration-700 ease-out pointer-events-none"></i>

          <div class="relative z-10 flex flex-col h-full">
            <div class="flex items-center gap-3 mb-6">
              <div class="h-12 w-12 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center shrink-0 shadow-sm group-hover:shadow-md group-hover:scale-105 transition-all duration-300">
                <i :class="[stat.icon, stat.color]" class="ph-fill text-2xl drop-shadow-lg"></i>
              </div>

              <div class="flex-1 min-w-0">
                <div class="text-sm font-black uppercase tracking-widest text-slate-100 group-hover:text-white transition-colors leading-tight break-words">
                  {{ stat.title }}
                </div>
                <div class="text-[10px] font-medium text-slate-500 leading-tight mt-1 line-clamp-2">
                  {{ stat.description }}
                </div>
              </div>
            </div>

            <div class="flex flex-col gap-2 mt-auto pl-1">
              <div class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">
                {{ stat.hasMultipleWinners ? 'Winners' : 'Winner' }}
              </div>

              <div v-if="!stat.hasMultipleWinners" class="flex items-center justify-between gap-2 w-full">
                <div class="text-base font-bold text-white group-hover:text-amber-50 leading-tight break-words min-w-0">
                  {{ stat.results[0]?.player.name }}
                </div>
                <div class="shrink-0 flex flex-col items-end pl-2 max-w-[50%]">
                  <span class="text-xs font-bold text-white whitespace-nowrap">{{ stat.results[0]?.value }}</span>
                  <span class="text-[9px] font-bold uppercase tracking-wider text-slate-400 text-right leading-tight">{{ stat.results[0]?.subtext }}</span>
                </div>
              </div>

              <div v-else class="flex flex-col gap-1">
                <div v-for="(result, idx) in stat.results.slice(0, -1)" :key="idx"
                     class="text-sm font-bold text-white/90 leading-tight truncate">
                  {{ result.player.name }},
                </div>
                <div class="flex items-center justify-between gap-2 w-full">
                  <div class="text-sm font-bold text-white/90 leading-tight break-words">
                    {{ stat.results[stat.results.length - 1]?.player.name }}
                  </div>
                  <div class="shrink-0 flex flex-col items-end pl-2 max-w-[50%]">
                    <span class="text-xs font-bold text-white whitespace-nowrap">{{ stat.results[0]?.value }}</span>
                    <span class="text-[9px] font-bold uppercase tracking-wider text-slate-400 text-right leading-tight">{{ stat.results[0]?.subtext }}</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
/* Smooth transitions for the cycle view */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.5s ease;
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(15px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-15px);
}

/* Progress bar animation for the cycle view */
@keyframes progress {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}

.animate-progress {
  animation: progress 10s linear forwards;
}
/* Optional: Add animation for multiple winners */
.winner-enter-active,
.winner-leave-active {
  transition: all 0.3s ease;
}

.winner-enter-from,
.winner-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}
</style>
