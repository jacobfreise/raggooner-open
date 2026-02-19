<script setup lang="ts">
import {ref, computed, onMounted, inject, type Ref} from 'vue';
import { collection, query, getDocs, orderBy, where, doc, setDoc, increment } from 'firebase/firestore';
import { db, auth } from '../firebase';
import type {GlobalPlayer, Tournament, Season} from '../types';
import {compareTeams, recalculateTournamentScores} from "../utils/utils.ts";
import {POINTS_SYSTEM} from "../utils/constants.ts";
import {getCached, setCache} from "../utils/cache.ts";

// Derived types reconstructed from tournaments (no separate Firestore collections)
interface DerivedParticipation {
  playerId: string;
  tournamentId: string;
  uma: string;
  teamId?: string;
  totalPoints: number;
}

interface DerivedRace {
  tournamentId: string;
  stage: string;
  group: string;
  raceNumber: number;
  placements: Record<string, number>;
  umaMapping: Record<string, string>;
}

// Inject Changelog functions from App.vue
const openChangelog = inject<() => void>('openChangelog')!;
const hasNewUpdates = inject<Ref<boolean>>('hasNewUpdates')!;

const APP_ID = 'default-app';

const loading = ref(true);
const activeTab = ref<'overview' | 'players' | 'umas' | 'tierlist' | 'tournaments'>('overview');

// Data
const players = ref<GlobalPlayer[]>([]);
const participations = ref<DerivedParticipation[]>([]);
const races = ref<DerivedRace[]>([]);
const tournaments = ref<Tournament[]>([]);

// Filters
const searchQuery = ref('');
const umaSearchQuery = ref('');
const minTournaments = ref(1);

const seasons = ref<Season[]>([]);
const selectedSeasons = ref<string[]>(['season-2']);

const expandedPlayerId = ref<string | null>(null);
const expandedDetailTab = ref<'umas' | 'tournaments'>('tournaments');
const playerUmaSortKey = ref('racesPlayed');
const playerUmaSortDesc = ref(true);
const playerTournamentSortKey = ref('totalPoints');
const playerTournamentSortDesc = ref(true);

const expandedUmaName = ref<string | null>(null);
const expandedUmaDetailTab = ref<'players' | 'tournaments'>('tournaments');
const umaPlayerSortKey = ref('racesPlayed');
const umaPlayerSortDesc = ref(true);
const umaTournamentSortKey = ref('tournamentName');
const umaTournamentSortDesc = ref(false);

const togglePlayerExpand = (playerId: string) => {
  if (expandedPlayerId.value === playerId) {
    expandedPlayerId.value = null;
  } else {
    expandedPlayerId.value = playerId;
    expandedDetailTab.value = 'tournaments';
    playerUmaSortKey.value = 'racesPlayed';
    playerUmaSortDesc.value = true;
    playerTournamentSortKey.value = 'totalPoints';
    playerTournamentSortDesc.value = true;
  }
};

const togglePlayerUmaSort = (key: string) => {
  if (playerUmaSortKey.value === key) {
    playerUmaSortDesc.value = !playerUmaSortDesc.value;
  } else {
    playerUmaSortKey.value = key;
    playerUmaSortDesc.value = true;
  }
};

const toggleUmaExpand = (umaName: string) => {
  if (expandedUmaName.value === umaName) {
    expandedUmaName.value = null;
  } else {
    expandedUmaName.value = umaName;
    expandedUmaDetailTab.value = 'tournaments';
    umaPlayerSortKey.value = 'racesPlayed';
    umaPlayerSortDesc.value = true;
    umaTournamentSortKey.value = 'tournamentName';
    umaTournamentSortDesc.value = false;
  }
};

const toggleUmaPlayerSort = (key: string) => {
  if (umaPlayerSortKey.value === key) {
    umaPlayerSortDesc.value = !umaPlayerSortDesc.value;
  } else {
    umaPlayerSortKey.value = key;
    umaPlayerSortDesc.value = true;
  }
};

const toggleUmaTournamentSort = (key: string) => {
  if (umaTournamentSortKey.value === key) {
    umaTournamentSortDesc.value = !umaTournamentSortDesc.value;
  } else {
    umaTournamentSortKey.value = key;
    umaTournamentSortDesc.value = true;
  }
};

const expandedPlayerUmas = computed(() => {
  if (!expandedPlayerId.value) return [];
  const player = playerRankings.value.find(p => p.player.id === expandedPlayerId.value);
  if (!player) return [];

  const umaRows = Array.from(player.umas.entries()).map(([name, data]) => {
    return {
      name,
      picks: data.tournamentIds.size,
      racesPlayed: data.racesPlayed,
      wins: data.wins,
      winRate: data.racesPlayed > 0 ? Math.round((data.wins / data.racesPlayed) * 100 * 10) / 10 : 0,
      avgPoints: data.racesPlayed > 0 ? Math.round((data.totalPoints / data.racesPlayed) * 10) / 10 : 0,
      avgPosition: data.racesPlayed > 0 ? Math.round((data.totalPosition / data.racesPlayed) * 10) / 10 : 0,
      opponentsFaced: 0,
      opponentsBeaten: 0,
      dominance: 0,
    };
  });

  // Calculate per-uma dominance from race data
  filteredRaces.value.forEach(race => {
    const playersInRace = Object.keys(race.placements).length;
    if (playersInRace <= 1) return;

    const playerId = expandedPlayerId.value!;
    const position = race.placements[playerId];
    if (position === undefined) return;

    const umaName = race.umaMapping?.[playerId];
    if (!umaName) return;

    const row = umaRows.find(r => r.name === umaName);
    if (row) {
      row.opponentsFaced += (playersInRace - 1);
      row.opponentsBeaten += (playersInRace - position);
    }
  });

  umaRows.forEach(row => {
    row.dominance = row.opponentsFaced > 0
      ? Math.round((row.opponentsBeaten / row.opponentsFaced) * 100 * 10) / 10
      : 0;
  });

  // Sort
  umaRows.sort((a, b) => {
    let valA: any = playerUmaSortKey.value === 'name' ? a.name.toLowerCase() : (a as any)[playerUmaSortKey.value];
    let valB: any = playerUmaSortKey.value === 'name' ? b.name.toLowerCase() : (b as any)[playerUmaSortKey.value];
    const modifier = playerUmaSortDesc.value ? -1 : 1;
    if (valA < valB) return -1 * modifier;
    if (valA > valB) return 1 * modifier;
    return 0;
  });

  return umaRows;
});

const togglePlayerTournamentSort = (key: string) => {
  if (playerTournamentSortKey.value === key) {
    playerTournamentSortDesc.value = !playerTournamentSortDesc.value;
  } else {
    playerTournamentSortKey.value = key;
    playerTournamentSortDesc.value = true;
  }
};

const expandedPlayerTournaments = computed(() => {
  if (!expandedPlayerId.value) return [];
  const playerId = expandedPlayerId.value;

  // Get this player's participations
  const playerParts = filteredParticipations.value.filter(p => p.playerId === playerId);
  if (playerParts.length === 0) return [];

  const rows = playerParts.map(part => {
    const t = tournaments.value.find(tourney => tourney.id === part.tournamentId);
    const tName = t?.name || part.tournamentId;
    const tStatus = t?.status || 'unknown';

    // Count races, wins, dominance for this player in this tournament
    const tournamentRaces = filteredRaces.value.filter(r => r.tournamentId === part.tournamentId);
    let races = 0;
    let wins = 0;
    let opponentsFaced = 0;
    let opponentsBeaten = 0;
    let totalPosition = 0;
    let totalPoints = 0;

    const pointSystem = t?.pointsSystem || POINTS_SYSTEM;

    tournamentRaces.forEach(race => {
      const position = race.placements[playerId];
      if (position === undefined) return;
      const playersInRace = Object.keys(race.placements).length;
      if (playersInRace <= 1) return;

      races++;
      totalPosition += position;
      totalPoints += pointSystem[position] || 0;
      if (position === 1) wins++;
      opponentsFaced += (playersInRace - 1);
      opponentsBeaten += (playersInRace - position);
    });

    // Determine finals status using tournament teams data
    const teams = t?.teams || [];
    const playerTeam = teams.find(tm =>
      (part.teamId && tm.id === part.teamId) ||
      tm.captainId === playerId ||
      tm.memberIds.includes(playerId)
    );
    const uniqueGroups = new Set(teams.map(tm => tm.group));
    const hasGroups = uniqueGroups.size > 1;
    // Determine the winning team (best finalsPoints among inFinals teams)
    const finalistTeams = teams.filter(tm => tm.inFinals);
    const winningTeam = finalistTeams.length > 0 && t
      ? [...finalistTeams].sort((a, b) => compareTeams(a, b, true, t, true))[0]
      : null;

    // Check if player was a wildcard
    const wildcards = t?.wildcards || [];
    const playerWildcards = wildcards.filter(wc => wc.playerId === playerId);
    const isWildcard = playerWildcards.length > 0;
    const wildcardGroups = playerWildcards.map(wc => wc.group);

    let finalsStatus: 'winner' | 'no-groups' | 'finals' | 'eliminated' | '-' = '-';
    if (teams.length === 0 && tStatus === 'active') {
      finalsStatus = '-';
    } else if (playerTeam) {
      if (winningTeam && playerTeam.id === winningTeam.id && tStatus === 'completed') finalsStatus = 'winner';
      else if (!hasGroups) finalsStatus = 'no-groups';
      else if (playerTeam.inFinals) finalsStatus = 'finals';
      else if (hasGroups) finalsStatus = 'eliminated';
    }

    return {
      tournamentId: part.tournamentId,
      tournamentName: tName,
      status: tStatus,
      uma: part.uma || '-',
      isWildcard,
      wildcardGroups,
      finalsStatus,
      races,
      wins,
      winRate: races > 0 ? Math.round((wins / races) * 100 * 10) / 10 : 0,
      totalPoints,
      avgPoints: races > 0 ? Math.round((totalPoints / races) * 10) / 10 : 0,
      dominance: opponentsFaced > 0 ? Math.round((opponentsBeaten / opponentsFaced) * 100 * 10) / 10 : 0,
      avgPosition: races > 0 ? Math.round((totalPosition / races) * 10) / 10 : 0,
    };
  });

  // Sort
  rows.sort((a, b) => {
    let valA: any = playerTournamentSortKey.value === 'tournamentName' ? a.tournamentName.toLowerCase() : (a as any)[playerTournamentSortKey.value];
    let valB: any = playerTournamentSortKey.value === 'tournamentName' ? b.tournamentName.toLowerCase() : (b as any)[playerTournamentSortKey.value];
    const modifier = playerTournamentSortDesc.value ? -1 : 1;
    if (valA < valB) return -1 * modifier;
    if (valA > valB) return 1 * modifier;
    return 0;
  });

  return rows;
});

