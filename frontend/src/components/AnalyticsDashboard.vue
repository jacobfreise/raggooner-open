<script setup lang="ts">
import {ref, computed, onMounted, inject, type Ref} from 'vue';
import { doc, getDoc, setDoc as firestoreSetDoc, increment } from 'firebase/firestore';
import { db, auth } from '../firebase';
import {getCached, setCache} from "../utils/cache.ts";

// Inject Changelog functions from App.vue
const openChangelog = inject<() => void>('openChangelog')!;
const hasNewUpdates = inject<Ref<boolean>>('hasNewUpdates')!;

const APP_ID = 'default-app';

const loading = ref(true);
const activeTab = ref<'overview' | 'players' | 'umas' | 'tierlist' | 'tournaments'>('overview');

// Pre-aggregated analytics JSON blob
const analyticsData = ref<any>(null);

// Filters
const searchQuery = ref('');
const umaSearchQuery = ref('');
const minTournaments = ref(1);

const seasons = ref<any[]>([]);
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

// --- Helpers for rounding (matches generation script) ---
function round1(v: number) { return Math.round(v * 10) / 10; }
function pct1(num: number, den: number) { return den > 0 ? round1((num / den) * 100) : 0; }

// --- Season key resolution ---
// Empty selectedSeasons = "All Time" = '_all'
// Single season = direct lookup
// Multiple seasons = merge from individual season keys
const seasonKeys = computed<string[]>(() => {
  if (selectedSeasons.value.length === 0) return ['_all'];
  return selectedSeasons.value;
});

const isSingleKey = computed(() => seasonKeys.value.length === 1);

// --- Merge helpers for multi-season ---

function mergePlayerStatsArrays(data: any, keys: string[]): any[] {
  if (keys.length === 1) return data.playerStats[keys[0]!] || [];

  const merged = new Map<string, any>();
  for (const key of keys) {
    for (const ps of (data.playerStats[key] || [])) {
      if (!merged.has(ps.playerId)) {
        merged.set(ps.playerId, {
          ...ps,
          tournamentDetails: [...ps.tournamentDetails],
          umaDetails: [...ps.umaDetails],
        });
      } else {
        const m = merged.get(ps.playerId)!;
        m.tournaments += ps.tournaments;
        m.completedTournaments += ps.completedTournaments;
        m.tournamentWins += ps.tournamentWins;
        m.races += ps.races;
        m.wins += ps.wins;
        m.totalPoints += ps.totalPoints;
        m.opponentsFaced += ps.opponentsFaced;
        m.opponentsBeaten += ps.opponentsBeaten;
        m.tournamentDetails.push(...ps.tournamentDetails);
        m.umaDetails.push(...ps.umaDetails);
      }
    }
  }

  // Recompute derived fields and re-aggregate uma details
  for (const [, m] of merged) {
    m.avgPoints = m.races > 0 ? round1(m.totalPoints / m.races) : 0;
    m.dominance = pct1(m.opponentsBeaten, m.opponentsFaced);
    m.winRate = pct1(m.wins, m.races);
    m.tournamentWinRate = pct1(m.tournamentWins, m.completedTournaments);

    // Re-aggregate umaDetails by name
    const umaMap = new Map<string, any>();
    for (const u of m.umaDetails) {
      if (!umaMap.has(u.name)) {
        umaMap.set(u.name, { ...u });
      } else {
        const ex = umaMap.get(u.name)!;
        ex.picks += u.picks;
        ex.racesPlayed += u.racesPlayed;
        ex.wins += u.wins;
        ex.totalPoints += u.totalPoints;
        ex.totalPosition += u.totalPosition;
        ex.opponentsFaced += u.opponentsFaced;
        ex.opponentsBeaten += u.opponentsBeaten;
      }
    }
    // Recompute derived uma fields
    for (const [, u] of umaMap) {
      u.winRate = pct1(u.wins, u.racesPlayed);
      u.avgPoints = u.racesPlayed > 0 ? round1(u.totalPoints / u.racesPlayed) : 0;
      u.avgPosition = u.racesPlayed > 0 ? round1(u.totalPosition / u.racesPlayed) : 0;
      u.dominance = pct1(u.opponentsBeaten, u.opponentsFaced);
    }
    m.umaDetails = Array.from(umaMap.values());

    // Recompute bestTournament from merged tournamentDetails
    if (m.tournamentDetails.length > 0) {
      m.bestTournament = [...m.tournamentDetails].sort((a: any, b: any) => b.totalPoints - a.totalPoints)[0];
      m.bestTournament = { tId: m.bestTournament.tournamentId, tName: m.bestTournament.tournamentName, points: m.bestTournament.totalPoints };
    }

    // Recompute mostPickedUmas / mostWinningUmas from merged umaDetails
    let maxPicks = 0, maxWins = 0;
    m.mostPickedUmas = [];
    m.mostWinningUmas = [];
    for (const u of m.umaDetails) {
      if (u.picks > maxPicks) {
        maxPicks = u.picks;
        m.mostPickedUmas = [{ name: u.name, count: u.picks, wins: u.wins, avgPosition: u.avgPosition }];
      } else if (u.picks === maxPicks && u.picks > 0) {
        m.mostPickedUmas.push({ name: u.name, count: u.picks, wins: u.wins, avgPosition: u.avgPosition });
      }
      if (u.wins > maxWins) {
        maxWins = u.wins;
        m.mostWinningUmas = [{ name: u.name, count: u.racesPlayed, wins: u.wins, winRate: u.winRate }];
      } else if (u.wins === maxWins && u.wins > 0) {
        m.mostWinningUmas.push({ name: u.name, count: u.racesPlayed, wins: u.wins, winRate: u.winRate });
      }
    }
  }

  return Array.from(merged.values());
}

