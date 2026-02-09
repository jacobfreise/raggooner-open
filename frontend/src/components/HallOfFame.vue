<script setup lang="ts">
import {computed} from 'vue';
import type {FameCategory, Player, Team, Tournament} from '../types';
import {POINTS_SYSTEM} from "../utils/constants.ts"; // Import your types

const props = defineProps<{
  tournament: Tournament;
}>();

// --- 2. The Configuration (Add new stats here!) ---
const categories: FameCategory[] = [
  {
    id: 'mvp',
    title: 'The MVP',
    description: 'Highest total points across all stages',
    icon: 'ph-trophy',
    color: 'text-yellow-400', // Gold for the winner
    gradient: 'from-yellow-500/20',
    calculate: (t: Tournament) => {
      let maxPoints = -999;
      let winner: Player | null = null;

      t.players.forEach(p => {
        const points = p.totalPoints || 0;
        if (points > maxPoints) {
          maxPoints = points;
          winner = p;
        }
      });

      if (!winner || maxPoints < 10) return null;

      return {
        player: winner,
        value: maxPoints,
        subtext: 'Total Pts'
      };
    }
  },
  {
    id: 'inevitable',
    title: 'The Inevitable',
    description: 'Finished Top 3 in every single race participated',
    icon: 'ph-medal',
    color: 'text-yellow-500', // Deep Gold
    gradient: 'from-yellow-600/20',
    calculate: (t: Tournament) => {
      let bestCandidate: Player | null = null;
      // Track best stats for comparison
      let bestStats = { count: 0, g: 0, s: 0, b: 0 };

      t.players.forEach(p => {
        let g = 0, s = 0, b = 0;
        let valid = true;
        let count = 0;

        // 1. Analyze every race this player ran
        for (const r of t.races) {
          const pos = r.placements[p.id];
          if (pos === undefined) continue; // Didn't play, doesn't count against them

          count++;

          if (pos === 1) g++;
          else if (pos === 2) s++;
          else if (pos === 3) b++;
          else {
            valid = false; // They got 4th or worse. Disqualified.
            break;
          }
        }

        // 2. Minimum Criteria (e.g. 3 races)
        if (!valid || count < 3) return;

        // 3. The "Olympic" Tiebreaker Logic
        let isBetter = false;

        if (count > bestStats.count) {
          isBetter = true; // More races played = Automatic win
        } else if (count === bestStats.count) {
          // Tiebreaker 1: Golds
          if (g > bestStats.g) {
            isBetter = true;
          } else if (g === bestStats.g) {
            // Tiebreaker 2: Silvers
            if (s > bestStats.s) {
              isBetter = true;
            } else if (s === bestStats.s) {
              // Tiebreaker 3: Bronzes
              if (b > bestStats.b) {
                isBetter = true;
              }
            }
          }
        }

        // 4. Update the King of the Hill
        if (isBetter) {
          bestStats = { count, g, s, b };
          bestCandidate = p;
        }
      });

      if (!bestCandidate) return null;

      // 5. Format Output: "3G 1S 0B"
      return {
        player: bestCandidate,
        value: `${bestStats.g}G ${bestStats.s}S ${bestStats.b}B`,
        subtext: `in ${bestStats.count} Races`
      };
    }
  },
  {
    id: 'clutcher',
    title: 'The Clutcher',
    description: 'Biggest performance boost in Finals vs Groups',
    icon: 'ph-snowflake', // "Ice in their veins"
    color: 'text-cyan-400',
    gradient: 'from-cyan-500/20',
    calculate: (t: Tournament) => {
      let maxImprovement = -999;
      let winner: Player | null = null;

      t.players.forEach(p => {
        // 1. Get Placements for each stage
        const groupPlaces = t.races
            .filter(r => r.stage === 'groups' && r.placements[p.id] !== undefined)
            .map(r => r.placements[p.id]!);

        const finalsPlaces = t.races
            .filter(r => r.stage === 'finals' && r.placements[p.id] !== undefined)
            .map(r => r.placements[p.id]!);

        // Must have played at least 1 race in BOTH stages to qualify
        if (groupPlaces.length === 0 || finalsPlaces.length === 0) return;

        // 2. Calculate Averages
        const groupAvg = groupPlaces.reduce((a,b)=>a+b,0) / groupPlaces.length;
        const finalsAvg = finalsPlaces.reduce((a,b)=>a+b,0) / finalsPlaces.length;

        // 3. Calculate Improvement (Positive = Lower/Better placement number)
        // e.g. Group 6.0 - Finals 2.0 = +4.0 Improvement
        const diff = groupAvg - finalsAvg;

        if (diff > maxImprovement && diff > 0 && diff >= 1.5) {
          maxImprovement = diff;
          winner = p;
        }
      });

      if (!winner) return null;

      return {
        player: winner,
        value: `+${maxImprovement.toFixed(1)}`,
        subtext: 'avg Place Improv.'
      };
    }
  },
  {
    id: 'choker',
    title: 'The Choker',
    description: 'Biggest performance drop-off in Finals',
    icon: 'ph-skull', // or ph-warning-circle
    color: 'text-rose-500', // Distinct red for "Danger"
    gradient: 'from-rose-600/20',
    calculate: (t: Tournament) => {
      let maxDropoff = -999;
      let victim: Player | null = null;

      t.players.forEach(p => {
        const groupPlaces = t.races
            .filter(r => r.stage === 'groups' && r.placements[p.id] !== undefined)
            .map(r => r.placements[p.id]!);

        const finalsPlaces = t.races
            .filter(r => r.stage === 'finals' && r.placements[p.id] !== undefined)
            .map(r => r.placements[p.id]!);

        if (groupPlaces.length === 0 || finalsPlaces.length === 0) return;

        const groupAvg = groupPlaces.reduce((a,b)=>a+b,0) / groupPlaces.length;
        const finalsAvg = finalsPlaces.reduce((a,b)=>a+b,0) / finalsPlaces.length;

        // 3. Calculate Dropoff (Positive = Higher/Worse placement number)
        // e.g. Finals 8.0 - Group 2.0 = +6.0 Dropoff
        const dropoff = finalsAvg - groupAvg;

        // Threshold: Must have dropped at least 1.5 places on average to count
        if (dropoff > maxDropoff && dropoff >= 1.5) {
          maxDropoff = dropoff;
          victim = p;
        }
      });

      if (!victim) return null;

      return {
        player: victim,
        value: `-${maxDropoff.toFixed(1)}`,
        subtext: 'avg Place Drop'
      };
    }
  },
  {
    id: 'volatility',
    title: 'The Coinflip',
    description: 'Most inconsistent placements (High Variance)',
    icon: 'ph-coin-vertical',
    color: 'text-purple-400',
    gradient: 'from-violet-500/20',
    calculate: (t: Tournament) => {
      let maxDev = 0;
      let candidate: Player | null = null;

      t.players.forEach(p => {
        // 1. Get all placements for this player
        const places: number[] = [];
        t.races.forEach(r => {
          if (r.placements[p.id]) places.push(r.placements[p.id]!);
        });

        if (places.length < 3) return; // Need data for deviation

        // 2. Calculate Standard Deviation
        const mean = places.reduce((a, b) => a + b, 0) / places.length;
        const variance = places.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / places.length;
        const stdDev = Math.sqrt(variance);

        if (stdDev > maxDev) {
          maxDev = stdDev;
          candidate = p;
        }
      });

      return candidate ? {
        player: candidate,
        value: maxDev.toFixed(2),
        subtext: 'Std Dev'
      } : null;
    }
  },
  {
    id: 'metronome',
    title: 'The Metronome', // or 'The Machine'
    description: 'Most consistent placements (Low Variance)',
    icon: 'ph-wave-sine', // Represents the frequency/consistency
    color: 'text-indigo-400',
    gradient: 'from-indigo-500/20',
    calculate: (t: Tournament) => {
      let minStdDev = 999;
      let winner: Player | null = null;
      let winnerAvg = 0;

      t.players.forEach(p => {
        // 1. Collect all placements
        const placements: number[] = [];
        t.races.forEach(r => {
          const pos = r.placements[p.id];
          if (pos !== undefined) placements.push(pos);
        });

        // 2. Minimum Sample Size (e.g. 5 races)
        // Standard deviation is meaningless with too few data points
        if (placements.length < 5) return;

        // 3. Calculate Mean (Average)
        const n = placements.length;
        const mean = placements.reduce((a, b) => a + b, 0) / n;

        // 4. Calculate Variance
        // Sum of squared differences from the mean
        const sumSquaredDiffs = placements.reduce((sum, val) => {
          const diff = val - mean;
          return sum + (diff * diff);
        }, 0);

        const variance = sumSquaredDiffs / n;

        // 5. Calculate Standard Deviation
        const stdDev = Math.sqrt(variance);

        // 6. Find the Lowest
        if (stdDev < minStdDev) {
          minStdDev = stdDev;
          winner = p;
          winnerAvg = mean;
        }
      });

      if (!winner) return null;

      return {
        player: winner,
        value: `±${minStdDev.toFixed(2)}`,
        // Shows their "usual" spot (e.g. "Avg Place 2.5")
        subtext: `Avg Place ${winnerAvg.toFixed(1)}`
      };
    }
  },
  {
    id: 'the_yoyo',
    title: 'The YOYO',
    description: 'Most immediate jumps between Top 3 and Bottom 3',
    icon: 'ph-arrows-vertical',
    color: 'text-fuchsia-400',
    gradient: 'from-fuchsia-500/20',
    calculate: (t: Tournament) => {
      let maxYoyos = 0;
      let winner: Player | null = null;

      t.players.forEach(p => {
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

          if (fieldSize < 6) return; // Skip tiny lobbies

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
          winner = p;
        }
      });

      if (!winner || maxYoyos < 3) return null;

      return {
        player: winner,
        value: maxYoyos,
        subtext: maxYoyos === 1 ? 'Whiplash' : 'Whiplashes'
      };
    }
  },
  {
    id: 'the_anchor',
    title: 'The Anchor',
    description: 'Most last place finishes',
    icon: 'ph-anchor',
    color: 'text-slate-500', // Grey for shame
    gradient: 'from-rose-500/20',
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
      let victim: Player | null = null;
      Object.entries(lastCounts).forEach(([pid, count]) => {
        if (count > maxLasts) {
          maxLasts = count;
          victim = t.players.find(p => p.id === pid) || null;
        }
      });

      if (maxLasts < 2) return null;

      return victim ? {
        player: victim,
        value: maxLasts,
        subtext: 'Last Places'
      } : null;
    }
  },
  {
    id: 'bridesmaid',
    title: 'Always the Bridesmaid',
    description: 'Most 2nd place finishes',
    icon: 'ph-heart-break',
    color: 'text-pink-400',
    gradient: 'from-pink-500/20',
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
      let runnerUp: Player | null = null;

      Object.entries(seconds).forEach(([pid, count]) => {
        if (count > maxSeconds) {
          maxSeconds = count;
          runnerUp = t.players.find(p => p.id === pid) || null;
        }
      });

      if (maxSeconds < 2) return null;

      return runnerUp ? {
        player: runnerUp,
        value: maxSeconds,
        subtext: maxSeconds > 1 ? 'Silvers' : 'Silver'
      } : null;
    }
  },
  {
    id: 'the_npc',
    title: 'The NPC',
    description: 'Closest to the exact middle of the pack',
    icon: 'ph-robot',
    color: 'text-gray-400',
    gradient: 'from-gray-500/20',
    calculate: (t: Tournament) => {
      // 1. Set Cutoff: Deviation must be <= 1.0 position to qualify
      let bestDev = 1.6;
      let winner: Player | null = null;
      let winnerAvgMiddle = 0;

      t.players.forEach(p => {
        let totalDev = 0;
        let totalMiddle = 0;
        let raceCount = 0;

        t.races.forEach(r => {
          const pos = r.placements[p.id];
          // Skip if player didn't race
          if (pos === undefined) return;

          // Get all positions to find the true "Last Place"
          const allPositions = Object.values(r.placements);
          if (allPositions.length === 0) return;

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
        if (raceCount < 3) return;

        const avgDev = totalDev / raceCount;

        // Check if this is the new lowest deviation (closer to 0 is better)
        if (avgDev < bestDev) {
          bestDev = avgDev;
          winner = p;
          winnerAvgMiddle = totalMiddle / raceCount;
        }
      });

      if (!winner) return null;

      return {
        player: winner,
        // e.g. "0.50 Dev"
        value: `${bestDev.toFixed(2)} Dev`,
        // e.g. "from Middle 6.5"
        subtext: `from Middle ${winnerAvgMiddle.toFixed(1)}`
      };
    }
  },
  {
    id: 'rising_star',
    title: 'The Rising Star',
    description: 'Best improvement trend across the entire tournament',
    icon: 'ph-chart-line-up',
    color: 'text-green-400',
    gradient: 'from-green-500/20',
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
        if (n < 4) return;

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

        if (denominator === 0) return; // Avoid division by zero

        const slope = numerator / denominator;

        // 4. Check for best improvement (Most negative slope wins)
        // We set a threshold (e.g. -0.5) to ensure it's actual improvement, not just noise
        if (slope < bestSlope && slope < -0.3) {
          bestSlope = slope;
          winner = p;
        }
      });

      if (!winner) return null;

      return {
        player: winner,
        value: Math.abs(bestSlope).toFixed(2), // Show as positive number for display
        subtext: 'Places / Race' // e.g. "1.50 Places / Race"
      };
    }
  },
  {
    id: 'hard_carry',
    title: 'The Carry',
    description: 'Highest % contribution to team score',
    icon: 'ph-backpack',
    color: 'text-rose-400',
    gradient: 'from-rose-500/20',
    calculate: (t) => {
      let bestPlayer: Player | null = null;
      let highestPercentage = 0;

      t.teams.forEach(team => {
        const teamTotalPoints = (team.points || 0) + (team.finalsPoints || 0);
        if (teamTotalPoints === 0) return; // Avoid divide by zero

        // Get all players in this team
        const members = t.players.filter(p =>
            p.id === team.captainId || team.memberIds.includes(p.id)
        );

        members.forEach(p => {
          const points = p.totalPoints || 0;
          const pct = points / teamTotalPoints;

          if (pct > highestPercentage) {
            highestPercentage = pct;
            bestPlayer = p;
          } else if (pct === highestPercentage) {
            if (!bestPlayer || p.totalPoints! > bestPlayer?.totalPoints!) {
              bestPlayer = p;
            }
          }
        });
      });

      if (!bestPlayer || highestPercentage < 0.6) return null; // Only show if they carried >60%

      return {
        player: bestPlayer,
        value: (highestPercentage * 100).toFixed(0) + '%',
        subtext: 'of Team Pts'
      };
    }
  },
  {
    id: 'most_wins',
    title: 'The Speedster',
    description: 'Most 1st place finishes in races',
    icon: 'ph-crown',
    color: 'text-amber-400',
    gradient: 'from-amber-500/20',
    calculate: (t) => {
      const wins: Record<string, number> = {};

      // 1. Iterate over every race history
      t.races.forEach(race => {
        // placements is { "playerId": position }
        // We want to find the ID where position === 1
        const winnerId = Object.keys(race.placements).find(
            pid => race.placements[pid] === 1
        );

        if (winnerId) {
          wins[winnerId] = (wins[winnerId] || 0) + 1;
        }
      });

      // 2. Find the max
      let maxWins = 0;
      let winnerId = '';

      Object.entries(wins).forEach(([pid, count]) => {
        if (count > maxWins) {
          maxWins = count;
          winnerId = pid;
        }
      });

      if (maxWins === 0) return null;

      const player = t.players.find(p => p.id === winnerId);
      if (!player) return null;

      return {
        player: player,
        value: maxWins,
        subtext: maxWins === 1 ? 'Victory' : 'Victories'
      };
    }
  },
  {
    id: 'consistency',
    title: 'The Machine',
    description: 'Best average placement',
    icon: 'ph-trend-up',
    color: 'text-emerald-400',
    gradient: 'from-emerald-500/20',
    calculate: (t) => {
      let bestAvg = 99;
      let bestP: Player | null = null;

      t.players.forEach(p => {
        const places = t.races
            .map(r => r.placements[p.id])
            .filter(pos => pos !== undefined);

        if (places.length < 3) return;
        const avg = places.reduce((a,b)=>a+b,0) / places.length;

        if (avg < bestAvg) {
          bestAvg = avg;
          bestP = p;
        }
      });

      return bestP ? { player: bestP, value: bestAvg.toFixed(1), subtext: 'Avg Place' } : null;
    }
  },
  {
    id: 'pacifist',
    title: 'The Pacifist',
    description: 'Best average placement... with ZERO wins',
    icon: 'ph-hand-peace',
    color: 'text-blue-400',
    gradient: 'from-blue-500/20',
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
      let bestAvg = 999;
      let candidateId = '';

      Object.entries(stats).forEach(([pid, stat]) => {
        if (stat.wins === 0 && stat.count >= 3) { // Min 3 races to qualify
          const avg = stat.sum / stat.count;
          if (avg < bestAvg && avg <= 4) {
            bestAvg = avg;
            candidateId = pid;
          }
        }
      });

      if (!candidateId) return null;

      const player = t.players.find(p => p.id === candidateId);
      return player ? {
        player: player,
        value: bestAvg.toFixed(1),
        subtext: 'Avg Place'
      } : null;
    }
  },
  {
    id: 'liability',
    title: 'The Liability',
    description: 'Lowest % contribution to team score',
    icon: 'ph-warning-octagon', // A warning sign fits perfectly
    color: 'text-orange-400',
    gradient: 'from-orange-500/20',
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

      // Safety check: if minPct is still 1.0, nobody qualified
      if (!liability || minPct > 0.12) return null;

      return {
        player: liability,
        value: (minPct * 100).toFixed(1) + '%',
        subtext: 'of team pts'
      };
    }
  },
  {
    id: 'team_podiums',
    title: 'The Podium Hogs',
    description: 'Most combined Top 3 finishes (Gold/Silver/Bronze) by the team.',
    icon: 'ph-steps',
    color: 'text-amber-400',
    gradient: 'from-amber-500/20',
    calculate: (t: Tournament) => {
      let maxTotal = 0;
      let bestTeam: Team | null = null;
      let bestStats = { g: 0, s: 0, b: 0 };

      for (const team of t.teams) {
        let g = 0, s = 0, b = 0;
        const roster = [team.captainId, ...team.memberIds];

        // 1. Tally up medals for every member across all races
        t.races.forEach(r => {
          roster.forEach(pid => {
            const pos = r.placements[pid];
            if (pos === 1) g++;
            else if (pos === 2) s++;
            else if (pos === 3) b++;
          });
        });

        const total = g + s + b;

        // 2. Determine Winner (Prioritize Total Count first)
        if (total > maxTotal) {
          maxTotal = total;
          bestTeam = team;
          bestStats = { g, s, b };
        }
        // Tie-breaker: If total count is same, check Gold count
        else if (total === maxTotal && total > 0) {
          if (g > bestStats.g) {
            bestTeam = team;
            bestStats = { g, s, b };
          }
        }
      }

      if (!bestTeam) return null;

      // 3. Return the Captain as the "Face" of the card, but use Team Name
      const captain = t.players.find(p => p.id === bestTeam!.captainId);
      if (!captain) return null;

      return {
        // Clone the captain but overwrite name with Team Name
        player: { ...captain, name: bestTeam.name },
        value: `${bestStats.g}G ${bestStats.s}S ${bestStats.b}B`,
        subtext: 'Team Total'
      };
    }
  },
  {
    id: 'one_two_punch',
    title: 'The 1-2 Punch',
    description: 'Most races finishing 1st and 2nd together.',
    icon: 'ph-fist', // Or ph-lightning
    color: 'text-rose-500',
    gradient: 'from-rose-600/20',
    calculate: (t: Tournament) => {
      let maxCount = 0;
      let winner: Team | null = null;

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
          winner = team;
        }
      }

      if (!winner || maxCount === 0) return null;

      return {
        player: { ...t.players.find(p => p.id === winner!.captainId)!, name: winner.name },
        value: `${maxCount}x`,
        subtext: 'Perfect Races'
      };
    }
  },
  {
    id: 'balanced_attack',
    title: 'Balanced Attack',
    description: 'Smallest point gap between teammates (No weak links).',
    icon: 'ph-scales',
    color: 'text-teal-400',
    gradient: 'from-teal-500/20',
    calculate: (t: Tournament) => {
      let minGap = 999;
      let winner: Team | null = null;
      let winnerAvg = 0;

      for (const team of t.teams) {
        const roster = [team.captainId, ...team.memberIds];

        // 1. Get total points for each member
        const memberPoints = roster.map(pid => {
          const p = t.players.find(pl => pl.id === pid);
          return p?.totalPoints || 0;
        });

        // Ignore empty teams or solo teams (need at least 2 to compare)
        if (memberPoints.length < 2) continue;
        if (memberPoints.reduce((a,b)=>a+b,0) === 0) continue; // Ignore 0 point teams

        // 2. Calculate Gap (Max - Min)
        const max = Math.max(...memberPoints);
        const min = Math.min(...memberPoints);
        const gap = max - min;
        const avg = memberPoints.reduce((a,b)=>a+b,0) / memberPoints.length;

        // 3. Find smallest gap (Higher average points breaks ties)
        if (gap < minGap) {
          minGap = gap;
          winner = team;
          winnerAvg = avg;
        } else if (gap === minGap) {
          // Tie-breaker: Who scored more?
          if (avg > winnerAvg) {
            winner = team;
            winnerAvg = avg;
          }
        }
      }

      if (!winner) return null;

      return {
        player: { ...t.players.find(p => p.id === winner!.captainId)!, name: winner.name },
        value: `${minGap} pts`,
        subtext: 'Spread' // e.g. "12 pts Spread"
      };
    }
  },
  {
    id: 'high_rollers',
    title: 'High Rollers',
    description: 'Highest team score achieved in a single race.',
    icon: 'ph-trend-up',
    color: 'text-emerald-400',
    gradient: 'from-emerald-500/20',
    calculate: (t: Tournament) => {
      const SYSTEM = t.pointsSystem || POINTS_SYSTEM;

      let maxRaceScore = 0;
      let winner: Team | null = null;

      for (const team of t.teams) {
        const roster = [team.captainId, ...team.memberIds];

        // CHANGE: Use for...of instead of .forEach
        for (const r of t.races) {
          let currentRaceScore = 0;

          // Inner loop can stay forEach since it doesn't set 'winner',
          // but for...of is cleaner.
          for (const pid of roster) {
            const pos = r.placements[pid];
            if (pos) {
              currentRaceScore += (SYSTEM[pos] || 1);
            }
          }

          if (currentRaceScore > maxRaceScore) {
            maxRaceScore = currentRaceScore;
            winner = team;
          }
        }
      }

      if (!winner) return null;

      return {
        player: { ...t.players.find(p => p.id === winner!.captainId)!, name: winner.name },
        value: `${maxRaceScore} pts`,
        subtext: 'Single Race'
      };
    }
  },
];