// --- UMA DRILLDOWN: Tournament appearances ---
const expandedUmaTournaments = computed(() => {
  if (!expandedUmaName.value) return [];
  const umaName = expandedUmaName.value;

  // Find all participations where this uma was picked
  const umaParts = filteredParticipations.value.filter(p => p.uma === umaName);
  if (umaParts.length === 0) return [];

  const rows = umaParts.map(part => {
    const t = tournaments.value.find(tourney => tourney.id === part.tournamentId);
    const tName = t?.name || part.tournamentId;
    const player = players.value.find(p => p.id === part.playerId);
    const playerName = player?.name || part.playerId;

    // Race stats for this player in this tournament
    const tournamentRaces = filteredRaces.value.filter(r => r.tournamentId === part.tournamentId);
    let races = 0, wins = 0, opponentsFaced = 0, opponentsBeaten = 0, totalPosition = 0, totalPoints = 0;
    const pointSystem = t?.pointsSystem || POINTS_SYSTEM;

    tournamentRaces.forEach(race => {
      const position = race.placements[part.playerId];
      if (position === undefined) return;
      const playersInRace = Object.keys(race.placements).length;
      if (playersInRace <= 1) return;
      races++;
      totalPosition += position;
      totalPoints += pointSystem[position] || 0;
      if (position === 1) wins++;
      opponentsFaced += (playersInRace - 1);
      opponentsBeaten += (playersInRace - position);
    });

    return {
      tournamentId: part.tournamentId,
      tournamentName: tName,
      playerId: part.playerId,
      playerName,
      races,
      wins,
      winRate: races > 0 ? Math.round((wins / races) * 100 * 10) / 10 : 0,
      totalPoints,
      avgPoints: races > 0 ? Math.round((totalPoints / races) * 10) / 10 : 0,
      dominance: opponentsFaced > 0 ? Math.round((opponentsBeaten / opponentsFaced) * 100 * 10) / 10 : 0,
      avgPosition: races > 0 ? Math.round((totalPosition / races) * 10) / 10 : 0,
    };
  });

  rows.sort((a, b) => {
    const key = umaTournamentSortKey.value;
    let valA: any = key === 'tournamentName' ? a.tournamentName.toLowerCase() : key === 'playerName' ? a.playerName.toLowerCase() : (a as any)[key];
    let valB: any = key === 'tournamentName' ? b.tournamentName.toLowerCase() : key === 'playerName' ? b.playerName.toLowerCase() : (b as any)[key];
    const modifier = umaTournamentSortDesc.value ? -1 : 1;
    if (valA < valB) return -1 * modifier;
    if (valA > valB) return 1 * modifier;
    return 0;
  });

  return rows;
});

// --- UMA DRILLDOWN: Per-player stats ---
const expandedUmaPlayers = computed(() => {
  if (!expandedUmaName.value) return [];
  const umaName = expandedUmaName.value;

  const umaParts = filteredParticipations.value.filter(p => p.uma === umaName);
  if (umaParts.length === 0) return [];

  // Group by player
  const playerMap = new Map<string, { playerId: string; playerName: string; tournaments: number; races: number; wins: number; opponentsFaced: number; opponentsBeaten: number; totalPosition: number; totalPoints: number }>();

  for (const part of umaParts) {
    const player = players.value.find(p => p.id === part.playerId);
    const playerName = player?.name || part.playerId;

    if (!playerMap.has(part.playerId)) {
      playerMap.set(part.playerId, { playerId: part.playerId, playerName, tournaments: 0, races: 0, wins: 0, opponentsFaced: 0, opponentsBeaten: 0, totalPosition: 0, totalPoints: 0 });
    }
    const entry = playerMap.get(part.playerId)!;
    entry.tournaments++;

    const t = tournaments.value.find(tourney => tourney.id === part.tournamentId);
    const pointSystem = t?.pointsSystem || POINTS_SYSTEM;
    const tournamentRaces = filteredRaces.value.filter(r => r.tournamentId === part.tournamentId);

    tournamentRaces.forEach(race => {
      const position = race.placements[part.playerId];
      if (position === undefined) return;
      const playersInRace = Object.keys(race.placements).length;
      if (playersInRace <= 1) return;
      entry.races++;
      entry.totalPosition += position;
      entry.totalPoints += (pointSystem[position] || 0);
      if (position === 1) entry.wins++;
      entry.opponentsFaced += (playersInRace - 1);
      entry.opponentsBeaten += (playersInRace - position);
    });
  }

  const rows = Array.from(playerMap.values()).map(e => ({
    playerId: e.playerId,
    playerName: e.playerName,
    tournaments: e.tournaments,
    racesPlayed: e.races,
    wins: e.wins,
    winRate: e.races > 0 ? Math.round((e.wins / e.races) * 100 * 10) / 10 : 0,
    totalPoints: e.totalPoints,
    avgPoints: e.races > 0 ? Math.round((e.totalPoints / e.races) * 10) / 10 : 0,
    dominance: e.opponentsFaced > 0 ? Math.round((e.opponentsBeaten / e.opponentsFaced) * 100 * 10) / 10 : 0,
    avgPosition: e.races > 0 ? Math.round((e.totalPosition / e.races) * 10) / 10 : 0,
  }));

  rows.sort((a, b) => {
    const key = umaPlayerSortKey.value;
    let valA: any = key === 'playerName' ? a.playerName.toLowerCase() : (a as any)[key];
    let valB: any = key === 'playerName' ? b.playerName.toLowerCase() : (b as any)[key];
    const modifier = umaPlayerSortDesc.value ? -1 : 1;
    if (valA < valB) return -1 * modifier;
    if (valA > valB) return 1 * modifier;
    return 0;
  });

  return rows;
});

const toggleSeason = (seasonId: string) => {
  const index = selectedSeasons.value.indexOf(seasonId);
  if (index === -1) {
    selectedSeasons.value.push(seasonId); // Add
  } else {
    selectedSeasons.value.splice(index, 1); // Remove
  }
};

// --- SORTING STATE ---
const playerSortKey = ref('totalPoints');
const playerSortDesc = ref(true);

const umaSortKey = ref('dominance');
const umaSortDesc = ref(true);

// --- FILTERED DATA PIPELINES ---
// These ensure all downstream stats only look at the selected seasons!
const filteredTournaments = computed(() => {
  if (selectedSeasons.value.length === 0) return tournaments.value; // Empty = All Time
  return tournaments.value.filter(t => t.seasonId && selectedSeasons.value.includes(t.seasonId));
});

const validTournamentIds = computed(() => {
  return new Set(filteredTournaments.value.map(t => t.id));
});

const filteredParticipations = computed(() => {
  return participations.value.filter(p => validTournamentIds.value.has(p.tournamentId));
});

const filteredRaces = computed(() => {
  return races.value.filter(r => r.tournamentId && validTournamentIds.value.has(r.tournamentId));
});

const togglePlayerSort = (key: string) => {
  if (playerSortKey.value === key) {
    playerSortDesc.value = !playerSortDesc.value; // Toggle direction
  } else {
    playerSortKey.value = key;
    playerSortDesc.value = true; // New columns default to Descending
  }
};

const toggleUmaSort = (key: string) => {
  if (umaSortKey.value === key) {
    umaSortDesc.value = !umaSortDesc.value;
  } else {
    umaSortKey.value = key;
    umaSortDesc.value = true;
  }
};

// Overview Stats
const overviewStats = computed(() => {
  const uniquePlayerIds = new Set(filteredParticipations.value.map(p => p.playerId));
  return {
    totalPlayers: uniquePlayerIds.size,
    totalTournaments: filteredTournaments.value.length,
    totalRaces: filteredRaces.value.length,
    totalParticipations: filteredParticipations.value.length,
    avgPlayersPerTournament: filteredTournaments.value.length > 0
        ? Math.round(filteredParticipations.value.length / filteredTournaments.value.length * 10) / 10
        : 0,
    avgRacesPerTournament: filteredTournaments.value.length > 0
        ? Math.round(filteredRaces.value.length / filteredTournaments.value.length * 10) / 10
        : 0
  };
});