function mergeUmaStatsArrays(data: any, keys: string[]): any[] {
  if (keys.length === 1) return data.umaStats[keys[0]!] || [];

  const merged = new Map<string, any>();
  for (const key of keys) {
    for (const us of (data.umaStats[key] || [])) {
      if (!merged.has(us.name)) {
        merged.set(us.name, {
          ...us,
          tournamentAppearances: [...us.tournamentAppearances],
          playerAggregates: [...us.playerAggregates],
        });
      } else {
        const m = merged.get(us.name)!;
        m.timesPlayed += us.timesPlayed;
        m.picks += us.picks;
        m.wins += us.wins;
        m.bans += us.bans;
        m.totalPoints += us.totalPoints;
        m.totalPosition += us.totalPosition;
        m.opponentsFaced += us.opponentsFaced;
        m.opponentsBeaten += us.opponentsBeaten;
        m.tournamentsPicked += us.tournamentsPicked;
        m.tournamentCount += us.tournamentCount;
        m.totalPicks += us.totalPicks;
        m.tournamentAppearances.push(...us.tournamentAppearances);
        m.playerAggregates.push(...us.playerAggregates);
      }
    }
  }

  // Recompute derived fields and re-aggregate playerAggregates
  const totalTournaments = keys.reduce((sum, k) => sum + (data.overview[k]?.totalTournaments || 0), 0);
  let totalOverallPicks = 0;
  for (const [, m] of merged) totalOverallPicks += m.picks;

  for (const [, m] of merged) {
    m.winRate = pct1(m.wins, m.timesPlayed);
    m.avgPoints = m.timesPlayed > 0 ? round1(m.totalPoints / m.timesPlayed) : 0;
    m.avgPosition = m.timesPlayed > 0 ? round1(m.totalPosition / m.timesPlayed) : 0;
    m.dominance = pct1(m.opponentsBeaten, m.opponentsFaced);
    m.banRate = pct1(m.bans, totalTournaments);
    m.pickRate = pct1(m.picks, totalOverallPicks);
    m.presence = pct1(m.tournamentCount, totalTournaments);
    m.totalPicks = totalOverallPicks;

    // Re-aggregate playerAggregates by playerId
    const playerMap = new Map<string, any>();
    for (const pa of m.playerAggregates) {
      if (!playerMap.has(pa.playerId)) {
        playerMap.set(pa.playerId, { ...pa });
      } else {
        const ex = playerMap.get(pa.playerId)!;
        ex.tournaments += pa.tournaments;
        ex.racesPlayed += pa.racesPlayed;
        ex.wins += pa.wins;
        ex.totalPoints += pa.totalPoints;
        ex.totalPosition += pa.totalPosition;
        ex.opponentsFaced += pa.opponentsFaced;
        ex.opponentsBeaten += pa.opponentsBeaten;
      }
    }
    for (const [, pa] of playerMap) {
      pa.winRate = pct1(pa.wins, pa.racesPlayed);
      pa.avgPoints = pa.racesPlayed > 0 ? round1(pa.totalPoints / pa.racesPlayed) : 0;
      pa.avgPosition = pa.racesPlayed > 0 ? round1(pa.totalPosition / pa.racesPlayed) : 0;
      pa.dominance = pct1(pa.opponentsBeaten, pa.opponentsFaced);
    }
    m.playerAggregates = Array.from(playerMap.values());
  }

  return Array.from(merged.values());
}

