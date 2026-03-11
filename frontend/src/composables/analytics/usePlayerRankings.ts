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
  // Total stats
  races: number;
  wins: number;
  totalPoints: number;
  avgPoints: number;
  totalPosition: number;
  avgPosition: number;
  opponentsFaced: number;
  opponentsBeaten: number;
  dominance: number;
  winRate: number;
  // Group stage stats
  groupRaces: number;
  groupWins: number;
  groupTotalPoints: number;
  avgGroupPoints: number;
  groupTotalPosition: number;
  groupAvgPosition: number;
  groupOpponentsFaced: number;
  groupOpponentsBeaten: number;
  groupDominance: number;
  groupWinRate: number;
  // Finals stage stats
  finalsRaces: number;
  finalsWins: number;
  finalsTotalPoints: number;
  avgFinalsPoints: number;
  finalsTotalPosition: number;
  finalsAvgPosition: number;
  finalsOpponentsFaced: number;
  finalsOpponentsBeaten: number;
  finalsDominance: number;
  finalsWinRate: number;
  // Meta
  tournamentsRecord: { tId: string; tName: string; points: number }[];
  umas: Map<string, any>;
  bestTournament: { tId: string; tName: string; points: number } | null;
  mostPickedUmas: { name: string; count: number; wins: number; avgPosition: number }[];
  mostWinningUmas: { name: string; count: number; wins: number; winRate: number }[];
}

const PLAYER_STAGE_KEY: Record<string, Record<string, string>> = {
  groups: { totalPoints: 'groupTotalPoints', avgPoints: 'avgGroupPoints', winRate: 'groupWinRate', dominance: 'groupDominance', tournaments: 'tournaments', tournamentWinRate: 'tournamentWinRate' },
  finals: { totalPoints: 'finalsTotalPoints', avgPoints: 'avgFinalsPoints', winRate: 'finalsWinRate', dominance: 'finalsDominance', tournaments: 'tournaments', tournamentWinRate: 'tournamentWinRate' },
};

const PLAYER_CRIT_KEY: Record<string, Record<string, string>> = {
  groups: { dominance: 'groupDominance', winRate: 'groupWinRate', tournamentWinRate: 'tournamentWinRate' },
  finals: { dominance: 'finalsDominance', winRate: 'finalsWinRate', tournamentWinRate: 'tournamentWinRate' },
};

const SORT_STAGE_KEY: Record<string, { groups: string; finals: string }> = {
  races:       { groups: 'groupRaces',       finals: 'finalsRaces' },
  wins:        { groups: 'groupWins',        finals: 'finalsWins' },
  winRate:     { groups: 'groupWinRate',     finals: 'finalsWinRate' },
  totalPoints: { groups: 'groupTotalPoints', finals: 'finalsTotalPoints' },
  avgPoints:   { groups: 'avgGroupPoints',   finals: 'avgFinalsPoints' },
  dominance:   { groups: 'groupDominance',   finals: 'finalsDominance' },
  avgPosition: { groups: 'groupAvgPosition', finals: 'finalsAvgPosition' },
  racesPlayed: { groups: 'groupRaces',       finals: 'finalsRaces' },
};