// Player Rankings
const playerRankings = computed(() => {
  const playerStats = new Map<string, {
    player: GlobalPlayer;
    tournaments: number;
    completedTournaments: number;
    tournamentWins: number;
    tournamentWinRate: number;
    races: number;
    totalPoints: number;
    avgPoints: number;
    wins: number;
    opponentsFaced: number;
    opponentsBeaten: number;
    dominance: number;
    winRate: number;
    // --- NEW: Detailed Tracking ---
    tournamentsRecord: { tId: string, tName: string, points: number }[];
    umas: Map<string, {
      tournamentIds: Set<string>, // Tracks unique tournaments
      racesPlayed: number,        // Tracks total races for math
      wins: number,
      totalPosition: number,
      totalPoints: number
    }>;
    bestTournament: { tId: string, tName: string, points: number } | null;
    mostPickedUmas: { name: string, count: number, wins: number, avgPosition: number }[];
    mostWinningUmas: { name: string, count: number, wins: number, winRate: number }[];
  }>();

  // 1. Build stats from participations
  filteredParticipations.value.forEach(p => {
    const player = players.value.find(pl => pl.id === p.playerId);
    if (!player) return;

    if (!playerStats.has(p.playerId)) {
      playerStats.set(p.playerId, {
        player,
        tournaments: 0,
        completedTournaments: 0,
        tournamentWins: 0,
        tournamentWinRate: 0,
        races: 0,
        totalPoints: 0,
        avgPoints: 0,
        wins: 0,
        opponentsFaced: 0,
        opponentsBeaten: 0,
        dominance: 0,
        winRate: 0,
        tournamentsRecord: [],
        umas: new Map(),
        bestTournament: null,
        mostPickedUmas: [],
        mostWinningUmas: []
      });
    }

    const stats = playerStats.get(p.playerId)!;
    stats.tournaments++;
    stats.totalPoints += p.totalPoints || 0;

    const t = tournaments.value.find(tourney => tourney.id === p.tournamentId);
    if (t) {
      if (t.status === 'completed') stats.completedTournaments++;
      // Track tournament performance
      stats.tournamentsRecord.push({
        tId: t.id,
        tName: t.name,
        points: p.totalPoints || 0
      });
    }
  });

  // 2. Count Tournament Wins
  filteredTournaments.value.filter(t => t.status === 'completed').forEach(t => {
    if (!t.teams || t.teams.length === 0) return;
    const finalistTeams = t.teams.filter(team => team.inFinals);
    if (finalistTeams.length === 0) return;

    const sorted = [...finalistTeams].sort((a, b) => compareTeams(a, b, true, t, true));
    const winningTeam = sorted[0];
    if (!winningTeam) return;

    filteredParticipations.value
        .filter(p => p.tournamentId === t.id && p.teamId === winningTeam.id)
        .forEach(p => {
          const stats = playerStats.get(p.playerId);
          if (stats) stats.tournamentWins++;
        });
  });

  // 3. Count races, wins, dominance, and specific Uma usage
  filteredRaces.value.forEach(race => {
    const playersInRace = Object.keys(race.placements).length;
    if (playersInRace <= 1) return;

    Object.entries(race.placements).forEach(([playerId, position]) => {
      const stats = playerStats.get(playerId);
      if (stats) {
        stats.races++;
        if (position === 1) stats.wins++;
        stats.opponentsFaced += (playersInRace - 1);
        stats.opponentsBeaten += (playersInRace - position);

        // Track Uma specific to this player
        const umaName = race.umaMapping?.[playerId];
        if (umaName) {
          if (!stats.umas.has(umaName)) {
            stats.umas.set(umaName, {
              tournamentIds: new Set(),
              racesPlayed: 0,
              wins: 0,
              totalPosition: 0,
              totalPoints: 0
            });
          }
          const umaStat = stats.umas.get(umaName)!;

          // Add the tournament ID to the set (Sets automatically prevent duplicates)
          if (race.tournamentId) {
            umaStat.tournamentIds.add(race.tournamentId);
          }

          umaStat.racesPlayed++;
          umaStat.totalPosition += position;
          if (position === 1) umaStat.wins++;

          // Track points using the tournament's point system
          const t = tournaments.value.find(tourney => tourney.id === race.tournamentId);
          const pointSystem = t?.pointsSystem || POINTS_SYSTEM;
          umaStat.totalPoints += pointSystem[position] || 0;
        }
      }
    });
  });

  // 4. Calculate averages and find "Bests"
  playerStats.forEach(stats => {
    stats.avgPoints = stats.races > 0 ? Math.round(stats.totalPoints / stats.races * 10) / 10 : 0;
    stats.dominance = stats.opponentsFaced > 0 ? Math.round((stats.opponentsBeaten / stats.opponentsFaced) * 100 * 10) / 10 : 0;
    stats.winRate = stats.races > 0 ? Math.round((stats.wins / stats.races) * 100 * 10) / 10 : 0;
    stats.tournamentWinRate = stats.completedTournaments > 0 ? Math.round((stats.tournamentWins / stats.completedTournaments) * 100 * 10) / 10 : 0;

    // Calculate Best Tournament
    if (stats.tournamentsRecord.length > 0) {
      stats.bestTournament = [...stats.tournamentsRecord].sort((a, b) => b.points - a.points)[0] || null;
    }

    // Calculate Most Picked and Most Winning Umas
    let maxTourneyPicks = 0;
    let maxWins = 0;

    stats.umas.forEach((val, key) => {
      const tourneyCount = val.tournamentIds.size;

      // --- MOST PICKED ---
      if (tourneyCount > maxTourneyPicks) {
        // New record: reset array
        maxTourneyPicks = tourneyCount;
        stats.mostPickedUmas = [{
          name: key,
          count: tourneyCount,
          wins: val.wins,
          avgPosition: val.racesPlayed > 0 ? Math.round((val.totalPosition / val.racesPlayed) * 10) / 10 : 0
        }];
      } else if (tourneyCount === maxTourneyPicks && tourneyCount > 0) {
        // Tie: add to array
        stats.mostPickedUmas.push({
          name: key,
          count: tourneyCount,
          wins: val.wins,
          avgPosition: val.racesPlayed > 0 ? Math.round((val.totalPosition / val.racesPlayed) * 10) / 10 : 0
        });
      }

      // --- MOST WINNING ---
      if (val.wins > maxWins) {
        // New record: reset array
        maxWins = val.wins;
        stats.mostWinningUmas = [{
          name: key,
          count: val.racesPlayed,
          wins: val.wins,
          winRate: val.racesPlayed > 0 ? Math.round((val.wins / val.racesPlayed) * 100) : 0
        }];
      } else if (val.wins === maxWins && maxWins > 0) {
        // Tie: add to array
        stats.mostWinningUmas.push({
          name: key,
          count: val.racesPlayed,
          wins: val.wins,
          winRate: val.racesPlayed > 0 ? Math.round((val.wins / val.racesPlayed) * 100) : 0
        });
      }
    });
  });

  // 5. Filter and Sort
  return Array.from(playerStats.values())
      .filter(p => p.tournaments >= minTournaments.value)
      .sort((a, b) => {
        let valA: any = playerSortKey.value === 'name' ? a.player.name.toLowerCase() : (a as any)[playerSortKey.value];
        let valB: any = playerSortKey.value === 'name' ? b.player.name.toLowerCase() : (b as any)[playerSortKey.value];

        const modifier = playerSortDesc.value ? -1 : 1;
        if (valA < valB) return -1 * modifier;
        if (valA > valB) return 1 * modifier;
        return 0;
      });
});

// Uma Stats
// Uma Stats
const umaStats = computed(() => {
  const umaData = new Map<string, {
    name: string;
    timesPlayed: number;
    picks: number;
    wins: number;
    bans: number;
    totalPosition: number;
    totalPoints: number;
    avgPoints: number;
    winRate: number;
    tournamentWinRate: number;
    banRate: number;
    pickRate: number;
    presence: number;
    avgPosition: number;
    opponentsFaced: number;
    opponentsBeaten: number;
    dominance: number;
    tournamentIds: Set<string>;
    presenceTournaments: Set<string>;
    pickInstances: Set<string>;
    teamInstances: Set<string>;
    teamWins: number;
    tournamentCount: number;
    tournamentsPicked: number;
    totalPicks: number;
  }>();

  // Helper to initialize a clean Uma object
  const initUma = (name: string) => ({
    name,
    timesPlayed: 0,
    picks: 0,
    wins: 0,
    bans: 0,
    totalPosition: 0,
    totalPoints: 0,
    avgPoints: 0,
    winRate: 0,
    tournamentWinRate: 0,
    banRate: 0,
    pickRate: 0,
    presence: 0,
    avgPosition: 0,
    opponentsFaced: 0,
    opponentsBeaten: 0,
    dominance: 0,
    tournamentIds: new Set<string>(),
    presenceTournaments: new Set<string>(),
    pickInstances: new Set<string>(),
    teamInstances: new Set<string>(),
    teamWins: 0,
    tournamentCount: 0,
    tournamentsPicked: 0,
    totalPicks: 0
  });

  // 1. Process Bans
  filteredTournaments.value.forEach(t => {
    if (t.bans) {
      t.bans.forEach(bannedUma => {
        if (!umaData.has(bannedUma)) {
          umaData.set(bannedUma, initUma(bannedUma));
        }
        const stats = umaData.get(bannedUma)!;
        stats.bans++;
        stats.presenceTournaments.add(t.id); // Track presence via ban
      });
    }
  });

  // 2. Process Races & Picks
  filteredRaces.value.forEach(race => {
    const playersInRace = Object.keys(race.placements).length;
    if (playersInRace <= 1) return;

    Object.entries(race.umaMapping || {}).forEach(([playerId, uma]) => {
      if (!uma) return;

      if (!umaData.has(uma)) {
        umaData.set(uma, initUma(uma));
      }

      const stats = umaData.get(uma)!;
      stats.timesPlayed++;

      if (race.tournamentId) {
        stats.tournamentIds.add(race.tournamentId);
        stats.presenceTournaments.add(race.tournamentId); // Track presence via play

        // A "Pick" is a unique combination of a Tournament and a Player
        stats.pickInstances.add(`${race.tournamentId}_${playerId}`);
        // A "Pick" is when an Uma has been picked at least once by a Player in a Tournament
        // stats.pickInstances.add(race.tournamentId);
      }

      const position = race.placements[playerId];
      if (position) {
        stats.totalPosition += position;
        if (position === 1) stats.wins++;
        stats.opponentsFaced += (playersInRace - 1);
        stats.opponentsBeaten += (playersInRace - position);

        const t = filteredTournaments.value.find(tourney => tourney.id === race.tournamentId);
        const pointSystem = t?.pointsSystem || POINTS_SYSTEM;
        stats.totalPoints += pointSystem[position] || 0;
      }
    });
  });

  // 2b. Calculate tournament win rate per uma
  // Build: which teams used which uma (via participations linking playerId -> teamId)
  // Then check which of those teams won their tournament

  // First, build winning team IDs per tournament
  const winningTeamByTournament = new Map<string, string>();
  filteredTournaments.value.filter(t => t.status === 'completed').forEach(t => {
    if (!t.teams || t.teams.length === 0) return;
    const finalistTeams = t.teams.filter(team => team.inFinals);
    if (finalistTeams.length === 0) return;
    const sorted = [...finalistTeams].sort((a, b) => compareTeams(a, b, true, t, true));
    if (sorted[0]) winningTeamByTournament.set(t.id, sorted[0].id);
  });

  // Build player -> teamId lookup per tournament from participations
  const playerTeamMap = new Map<string, string>(); // key: "tournamentId_playerId" -> teamId
  filteredParticipations.value.forEach(p => {
    if (p.teamId) playerTeamMap.set(`${p.tournamentId}_${p.playerId}`, p.teamId);
  });

  // For each uma, track unique (tournament, team) pairs and count wins
  // We need to iterate races again to link uma -> player -> team -> tournament
  filteredRaces.value.forEach(race => {
    if (!race.tournamentId) return;
    Object.entries(race.umaMapping || {}).forEach(([playerId, uma]) => {
      if (!uma) return;
      const stats = umaData.get(uma);
      if (!stats) return;

      const teamId = playerTeamMap.get(`${race.tournamentId}_${playerId}`);
      if (!teamId) return; // wildcard player, no team

      const teamKey = `${race.tournamentId}_${teamId}`;
      if (!stats.teamInstances.has(teamKey)) {
        stats.teamInstances.add(teamKey);
        // Check if this team won the tournament
        if (winningTeamByTournament.get(race.tournamentId) === teamId) {
          stats.teamWins++;
        }
      }
    });
  });

  // 3. Calculate final percentages and averages
  const totalTournaments = filteredTournaments.value.length;

  let totalOverallPicks = 0;
  umaData.forEach(stats => {
    stats.tournamentCount = stats.presenceTournaments.size;
    stats.picks = stats.pickInstances.size;
    totalOverallPicks += stats.picks;
  });

  umaData.forEach(stats => {
    stats.totalPicks = totalOverallPicks
    stats.tournamentCount = stats.presenceTournaments.size; // Slider now filters by Presence!
    stats.picks = stats.pickInstances.size;
    stats.tournamentsPicked = stats.tournamentIds.size;

    stats.winRate = stats.timesPlayed > 0
        ? Math.round((stats.wins / stats.timesPlayed) * 100 * 10) / 10
        : 0;
    stats.tournamentWinRate = stats.teamInstances.size > 0
        ? Math.round((stats.teamWins / stats.teamInstances.size) * 100 * 10) / 10
        : 0;
    stats.avgPoints = stats.timesPlayed > 0
        ? Math.round((stats.totalPoints / stats.timesPlayed) * 10) / 10
        : 0;
    stats.avgPosition = stats.timesPlayed > 0
        ? Math.round((stats.totalPosition / stats.timesPlayed) * 10) / 10
        : 0;
    stats.dominance = stats.opponentsFaced > 0
        ? Math.round((stats.opponentsBeaten / stats.opponentsFaced) * 100 * 10) / 10
        : 0;

    stats.banRate = totalTournaments > 0
        ? Math.round((stats.bans / totalTournaments) * 100 * 10) / 10
        : 0;
    stats.pickRate = totalOverallPicks > 0
        ? Math.round((stats.picks / totalOverallPicks) * 100 * 10) / 10
        : 0;

    // Presence = (Picks + Bans) / Total Tournaments
    stats.presence = totalTournaments > 0
        ? Math.round((stats.presenceTournaments.size / totalTournaments) * 100 * 10) / 10
        : 0;
  });

  // 4. Sort and Filter
  return Array.from(umaData.values())
      .filter(u => u.tournamentCount >= minTournaments.value)
      .sort((a, b) => {
        let valA: any = umaSortKey.value === 'name' ? a.name.toLowerCase() : (a as any)[umaSortKey.value];
        let valB: any = umaSortKey.value === 'name' ? b.name.toLowerCase() : (b as any)[umaSortKey.value];

        const modifier = umaSortDesc.value ? -1 : 1;
        if (valA < valB) return -1 * modifier;
        if (valA > valB) return 1 * modifier;
        return 0;
      });
});