// --- 3. The Computation ---
// We map over categories and execute their logic
const activeStats = computed(() => {
  return categories.map(cat => {
    const result = cat.calculate(props.tournament);
    return { ...cat, result };
  }).filter(item => item.result !== null); // Hide categories with no data
});

</script>

<template>
  <div v-if="activeStats.length > 0" class="animate-fade-in">
    <div class="mt-12 pt-8 border-t border-slate-700">
      <div class="flex items-center gap-3 mb-6">
        <div class="h-8 w-1.5 bg-amber-500 rounded-full shadow-[0_0_15px_rgba(245,158,11,0.6)]"></div>
        <div>
          <h2 class="text-xl font-bold text-white uppercase tracking-widest">Hall of Fame</h2>
          <p class="text-xs text-slate-400 font-medium">Tournament Records & Superlatives</p>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

        <div v-for="stat in activeStats" :key="stat.id"
             class="group relative bg-slate-800 rounded-xl border border-slate-700 p-4 overflow-hidden hover:border-slate-600 transition-all hover:shadow-xl hover:-translate-y-1">

          <div class="absolute inset-0 bg-gradient-to-br to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"
               :class="stat.gradient"></div>

          <i :class="[stat.icon, stat.color]"
             class="ph-fill absolute -right-6 -bottom-6 text-9xl opacity-[0.03] group-hover:opacity-[0.08] group-hover:scale-110 group-hover:rotate-12 transition-all duration-700 ease-out pointer-events-none"></i>

          <div class="relative z-10 flex flex-col h-full">

            <div class="flex items-center gap-3 mb-6">
              <div class="h-12 w-12 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center shrink-0 shadow-sm group-hover:shadow-md group-hover:scale-105 transition-all duration-300">
                <i :class="[stat.icon, stat.color]" class="ph-fill text-2xl drop-shadow-lg"></i>
              </div>

              <div class="flex-1 min-w-0">
                <div class="text-sm font-black uppercase tracking-widest text-slate-100 group-hover:text-white transition-colors leading-tight">
                  {{ stat.title }}
                </div>
                <div class="text-[10px] font-medium text-slate-500 leading-tight mt-1 line-clamp-2">
                  {{ stat.description }}
                </div>
              </div>
            </div>

            <div class="flex flex-col gap-2 mt-auto pl-1">
              <div class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-0.5">
                Winner
              </div>

              <div class="flex items-center justify-between gap-2 w-full">
                <div class="text-lg font-bold text-white group-hover:text-amber-50 leading-tight break-words min-w-0">
                  {{ stat.result?.player.name }}
                </div>

                <div class="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded bg-slate-900/80 border border-slate-700/80 backdrop-blur-sm group-hover:border-slate-600 transition-colors">
                  <span class="text-xs font-bold text-white whitespace-nowrap">
                    {{ stat.result?.value }}
                  </span>
                  <span class="text-[10px] font-bold uppercase tracking-wide text-slate-400 whitespace-nowrap">
                    {{ stat.result?.subtext }}
                  </span>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  </div>
</template>