export function usePlayerRankings(
  players: Ref<GlobalPlayer[]>,
  filteredTournaments: Ref<Tournament[]>,
  filteredParticipations: Ref<DerivedParticipation[]>,
  filteredRaces: Ref<DerivedRace[]>,
  minTournaments: Ref<number>,
  tierCriterion: Ref<TierCriterion>,
  stageView: Ref<'total' | 'groups' | 'finals'> = ref<'total' | 'groups' | 'finals'>('total')
) {
  // Sort states
  const playerSort = createSortState('dominance');
  const playerSortKey = playerSort.sortKey;
  const playerSortDesc = playerSort.sortDesc;
  const togglePlayerSort = playerSort.toggle;
  const resetPlayerSort = playerSort.reset;

  const playerUmaSort = createSortState('racesPlayed');
  const playerUmaSortKey = playerUmaSort.sortKey;
  const playerUmaSortDesc = playerUmaSort.sortDesc;
  const togglePlayerUmaSort = playerUmaSort.toggle;

  const playerTournamentSort = createSortState('dominance');
  const playerTournamentSortKey = playerTournamentSort.sortKey;
  const playerTournamentSortDesc = playerTournamentSort.sortDesc;
  const togglePlayerTournamentSort = playerTournamentSort.toggle;

  const resolveStageKey = (key: string) =>
    stageView.value !== 'total' ? (SORT_STAGE_KEY[key]?.[stageView.value] ?? key) : key;

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
          races: 0, wins: 0, totalPoints: 0, avgPoints: 0, totalPosition: 0, avgPosition: 0,
          opponentsFaced: 0, opponentsBeaten: 0, dominance: 0, winRate: 0,
          groupRaces: 0, groupWins: 0, groupTotalPoints: 0, avgGroupPoints: 0,
          groupTotalPosition: 0, groupAvgPosition: 0, groupOpponentsFaced: 0, groupOpponentsBeaten: 0,
          groupDominance: 0, groupWinRate: 0,
          finalsRaces: 0, finalsWins: 0, finalsTotalPoints: 0, avgFinalsPoints: 0,
          finalsTotalPosition: 0, finalsAvgPosition: 0, finalsOpponentsFaced: 0, finalsOpponentsBeaten: 0,
          finalsDominance: 0, finalsWinRate: 0,
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

    // 3. Count races, wins, dominance (total + per-stage)
    const tournamentHasGroupsMap = new Map<string, boolean>();
    filteredTournaments.value.forEach(t => {
      const uniqueGroups = new Set(t.teams.map(tm => tm.group));
      tournamentHasGroupsMap.set(t.id, uniqueGroups.size > 1);
    });

    filteredRaces.value.forEach(race => {
      const playersInRace = Object.keys(race.placements).length;
      if (playersInRace <= 1) return;

      const t = filteredTournaments.value.find(tourney => tourney.id === race.tournamentId);
      const pointSystem = t?.pointsSystem || POINTS_SYSTEM;
      const hasGroups = tournamentHasGroupsMap.get(race.tournamentId) ?? false;
      const isFinalsRace = race.stage === 'finals' || !hasGroups;

      Object.entries(race.placements).forEach(([playerId, position]) => {
        const stats = playerStats.get(playerId);
        if (stats) {
          stats.races++;
          if (position === 1) stats.wins++;
          stats.opponentsFaced += (playersInRace - 1);
          stats.opponentsBeaten += (playersInRace - position);
          stats.totalPosition += position;

          const pts = pointSystem[position] || 0;
          if (isFinalsRace) {
            stats.finalsRaces++;
            if (position === 1) stats.finalsWins++;
            stats.finalsTotalPoints += pts;
            stats.finalsTotalPosition += position;
            stats.finalsOpponentsFaced += (playersInRace - 1);
            stats.finalsOpponentsBeaten += (playersInRace - position);
          } else {
            stats.groupRaces++;
            if (position === 1) stats.groupWins++;
            stats.groupTotalPoints += pts;
            stats.groupTotalPosition += position;
            stats.groupOpponentsFaced += (playersInRace - 1);
            stats.groupOpponentsBeaten += (playersInRace - position);
          }

          const umaName = race.umaMapping?.[playerId];
          if (umaName) {
            if (!stats.umas.has(umaName)) {
              stats.umas.set(umaName, {
                tournamentIds: new Set(), racesPlayed: 0, wins: 0, totalPosition: 0, totalPoints: 0,
                groupRaces: 0, groupTotalPoints: 0, finalsRaces: 0, finalsTotalPoints: 0,
                groupWins: 0, finalsWins: 0, groupTotalPosition: 0, finalsTotalPosition: 0,
                groupOpponentsFaced: 0, groupOpponentsBeaten: 0, finalsOpponentsFaced: 0, finalsOpponentsBeaten: 0,
              });
            }
            const umaStat = stats.umas.get(umaName)!;
            if (race.tournamentId) umaStat.tournamentIds.add(race.tournamentId);
            umaStat.racesPlayed++;
            umaStat.totalPosition += position;
            if (position === 1) umaStat.wins++;
            umaStat.totalPoints += pts;
            if (isFinalsRace) {
              umaStat.finalsRaces++;
              umaStat.finalsTotalPoints += pts;
              if (position === 1) umaStat.finalsWins++;
              umaStat.finalsTotalPosition += position;
              umaStat.finalsOpponentsFaced += (playersInRace - 1);
              umaStat.finalsOpponentsBeaten += (playersInRace - position);
            } else {
              umaStat.groupRaces++;
              umaStat.groupTotalPoints += pts;
              if (position === 1) umaStat.groupWins++;
              umaStat.groupTotalPosition += position;
              umaStat.groupOpponentsFaced += (playersInRace - 1);
              umaStat.groupOpponentsBeaten += (playersInRace - position);
            }
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
      // Group stage
      stats.avgGroupPoints = stats.groupRaces > 0 ? Math.round(stats.groupTotalPoints / stats.groupRaces * 10) / 10 : 0;
      stats.groupWinRate = stats.groupRaces > 0 ? Math.round((stats.groupWins / stats.groupRaces) * 100 * 10) / 10 : 0;
      stats.groupDominance = stats.groupOpponentsFaced > 0 ? Math.round((stats.groupOpponentsBeaten / stats.groupOpponentsFaced) * 100 * 10) / 10 : 0;
      stats.groupAvgPosition = stats.groupRaces > 0 ? Math.round((stats.groupTotalPosition / stats.groupRaces) * 10) / 10 : 0;
      // Finals stage
      stats.avgFinalsPoints = stats.finalsRaces > 0 ? Math.round(stats.finalsTotalPoints / stats.finalsRaces * 10) / 10 : 0;
      stats.finalsWinRate = stats.finalsRaces > 0 ? Math.round((stats.finalsWins / stats.finalsRaces) * 100 * 10) / 10 : 0;
      stats.finalsDominance = stats.finalsOpponentsFaced > 0 ? Math.round((stats.finalsOpponentsBeaten / stats.finalsOpponentsFaced) * 100 * 10) / 10 : 0;
      stats.finalsAvgPosition = stats.finalsRaces > 0 ? Math.round((stats.finalsTotalPosition / stats.finalsRaces) * 10) / 10 : 0;

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
          const effectiveKey = resolveStageKey(playerSortKey.value);
          let valA: any = playerSortKey.value === 'name' ? a.player.name.toLowerCase() : (a as any)[effectiveKey];
          let valB: any = playerSortKey.value === 'name' ? b.player.name.toLowerCase() : (b as any)[effectiveKey];
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
        avgGroupPoints: data.groupRaces > 0 ? Math.round((data.groupTotalPoints / data.groupRaces) * 10) / 10 : 0,
        avgFinalsPoints: data.finalsRaces > 0 ? Math.round((data.finalsTotalPoints / data.finalsRaces) * 10) / 10 : 0,
        avgPosition: data.racesPlayed > 0 ? Math.round((data.totalPosition / data.racesPlayed) * 10) / 10 : 0,
        opponentsFaced: 0, opponentsBeaten: 0, dominance: 0,
        groupRaces: data.groupRaces, finalsRaces: data.finalsRaces,
        groupWins: data.groupWins, finalsWins: data.finalsWins,
        groupWinRate: data.groupRaces > 0 ? Math.round((data.groupWins / data.groupRaces) * 100 * 10) / 10 : 0,
        finalsWinRate: data.finalsRaces > 0 ? Math.round((data.finalsWins / data.finalsRaces) * 100 * 10) / 10 : 0,
        groupAvgPosition: data.groupRaces > 0 ? Math.round((data.groupTotalPosition / data.groupRaces) * 10) / 10 : 0,
        finalsAvgPosition: data.finalsRaces > 0 ? Math.round((data.finalsTotalPosition / data.finalsRaces) * 10) / 10 : 0,
        groupOpponentsFaced: 0, groupOpponentsBeaten: 0, finalsOpponentsFaced: 0, finalsOpponentsBeaten: 0,
        groupDominance: 0, finalsDominance: 0,
      };
    });

    const hasGroupsMap = new Map<string, boolean>();
    filteredTournaments.value.forEach(t => {
      const uniqueGroups = new Set(t.teams.map(tm => tm.group));
      hasGroupsMap.set(t.id, uniqueGroups.size > 1);
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
        const hasGroups = hasGroupsMap.get(race.tournamentId) ?? false;
        const isFinalsRace = race.stage === 'finals' || !hasGroups;
        row.opponentsFaced += (playersInRace - 1);
        row.opponentsBeaten += (playersInRace - position);
        if (isFinalsRace) {
          row.finalsOpponentsFaced += (playersInRace - 1);
          row.finalsOpponentsBeaten += (playersInRace - position);
        } else {
          row.groupOpponentsFaced += (playersInRace - 1);
          row.groupOpponentsBeaten += (playersInRace - position);
        }
      }
    });

    umaRows.forEach(row => {
      row.dominance = row.opponentsFaced > 0 ? Math.round((row.opponentsBeaten / row.opponentsFaced) * 100 * 10) / 10 : 0;
      row.groupDominance = row.groupOpponentsFaced > 0 ? Math.round((row.groupOpponentsBeaten / row.groupOpponentsFaced) * 100 * 10) / 10 : 0;
      row.finalsDominance = row.finalsOpponentsFaced > 0 ? Math.round((row.finalsOpponentsBeaten / row.finalsOpponentsFaced) * 100 * 10) / 10 : 0;
    });

    umaRows.sort((a, b) => {
      const effectiveKey = resolveStageKey(playerUmaSortKey.value);
      let valA: any = playerUmaSortKey.value === 'name' ? a.name.toLowerCase() : (a as any)[effectiveKey];
      let valB: any = playerUmaSortKey.value === 'name' ? b.name.toLowerCase() : (b as any)[effectiveKey];
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

    const emptyStats = { races: 0, wins: 0, opponentsFaced: 0, opponentsBeaten: 0, totalPosition: 0, totalPoints: 0 };

    const computeRaceStats = (tournamentId: string, pointSystem: Record<number, number>, groupFilter?: Set<string>, stageFilter?: string) => {
      let tournamentRaces = filteredRaces.value.filter(r => r.tournamentId === tournamentId);
      if (groupFilter) tournamentRaces = tournamentRaces.filter(r => groupFilter.has(r.group));
      if (stageFilter) tournamentRaces = tournamentRaces.filter(r => r.stage === stageFilter);
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
      const grp = overrides.groupRowStats ?? emptyStats;
      const fin = overrides.finalsRowStats ?? emptyStats;
      return {
        rowKey, tournamentId: part.tournamentId, tournamentName: t?.name || part.tournamentId,
        playedAt: t?.playedAt ?? t?.createdAt ?? '', status: t?.status || 'unknown',
        uma: part.uma || '-', isWildcard: overrides.isWildcard, wildcardGroup: overrides.wildcardGroup || null,
        finalsStatus: overrides.finalsStatus, teamRank: overrides.teamRank ?? null,
        races: stats.races, wins: stats.wins,
        winRate: stats.races > 0 ? Math.round((stats.wins / stats.races) * 100 * 10) / 10 : 0,
        totalPoints: stats.totalPoints,
        avgPoints: stats.races > 0 ? Math.round((stats.totalPoints / stats.races) * 10) / 10 : 0,
        dominance: stats.opponentsFaced > 0 ? Math.round((stats.opponentsBeaten / stats.opponentsFaced) * 100 * 10) / 10 : 0,
        avgPosition: stats.races > 0 ? Math.round((stats.totalPosition / stats.races) * 10) / 10 : 0,
        // Per-stage
        groupRaces: grp.races, groupWins: grp.wins,
        groupWinRate: grp.races > 0 ? Math.round((grp.wins / grp.races) * 100 * 10) / 10 : 0,
        avgGroupPoints: grp.races > 0 ? Math.round((grp.totalPoints / grp.races) * 10) / 10 : 0,
        groupDominance: grp.opponentsFaced > 0 ? Math.round((grp.opponentsBeaten / grp.opponentsFaced) * 100 * 10) / 10 : 0,
        groupAvgPosition: grp.races > 0 ? Math.round((grp.totalPosition / grp.races) * 10) / 10 : 0,
        finalsRaces: fin.races, finalsWins: fin.wins,
        finalsWinRate: fin.races > 0 ? Math.round((fin.wins / fin.races) * 100 * 10) / 10 : 0,
        avgFinalsPoints: fin.races > 0 ? Math.round((fin.totalPoints / fin.races) * 10) / 10 : 0,
        finalsDominance: fin.opponentsFaced > 0 ? Math.round((fin.opponentsBeaten / fin.opponentsFaced) * 100 * 10) / 10 : 0,
        finalsAvgPosition: fin.races > 0 ? Math.round((fin.totalPosition / fin.races) * 10) / 10 : 0,
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
        let groupRowStats = emptyStats, finalsRowStats = emptyStats;
        if (hasGroups) {
          groupRowStats = computeRaceStats(part.tournamentId, pointSystem, new Set([playerTeam.group]), 'groups');
          finalsRowStats = computeRaceStats(part.tournamentId, pointSystem, undefined, 'finals');
        } else {
          finalsRowStats = stats;
        }
        rows.push(buildRow(part, part.tournamentId, stats, { isWildcard: false, finalsStatus, teamRank, groupRowStats, finalsRowStats }));
      }

      for (const wc of playerWildcards) {
        const stats = computeRaceStats(part.tournamentId, pointSystem, new Set([wc.group]));
        const groupRowStats = computeRaceStats(part.tournamentId, pointSystem, new Set([wc.group]), 'groups');
        const finalsRowStats = computeRaceStats(part.tournamentId, pointSystem, undefined, 'finals');
        rows.push(buildRow(part, `${part.tournamentId}_wc_${wc.group}`, stats, { isWildcard: true, wildcardGroup: wc.group, finalsStatus: '-', groupRowStats, finalsRowStats }));
      }

      if (!playerTeam && playerWildcards.length === 0) {
        const stats = computeRaceStats(part.tournamentId, pointSystem);
        let groupRowStats = emptyStats, finalsRowStats = emptyStats;
        if (hasGroups) {
          groupRowStats = computeRaceStats(part.tournamentId, pointSystem, undefined, 'groups');
          finalsRowStats = computeRaceStats(part.tournamentId, pointSystem, undefined, 'finals');
        } else {
          finalsRowStats = stats;
        }
        rows.push(buildRow(part, part.tournamentId, stats, { isWildcard: false, finalsStatus: '-', groupRowStats, finalsRowStats }));
      }
    }

    rows.sort((a, b) => {
      const effectiveKey = resolveStageKey(playerTournamentSortKey.value);
      let valA: any = playerTournamentSortKey.value === 'tournamentName' ? a.tournamentName.toLowerCase() : a[effectiveKey];
      let valB: any = playerTournamentSortKey.value === 'tournamentName' ? b.tournamentName.toLowerCase() : b[effectiveKey];
      const modifier = playerTournamentSortDesc.value ? -1 : 1;
      if (valA < valB) return -1 * modifier;
      if (valA > valB) return 1 * modifier;
      return 0;
    });

    return rows;
  });

  const topPlayers = computed(() => {
    const baseKey = TOP5_CRITERIA[topPlayerCriterion.value].playerKey;
    const key = stageView.value !== 'total' ? (PLAYER_STAGE_KEY[stageView.value]?.[baseKey] ?? baseKey) : baseKey;
    return [...playerRankings.value]
        .sort((a, b) => (b as any)[key] - (a as any)[key])
        .slice(0, 5);
  });

  const playerTierList = computed(() => {
    const tiers = new Map<string, any>();
    for (const t of TIER_STYLES) tiers.set(t.tier, []);

    const critKey = stageView.value !== 'total'
      ? (PLAYER_CRIT_KEY[stageView.value]?.[tierCriterion.value] ?? tierCriterion.value)
      : tierCriterion.value;

    for (const p of playerRankings.value) {
      const val = (p as any)[critKey] || 0;
      const tier = assignTier(val, tierCriterion.value);
      tiers.get(tier)!.push(p);
    }

    for (const [, entries] of tiers) {
      entries.sort((a: any, b: any) => ((b as any)[critKey] || 0) - ((a as any)[critKey] || 0));
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
    resetPlayerSort,
    togglePlayerExpand,
    togglePlayerUmaSort,
    togglePlayerTournamentSort,
    getStatValue,
    assignTier
  };
}