function mergeOverview(data: any, keys: string[], playerCount: number): any {
  if (keys.length === 1) return data.overview[keys[0]!] || {};
  const result = { totalPlayers: 0, totalTournaments: 0, totalRaces: 0, totalParticipations: 0, avgPlayersPerTournament: 0, avgRacesPerTournament: 0 };

  for (const key of keys) {
    const o = data.overview[key];
    if (!o) continue;
    result.totalTournaments += o.totalTournaments;
    result.totalRaces += o.totalRaces;
    result.totalParticipations += o.totalParticipations;
  }

  result.totalPlayers = playerCount;

  result.avgPlayersPerTournament = result.totalTournaments > 0
    ? round1(result.totalParticipations / result.totalTournaments) : 0;
  result.avgRacesPerTournament = result.totalTournaments > 0
    ? round1(result.totalRaces / result.totalTournaments) : 0;

  return result;
}

// --- Computed: current stats from pre-aggregated data ---

const currentPlayerStatsRaw = computed(() => {
  if (!analyticsData.value) return [];
  return mergePlayerStatsArrays(analyticsData.value, seasonKeys.value);
});

const currentUmaStatsRaw = computed(() => {
  if (!analyticsData.value) return [];
  return mergeUmaStatsArrays(analyticsData.value, seasonKeys.value);
});

// --- Drilldowns from pre-aggregated data ---