// Top Players by Total Points (independent of player tab sorting)
const TOP5_CRITERIA = {
  totalPoints:       { label: 'Total Points',      suffix: 'pts',   playerKey: 'totalPoints',       umaKey: 'totalPoints' },
  avgPoints:         { label: 'Avg Points',         suffix: 'avg',   playerKey: 'avgPoints',         umaKey: 'avgPoints' },
  winRate:           { label: 'Race Win Rate',      suffix: '%',     playerKey: 'winRate',           umaKey: 'winRate' },
  tournamentWinRate: { label: 'Tournament Win Rate', suffix: '%',    playerKey: 'tournamentWinRate', umaKey: 'tournamentWinRate' },
  tournaments:       { label: 'Tournaments Played', suffix: '',      playerKey: 'tournaments',       umaKey: 'tournamentsPicked' },
  dominance:         { label: 'Dominance',          suffix: '%',     playerKey: 'dominance',         umaKey: 'dominance' },
} as const;

type Top5Key = keyof typeof TOP5_CRITERIA;
const topPlayerCriterion = ref<Top5Key>('totalPoints');
const topUmaCriterion = ref<Top5Key>('winRate');

const topPlayers = computed(() => {
  const key = TOP5_CRITERIA[topPlayerCriterion.value].playerKey;
  return [...playerRankings.value]
      .sort((a, b) => (b as any)[key] - (a as any)[key])
      .slice(0, 5);
});

const topUmas = computed(() => {
  const key = TOP5_CRITERIA[topUmaCriterion.value].umaKey;
  return [...umaStats.value]
      .sort((a, b) => (b as any)[key] - (a as any)[key])
      .slice(0, 5);
});

// Tier List
const TIER_STYLES = [
  { tier: 'S', color: 'from-amber-500/20 to-amber-600/5', border: 'border-amber-500/50', text: 'text-amber-400', badge: 'bg-amber-500' },
  { tier: 'A', color: 'from-emerald-500/20 to-emerald-600/5', border: 'border-emerald-500/50', text: 'text-emerald-400', badge: 'bg-emerald-500' },
  { tier: 'B', color: 'from-blue-500/20 to-blue-600/5', border: 'border-blue-500/50', text: 'text-blue-400', badge: 'bg-blue-500' },
  { tier: 'C', color: 'from-purple-500/20 to-purple-600/5', border: 'border-purple-500/50', text: 'text-purple-400', badge: 'bg-purple-500' },
  { tier: 'D', color: 'from-orange-500/20 to-orange-600/5', border: 'border-orange-500/50', text: 'text-orange-400', badge: 'bg-orange-500' },
  { tier: 'F', color: 'from-red-500/20 to-red-600/5', border: 'border-red-500/50', text: 'text-red-400', badge: 'bg-red-500' },
] as const;

const TIER_CRITERIA = {
  dominance:       { label: 'Dominance',     icon: 'ph-fill ph-sword',   thresholds: [66, 50, 30, 10, 3, 0], suffix: '%' },
  tournamentWinRate: { label: 'T. Win Rate', icon: 'ph-fill ph-trophy',  thresholds: [35, 25, 15, 10, 3, 0], suffix: '%' },
  winRate:          { label: 'Race Win Rate', icon: 'ph-fill ph-flag-checkered', thresholds: [30, 23, 18, 10, 5, 0], suffix: '%' },
} as const;

type TierCriterion = keyof typeof TIER_CRITERIA;
const tierCriterion = ref<TierCriterion>('dominance');

function assignTier(value: number): string {
  const thresholds = TIER_CRITERIA[tierCriterion.value].thresholds;
  for (let i = 0; i < thresholds.length; i++) {
    if (value >= thresholds[i]!) return TIER_STYLES[i]!.tier;
  }
  return 'F';
}

function getStatValue(item: any): number {
  return item[tierCriterion.value] || 0;
}

const playerTierList = computed(() => {
  const tiers = new Map<string, typeof playerRankings.value>();
  for (const t of TIER_STYLES) tiers.set(t.tier, []);

  for (const p of playerRankings.value) {
    const tier = assignTier(getStatValue(p));
    tiers.get(tier)!.push(p);
  }

  for (const [, entries] of tiers) {
    entries.sort((a, b) => getStatValue(b) - getStatValue(a));
  }

  return TIER_STYLES
    .map(t => ({ ...t, entries: tiers.get(t.tier)! }))
    .filter(t => t.entries.length > 0);
});

const umaTierList = computed(() => {
  const tiers = new Map<string, typeof umaStats.value>();
  for (const t of TIER_STYLES) tiers.set(t.tier, []);

  for (const u of umaStats.value) {
    const tier = assignTier(getStatValue(u));
    tiers.get(tier)!.push(u);
  }

  for (const [, entries] of tiers) {
    entries.sort((a, b) => getStatValue(b) - getStatValue(a));
  }

  return TIER_STYLES
    .map(t => ({ ...t, entries: tiers.get(t.tier)! }))
    .filter(t => t.entries.length > 0);
});

// Fetch tournaments + players + seasons (3 collections), derive participations & races in-memory
const CACHE_KEY = 'analytics';

let fetchCount = 0;
let readOps = 0;

async function fetchOrCache<T extends any[]>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const cached = getCached<T>(`${CACHE_KEY}:${key}`);
  if (cached) return cached;

  fetchCount++;
  const data = await fetcher();
  readOps += Math.max(data.length, 1); // min 1 read per query even if empty
  setCache(`${CACHE_KEY}:${key}`, data);
  return data;
}

const forceRefreshAnalytics = async () => {
  sessionStorage.removeItem(`cache:${CACHE_KEY}:seasons`);
  sessionStorage.removeItem(`cache:${CACHE_KEY}:players`);
  sessionStorage.removeItem(`cache:${CACHE_KEY}:tournaments`);
  await loadData();
};

async function trackUsage(fetches: number, reads: number) {
  try {
    const uid = auth.currentUser?.uid || 'anonymous';
    const usageRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'usage', uid);
    await setDoc(usageRef, {
      requestCount: increment(fetches),
      readOps: increment(reads),
      lastAccess: new Date().toISOString(),
    }, { merge: true });
  } catch {
    // Usage tracking is best-effort — don't break the dashboard
  }
}

/**
 * Derive participations and races from tournament data.
 * This avoids reading the separate participations (~727) and races (~450)
 * collections — all the data already lives inside each tournament document.
 */
function deriveFromTournaments(allTournaments: Tournament[]) {
  const derivedParticipations: DerivedParticipation[] = [];
  const derivedRaces: DerivedRace[] = [];

  for (const t of allTournaments) {
    // Recalculate scores to get accurate per-player points
    const { teams: scoredTeams, players: scoredPlayers } = recalculateTournamentScores(t);

    // Build player→uma lookup from tournament.players
    const playerUmaMap: Record<string, string> = {};
    for (const p of t.players) {
      if (p.uma) playerUmaMap[p.id] = p.uma;
    }

    // Build player→team lookup from scored teams
    const playerTeamMap: Record<string, string> = {};
    for (const team of scoredTeams) {
      if (team.captainId) playerTeamMap[team.captainId] = team.id;
      for (const mid of team.memberIds) playerTeamMap[mid] = team.id;
    }

    // Derive participations from tournament players
    for (const p of scoredPlayers) {
      derivedParticipations.push({
        playerId: p.id,
        tournamentId: t.id,
        uma: playerUmaMap[p.id] || '',
        teamId: playerTeamMap[p.id],
        totalPoints: p.totalPoints || 0,
      });
    }

    // Derive races from tournament.races, adding tournamentId and umaMapping
    for (const race of t.races) {
      // Build umaMapping for this race from players who appear in placements
      const umaMapping: Record<string, string> = {};
      for (const pid of Object.keys(race.placements || {})) {
        if (playerUmaMap[pid]) umaMapping[pid] = playerUmaMap[pid];
      }

      derivedRaces.push({
        tournamentId: t.id,
        stage: race.stage,
        group: race.group,
        raceNumber: race.raceNumber,
        placements: race.placements,
        umaMapping,
      });
    }
  }

  return { derivedParticipations, derivedRaces };
}

async function loadData() {
  loading.value = true;
  fetchCount = 0;
  readOps = 0;

  try {
    const col = (name: string) => collection(db, 'artifacts', APP_ID, 'public', 'data', name);

    // Fetch only 3 collections (seasons + players + tournaments)
    const [s, p, t] = await Promise.all([
      fetchOrCache('seasons', async () => {
        const snap = await getDocs(query(col('seasons'), orderBy('startDate', 'desc')));
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Season));
      }),
      fetchOrCache('players', async () => {
        const snap = await getDocs(col('players'));
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as GlobalPlayer));
      }),
      fetchOrCache('tournaments', async () => {
        const snap = await getDocs(query(col('tournaments'), where('status', '==', 'completed')));
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Tournament));
      }),
    ]);

    seasons.value = s;
    players.value = p;
    tournaments.value = t;

    // Derive participations & races from tournament data (no extra Firestore reads)
    const { derivedParticipations, derivedRaces } = deriveFromTournaments(t);
    participations.value = derivedParticipations;
    races.value = derivedRaces;

    // Track usage if any actual Firestore fetches were made
    if (fetchCount > 0) trackUsage(fetchCount, readOps);

  } catch (e) {
    console.error('Failed to fetch analytics data:', e);
  } finally {
    loading.value = false;
  }
}

onMounted(loadData);

const getRankColor = (index: number) => {
  if (index === 0) return 'text-yellow-400';
  if (index === 1) return 'text-slate-300';
  if (index === 2) return 'text-amber-600';
  return 'text-slate-400';
};

const getRankIcon = (index: number) => {
  if (index === 0) return 'ph-fill ph-crown';
  if (index === 1) return 'ph-fill ph-medal';
  if (index === 2) return 'ph-fill ph-medal';
  return 'ph-fill ph-user-circle';
};
</script>

