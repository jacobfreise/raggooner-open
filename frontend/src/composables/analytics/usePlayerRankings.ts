import { ref, computed, type Ref } from 'vue';
import type { GlobalPlayer, Tournament } from '../../types';
import { compareTeams, recalculateTournamentScores } from "../../utils/utils.ts";
import { POINTS_SYSTEM } from "../../utils/constants.ts";
import {
  type DerivedParticipation,
  type DerivedRace,
  TIER_STYLES,
  type TierCriterion,
  TOP5_CRITERIA,
  type Top5Key,
  assignTier,
  getStatValue,
  createSortState,
  getWinningTeam
} from '../../utils/analyticsUtils';

export interface PlayerStats {
  player: GlobalPlayer;
  tournaments: number;
  completedTournaments: number;
  tournamentWins: number;
  tournamentWinRate: number;
  races: number;
  totalPoints: number;
  avgPoints: number;
  totalPosition: number;
  avgPosition: number;
  wins: number;
  opponentsFaced: number;
  opponentsBeaten: number;
  dominance: number;
  winRate: number;
  tournamentsRecord: { tId: string; tName: string; points: number }[];
  umas: Map<string, any>;
  bestTournament: { tId: string; tName: string; points: number } | null;
  mostPickedUmas: { name: string; count: number; wins: number; avgPosition: number }[];
  mostWinningUmas: { name: string; count: number; wins: number; winRate: number }[];
}

