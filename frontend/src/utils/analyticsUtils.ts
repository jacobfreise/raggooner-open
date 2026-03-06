import { ref } from 'vue';
import type { Tournament, Team } from '../types';
import { recalculateTournamentScores, compareTeams } from './utils';

export interface DerivedParticipation {
  playerId: string;
  tournamentId: string;
  uma: string;
  teamId?: string;
  totalPoints: number;
}

export interface DerivedRace {
  tournamentId: string;
  stage: string;
  group: string;
  raceNumber: number;
  placements: Record<string, number>;
  umaMapping: Record<string, string>;
}

export const TIER_STYLES = [
  { tier: 'S', color: 'from-amber-500/20 to-amber-600/5', border: 'border-amber-500/50', text: 'text-amber-400', badge: 'bg-amber-500' },
  { tier: 'A', color: 'from-emerald-500/20 to-emerald-600/5', border: 'border-emerald-500/50', text: 'text-emerald-400', badge: 'bg-emerald-500' },
  { tier: 'B', color: 'from-blue-500/20 to-blue-600/5', border: 'border-blue-500/50', text: 'text-blue-400', badge: 'bg-blue-500' },
  { tier: 'C', color: 'from-purple-500/20 to-purple-600/5', border: 'border-purple-500/50', text: 'text-purple-400', badge: 'bg-purple-500' },
  { tier: 'D', color: 'from-orange-500/20 to-orange-600/5', border: 'border-orange-500/50', text: 'text-orange-400', badge: 'bg-orange-500' },
  { tier: 'F', color: 'from-red-500/20 to-red-600/5', border: 'border-red-500/50', text: 'text-red-400', badge: 'bg-red-500' },
] as const;

export const TIER_CRITERIA = {
  dominance:       { label: 'Dominance',     icon: 'ph-fill ph-sword',   thresholds: [66, 50, 30, 10, 3, 0], suffix: '%' },
  tournamentWinRate: { label: 'T. Win Rate', icon: 'ph-fill ph-trophy',  thresholds: [35, 25, 15, 10, 3, 0], suffix: '%' },
  winRate:          { label: 'Race Win Rate', icon: 'ph-fill ph-flag-checkered', thresholds: [30, 23, 18, 10, 5, 0], suffix: '%' },
} as const;

export type TierCriterion = keyof typeof TIER_CRITERIA;

export const TOP5_CRITERIA = {
  totalPoints:       { label: 'Total Points',      suffix: 'pts',   playerKey: 'totalPoints',       umaKey: 'totalPoints' },
  avgPoints:         { label: 'Avg Points',         suffix: 'avg',   playerKey: 'avgPoints',         umaKey: 'avgPoints' },
  winRate:           { label: 'Race Win Rate',      suffix: '%',     playerKey: 'winRate',           umaKey: 'winRate' },
  tournamentWinRate: { label: 'Tournament Win Rate', suffix: '%',    playerKey: 'tournamentWinRate', umaKey: 'tournamentWinRate' },
  tournaments:       { label: 'Tournaments Played', suffix: '',      playerKey: 'tournaments',       umaKey: 'tournamentsPicked' },
  dominance:         { label: 'Dominance',          suffix: '%',     playerKey: 'dominance',         umaKey: 'dominance' },
} as const;

export type Top5Key = keyof typeof TOP5_CRITERIA;

export function assignTier(value: number, criterion: TierCriterion): string {
  const thresholds = TIER_CRITERIA[criterion].thresholds;
  for (let i = 0; i < thresholds.length; i++) {
    if (value >= thresholds[i]!) return TIER_STYLES[i]!.tier;
  }
  return 'F';
}

export function getStatValue(item: any, criterion: TierCriterion): number {
  return item[criterion] || 0;
}

export function createSortState(defaultKey: string, defaultDesc = true) {
  const sortKey = ref(defaultKey);
  const sortDesc = ref(defaultDesc);
  const toggle = (key: string) => {
    if (sortKey.value === key) sortDesc.value = !sortDesc.value;
    else { sortKey.value = key; sortDesc.value = defaultDesc; }
  };
  const reset = () => { sortKey.value = defaultKey; sortDesc.value = defaultDesc; };
  return { sortKey, sortDesc, toggle, reset };
}

export function getWinningTeam(tournament: Tournament): Team | undefined {
  const teams = tournament.teams;
  if (!teams || teams.length === 0) return undefined;

  const finalistTeams = teams.filter(team => team.inFinals);
  if (finalistTeams.length > 0) {
    return [...finalistTeams].sort((a, b) => compareTeams(a, b, true, tournament, true))[0];
  }

  const hasGroups = new Set(teams.map(tm => tm.group)).size > 1;
  if (hasGroups) return undefined;

  const { teams: scoredTeams } = recalculateTournamentScores(tournament);
  const topId = [...scoredTeams].sort((a, b) => {
    const aTotal = (a.points || 0) + (a.finalsPoints || 0);
    const bTotal = (b.points || 0) + (b.finalsPoints || 0);
    return bTotal !== aTotal ? bTotal - aTotal : a.id.localeCompare(b.id);
  })[0]?.id;

  return topId ? teams.find(tm => tm.id === topId) : undefined;
}

/**
 * Derive participations and races from tournament data.
 * This avoids reading the separate participations (~727) and races (~450)
 * collections — all the data already lives inside each tournament document.
 */
export function deriveFromTournaments(allTournaments: Tournament[]) {
  const derivedParticipations: DerivedParticipation[] = [];
  const derivedRaces: DerivedRace[] = [];

  for (const t of allTournaments) {
    // Recalculate scores to get accurate per-player points
    const { teams: scoredTeams, players: scoredPlayers } = recalculateTournamentScores(t);

    // Build player→uma lookup from tournament.players
    const playerUmaMap: Record<string, string> = {};
    for (const p of Object.values(t.players)) {
      if (p.uma) playerUmaMap[p.id] = p.uma;
    }

    // Build player→team lookup from scored teams
    const playerTeamMap: Record<string, string> = {};
    for (const team of scoredTeams) {
      if (team.captainId) playerTeamMap[team.captainId] = team.id;
      for (const mid of team.memberIds) playerTeamMap[mid] = team.id;
    }

    // Derive participations from tournament players
    for (const p of Object.values(scoredPlayers)) {
      derivedParticipations.push({
        playerId: p.id,
        tournamentId: t.id,
        uma: playerUmaMap[p.id] || '',
        teamId: playerTeamMap[p.id],
        totalPoints: p.totalPoints || 0,
      });
    }

    // Derive races from tournament.races, adding tournamentId and umaMapping
    for (const race of Object.values(t.races)) {
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
