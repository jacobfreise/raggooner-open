import { ref, computed, type Ref } from 'vue';
import type { GlobalPlayer, Tournament } from '../../types';
import { POINTS_SYSTEM } from "../../utils/constants.ts";
import {
  type DerivedParticipation,
  type DerivedRace,
  TIER_STYLES,
  type TierCriterion,
  TOP5_CRITERIA,
  type Top5Key,
  assignTier,
  createSortState,
  getWinningTeam
} from '../../utils/analyticsUtils';
import { getUmaData } from '../../utils/umaData';

const UMA_STAGE_KEY: Record<string, Record<string, string>> = {
  groups: { totalPoints: 'groupTotalPoints', avgPoints: 'avgGroupPoints', winRate: 'groupWinRate', dominance: 'groupDominance', tournaments: 'tournamentsPicked', tournamentWinRate: 'tournamentWinRate' },
  finals: { totalPoints: 'finalsTotalPoints', avgPoints: 'avgFinalsPoints', winRate: 'finalsWinRate', dominance: 'finalsDominance', tournaments: 'tournamentsPicked', tournamentWinRate: 'tournamentWinRate' },
};

const UMA_CRIT_KEY: Record<string, Record<string, string>> = {
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
  timesPlayed: { groups: 'groupRaces',       finals: 'finalsRaces' },
  racesPlayed: { groups: 'groupRaces',       finals: 'finalsRaces' },
};