export function usePlayerRankings(
  players: Ref<GlobalPlayer[]>,
  filteredTournaments: Ref<Tournament[]>,
  filteredParticipations: Ref<DerivedParticipation[]>,
  filteredRaces: Ref<DerivedRace[]>,
  minTournaments: Ref<number>,
  tierCriterion: Ref<TierCriterion>
) {
  // Sort states
  const playerSort = createSortState('dominance');
  const playerSortKey = playerSort.sortKey;
  const playerSortDesc = playerSort.sortDesc;
  const togglePlayerSort = playerSort.toggle;

  const playerUmaSort = createSortState('racesPlayed');
  const playerUmaSortKey = playerUmaSort.sortKey;
  const playerUmaSortDesc = playerUmaSort.sortDesc;
  const togglePlayerUmaSort = playerUmaSort.toggle;

  const playerTournamentSort = createSortState('dominance');
  const playerTournamentSortKey = playerTournamentSort.sortKey;
  const playerTournamentSortDesc = playerTournamentSort.sortDesc;
  const togglePlayerTournamentSort = playerTournamentSort.toggle;

  const expandedPlayerId = ref<string | null>(null);
  const expandedDetailTab = ref<'umas' | 'tournaments'>('tournaments');

  const topPlayerCriterion = ref<Top5Key>('totalPoints');

  // Actions
  const togglePlayerExpand = (playerId: string) => {
    if (expandedPlayerId.value === playerId) {
      expandedPlayerId.value = null;
    } else {
      expandedPlayerId.value = playerId;
      expandedDetailTab.value = 'tournaments';
      playerUmaSort.reset();
      playerTournamentSort.reset();
    }
  };

  // Main Computed
  const playerRankings = computed(() => {
    const playerStats = new Map<string, PlayerStats>();

    // 1. Build stats from participations
    filteredParticipations.value.forEach(p => {
      const player = players.value.find(pl => pl.id === p.playerId);
      if (!player) return;

      if (!playerStats.has(p.playerId)) {
        playerStats.set(p.playerId, {
          player, tournaments: 0, completedTournaments: 0, tournamentWins: 0, tournamentWinRate: 0,
          races: 0, totalPoints: 0, avgPoints: 0, totalPosition: 0, avgPosition: 0,
          wins: 0, opponentsFaced: 0, opponentsBeaten: 0, dominance: 0, winRate: 0,
          tournamentsRecord: [], umas: new Map(), bestTournament: null,
          mostPickedUmas: [], mostWinningUmas: []
        });
      }

      const stats = playerStats.get(p.playerId)!;
      stats.tournaments++;
      stats.totalPoints += p.totalPoints || 0;

      const t = filteredTournaments.value.find(tourney => tourney.id === p.tournamentId);
      if (t) {
        if (t.status === 'completed') stats.completedTournaments++;
        stats.tournamentsRecord.push({ tId: t.id, tName: t.name, points: p.totalPoints || 0 });
      }
    });

    // 2. Count Tournament Wins
    filteredTournaments.value.filter(t => t.status === 'completed').forEach(t => {
      const winningTeamId = getWinningTeam(t)?.id;
      if (!winningTeamId) return;

      filteredParticipations.value
          .filter(p => p.tournamentId === t.id && p.teamId === winningTeamId)
          .forEach(p => {
            const stats = playerStats.get(p.playerId);
            if (stats) stats.tournamentWins++;
          });
    });

    // 3. Count races, wins, dominance
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
          stats.totalPosition += position;

          const umaName = race.umaMapping?.[playerId];
          if (umaName) {
            if (!stats.umas.has(umaName)) {
              stats.umas.set(umaName, { tournamentIds: new Set(), racesPlayed: 0, wins: 0, totalPosition: 0, totalPoints: 0 });
            }
            const umaStat = stats.umas.get(umaName)!;
            if (race.tournamentId) umaStat.tournamentIds.add(race.tournamentId);
            umaStat.racesPlayed++;
            umaStat.totalPosition += position;
            if (position === 1) umaStat.wins++;

            const t = filteredTournaments.value.find(tourney => tourney.id === race.tournamentId);
            const pointSystem = t?.pointsSystem || POINTS_SYSTEM;
            umaStat.totalPoints += pointSystem[position] || 0;
          }
        }
      });
    });

    // 4. Calculate averages and "Bests"
    playerStats.forEach(stats => {
      stats.avgPoints = stats.races > 0 ? Math.round(stats.totalPoints / stats.races * 10) / 10 : 0;
      stats.dominance = stats.opponentsFaced > 0 ? Math.round((stats.opponentsBeaten / stats.opponentsFaced) * 100 * 10) / 10 : 0;
      stats.winRate = stats.races > 0 ? Math.round((stats.wins / stats.races) * 100 * 10) / 10 : 0;
      stats.tournamentWinRate = stats.completedTournaments > 0 ? Math.round((stats.tournamentWins / stats.completedTournaments) * 100 * 10) / 10 : 0;
      stats.avgPosition = stats.races > 0 ? Math.round((stats.totalPosition / stats.races) * 10) / 10 : 0;

      if (stats.tournamentsRecord.length > 0) {
        stats.bestTournament = [...stats.tournamentsRecord].sort((a, b) => b.points - a.points)[0] || null;
      }

      let maxTourneyPicks = 0, maxWins = 0;
      stats.umas.forEach((val: any, key: string) => {
        const tourneyCount = val.tournamentIds.size;
        if (tourneyCount > maxTourneyPicks) {
          maxTourneyPicks = tourneyCount;
          stats.mostPickedUmas = [{ name: key, count: tourneyCount, wins: val.wins, avgPosition: val.racesPlayed > 0 ? Math.round((val.totalPosition / val.racesPlayed) * 10) / 10 : 0 }];
        } else if (tourneyCount === maxTourneyPicks && tourneyCount > 0) {
          stats.mostPickedUmas.push({ name: key, count: tourneyCount, wins: val.wins, avgPosition: val.racesPlayed > 0 ? Math.round((val.totalPosition / val.racesPlayed) * 10) / 10 : 0 });
        }

        if (val.wins > maxWins) {
          maxWins = val.wins;
          stats.mostWinningUmas = [{ name: key, count: val.racesPlayed, wins: val.wins, winRate: val.racesPlayed > 0 ? Math.round((val.wins / val.racesPlayed) * 100) : 0 }];
        } else if (val.wins === maxWins && maxWins > 0) {
          stats.mostWinningUmas.push({ name: key, count: val.racesPlayed, wins: val.wins, winRate: val.racesPlayed > 0 ? Math.round((val.wins / val.racesPlayed) * 100) : 0 });
        }
      });
    });

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

  const expandedPlayerUmas = computed(() => {
    if (!expandedPlayerId.value) return [];
    const player = playerRankings.value.find(p => p.player.id === expandedPlayerId.value);
    if (!player) return [];

    const umaRows = Array.from(player.umas.entries()).map((entry: unknown) => {
      const [name, data] = entry as [string, any];
      return {
        name, picks: data.tournamentIds.size, racesPlayed: data.racesPlayed, wins: data.wins,
        winRate: data.racesPlayed > 0 ? Math.round((data.wins / data.racesPlayed) * 100 * 10) / 10 : 0,
        avgPoints: data.racesPlayed > 0 ? Math.round((data.totalPoints / data.racesPlayed) * 10) / 10 : 0,
        avgPosition: data.racesPlayed > 0 ? Math.round((data.totalPosition / data.racesPlayed) * 10) / 10 : 0,
        opponentsFaced: 0, opponentsBeaten: 0, dominance: 0,
      };
    });

    filteredRaces.value.forEach(race => {
      const playersInRace = Object.keys(race.placements).length;
      if (playersInRace <= 1) return;
      const position = race.placements[expandedPlayerId.value!];
      if (position === undefined) return;
      const umaName = race.umaMapping?.[expandedPlayerId.value!];
      if (!umaName) return;
      const row = umaRows.find(r => r.name === umaName);
      if (row) {
        row.opponentsFaced += (playersInRace - 1);
        row.opponentsBeaten += (playersInRace - position);
      }
    });

    umaRows.forEach(row => {
      row.dominance = row.opponentsFaced > 0 ? Math.round((row.opponentsBeaten / row.opponentsFaced) * 100 * 10) / 10 : 0;
    });

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

  const expandedPlayerTournaments = computed(() => {
    if (!expandedPlayerId.value) return [];
    const playerId = expandedPlayerId.value;

    const playerParts = filteredParticipations.value.filter(p => p.playerId === playerId);
    if (playerParts.length === 0) return [];
    const seenTournamentIds = new Set<string>();
    const uniqueParts = playerParts.filter(p => {
      if (seenTournamentIds.has(p.tournamentId)) return false;
      seenTournamentIds.add(p.tournamentId);
      return true;
    });

    const computeRaceStats = (tournamentId: string, pointSystem: Record<number, number>, groupFilter?: Set<string>) => {
      let tournamentRaces = filteredRaces.value.filter(r => r.tournamentId === tournamentId);
      if (groupFilter) tournamentRaces = tournamentRaces.filter(r => groupFilter.has(r.group));
      let races = 0, wins = 0, opponentsFaced = 0, opponentsBeaten = 0, totalPosition = 0, totalPoints = 0;
      tournamentRaces.forEach(race => {
        const position = race.placements[playerId];
        if (position === undefined) return;
        const playersInRace = Object.keys(race.placements).length;
        if (playersInRace <= 1) return;
        races++; totalPosition += position; totalPoints += pointSystem[position] || 0;
        if (position === 1) wins++;
        opponentsFaced += (playersInRace - 1); opponentsBeaten += (playersInRace - position);
      });
      return { races, wins, opponentsFaced, opponentsBeaten, totalPosition, totalPoints };
    };

    const buildRow = (part: any, rowKey: string, stats: any, overrides: any) => {
      const t = filteredTournaments.value.find(tourney => tourney.id === part.tournamentId);
      return {
        rowKey, tournamentId: part.tournamentId, tournamentName: t?.name || part.tournamentId, status: t?.status || 'unknown',
        uma: part.uma || '-', isWildcard: overrides.isWildcard, wildcardGroup: overrides.wildcardGroup || null,
        finalsStatus: overrides.finalsStatus, teamRank: overrides.teamRank ?? null,
        races: stats.races, wins: stats.wins, winRate: stats.races > 0 ? Math.round((stats.wins / stats.races) * 100 * 10) / 10 : 0,
        totalPoints: stats.totalPoints, avgPoints: stats.races > 0 ? Math.round((stats.totalPoints / stats.races) * 10) / 10 : 0,
        dominance: stats.opponentsFaced > 0 ? Math.round((stats.opponentsBeaten / stats.opponentsFaced) * 100 * 10) / 10 : 0,
        avgPosition: stats.races > 0 ? Math.round((stats.totalPosition / stats.races) * 10) / 10 : 0,
      };
    };

    const rows: any[] = [];
    for (const part of uniqueParts) {
      const t = filteredTournaments.value.find(tourney => tourney.id === part.tournamentId);
      const tStatus = t?.status || 'unknown';
      const pointSystem = t?.pointsSystem || POINTS_SYSTEM;
      const teams = t?.teams || [];
      const playerTeam = teams.find(tm => (part.teamId && tm.id === part.teamId) || tm.captainId === playerId || tm.memberIds.includes(playerId));
      const uniqueGroupSet = new Set(teams.map(tm => tm.group));
      const hasGroups = uniqueGroupSet.size > 1;
      const finalistTeams = teams.filter(tm => tm.inFinals);
      
      const winningTeam = t ? (getWinningTeam(t) ?? null) : null;

      const wildcards = t?.wildcards || [];
      const playerWildcards = wildcards.filter(wc => wc.playerId === playerId);

      if (playerTeam) {
        let finalsStatus = '-';
        if (teams.length === 0 && tStatus === 'active') finalsStatus = '-';
        else if (winningTeam && playerTeam.id === winningTeam.id && tStatus === 'completed') finalsStatus = 'winner';
        else if (!hasGroups) finalsStatus = 'no-groups';
        else if (playerTeam.inFinals) finalsStatus = 'finals';
        else if (hasGroups) finalsStatus = 'eliminated';

        let teamRank = null;
        if (finalsStatus === 'winner') teamRank = 1;
        else if (finalsStatus === 'finals' && t) {
          const sorted = [...finalistTeams].sort((a, b) => compareTeams(a, b, true, t, true));
          teamRank = sorted.findIndex(tm => tm.id === playerTeam.id) + 1 || null;
        } else if (finalsStatus === 'eliminated' && t) {
          const groupTeams = teams.filter(tm => tm.group === playerTeam.group);
          const sorted = [...groupTeams].sort((a, b) => compareTeams(a, b, true, t, false));
          teamRank = sorted.findIndex(tm => tm.id === playerTeam.id) + 1 || null;
        } else if (finalsStatus === 'no-groups' && t) {
          const { teams: scoredTeams } = recalculateTournamentScores(t);
          const sorted = [...scoredTeams].sort((a, b) => {
            const aTotal = (a.points || 0) + (a.finalsPoints || 0);
            const bTotal = (b.points || 0) + (b.finalsPoints || 0);
            return bTotal !== aTotal ? bTotal - aTotal : a.id.localeCompare(b.id);
          });
          teamRank = sorted.findIndex(tm => tm.id === playerTeam.id) + 1 || null;
        }

        const teamGroups = new Set<string>([playerTeam.group]);
        if (playerTeam.inFinals) teamGroups.add('Finals');
        const stats = computeRaceStats(part.tournamentId, pointSystem, hasGroups ? teamGroups : undefined);
        rows.push(buildRow(part, part.tournamentId, stats, { isWildcard: false, finalsStatus, teamRank }));
      }

      for (const wc of playerWildcards) {
        const stats = computeRaceStats(part.tournamentId, pointSystem, new Set([wc.group]));
        rows.push(buildRow(part, `${part.tournamentId}_wc_${wc.group}`, stats, { isWildcard: true, wildcardGroup: wc.group, finalsStatus: '-' }));
      }

      if (!playerTeam && playerWildcards.length === 0) {
        const stats = computeRaceStats(part.tournamentId, pointSystem);
        rows.push(buildRow(part, part.tournamentId, stats, { isWildcard: false, finalsStatus: '-' }));
      }
    }

    rows.sort((a, b) => {
      let valA: any = playerTournamentSortKey.value === 'tournamentName' ? a.tournamentName.toLowerCase() : a[playerTournamentSortKey.value];
      let valB: any = playerTournamentSortKey.value === 'tournamentName' ? b.tournamentName.toLowerCase() : b[playerTournamentSortKey.value];
      const modifier = playerTournamentSortDesc.value ? -1 : 1;
      if (valA < valB) return -1 * modifier;
      if (valA > valB) return 1 * modifier;
      return 0;
    });

    return rows;
  });

  const topPlayers = computed(() => {
    const key = TOP5_CRITERIA[topPlayerCriterion.value].playerKey;
    return [...playerRankings.value]
        .sort((a, b) => (b as any)[key] - (a as any)[key])
        .slice(0, 5);
  });

  const playerTierList = computed(() => {
    const tiers = new Map<string, any>();
    for (const t of TIER_STYLES) tiers.set(t.tier, []);

    for (const p of playerRankings.value) {
      const tier = assignTier(getStatValue(p, tierCriterion.value), tierCriterion.value);
      tiers.get(tier)!.push(p);
    }

    for (const [, entries] of tiers) {
      entries.sort((a: any, b: any) => getStatValue(b, tierCriterion.value) - getStatValue(a, tierCriterion.value));
    }

    return TIER_STYLES
      .map(t => ({ ...t, entries: tiers.get(t.tier)! }))
      .filter(t => t.entries.length > 0);
  });

  return {
    playerRankings,
    expandedPlayerTournaments,
    expandedPlayerUmas,
    topPlayers,
    playerTierList,
    
    playerSortKey,
    playerSortDesc,
    expandedPlayerId,
    expandedDetailTab,
    playerUmaSortKey,
    playerUmaSortDesc,
    playerTournamentSortKey,
    playerTournamentSortDesc,
    topPlayerCriterion,

    togglePlayerSort,
    togglePlayerExpand,
    togglePlayerUmaSort,
    togglePlayerTournamentSort,
    getStatValue,
    assignTier
  };
}