const expandedPlayerUmas = computed(() => {
  if (!expandedPlayerId.value) return [];
  const player = playerRankings.value.find(p => p.player.id === expandedPlayerId.value);
  if (!player) return [];

  const umaRows = [...(player.umaDetails || [])];

  // Sort
  umaRows.sort((a: any, b: any) => {
    let valA: any = playerUmaSortKey.value === 'name' ? a.name.toLowerCase() : a[playerUmaSortKey.value];
    let valB: any = playerUmaSortKey.value === 'name' ? b.name.toLowerCase() : b[playerUmaSortKey.value];
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
  const player = playerRankings.value.find(p => p.player.id === expandedPlayerId.value);
  if (!player) return [];

  const rows = [...(player.tournamentDetails || [])];

  // Sort
  rows.sort((a: any, b: any) => {
    let valA: any = playerTournamentSortKey.value === 'tournamentName' ? a.tournamentName.toLowerCase() : a[playerTournamentSortKey.value];
    let valB: any = playerTournamentSortKey.value === 'tournamentName' ? b.tournamentName.toLowerCase() : b[playerTournamentSortKey.value];
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
  const uma = umaStats.value.find(u => u.name === expandedUmaName.value);
  if (!uma) return [];

  const rows = [...(uma.tournamentAppearances || [])];

  rows.sort((a: any, b: any) => {
    const key = umaTournamentSortKey.value;
    let valA: any = key === 'tournamentName' ? a.tournamentName.toLowerCase() : key === 'playerName' ? a.playerName.toLowerCase() : a[key];
    let valB: any = key === 'tournamentName' ? b.tournamentName.toLowerCase() : key === 'playerName' ? b.playerName.toLowerCase() : b[key];
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
  const uma = umaStats.value.find(u => u.name === expandedUmaName.value);
  if (!uma) return [];

  const rows = [...(uma.playerAggregates || [])];

  rows.sort((a: any, b: any) => {
    const key = umaPlayerSortKey.value;
    let valA: any = key === 'playerName' ? a.playerName.toLowerCase() : a[key];
    let valB: any = key === 'playerName' ? b.playerName.toLowerCase() : b[key];
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

// Template uses filteredTournaments.length for display
const filteredTournaments = computed(() => ({
  length: overviewStats.value.totalTournaments,
}));

const togglePlayerSort = (key: string) => {
  if (playerSortKey.value === key) {
    playerSortDesc.value = !playerSortDesc.value;
  } else {
    playerSortKey.value = key;
    playerSortDesc.value = true;
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
  if (!analyticsData.value) return { totalPlayers: 0, totalTournaments: 0, totalRaces: 0, totalParticipations: 0, avgPlayersPerTournament: 0, avgRacesPerTournament: 0 };
  if (isSingleKey.value) return analyticsData.value.overview[seasonKeys.value[0]!] || { totalPlayers: 0, totalTournaments: 0, totalRaces: 0, totalParticipations: 0, avgPlayersPerTournament: 0, avgRacesPerTournament: 0 };
  return mergeOverview(analyticsData.value, seasonKeys.value, currentPlayerStatsRaw.value.length);
});

// Player Rankings — wraps pre-aggregated data with `.player` object for template compatibility
const playerRankings = computed(() => {
  if (!analyticsData.value) return [];
  const players = analyticsData.value.players || {};

  return currentPlayerStatsRaw.value
    .filter((p: any) => p.tournaments >= minTournaments.value)
    .map((p: any) => ({
      ...p,
      player: players[p.playerId] || { id: p.playerId, name: p.playerId },
    }))
    .sort((a: any, b: any) => {
      let valA: any = playerSortKey.value === 'name' ? a.player.name.toLowerCase() : a[playerSortKey.value];
      let valB: any = playerSortKey.value === 'name' ? b.player.name.toLowerCase() : b[playerSortKey.value];

      const modifier = playerSortDesc.value ? -1 : 1;
      if (valA < valB) return -1 * modifier;
      if (valA > valB) return 1 * modifier;
      return 0;
    });
});

// Uma Stats
const umaStats = computed(() => {
  if (!analyticsData.value) return [];

  return currentUmaStatsRaw.value
    .filter((u: any) => u.tournamentCount >= minTournaments.value)
    .sort((a: any, b: any) => {
      let valA: any = umaSortKey.value === 'name' ? a.name.toLowerCase() : a[umaSortKey.value];
      let valB: any = umaSortKey.value === 'name' ? b.name.toLowerCase() : b[umaSortKey.value];

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

// --- Data fetching: metadata doc + pre-aggregated JSON ---
const CACHE_KEY = 'analytics:json';

const forceRefreshAnalytics = async () => {
  sessionStorage.removeItem(`cache:${CACHE_KEY}`);
  await loadData();
};

async function trackUsage(reads: number) {
  try {
    const uid = auth.currentUser?.uid || 'anonymous';
    const usageRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'usage', uid);
    await firestoreSetDoc(usageRef, {
      requestCount: increment(1),
      readOps: increment(reads),
      lastAccess: new Date().toISOString(),
    }, { merge: true });
  } catch {
    // Usage tracking is best-effort
  }
}

async function loadData() {
  loading.value = true;

  try {
    // Check sessionStorage cache first
    const cached = getCached<any>(CACHE_KEY);
    if (cached) {
      analyticsData.value = cached;
      seasons.value = cached.seasons || [];
      loading.value = false;
      return;
    }

    // 1. Read metadata doc from Firestore (1 read)
    const metadataRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'usage', 'analyticsMetadata');
    const metadataSnap = await getDoc(metadataRef);

    if (!metadataSnap.exists()) {
      console.error('Analytics metadata not found. Run generateAnalytics.mjs first.');
      loading.value = false;
      return;
    }

    const metadata = metadataSnap.data();
    const jsonUrl = metadata.url;

    // 2. Fetch the pre-aggregated JSON from Cloud Storage
    const resp = await fetch(jsonUrl);
    if (!resp.ok) throw new Error(`Failed to fetch analytics JSON: ${resp.status}`);
    const data = await resp.json();

    // 3. Store in cache and reactive state
    setCache(CACHE_KEY, data);
    analyticsData.value = data;
    seasons.value = data.seasons || [];

    // Track usage: 1 metadata read
    trackUsage(1);

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