export function useUmaStats(
  players: Ref<GlobalPlayer[]>,
  filteredTournaments: Ref<Tournament[]>,
  filteredParticipations: Ref<DerivedParticipation[]>,
  filteredRaces: Ref<DerivedRace[]>,
  minTournaments: Ref<number>,
  tierCriterion: Ref<TierCriterion>,
  stageView: Ref<'total' | 'groups' | 'finals'> = ref<'total' | 'groups' | 'finals'>('total')
) {
  // Sort and display states
  const umaSort = createSortState('dominance');
  const umaSortKey = umaSort.sortKey;
  const umaSortDesc = umaSort.sortDesc;
  const toggleUmaSort = umaSort.toggle;

  const umaPlayerSort = createSortState('racesPlayed');
  const umaPlayerSortKey = umaPlayerSort.sortKey;
  const umaPlayerSortDesc = umaPlayerSort.sortDesc;
  const toggleUmaPlayerSort = umaPlayerSort.toggle;

  const umaTournamentSort = createSortState('tournamentName', false);
  const umaTournamentSortKey = umaTournamentSort.sortKey;
  const umaTournamentSortDesc = umaTournamentSort.sortDesc;
  const toggleUmaTournamentSort = umaTournamentSort.toggle;

  const resolveStageKey = (key: string) =>
    stageView.value !== 'total' ? (SORT_STAGE_KEY[key]?.[stageView.value] ?? key) : key;

  const expandedUmaName = ref<string | null>(null);
  const expandedUmaDetailTab = ref<'players' | 'tournaments'>('tournaments');

  const topUmaCriterion = ref<Top5Key>('winRate');

  // Actions
  const toggleUmaExpand = (umaName: string) => {
    if (expandedUmaName.value === umaName) {
      expandedUmaName.value = null;
    } else {
      expandedUmaName.value = umaName;
      expandedUmaDetailTab.value = 'tournaments';
      umaPlayerSort.reset();
      umaTournamentSort.reset();
    }
  };

  // Main Computed
  const umaStats = computed(() => {
    const umaData = new Map<string, any>();

    const initUma = (name: string) => ({
      name, timesPlayed: 0, picks: 0, wins: 0, bans: 0, totalPosition: 0,
      totalPoints: 0, avgPoints: 0, avgGroupPoints: 0, avgFinalsPoints: 0,
      groupTotalPoints: 0, groupRaces: 0, finalsTotalPoints: 0, finalsRaces: 0,
      groupWins: 0, finalsWins: 0,
      groupTotalPosition: 0, finalsTotalPosition: 0,
      groupOpponentsFaced: 0, groupOpponentsBeaten: 0,
      finalsOpponentsFaced: 0, finalsOpponentsBeaten: 0,
      groupWinRate: 0, finalsWinRate: 0,
      groupDominance: 0, finalsDominance: 0,
      groupAvgPosition: 0, finalsAvgPosition: 0,
      winRate: 0, tournamentWinRate: 0, banRate: 0,
      pickRate: 0, presence: 0, avgPosition: 0, opponentsFaced: 0, opponentsBeaten: 0,
      dominance: 0, tournamentIds: new Set<string>(), presenceTournaments: new Set<string>(),
      pickInstances: new Set<string>(), teamInstances: new Set<string>(), teamWins: 0,
      tournamentCount: 0, tournamentsPicked: 0, totalPicks: 0, availableTournaments: 0
    });

    // 1. Process Bans
    filteredTournaments.value.forEach(t => {
      if (t.bans) {
        t.bans.forEach(bannedUma => {
          if (!umaData.has(bannedUma)) umaData.set(bannedUma, initUma(bannedUma));
          const stats = umaData.get(bannedUma)!;
          stats.bans++;
          stats.presenceTournaments.add(t.id);
        });
      }
    });

    // Build tournament groups map for stage classification
    const tournamentHasGroupsMap = new Map<string, boolean>();
    filteredTournaments.value.forEach(t => {
      const uniqueGroups = new Set((t.teams ?? []).map(tm => tm.group));
      tournamentHasGroupsMap.set(t.id, uniqueGroups.size > 1);
    });

    // 2. Process Races & Picks
    filteredRaces.value.forEach(race => {
      const playersInRace = Object.keys(race.placements).length;
      if (playersInRace <= 1) return;

      const hasGroups = tournamentHasGroupsMap.get(race.tournamentId) ?? false;
      const isFinalsRace = race.stage === 'finals' || !hasGroups;

      Object.entries(race.umaMapping || {}).forEach(([playerId, uma]) => {
        if (!uma) return;
        if (!umaData.has(uma)) umaData.set(uma, initUma(uma));

        const stats = umaData.get(uma)!;
        stats.timesPlayed++;

        if (race.tournamentId) {
          stats.tournamentIds.add(race.tournamentId);
          stats.presenceTournaments.add(race.tournamentId);
          stats.pickInstances.add(`${race.tournamentId}_${playerId}`);
        }

        const position = race.placements[playerId];
        if (position) {
          stats.totalPosition += position;
          if (position === 1) stats.wins++;
          stats.opponentsFaced += (playersInRace - 1);
          stats.opponentsBeaten += (playersInRace - position);

          const t = filteredTournaments.value.find(tourney => tourney.id === race.tournamentId);
          const pointSystem = t?.pointsSystem || POINTS_SYSTEM;
          const pts = pointSystem[position] || 0;
          stats.totalPoints += pts;
          if (isFinalsRace) {
            stats.finalsRaces++;
            stats.finalsTotalPoints += pts;
            if (position === 1) stats.finalsWins++;
            stats.finalsTotalPosition += position;
            stats.finalsOpponentsFaced += (playersInRace - 1);
            stats.finalsOpponentsBeaten += (playersInRace - position);
          } else {
            stats.groupRaces++;
            stats.groupTotalPoints += pts;
            if (position === 1) stats.groupWins++;
            stats.groupTotalPosition += position;
            stats.groupOpponentsFaced += (playersInRace - 1);
            stats.groupOpponentsBeaten += (playersInRace - position);
          }
        }
      });
    });

    // 3. Team Winners for Uma
    const winningTeamByTournament = new Map<string, string>();
    filteredTournaments.value.filter(t => t.status === 'completed').forEach(t => {
      const winningTeam = getWinningTeam(t);
      if (winningTeam) winningTeamByTournament.set(t.id, winningTeam.id);
    });

    const playerTeamMap = new Map<string, string>();
    filteredParticipations.value.forEach(p => {
      if (p.teamId) playerTeamMap.set(`${p.tournamentId}_${p.playerId}`, p.teamId);
    });

    filteredRaces.value.forEach(race => {
      if (!race.tournamentId) return;
      Object.entries(race.umaMapping || {}).forEach(([playerId, uma]) => {
        if (!uma) return;
        const stats = umaData.get(uma);
        if (!stats) return;

        const teamId = playerTeamMap.get(`${race.tournamentId}_${playerId}`);
        if (!teamId) return;

        const teamKey = `${race.tournamentId}_${teamId}`;
        if (!stats.teamInstances.has(teamKey)) {
          stats.teamInstances.add(teamKey);
          if (winningTeamByTournament.get(race.tournamentId) === teamId) {
            stats.teamWins++;
          }
        }
      });
    });

    // 4. Calculate stats vs release dates
    const picksByTournament = new Map<string, Set<string>>();
    filteredRaces.value.forEach(race => {
      if (!race.tournamentId) return;
      if (!picksByTournament.has(race.tournamentId)) picksByTournament.set(race.tournamentId, new Set());
      Object.entries(race.umaMapping || {}).forEach(([playerId, uma]) => {
        if (uma) picksByTournament.get(race.tournamentId)!.add(`${race.tournamentId}_${playerId}`);
      });
    });

    umaData.forEach(stats => {
      const umaDetails = getUmaData(stats.name);
      const releaseTime = umaDetails ? new Date(umaDetails.releaseDate).getTime() : 0;

      let availableTournamentsCount = 0;
      let availablePicksCount = 0;

      filteredTournaments.value.forEach(t => {
        const tTime = new Date(t.playedAt ?? t.createdAt).getTime();
        if (tTime >= releaseTime) {
          availableTournamentsCount++;
          availablePicksCount += (picksByTournament.get(t.id)?.size || 0);
        }
      });

      stats.availableTournaments = availableTournamentsCount;
      stats.totalPicks = availablePicksCount;
      stats.tournamentCount = stats.presenceTournaments.size;
      stats.picks = stats.pickInstances.size;
      stats.tournamentsPicked = stats.tournamentIds.size;

      stats.winRate = stats.timesPlayed > 0 ? Math.round((stats.wins / stats.timesPlayed) * 100 * 10) / 10 : 0;
      stats.tournamentWinRate = stats.teamInstances.size > 0 ? Math.round((stats.teamWins / stats.teamInstances.size) * 100 * 10) / 10 : 0;
      stats.avgPoints = stats.timesPlayed > 0 ? Math.round((stats.totalPoints / stats.timesPlayed) * 10) / 10 : 0;
      stats.avgGroupPoints = stats.groupRaces > 0 ? Math.round((stats.groupTotalPoints / stats.groupRaces) * 10) / 10 : 0;
      stats.avgFinalsPoints = stats.finalsRaces > 0 ? Math.round((stats.finalsTotalPoints / stats.finalsRaces) * 10) / 10 : 0;
      stats.avgPosition = stats.timesPlayed > 0 ? Math.round((stats.totalPosition / stats.timesPlayed) * 10) / 10 : 0;
      stats.dominance = stats.opponentsFaced > 0 ? Math.round((stats.opponentsBeaten / stats.opponentsFaced) * 100 * 10) / 10 : 0;
      stats.groupWinRate = stats.groupRaces > 0 ? Math.round((stats.groupWins / stats.groupRaces) * 100 * 10) / 10 : 0;
      stats.finalsWinRate = stats.finalsRaces > 0 ? Math.round((stats.finalsWins / stats.finalsRaces) * 100 * 10) / 10 : 0;
      stats.groupDominance = stats.groupOpponentsFaced > 0 ? Math.round((stats.groupOpponentsBeaten / stats.groupOpponentsFaced) * 100 * 10) / 10 : 0;
      stats.finalsDominance = stats.finalsOpponentsFaced > 0 ? Math.round((stats.finalsOpponentsBeaten / stats.finalsOpponentsFaced) * 100 * 10) / 10 : 0;
      stats.groupAvgPosition = stats.groupRaces > 0 ? Math.round((stats.groupTotalPosition / stats.groupRaces) * 10) / 10 : 0;
      stats.finalsAvgPosition = stats.finalsRaces > 0 ? Math.round((stats.finalsTotalPosition / stats.finalsRaces) * 10) / 10 : 0;
      stats.banRate = availableTournamentsCount > 0 ? Math.round((stats.bans / availableTournamentsCount) * 100 * 10) / 10 : 0;
      stats.pickRate = availablePicksCount > 0 ? Math.round((stats.picks / availablePicksCount) * 100 * 10) / 10 : 0;
      stats.presence = availableTournamentsCount > 0 ? Math.round((stats.presenceTournaments.size / availableTournamentsCount) * 100 * 10) / 10 : 0;
    });

    return Array.from(umaData.values())
        .filter(u => u.tournamentCount >= minTournaments.value)
        .sort((a, b) => {
          const effectiveKey = resolveStageKey(umaSortKey.value);
          let valA: any = umaSortKey.value === 'name' ? a.name.toLowerCase() : a[effectiveKey];
          let valB: any = umaSortKey.value === 'name' ? b.name.toLowerCase() : b[effectiveKey];
          const modifier = umaSortDesc.value ? -1 : 1;
          if (valA < valB) return -1 * modifier;
          if (valA > valB) return 1 * modifier;
          return 0;
        });
  });

  const expandedUmaTournaments = computed(() => {
    if (!expandedUmaName.value) return [];
    const umaName = expandedUmaName.value;

    const umaParts = filteredParticipations.value.filter(p => p.uma === umaName);
    if (umaParts.length === 0) return [];

    const tournamentHasGroupsMap = new Map<string, boolean>();
    filteredTournaments.value.forEach(t => {
      const uniqueGroups = new Set((t.teams ?? []).map(tm => tm.group));
      tournamentHasGroupsMap.set(t.id, uniqueGroups.size > 1);
    });

    const rows = umaParts.map(part => {
      const t = filteredTournaments.value.find(tourney => tourney.id === part.tournamentId);
      const tName = t?.name || part.tournamentId;
      const player = players.value.find(p => p.id === part.playerId);
      const playerName = player?.name || part.playerId;

      const tournamentRaces = filteredRaces.value.filter(r => r.tournamentId === part.tournamentId);
      let races = 0, wins = 0, opponentsFaced = 0, opponentsBeaten = 0, totalPosition = 0, totalPoints = 0;
      let groupRaces = 0, groupTotalPoints = 0, finalsRaces = 0, finalsTotalPoints = 0;
      let groupWins = 0, finalsWins = 0, groupTotalPosition = 0, finalsTotalPosition = 0;
      let groupOpponentsFaced = 0, groupOpponentsBeaten = 0, finalsOpponentsFaced = 0, finalsOpponentsBeaten = 0;
      const pointSystem = t?.pointsSystem || POINTS_SYSTEM;
      const hasGroups = tournamentHasGroupsMap.get(part.tournamentId) ?? false;

      tournamentRaces.forEach(race => {
        const position = race.placements[part.playerId];
        if (position === undefined) return;
        const playersInRace = Object.keys(race.placements).length;
        if (playersInRace <= 1) return;
        const pts = pointSystem[position] || 0;
        const isFinalsRace = race.stage === 'finals' || !hasGroups;
        races++;
        totalPosition += position;
        totalPoints += pts;
        if (position === 1) wins++;
        opponentsFaced += (playersInRace - 1);
        opponentsBeaten += (playersInRace - position);
        if (isFinalsRace) {
          finalsRaces++; finalsTotalPoints += pts;
          if (position === 1) finalsWins++;
          finalsTotalPosition += position;
          finalsOpponentsFaced += (playersInRace - 1);
          finalsOpponentsBeaten += (playersInRace - position);
        } else {
          groupRaces++; groupTotalPoints += pts;
          if (position === 1) groupWins++;
          groupTotalPosition += position;
          groupOpponentsFaced += (playersInRace - 1);
          groupOpponentsBeaten += (playersInRace - position);
        }
      });

      return {
        tournamentId: part.tournamentId, tournamentName: tName,
        playedAt: t?.playedAt ?? t?.createdAt ?? '', playerId: part.playerId, playerName,
        races, wins, winRate: races > 0 ? Math.round((wins / races) * 100 * 10) / 10 : 0,
        totalPoints, avgPoints: races > 0 ? Math.round((totalPoints / races) * 10) / 10 : 0,
        avgGroupPoints: groupRaces > 0 ? Math.round((groupTotalPoints / groupRaces) * 10) / 10 : 0,
        avgFinalsPoints: finalsRaces > 0 ? Math.round((finalsTotalPoints / finalsRaces) * 10) / 10 : 0,
        dominance: opponentsFaced > 0 ? Math.round((opponentsBeaten / opponentsFaced) * 100 * 10) / 10 : 0,
        avgPosition: races > 0 ? Math.round((totalPosition / races) * 10) / 10 : 0,
        groupRaces, groupWins,
        groupWinRate: groupRaces > 0 ? Math.round((groupWins / groupRaces) * 100 * 10) / 10 : 0,
        groupDominance: groupOpponentsFaced > 0 ? Math.round((groupOpponentsBeaten / groupOpponentsFaced) * 100 * 10) / 10 : 0,
        groupAvgPosition: groupRaces > 0 ? Math.round((groupTotalPosition / groupRaces) * 10) / 10 : 0,
        groupTotalPoints,
        finalsRaces, finalsWins,
        finalsWinRate: finalsRaces > 0 ? Math.round((finalsWins / finalsRaces) * 100 * 10) / 10 : 0,
        finalsDominance: finalsOpponentsFaced > 0 ? Math.round((finalsOpponentsBeaten / finalsOpponentsFaced) * 100 * 10) / 10 : 0,
        finalsAvgPosition: finalsRaces > 0 ? Math.round((finalsTotalPosition / finalsRaces) * 10) / 10 : 0,
        finalsTotalPoints,
      };
    });

    rows.sort((a, b) => {
      const key = umaTournamentSortKey.value;
      const effectiveKey = resolveStageKey(key);
      let valA: any = key === 'tournamentName' ? a.tournamentName.toLowerCase() : key === 'playerName' ? a.playerName.toLowerCase() : (a as any)[effectiveKey];
      let valB: any = key === 'tournamentName' ? b.tournamentName.toLowerCase() : key === 'playerName' ? b.playerName.toLowerCase() : (b as any)[effectiveKey];
      const modifier = umaTournamentSortDesc.value ? -1 : 1;
      if (valA < valB) return -1 * modifier;
      if (valA > valB) return 1 * modifier;
      return 0;
    });

    return rows;
  });

  const expandedUmaPlayers = computed(() => {
    if (!expandedUmaName.value) return [];
    const umaName = expandedUmaName.value;

    const umaParts = filteredParticipations.value.filter(p => p.uma === umaName);
    if (umaParts.length === 0) return [];

    const tournamentHasGroupsMap = new Map<string, boolean>();
    filteredTournaments.value.forEach(t => {
      const uniqueGroups = new Set((t.teams ?? []).map(tm => tm.group));
      tournamentHasGroupsMap.set(t.id, uniqueGroups.size > 1);
    });

    const playerMap = new Map<string, any>();

    for (const part of umaParts) {
      const player = players.value.find(p => p.id === part.playerId);
      const playerName = player?.name || part.playerId;

      if (!playerMap.has(part.playerId)) {
        playerMap.set(part.playerId, {
          playerId: part.playerId, playerName, tournaments: 0,
          races: 0, wins: 0, opponentsFaced: 0, opponentsBeaten: 0, totalPosition: 0, totalPoints: 0,
          groupRaces: 0, groupTotalPoints: 0, finalsRaces: 0, finalsTotalPoints: 0,
          groupWins: 0, finalsWins: 0, groupTotalPosition: 0, finalsTotalPosition: 0,
          groupOpponentsFaced: 0, groupOpponentsBeaten: 0, finalsOpponentsFaced: 0, finalsOpponentsBeaten: 0,
        });
      }
      const entry = playerMap.get(part.playerId)!;
      entry.tournaments++;

      const t = filteredTournaments.value.find(tourney => tourney.id === part.tournamentId);
      const pointSystem = t?.pointsSystem || POINTS_SYSTEM;
      const hasGroups = tournamentHasGroupsMap.get(part.tournamentId) ?? false;
      const tournamentRaces = filteredRaces.value.filter(r => r.tournamentId === part.tournamentId);

      tournamentRaces.forEach(race => {
        const position = race.placements[part.playerId];
        if (position === undefined) return;
        const playersInRace = Object.keys(race.placements).length;
        if (playersInRace <= 1) return;
        const pts = pointSystem[position] || 0;
        const isFinalsRace = race.stage === 'finals' || !hasGroups;
        entry.races++;
        entry.totalPosition += position;
        entry.totalPoints += pts;
        if (position === 1) entry.wins++;
        entry.opponentsFaced += (playersInRace - 1);
        entry.opponentsBeaten += (playersInRace - position);
        if (isFinalsRace) {
          entry.finalsRaces++; entry.finalsTotalPoints += pts;
          if (position === 1) entry.finalsWins++;
          entry.finalsTotalPosition += position;
          entry.finalsOpponentsFaced += (playersInRace - 1);
          entry.finalsOpponentsBeaten += (playersInRace - position);
        } else {
          entry.groupRaces++; entry.groupTotalPoints += pts;
          if (position === 1) entry.groupWins++;
          entry.groupTotalPosition += position;
          entry.groupOpponentsFaced += (playersInRace - 1);
          entry.groupOpponentsBeaten += (playersInRace - position);
        }
      });
    }

    const rows = Array.from(playerMap.values()).map(e => ({
      ...e,
      winRate: e.races > 0 ? Math.round((e.wins / e.races) * 100 * 10) / 10 : 0,
      avgPoints: e.races > 0 ? Math.round((e.totalPoints / e.races) * 10) / 10 : 0,
      avgGroupPoints: e.groupRaces > 0 ? Math.round((e.groupTotalPoints / e.groupRaces) * 10) / 10 : 0,
      avgFinalsPoints: e.finalsRaces > 0 ? Math.round((e.finalsTotalPoints / e.finalsRaces) * 10) / 10 : 0,
      dominance: e.opponentsFaced > 0 ? Math.round((e.opponentsBeaten / e.opponentsFaced) * 100 * 10) / 10 : 0,
      avgPosition: e.races > 0 ? Math.round((e.totalPosition / e.races) * 10) / 10 : 0,
      groupWinRate: e.groupRaces > 0 ? Math.round((e.groupWins / e.groupRaces) * 100 * 10) / 10 : 0,
      finalsWinRate: e.finalsRaces > 0 ? Math.round((e.finalsWins / e.finalsRaces) * 100 * 10) / 10 : 0,
      groupDominance: e.groupOpponentsFaced > 0 ? Math.round((e.groupOpponentsBeaten / e.groupOpponentsFaced) * 100 * 10) / 10 : 0,
      finalsDominance: e.finalsOpponentsFaced > 0 ? Math.round((e.finalsOpponentsBeaten / e.finalsOpponentsFaced) * 100 * 10) / 10 : 0,
      groupAvgPosition: e.groupRaces > 0 ? Math.round((e.groupTotalPosition / e.groupRaces) * 10) / 10 : 0,
      finalsAvgPosition: e.finalsRaces > 0 ? Math.round((e.finalsTotalPosition / e.finalsRaces) * 10) / 10 : 0,
      racesPlayed: e.races,
    }));

    rows.sort((a, b) => {
      const effectiveKey = resolveStageKey(umaPlayerSortKey.value);
      let valA: any = umaPlayerSortKey.value === 'playerName' ? a.playerName.toLowerCase() : a[effectiveKey];
      let valB: any = umaPlayerSortKey.value === 'playerName' ? b.playerName.toLowerCase() : b[effectiveKey];
      const modifier = umaPlayerSortDesc.value ? -1 : 1;
      if (valA < valB) return -1 * modifier;
      if (valA > valB) return 1 * modifier;
      return 0;
    });

    return rows;
  });

  const topUmas = computed(() => {
    const baseKey = TOP5_CRITERIA[topUmaCriterion.value].umaKey;
    const key = stageView.value !== 'total' ? (UMA_STAGE_KEY[stageView.value]?.[baseKey] ?? baseKey) : baseKey;
    return [...umaStats.value]
        .sort((a, b) => (b as any)[key] - (a as any)[key])
        .slice(0, 5);
  });

  const umaTierList = computed(() => {
    const tiers = new Map<string, typeof umaStats.value>();
    for (const t of TIER_STYLES) tiers.set(t.tier, []);

    const critKey = stageView.value !== 'total'
      ? (UMA_CRIT_KEY[stageView.value]?.[tierCriterion.value] ?? tierCriterion.value)
      : tierCriterion.value;

    for (const u of umaStats.value) {
      const val = (u as any)[critKey] || 0;
      const tier = assignTier(val, tierCriterion.value);
      tiers.get(tier)!.push(u);
    }

    for (const [, entries] of tiers) {
      entries.sort((a: any, b: any) => ((b as any)[critKey] || 0) - ((a as any)[critKey] || 0));
    }

    return TIER_STYLES
      .map(t => ({ ...t, entries: tiers.get(t.tier)! }))
      .filter(t => t.entries.length > 0);
  });

  return {
    umaStats,
    expandedUmaTournaments,
    expandedUmaPlayers,
    topUmas,
    umaTierList,

    umaSortKey,
    umaSortDesc,
    expandedUmaName,
    expandedUmaDetailTab,
    umaPlayerSortKey,
    umaPlayerSortDesc,
    umaTournamentSortKey,
    umaTournamentSortDesc,
    topUmaCriterion,

    toggleUmaSort,
    resetUmaSort: umaSort.reset,
    toggleUmaExpand,
    toggleUmaPlayerSort,
    toggleUmaTournamentSort
  };
}