<template>
  <div class="w-full flex flex-col min-h-full">

    <header class="border-b border-slate-700 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
      <div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between relative">

        <router-link to="/" class="flex items-center gap-2 text-indigo-500 hover:text-indigo-400 transition-colors z-10">
          <i class="ph-fill ph-flag-checkered text-3xl"></i>
          <span class="text-2xl font-bold text-white heading tracking-widest hidden sm:block">Raccoon Open</span>
          <span class="text-2xl font-bold text-white heading tracking-widest sm:hidden">RO</span>
        </router-link>

        <div class="flex items-center gap-4 z-10">
          <button @click="openChangelog" class="relative text-slate-400 hover:text-white transition-colors">
            <i class="ph-bold ph-bell text-xl"></i>
            <span v-if="hasNewUpdates" class="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-slate-900 animate-pulse"></span>
          </button>
        </div>

      </div>
    </header>

    <!-- Header -->

    <main class="flex-grow max-w-7xl mx-auto p-4 md:p-6 w-full space-y-6">

      <div class="w-full mt-4 mb-12 animate-fade-in">

        <div class="w-full border-b border-slate-800 pb-12 mb-12">

          <div class="max-w-3xl mx-auto grid grid-cols-2 md:grid-cols-2 gap-4">

            <router-link to="/" class="group bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-center gap-3 hover:border-indigo-500 hover:bg-slate-750 transition-colors cursor-pointer">
              <i class="ph-fill ph-flag-checkered text-2xl text-indigo-400 group-hover:text-indigo-300"></i>
              <div>
                <div class="text-sm font-bold text-white uppercase tracking-widest group-hover:text-indigo-100">Play</div>
                <div class="text-[10px] text-slate-400">Tournaments</div>
              </div>
            </router-link>

            <router-link to="/analytics" class="group bg-indigo-600 border border-indigo-500 rounded-xl p-4 flex items-center gap-3 hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-500/20 cursor-default pointer-events-none">
              <i class="ph-fill ph-chart-line-up text-2xl text-white"></i>
              <div>
                <div class="text-sm font-bold text-white uppercase tracking-widest">Analytics</div>
                <div class="text-[10px] text-indigo-200">Global Stats</div>
              </div>
            </router-link>

          </div>
        </div>
      </div>


      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-black text-white uppercase tracking-wider">Analytics Dashboard</h1>
          <p class="text-slate-400 mt-1">Cross-tournament statistics and insights</p>
        </div>

        <div class="flex items-center gap-3">
          <div v-if="loading" class="flex items-center gap-2 text-slate-400">
            <i class="ph ph-circle-notch animate-spin"></i>
            Loading data...
          </div>
          <button
            v-else
            @click="forceRefreshAnalytics"
            class="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
            title="Refresh analytics data"
          >
            <i class="ph ph-arrows-clockwise"></i>
            Refresh
          </button>
        </div>
      </div>

      <div class="flex gap-2 border-b border-slate-700 mb-6">
      </div>

      <div class="bg-slate-800 border border-slate-700 rounded-xl p-5 mb-6 flex flex-col lg:flex-row gap-8 lg:items-center">

        <div class="flex items-center gap-6 flex-1 max-w-xl">
          <div class="flex flex-col min-w-[120px]">
            <label class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
              Min. Tourneys
            </label>
            <div class="text-2xl font-black text-white">
              {{ minTournaments }} <span class="text-xs text-slate-500 font-medium">played</span>
            </div>
          </div>

          <div class="flex-1">
            <input
                v-model.number="minTournaments"
                type="range"
                min="1"
                :max="20"
                class="w-full h-2 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all"
            />
            <div class="flex justify-between text-[10px] text-slate-500 font-bold mt-2 px-1">
              <span>1</span>
              <span>{{ 20 }}</span>
            </div>
          </div>
        </div>

        <div class="hidden lg:block w-px h-16 bg-slate-700"></div>
        <div class="lg:hidden w-full h-px bg-slate-700"></div>

        <div class="flex flex-col flex-1">
          <label class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
            Filter by Season
          </label>
          <div class="flex flex-wrap gap-2">

            <button
                @click="selectedSeasons = []"
                class="px-3 py-1.5 text-xs font-bold rounded-full transition-colors border"
                :class="selectedSeasons.length === 0
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'">
              All Time
            </button>

            <button
                v-for="season in seasons"
                :key="season.id"
                @click="toggleSeason(season.id)"
                class="px-3 py-1.5 text-xs font-bold rounded-full transition-colors border"
                :class="selectedSeasons.includes(season.id)
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'">
              {{ season.name }}
            </button>

          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex justify-center gap-2 border-b border-slate-700">
        <button
            v-for="tab in [
            { id: 'overview', label: 'Overview', icon: 'ph-chart-line' },
            { id: 'tierlist', label: 'Tier List', icon: 'ph-ranking' },
            { id: 'players', label: 'Players', icon: 'ph-users' },
            { id: 'umas', label: 'Umas', icon: 'ph-horse' },
            { id: 'tournaments', label: 'Tournaments', icon: 'ph-trophy' }
          ]"
            :key="tab.id"
            @click="activeTab = tab.id as any"
            class="px-4 py-3 font-bold transition-all relative"
            :class="activeTab === tab.id
            ? 'text-indigo-400 border-b-2 border-indigo-400'
            : 'text-slate-400 hover:text-white'"
        >
          <i :class="tab.icon" class="mr-2"></i>
          {{ tab.label }}
        </button>
      </div>

      <!-- Overview Tab -->
      <div v-if="activeTab === 'overview'" class="space-y-6">

        <!-- Stats Grid -->
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div class="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <div class="text-3xl font-black text-white">{{ overviewStats.totalPlayers }}</div>
            <div class="text-xs text-slate-400 uppercase tracking-wider mt-1">Players</div>
          </div>

          <div class="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <div class="text-3xl font-black text-indigo-400">{{ overviewStats.totalTournaments }}</div>
            <div class="text-xs text-slate-400 uppercase tracking-wider mt-1">Tournaments</div>
          </div>

          <div class="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <div class="text-3xl font-black text-emerald-400">{{ overviewStats.totalRaces }}</div>
            <div class="text-xs text-slate-400 uppercase tracking-wider mt-1">Races</div>
          </div>

          <div class="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <div class="text-3xl font-black text-amber-400">{{ overviewStats.totalParticipations }}</div>
            <div class="text-xs text-slate-400 uppercase tracking-wider mt-1">Participations</div>
          </div>

          <div class="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <div class="text-3xl font-black text-purple-400">{{ overviewStats.avgPlayersPerTournament }}</div>
            <div class="text-xs text-slate-400 uppercase tracking-wider mt-1">Avg Players</div>
          </div>

          <div class="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <div class="text-3xl font-black text-cyan-400">{{ overviewStats.avgRacesPerTournament }}</div>
            <div class="text-xs text-slate-400 uppercase tracking-wider mt-1">Avg Races</div>
          </div>
        </div>

        <!-- Quick Rankings -->
        <div class="grid lg:grid-cols-2 gap-6">

          <!-- Top Players -->
          <div class="bg-slate-800 border border-slate-700 rounded-xl p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-xl font-bold text-white flex items-center gap-2">
                <i class="ph-fill ph-trophy text-amber-400"></i>
                Top 5 Players
              </h3>
              <select
                  v-model="topPlayerCriterion"
                  class="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-slate-300 focus:outline-none focus:border-indigo-500"
              >
                <option v-for="(cfg, key) in TOP5_CRITERIA" :key="key" :value="key">{{ cfg.label }}</option>
              </select>
            </div>

            <div class="space-y-3">
              <div
                  v-for="(player, idx) in topPlayers"
                  :key="player.player.id"
                  class="flex items-center gap-3 p-3 bg-slate-900 rounded-lg border border-slate-700"
              >
                <div class="text-2xl" :class="getRankColor(idx)">
                  <i :class="getRankIcon(idx)"></i>
                </div>

                <div class="flex-1 min-w-0">
                  <div class="font-bold text-white truncate">{{ player.player.name }}</div>
                  <div class="text-xs text-slate-400">
                    {{ player.tournaments }} tournaments • {{ player.races }} races
                  </div>
                </div>

                <div class="text-right">
                  <div class="text-lg font-bold text-white">{{ (player as any)[TOP5_CRITERIA[topPlayerCriterion].playerKey] }}{{ TOP5_CRITERIA[topPlayerCriterion].suffix }}</div>
                  <div class="text-xs text-slate-400">{{ TOP5_CRITERIA[topPlayerCriterion].label.toLowerCase() }}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Top Umas -->
          <div class="bg-slate-800 border border-slate-700 rounded-xl p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-xl font-bold text-white flex items-center gap-2">
                <i class="ph-fill ph-horse text-indigo-400"></i>
                Top 5 Umas
              </h3>
              <select
                  v-model="topUmaCriterion"
                  class="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-slate-300 focus:outline-none focus:border-indigo-500"
              >
                <option v-for="(cfg, key) in TOP5_CRITERIA" :key="key" :value="key">{{ cfg.label }}</option>
              </select>
            </div>

            <div class="space-y-3">
              <div
                  v-for="(uma, idx) in topUmas"
                  :key="uma.name"
                  class="flex items-center gap-3 p-3 bg-slate-900 rounded-lg border border-slate-700"
              >
                <div class="text-2xl" :class="getRankColor(idx)">
                  {{ idx + 1 }}
                </div>

                <div class="flex-1 min-w-0">
                  <div class="font-bold text-white truncate">{{ uma.name }}</div>
                  <div class="text-xs text-slate-400">
                    {{ uma.picks }} picks • {{ uma.timesPlayed }} races
                  </div>
                </div>

                <div class="text-right">
                  <div class="text-lg font-bold text-emerald-400">{{ (uma as any)[TOP5_CRITERIA[topUmaCriterion].umaKey] }}{{ TOP5_CRITERIA[topUmaCriterion].suffix }}</div>
                  <div class="text-xs text-slate-400">{{ TOP5_CRITERIA[topUmaCriterion].label.toLowerCase() }}</div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- Players Tab -->
      <div v-if="activeTab === 'players'" class="space-y-4">

        <!-- Search -->
        <input
            v-model="searchQuery"
            type="text"
            placeholder="Search players..."
            class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
        />

        <!-- Player List -->
        <div class="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-slate-900 border-b border-slate-700">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider w-12">#</th>

                <th @click="togglePlayerSort('name')" class="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors group select-none">
                  <div class="flex items-center gap-1">
                    Player
                    <i v-if="playerSortKey === 'name'" class="ph-bold" :class="playerSortDesc ? 'ph-caret-down' : 'ph-caret-up'"></i>
                    <i v-else class="ph-bold ph-caret-down opacity-0 group-hover:opacity-50"></i>
                  </div>
                </th>

                <th v-for="col in [
                  { key: 'tournaments', label: 'Tourneys' },
                  { key: 'tournamentWins', label: 'T. Wins' },
                  { key: 'tournamentWinRate', label: 'T. Win %' },
                  { key: 'races', label: 'Races' },
                  { key: 'totalPoints', label: 'Total Pts' },
                  { key: 'avgPoints', label: 'Avg Pts' },
                  { key: 'dominance', label: 'Dominance' },
                  { key: 'wins', label: 'Race Wins' },
                  { key: 'winRate', label: 'Race Win %' },
                ]"
                    :key="col.key"
                    @click="togglePlayerSort(col.key)"
                    class="px-4 py-3 text-right text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors group select-none whitespace-nowrap">
                  <div class="flex items-center justify-end gap-1">
                    {{ col.label }}
                    <i v-if="playerSortKey === col.key" class="ph-bold text-indigo-400" :class="playerSortDesc ? 'ph-caret-down' : 'ph-caret-up'"></i>
                    <i v-else class="ph-bold ph-caret-down opacity-0 group-hover:opacity-50"></i>
                  </div>
                </th>
              </tr>
              </thead>
              <tbody class="divide-y divide-slate-700 border-t border-slate-700">
                <template
                    v-for="(player, idx) in playerRankings.filter(p =>
                        !searchQuery || p.player.name.toLowerCase().includes(searchQuery.toLowerCase())
                      )"
                    :key="player.player.id"
                >
                  <tr
                      @click="togglePlayerExpand(player.player.id)"
                      class="hover:bg-slate-700/50 transition-colors cursor-pointer group"
                      :class="{'bg-slate-800/80': expandedPlayerId === player.player.id}"
                  >
                    <td class="px-4 py-3 text-sm" :class="getRankColor(idx)">
                      <i v-if="idx < 3" :class="getRankIcon(idx)"></i>
                      <span v-else>{{ idx + 1 }}</span>
                    </td>
                    <td class="px-4 py-3 text-sm font-bold text-white flex items-center gap-2">
                      <i class="ph-bold text-slate-500 group-hover:text-indigo-400 transition-transform duration-200"
                         :class="expandedPlayerId === player.player.id ? 'ph-caret-down text-indigo-400' : 'ph-caret-right'"></i>
                      {{ player.player.name }}
                    </td>

                    <td class="px-4 py-3 text-sm text-right text-slate-300">{{ player.tournaments }}</td>
                    <td class="px-4 py-3 text-sm text-right font-bold text-amber-400">{{ player.tournamentWins }}</td>
                    <td class="px-4 py-3 text-sm text-right font-bold text-amber-400">{{ player.tournamentWinRate }}%</td>

                    <td class="px-4 py-3 text-sm text-right text-slate-300">{{ player.races }}</td>
                    <td class="px-4 py-3 text-sm text-right font-bold text-white">{{ player.totalPoints }}</td>
                    <td class="px-4 py-3 text-sm text-right text-indigo-400">{{ player.avgPoints }}</td>
                    <td class="px-4 py-3 text-sm text-right font-bold text-rose-400">{{ player.dominance }}%</td>
                    <td class="px-4 py-3 text-sm text-right text-emerald-400">{{ player.wins }}</td>
                    <td class="px-4 py-3 text-sm text-right font-bold text-emerald-400">{{ player.winRate }}%</td>
                  </tr>

                  <tr v-if="expandedPlayerId === player.player.id" class="bg-slate-900/50">
                    <td colspan="11" class="p-0 border-b-2 border-indigo-500/30">
                      <div class="p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in-down">

                        <div class="bg-slate-800 border border-slate-700 rounded-lg p-4">
                          <div class="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
                            <i class="ph-fill ph-trophy text-amber-400"></i> Best Tournament
                          </div>
                          <div v-if="player.bestTournament">
                            <div class="font-bold text-white truncate" :title="player.bestTournament.tName">
                              {{ player.bestTournament.tName }}
                            </div>
                            <div class="text-2xl font-black text-indigo-400 mt-1">
                              {{ player.bestTournament.points }} <span class="text-xs text-slate-500 font-medium">pts</span>
                            </div>
                            <router-link :to="'/t/' + player.bestTournament.tId" class="text-xs text-indigo-400 hover:text-indigo-300 mt-2 inline-flex items-center gap-1">
                              View Results <i class="ph-bold ph-arrow-right"></i>
                            </router-link>
                          </div>
                          <div v-else class="text-slate-500 text-sm italic">No data yet</div>
                        </div>

                        <div class="bg-slate-800 border border-slate-700 rounded-lg p-4">
                          <div class="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
                            <i class="ph-fill ph-horse text-purple-400"></i> Most Picked Uma
                          </div>
                          <div v-if="player.mostPickedUmas.length > 0">
                            <div class="font-bold text-white break-words text-sm" :title="player.mostPickedUmas.map(u => u.name).join(', ')">
                              {{ player.mostPickedUmas.map(u => u.name).join(', ') }}
                            </div>
                            <div class="flex items-end gap-3 mt-1">
                              <div class="text-2xl font-black text-purple-400">
                                {{ player.mostPickedUmas[0]!.count }} <span class="text-xs text-slate-500 font-medium">picks</span>
                              </div>
                            </div>
                            <div class="text-xs text-slate-400 mt-2 break-words">
                              Avg. Placement: <span class="font-bold text-white">{{ player.mostPickedUmas.map(u => u.avgPosition).join(' / ') }}</span>
                            </div>
                          </div>
                          <div v-else class="text-slate-500 text-sm italic">No data yet</div>
                        </div>

                        <div class="bg-slate-800 border border-slate-700 rounded-lg p-4">
                          <div class="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
                            <i class="ph-fill ph-medal text-emerald-400"></i> Best Performing Uma
                          </div>
                          <div v-if="player.mostWinningUmas.length > 0">
                            <div class="font-bold text-white truncate text-sm" :title="player.mostWinningUmas.map(u => u.name).join(', ')">
                              {{ player.mostWinningUmas.map(u => u.name).join(', ') }}
                            </div>
                            <div class="flex items-end gap-3 mt-1">
                              <div class="text-2xl font-black text-emerald-400">
                                {{ player.mostWinningUmas[0]!.wins }} <span class="text-xs text-slate-500 font-medium">wins</span>
                              </div>
                            </div>
                            <div class="text-xs text-slate-400 mt-2 truncate">
                              Win Rate: <span class="font-bold text-white">{{ player.mostWinningUmas.map(u => u.winRate + '%').join(' / ') }}</span>
                            </div>
                          </div>
                          <div v-else class="text-slate-500 text-sm italic">No wins recorded yet</div>
                        </div>

                        <div class="bg-slate-800 border border-slate-700 rounded-lg p-4">
                          <div class="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
                            <i class="ph-fill ph-trend-up text-blue-400"></i> Career Averages
                          </div>
                          <div class="space-y-2 mt-2">
                            <div class="flex justify-between items-center text-sm">
                              <span class="text-slate-400">Pts / Tournament</span>
                              <span class="font-bold text-white">
                                  {{ player.tournaments > 0 ? Math.round(player.totalPoints / player.tournaments) : 0 }}
                                </span>
                            </div>
                            <div class="flex justify-between items-center text-sm">
                              <span class="text-slate-400">Opponents Beaten</span>
                              <span class="font-bold text-white">
                                  {{ player.opponentsBeaten }} <span class="text-xs text-slate-500">/ {{ player.opponentsFaced }}</span>
                                </span>
                            </div>
                          </div>
                        </div>

                        <!-- Detail Tables with Tab Toggle -->
                        <div class="col-span-full bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
                          <!-- Tab Toggle -->
                          <div class="px-4 py-3 border-b border-slate-700 flex items-center gap-3">
                            <button
                                @click="expandedDetailTab = 'tournaments'"
                                class="px-3 py-1.5 text-xs font-bold rounded-full transition-colors border flex items-center gap-1.5"
                                :class="expandedDetailTab === 'tournaments'
                                  ? 'bg-indigo-600 border-indigo-500 text-white'
                                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'"
                            >
                              <i class="ph-fill ph-trophy"></i>
                              Tournaments
                              <span class="opacity-60">({{ expandedPlayerTournaments.length }})</span>
                            </button>
                            <button
                                @click="expandedDetailTab = 'umas'"
                                class="px-3 py-1.5 text-xs font-bold rounded-full transition-colors border flex items-center gap-1.5"
                                :class="expandedDetailTab === 'umas'
                                  ? 'bg-indigo-600 border-indigo-500 text-white'
                                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'"
                            >
                              <i class="ph-fill ph-horse"></i>
                              Umas
                              <span class="opacity-60">({{ expandedPlayerUmas.length }})</span>
                            </button>
                          </div>

                          <!-- Tournament History Table -->
                          <div v-if="expandedDetailTab === 'tournaments'" class="overflow-x-auto">
                            <table class="w-full">
                              <thead class="bg-slate-900 border-b border-slate-700">
                                <tr>
                                  <th class="px-3 py-2 text-left text-xs font-bold text-slate-400 uppercase tracking-wider w-8">#</th>
                                  <th @click="togglePlayerTournamentSort('tournamentName')" class="px-3 py-2 text-left text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors group select-none">
                                    <div class="flex items-center gap-1">
                                      Tournament
                                      <i v-if="playerTournamentSortKey === 'tournamentName'" class="ph-bold" :class="playerTournamentSortDesc ? 'ph-caret-down' : 'ph-caret-up'"></i>
                                      <i v-else class="ph-bold ph-caret-down opacity-0 group-hover:opacity-50"></i>
                                    </div>
                                  </th>
                                  <th v-for="col in [
                                    { key: 'uma', label: 'Uma' },
                                    { key: 'finalsStatus', label: 'Perf.' },
                                    { key: 'races', label: 'Races' },
                                    { key: 'wins', label: 'Wins' },
                                    { key: 'winRate', label: 'Win %' },
                                    { key: 'totalPoints', label: 'Points' },
                                    { key: 'avgPoints', label: 'Avg Pts' },
                                    { key: 'dominance', label: 'Dominance' },
                                    { key: 'avgPosition', label: 'Avg Pos' },
                                  ]"
                                    :key="col.key"
                                    @click="togglePlayerTournamentSort(col.key)"
                                    class="px-3 py-2 text-right text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors group select-none whitespace-nowrap"
                                  >
                                    <div class="flex items-center justify-end gap-1">
                                      {{ col.label }}
                                      <i v-if="playerTournamentSortKey === col.key" class="ph-bold text-indigo-400" :class="playerTournamentSortDesc ? 'ph-caret-down' : 'ph-caret-up'"></i>
                                      <i v-else class="ph-bold ph-caret-down opacity-0 group-hover:opacity-50"></i>
                                    </div>
                                  </th>
                                  <th class="px-3 py-2 w-8"></th>
                                </tr>
                              </thead>
                              <tbody class="divide-y divide-slate-700">
                                <tr v-for="(t, tIdx) in expandedPlayerTournaments" :key="t.tournamentId" class="hover:bg-slate-700/50 transition-colors">
                                  <td class="px-3 py-2 text-xs text-slate-500">{{ tIdx + 1 }}</td>
                                  <td class="px-3 py-2 text-sm font-bold text-white">
                                    {{ t.tournamentName }}
                                    <span v-if="t.status === 'active'" class="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold uppercase">Live</span>
                                  </td>
                                  <td class="px-3 py-2 text-sm text-right text-slate-300">{{ t.uma }}</td>
                                  <td class="px-3 py-2 text-sm text-right">
                                    <div class="flex items-center justify-end gap-1 flex-wrap">
                                      <span v-if="t.isWildcard" class="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-bold uppercase">WC {{ t.wildcardGroups.join('+') }}</span>
                                      <span v-if="t.finalsStatus === 'winner'" class="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-bold uppercase">Winner</span>
                                      <span v-else-if="t.finalsStatus === 'finals'" class="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-bold uppercase">Finals</span>
                                      <span v-else-if="t.finalsStatus === 'eliminated'" class="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 font-bold uppercase">Out</span>
                                      <span v-else-if="t.finalsStatus === 'no-groups'" class="text-[10px] px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-400 font-bold uppercase">Small</span>
                                      <span v-else-if="!t.isWildcard" class="text-slate-600">-</span>
                                    </div>
                                  </td>
                                  <td class="px-3 py-2 text-sm text-right text-slate-400">{{ t.races }}</td>
                                  <td class="px-3 py-2 text-sm text-right text-emerald-400">{{ t.wins }}</td>
                                  <td class="px-3 py-2 text-sm text-right font-bold text-emerald-400">{{ t.winRate }}%</td>
                                  <td class="px-3 py-2 text-sm text-right font-bold text-white">{{ t.totalPoints }}</td>
                                  <td class="px-3 py-2 text-sm text-right text-indigo-400">{{ t.avgPoints }}</td>
                                  <td class="px-3 py-2 text-sm text-right font-bold text-purple-400">{{ t.dominance }}%</td>
                                  <td class="px-3 py-2 text-sm text-right text-slate-400">{{ t.avgPosition }}</td>
                                  <td class="px-3 py-2 text-right">
                                    <router-link :to="'/t/' + t.tournamentId" class="text-indigo-400 hover:text-indigo-300 transition-colors">
                                      <i class="ph-bold ph-arrow-right"></i>
                                    </router-link>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                            <div v-if="expandedPlayerTournaments.length === 0" class="px-4 py-6 text-center text-slate-500 text-sm">No tournament data</div>
                          </div>

                          <!-- Uma Performance Table -->
                          <div v-if="expandedDetailTab === 'umas'" class="overflow-x-auto">
                            <table class="w-full">
                              <thead class="bg-slate-900 border-b border-slate-700">
                                <tr>
                                  <th class="px-3 py-2 text-left text-xs font-bold text-slate-400 uppercase tracking-wider w-8">#</th>
                                  <th @click="togglePlayerUmaSort('name')" class="px-3 py-2 text-left text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors group select-none">
                                    <div class="flex items-center gap-1">
                                      Uma
                                      <i v-if="playerUmaSortKey === 'name'" class="ph-bold" :class="playerUmaSortDesc ? 'ph-caret-down' : 'ph-caret-up'"></i>
                                      <i v-else class="ph-bold ph-caret-down opacity-0 group-hover:opacity-50"></i>
                                    </div>
                                  </th>
                                  <th v-for="col in [
                                    { key: 'picks', label: 'Picks' },
                                    { key: 'racesPlayed', label: 'Races' },
                                    { key: 'wins', label: 'Wins' },
                                    { key: 'winRate', label: 'Win %' },
                                    { key: 'avgPoints', label: 'Avg Pts' },
                                    { key: 'dominance', label: 'Dominance' },
                                    { key: 'avgPosition', label: 'Avg Pos' },
                                  ]"
                                    :key="col.key"
                                    @click="togglePlayerUmaSort(col.key)"
                                    class="px-3 py-2 text-right text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors group select-none whitespace-nowrap"
                                  >
                                    <div class="flex items-center justify-end gap-1">
                                      {{ col.label }}
                                      <i v-if="playerUmaSortKey === col.key" class="ph-bold text-indigo-400" :class="playerUmaSortDesc ? 'ph-caret-down' : 'ph-caret-up'"></i>
                                      <i v-else class="ph-bold ph-caret-down opacity-0 group-hover:opacity-50"></i>
                                    </div>
                                  </th>
                                </tr>
                              </thead>
                              <tbody class="divide-y divide-slate-700">
                                <tr v-for="(uma, uIdx) in expandedPlayerUmas" :key="uma.name" class="hover:bg-slate-700/50 transition-colors">
                                  <td class="px-3 py-2 text-xs text-slate-500">{{ uIdx + 1 }}</td>
                                  <td class="px-3 py-2 text-sm font-bold text-white">{{ uma.name }}</td>
                                  <td class="px-3 py-2 text-sm text-right text-slate-300">{{ uma.picks }}</td>
                                  <td class="px-3 py-2 text-sm text-right text-slate-400">{{ uma.racesPlayed }}</td>
                                  <td class="px-3 py-2 text-sm text-right text-emerald-400">{{ uma.wins }}</td>
                                  <td class="px-3 py-2 text-sm text-right font-bold text-emerald-400">{{ uma.winRate }}%</td>
                                  <td class="px-3 py-2 text-sm text-right text-indigo-400">{{ uma.avgPoints }}</td>
                                  <td class="px-3 py-2 text-sm text-right font-bold text-purple-400">{{ uma.dominance }}%</td>
                                  <td class="px-3 py-2 text-sm text-right text-slate-400">{{ uma.avgPosition }}</td>
                                </tr>
                              </tbody>
                            </table>
                            <div v-if="expandedPlayerUmas.length === 0" class="px-4 py-6 text-center text-slate-500 text-sm">No uma data</div>
                          </div>
                        </div>

                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Umas Tab -->
      <div v-if="activeTab === 'umas'" class="space-y-4">

        <!-- Search -->
        <input
            v-model="umaSearchQuery"
            type="text"
            placeholder="Search umas..."
            class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
        />

        <!-- Uma List -->
        <div class="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-slate-900 border-b border-slate-700">
                <tr>
                  <th class="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider w-12">#</th>

                  <th @click="toggleUmaSort('name')" class="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors group select-none">
                    <div class="flex items-center gap-1">
                      Uma
                      <i v-if="umaSortKey === 'name'" class="ph-bold" :class="umaSortDesc ? 'ph-caret-down' : 'ph-caret-up'"></i>
                      <i v-else class="ph-bold ph-caret-down opacity-0 group-hover:opacity-50"></i>
                    </div>
                  </th>

                  <th v-for="col in [
                      { key: 'picks', label: 'Picks' },
                      { key: 'pickRate', label: 'Pick %' },
                      { key: 'bans', label: 'Bans' },
                      { key: 'banRate', label: 'Ban %' },
                      { key: 'presence', label: 'Presence %' },
                      { key: 'timesPlayed', label: 'Races' },
                      { key: 'wins', label: 'Race Wins' },
                      { key: 'winRate', label: 'Win Rate' },
                      { key: 'avgPoints', label: 'Avg Pts' },
                      { key: 'dominance', label: 'Dominance' },
                      { key: 'avgPosition', label: 'Avg Pos' }
                    ]"
                      :key="col.key"
                      @click="toggleUmaSort(col.key)"
                      class="px-4 py-3 text-right text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors group select-none">
                    <div class="flex items-center justify-end gap-1">
                      {{ col.label }}
                      <i v-if="umaSortKey === col.key" class="ph-bold text-indigo-400" :class="umaSortDesc ? 'ph-caret-down' : 'ph-caret-up'"></i>
                      <i v-else class="ph-bold ph-caret-down opacity-0 group-hover:opacity-50"></i>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-700">
                <template
                    v-for="(uma, idx) in umaStats.filter(u => !umaSearchQuery || u.name.toLowerCase().includes(umaSearchQuery.toLowerCase()))"
                    :key="uma.name"
                >
                  <tr
                      @click="toggleUmaExpand(uma.name)"
                      class="hover:bg-slate-700/50 transition-colors cursor-pointer group"
                      :class="{'bg-slate-800/80': expandedUmaName === uma.name}"
                  >
                    <td class="px-4 py-3 text-sm text-slate-400">{{ idx + 1 }}</td>
                    <td class="px-4 py-3 text-sm font-bold text-white flex items-center gap-2">
                      <i class="ph-bold text-slate-500 group-hover:text-indigo-400 transition-transform duration-200"
                         :class="expandedUmaName === uma.name ? 'ph-caret-down text-indigo-400' : 'ph-caret-right'"></i>
                      {{ uma.name }}
                    </td>

                    <td class="px-4 py-3 text-sm text-right text-slate-300">{{ uma.picks }}/{{uma.totalPicks}}</td>
                    <td class="px-4 py-3 text-sm text-right text-blue-400">{{ uma.pickRate }}%</td>

                    <td class="px-4 py-3 text-sm text-right text-slate-300">{{ uma.bans }}/{{ filteredTournaments.length}} </td>
                    <td class="px-4 py-3 text-sm text-right text-rose-400">{{ uma.banRate }}%</td>

                    <td class="px-4 py-3 text-sm text-right font-bold text-amber-400">{{ uma.presence }}%</td>

                    <td class="px-4 py-3 text-sm text-right text-slate-400">{{ uma.timesPlayed }}</td>
                    <td class="px-4 py-3 text-sm text-right text-emerald-400">{{ uma.wins }}</td>
                    <td class="px-4 py-3 text-sm text-right font-bold text-emerald-400">{{ uma.winRate }}%</td>
                    <td class="px-4 py-3 text-sm text-right text-indigo-400">{{ uma.avgPoints }}</td>
                    <td class="px-4 py-3 text-sm text-right font-bold text-purple-400">{{ uma.dominance }}%</td>
                    <td class="px-4 py-3 text-sm text-right text-slate-400">{{ uma.avgPosition }}</td>
                  </tr>

                  <!-- Expanded Uma Drilldown -->
                  <tr v-if="expandedUmaName === uma.name">
                    <td :colspan="14" class="p-0">
                      <div class="bg-slate-900/50 border-t border-slate-700 p-4">
                        <div class="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
                          <!-- Tab Toggle -->
                          <div class="px-4 py-3 border-b border-slate-700 flex items-center gap-3">
                            <button
                                @click="expandedUmaDetailTab = 'tournaments'"
                                class="px-3 py-1.5 text-xs font-bold rounded-full transition-colors border flex items-center gap-1.5"
                                :class="expandedUmaDetailTab === 'tournaments'
                                  ? 'bg-indigo-600 border-indigo-500 text-white'
                                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'"
                            >
                              <i class="ph-fill ph-trophy"></i>
                              Appearances
                              <span class="opacity-60">({{ expandedUmaTournaments.length }})</span>
                            </button>
                            <button
                                @click="expandedUmaDetailTab = 'players'"
                                class="px-3 py-1.5 text-xs font-bold rounded-full transition-colors border flex items-center gap-1.5"
                                :class="expandedUmaDetailTab === 'players'
                                  ? 'bg-indigo-600 border-indigo-500 text-white'
                                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'"
                            >
                              <i class="ph-fill ph-users"></i>
                              Players
                              <span class="opacity-60">({{ expandedUmaPlayers.length }})</span>
                            </button>
                          </div>

                          <!-- Tournament Appearances Table -->
                          <div v-if="expandedUmaDetailTab === 'tournaments'" class="overflow-x-auto">
                            <table class="w-full">
                              <thead class="bg-slate-900 border-b border-slate-700">
                                <tr>
                                  <th class="px-3 py-2 text-left text-xs font-bold text-slate-400 uppercase tracking-wider w-8">#</th>
                                  <th v-for="col in [
                                    { key: 'tournamentName', label: 'Tournament' },
                                    { key: 'playerName', label: 'Player' },
                                    { key: 'races', label: 'Races' },
                                    { key: 'wins', label: 'Wins' },
                                    { key: 'winRate', label: 'Win %' },
                                    { key: 'totalPoints', label: 'Points' },
                                    { key: 'avgPoints', label: 'Avg Pts' },
                                    { key: 'dominance', label: 'Dominance' },
                                    { key: 'avgPosition', label: 'Avg Pos' },
                                  ]"
                                    :key="col.key"
                                    @click="toggleUmaTournamentSort(col.key)"
                                    class="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors group select-none whitespace-nowrap"
                                    :class="col.key === 'tournamentName' || col.key === 'playerName' ? 'text-left' : 'text-right'"
                                  >
                                    <div class="flex items-center gap-1" :class="col.key === 'tournamentName' || col.key === 'playerName' ? '' : 'justify-end'">
                                      {{ col.label }}
                                      <i v-if="umaTournamentSortKey === col.key" class="ph-bold text-indigo-400" :class="umaTournamentSortDesc ? 'ph-caret-down' : 'ph-caret-up'"></i>
                                      <i v-else class="ph-bold ph-caret-down opacity-0 group-hover:opacity-50"></i>
                                    </div>
                                  </th>
                                  <th class="px-3 py-2 w-8"></th>
                                </tr>
                              </thead>
                              <tbody class="divide-y divide-slate-700">
                                <tr v-for="(row, rIdx) in expandedUmaTournaments" :key="row.tournamentId + '_' + row.playerId" class="hover:bg-slate-700/50 transition-colors">
                                  <td class="px-3 py-2 text-xs text-slate-500">{{ rIdx + 1 }}</td>
                                  <td class="px-3 py-2 text-sm font-bold text-white">{{ row.tournamentName }}</td>
                                  <td class="px-3 py-2 text-sm text-slate-300">{{ row.playerName }}</td>
                                  <td class="px-3 py-2 text-sm text-right text-slate-400">{{ row.races }}</td>
                                  <td class="px-3 py-2 text-sm text-right text-emerald-400">{{ row.wins }}</td>
                                  <td class="px-3 py-2 text-sm text-right font-bold text-emerald-400">{{ row.winRate }}%</td>
                                  <td class="px-3 py-2 text-sm text-right font-bold text-white">{{ row.totalPoints }}</td>
                                  <td class="px-3 py-2 text-sm text-right text-indigo-400">{{ row.avgPoints }}</td>
                                  <td class="px-3 py-2 text-sm text-right font-bold text-purple-400">{{ row.dominance }}%</td>
                                  <td class="px-3 py-2 text-sm text-right text-slate-400">{{ row.avgPosition }}</td>
                                  <td class="px-3 py-2 text-right">
                                    <router-link :to="'/t/' + row.tournamentId" class="text-indigo-400 hover:text-indigo-300 transition-colors">
                                      <i class="ph-bold ph-arrow-right"></i>
                                    </router-link>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                            <div v-if="expandedUmaTournaments.length === 0" class="px-4 py-6 text-center text-slate-500 text-sm">No tournament data</div>
                          </div>

                          <!-- Players Table -->
                          <div v-if="expandedUmaDetailTab === 'players'" class="overflow-x-auto">
                            <table class="w-full">
                              <thead class="bg-slate-900 border-b border-slate-700">
                                <tr>
                                  <th class="px-3 py-2 text-left text-xs font-bold text-slate-400 uppercase tracking-wider w-8">#</th>
                                  <th v-for="col in [
                                    { key: 'playerName', label: 'Player' },
                                    { key: 'tournaments', label: 'Picks' },
                                    { key: 'racesPlayed', label: 'Races' },
                                    { key: 'wins', label: 'Wins' },
                                    { key: 'winRate', label: 'Win %' },
                                    { key: 'totalPoints', label: 'Points' },
                                    { key: 'avgPoints', label: 'Avg Pts' },
                                    { key: 'dominance', label: 'Dominance' },
                                    { key: 'avgPosition', label: 'Avg Pos' },
                                  ]"
                                    :key="col.key"
                                    @click="toggleUmaPlayerSort(col.key)"
                                    class="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors group select-none whitespace-nowrap"
                                    :class="col.key === 'playerName' ? 'text-left' : 'text-right'"
                                  >
                                    <div class="flex items-center gap-1" :class="col.key === 'playerName' ? '' : 'justify-end'">
                                      {{ col.label }}
                                      <i v-if="umaPlayerSortKey === col.key" class="ph-bold text-indigo-400" :class="umaPlayerSortDesc ? 'ph-caret-down' : 'ph-caret-up'"></i>
                                      <i v-else class="ph-bold ph-caret-down opacity-0 group-hover:opacity-50"></i>
                                    </div>
                                  </th>
                                </tr>
                              </thead>
                              <tbody class="divide-y divide-slate-700">
                                <tr v-for="(row, rIdx) in expandedUmaPlayers" :key="row.playerId" class="hover:bg-slate-700/50 transition-colors">
                                  <td class="px-3 py-2 text-xs text-slate-500">{{ rIdx + 1 }}</td>
                                  <td class="px-3 py-2 text-sm font-bold text-white">{{ row.playerName }}</td>
                                  <td class="px-3 py-2 text-sm text-right text-slate-300">{{ row.tournaments }}</td>
                                  <td class="px-3 py-2 text-sm text-right text-slate-400">{{ row.racesPlayed }}</td>
                                  <td class="px-3 py-2 text-sm text-right text-emerald-400">{{ row.wins }}</td>
                                  <td class="px-3 py-2 text-sm text-right font-bold text-emerald-400">{{ row.winRate }}%</td>
                                  <td class="px-3 py-2 text-sm text-right font-bold text-white">{{ row.totalPoints }}</td>
                                  <td class="px-3 py-2 text-sm text-right text-indigo-400">{{ row.avgPoints }}</td>
                                  <td class="px-3 py-2 text-sm text-right font-bold text-purple-400">{{ row.dominance }}%</td>
                                  <td class="px-3 py-2 text-sm text-right text-slate-400">{{ row.avgPosition }}</td>
                                </tr>
                              </tbody>
                            </table>
                            <div v-if="expandedUmaPlayers.length === 0" class="px-4 py-6 text-center text-slate-500 text-sm">No player data</div>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Tier List Tab -->
      <div v-if="activeTab === 'tierlist'" class="space-y-4">

        <!-- Criteria Toggle -->
        <div class="flex justify-center gap-2 flex-wrap">
          <button
              v-for="(config, key) in TIER_CRITERIA"
              :key="key"
              @click="tierCriterion = key"
              class="px-3 py-1.5 text-xs font-bold rounded-full transition-colors border flex items-center gap-1.5"
              :class="tierCriterion === key
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'"
          >
            <i :class="config.icon"></i>
            {{ config.label }}
          </button>
        </div>

        <!-- Side by Side Lists -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <!-- Player Tier List -->
          <div>
            <h3 class="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <i class="ph-fill ph-users text-indigo-400"></i> Players
            </h3>
            <div class="space-y-3">
              <div
                  v-for="tier in playerTierList"
                  :key="tier.tier"
                  class="rounded-xl border overflow-hidden"
                  :class="tier.border"
              >
                <div class="flex items-stretch">
                  <div
                      class="w-12 md:w-16 flex-shrink-0 flex items-center justify-center bg-gradient-to-r"
                      :class="tier.color"
                  >
                    <span class="text-2xl md:text-3xl font-black" :class="tier.text">{{ tier.tier }}</span>
                  </div>
                  <div class="flex-1 flex flex-wrap gap-2 p-3 bg-slate-900/50">
                    <div
                        v-for="p in tier.entries"
                        :key="p.player.id"
                        class="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 flex items-center gap-2 hover:border-slate-500 transition-colors"
                    >
                      <span class="font-bold text-white text-sm">{{ p.player.name }}</span>
                      <span class="text-xs px-1.5 py-0.5 rounded font-bold" :class="tier.text + ' bg-slate-900'">{{ getStatValue(p) }}{{ TIER_CRITERIA[tierCriterion].suffix }}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div v-if="playerTierList.length === 0" class="bg-slate-800 border border-slate-700 rounded-xl p-6 text-center text-slate-400">
                No players match the current filters.
              </div>
            </div>
          </div>

          <!-- Uma Tier List -->
          <div>
            <h3 class="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <i class="ph-fill ph-horse text-indigo-400"></i> Umas
            </h3>
            <div class="space-y-3">
              <div
                  v-for="tier in umaTierList"
                  :key="tier.tier"
                  class="rounded-xl border overflow-hidden"
                  :class="tier.border"
              >
                <div class="flex items-stretch">
                  <div
                      class="w-12 md:w-16 flex-shrink-0 flex items-center justify-center bg-gradient-to-r"
                      :class="tier.color"
                  >
                    <span class="text-2xl md:text-3xl font-black" :class="tier.text">{{ tier.tier }}</span>
                  </div>
                  <div class="flex-1 flex flex-wrap gap-2 p-3 bg-slate-900/50">
                    <div
                        v-for="u in tier.entries"
                        :key="u.name"
                        class="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 flex items-center gap-2 hover:border-slate-500 transition-colors"
                    >
                      <span class="font-bold text-white text-sm">{{ u.name }}</span>
                      <span class="text-xs px-1.5 py-0.5 rounded font-bold" :class="tier.text + ' bg-slate-900'">{{ getStatValue(u) }}{{ TIER_CRITERIA[tierCriterion].suffix }}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div v-if="umaTierList.length === 0" class="bg-slate-800 border border-slate-700 rounded-xl p-6 text-center text-slate-400">
                No umas match the current filters.
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- Tournaments Tab -->
      <div v-if="activeTab === 'tournaments'" class="space-y-4">
        <div class="bg-slate-800 border border-slate-700 rounded-xl p-6 text-center text-slate-400">
          <i class="ph ph-construction text-6xl mb-4"></i>
          <p>Tournament comparison view coming soon...</p>
        </div>
      </div>
    </main>

  </div>
</template>