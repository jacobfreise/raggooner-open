#!/usr/bin/env node

/**
 * Pre-aggregates all analytics data into a single JSON file and uploads
 * it to Cloud Storage. The dashboard then fetches this one file instead
 * of ~1400 Firestore documents.
 *
 * Usage:
 *   node scripts/generateAnalytics.mjs                        # emulator
 *   node scripts/generateAnalytics.mjs --dry-run              # preview only
 *   node scripts/generateAnalytics.mjs --live --dry-run       # preview against production
 *   node scripts/generateAnalytics.mjs --live                 # production
 */

import { writeFileSync } from 'fs';
import { getStorage } from 'firebase-admin/storage';
import {
  confirmLiveMode, IS_LIVE, DRY_RUN, PROJECT_ID,
  listAll, setDoc, initDb
} from './config.mjs';

// --- Inline constants ---

const POINTS_SYSTEM = {
  1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2,
  10: 1, 11: 0, 12: 0, 13: 0, 14: 0, 15: 0, 16: 0, 17: 0, 18: 0
};

// --- Ported from src/utils/utils.ts ---

function getTeamPlacements(team, tournament) {
  const counts = {};
  if (!tournament) return counts;
  const roster = [team.captainId, ...team.memberIds];
  const races = tournament.races || [];
  const raceList = Array.isArray(races) ? races : Object.values(races);
  const relevantRaces = raceList.filter(r =>
    r.stage === 'groups' && r.group === team.group
  );
  relevantRaces.forEach(race => {
    roster.forEach(pid => {
      const pos = race.placements?.[pid];
      if (pos) counts[pos] = (counts[pos] || 0) + 1;
    });
  });
  return counts;
}

function compareTeams(a, b, useIdFallback, tournament, isFinals) {
  const aPoints = isFinals ? a.finalsPoints : a.points;
  const bPoints = isFinals ? b.finalsPoints : b.points;
  if (bPoints !== aPoints) return bPoints - aPoints;

  const useTiebreaker = tournament.usePlacementTiebreaker ?? true;
  if (useTiebreaker) {
    const placementsA = getTeamPlacements(a, tournament);
    const placementsB = getTeamPlacements(b, tournament);
    for (let i = 1; i <= 18; i++) {
      const countA = placementsA[i] || 0;
      const countB = placementsB[i] || 0;
      if (countB !== countA) return countB - countA;
    }
  }

  if (useIdFallback) return a.id.localeCompare(b.id);
  return 0;
}

// --- Recalculate team scores from race data (ported from src/utils/utils.ts) ---

function recalculateTournamentScores(t) {
  const activePointsSystem = t.pointsSystem || POINTS_SYSTEM;
  const teams = (t.teams || []).map(team => ({
    ...team,
    points: 0,
    finalsPoints: 0,
    adjustments: team.adjustments || []
  }));

  const raceList = Array.isArray(t.races) ? t.races : Object.values(t.races || {});
  const findTeamIdx = (pid) => teams.findIndex(team => team.captainId === pid || (team.memberIds || []).includes(pid));

  raceList.forEach(race => {
    const isFinals = race.stage === 'finals';
    for (const [pid, pos] of Object.entries(race.placements || {})) {
      const points = activePointsSystem[Number(pos)] || 0;
      const tIdx = findTeamIdx(pid);
      if (tIdx !== -1) {
        if (isFinals) teams[tIdx].finalsPoints += points;
        else teams[tIdx].points += points;
      }
    }
  });

  teams.forEach(team => {
    (team.adjustments || []).forEach(adj => {
      if (adj.stage === 'finals') team.finalsPoints += adj.amount;
      else team.points += adj.amount;
    });
  });

  return { teams };
}

// --- Helper math ---

function round1(v) { return Math.round(v * 10) / 10; }
function pct1(num, den) { return den > 0 ? round1((num / den) * 100) : 0; }

// --- Main ---

async function main() {
  await confirmLiveMode();

  // Initialize the Admin SDK (also needed for Cloud Storage)
  initDb();

  // Set storage emulator host if not live
  if (!IS_LIVE) {
    process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';
  }

  console.log(`=== Generate Analytics${IS_LIVE ? ' (LIVE)' : ''}${DRY_RUN ? ' [DRY RUN]' : ''} ===\n`);

  // 1. Fetch all collections
  console.log('Fetching collections...');
  const [seasons, players, participations, racesDocs, tournaments] = await Promise.all([
    listAll('seasons'),
    listAll('players'),
    listAll('participations'),
    listAll('races'),
    listAll('tournaments'),
  ]);

  console.log(`  seasons: ${seasons.length}`);
  console.log(`  players: ${players.length}`);
  console.log(`  participations: ${participations.length}`);
  console.log(`  races: ${racesDocs.length}`);
  console.log(`  tournaments: ${tournaments.length}`);

  // Recalculate team scores from race data so compareTeams works correctly
  for (const t of tournaments) {
    if (t.teams && t.teams.length > 0) {
      const recalced = recalculateTournamentScores(t);
      t.teams = recalced.teams;
    }
  }

  // Build lookups
  const playerMap = new Map(players.map(p => [p.id, p]));
  const tournamentMap = new Map(tournaments.map(t => [t.id, t]));

  // Group tournaments by seasonId
  const tournamentsBySeasonId = new Map();
  for (const t of tournaments) {
    if (t.seasonId) {
      if (!tournamentsBySeasonId.has(t.seasonId)) tournamentsBySeasonId.set(t.seasonId, []);
      tournamentsBySeasonId.get(t.seasonId).push(t);
    }
  }

  // Build season keys: each individual season + "_all"
  const seasonKeys = ['_all', ...seasons.map(s => s.id)];

  // For each season key, determine the set of valid tournament IDs
  function getTournamentIdsForSeason(key) {
    if (key === '_all') return new Set(tournaments.map(t => t.id));
    return new Set((tournamentsBySeasonId.get(key) || []).map(t => t.id));
  }

  // 2. Compute stats for each season key
  console.log('\nComputing stats...');

  const overview = {};
  const playerStats = {};
  const umaStats = {};

  for (const seasonKey of seasonKeys) {
    const validTIds = getTournamentIdsForSeason(seasonKey);
    const fTournaments = tournaments.filter(t => validTIds.has(t.id));
    const fParticipations = participations.filter(p => validTIds.has(p.tournamentId));
    const fRaces = racesDocs.filter(r => r.tournamentId && validTIds.has(r.tournamentId));

    // --- Overview ---
    const uniquePlayerIds = new Set(fParticipations.map(p => p.playerId));
    overview[seasonKey] = {
      totalPlayers: uniquePlayerIds.size,
      totalTournaments: fTournaments.length,
      totalRaces: fRaces.length,
      totalParticipations: fParticipations.length,
      avgPlayersPerTournament: fTournaments.length > 0
        ? round1(fParticipations.length / fTournaments.length) : 0,
      avgRacesPerTournament: fTournaments.length > 0
        ? round1(fRaces.length / fTournaments.length) : 0,
    };

    // --- Player Stats ---
    playerStats[seasonKey] = computePlayerStats(
      fParticipations, fRaces, fTournaments, playerMap, tournamentMap
    );

    // --- Uma Stats ---
    umaStats[seasonKey] = computeUmaStats(
      fParticipations, fRaces, fTournaments, playerMap, tournamentMap
    );

    console.log(`  ${seasonKey}: ${playerStats[seasonKey].length} players, ${umaStats[seasonKey].length} umas`);
  }

  // 3. Build output JSON
  const playersLookup = {};
  for (const p of players) {
    playersLookup[p.id] = { id: p.id, name: p.name };
  }

  const output = {
    generatedAt: new Date().toISOString(),
    version: 1,
    players: playersLookup,
    seasons: seasons
      .map(s => ({ id: s.id, name: s.name, startDate: s.startDate }))
      .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    overview,
    playerStats,
    umaStats,
  };

  // 4. Write locally
  const jsonStr = JSON.stringify(output);
  const filePath = 'analytics.json';
  writeFileSync(filePath, jsonStr);
  console.log(`\nWrote ${filePath} (${(jsonStr.length / 1024).toFixed(1)} KB)`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Skipping upload and metadata write.');
    return;
  }

  // 5. Upload to Cloud Storage using the Admin SDK
  console.log('\nUploading to Cloud Storage...');
  const storageBucketName = `${PROJECT_ID}.firebasestorage.app`;
  const objectName = 'analytics.json';

  const bucket = getStorage().bucket(storageBucketName);
  const file = bucket.file(objectName);

  await file.save(jsonStr, {
    metadata: {
      contentType: 'application/json',
      cacheControl: 'public, max-age=3600'
    },
    resumable: false
  });

  // Build the public download URL
  const downloadUrl = IS_LIVE
      ? `https://firebasestorage.googleapis.com/v0/b/${storageBucketName}/o/${encodeURIComponent(objectName)}?alt=media`
      : `http://127.0.0.1:9199/v0/b/${storageBucketName}/o/${encodeURIComponent(objectName)}?alt=media`;

  console.log(`  Uploaded: ${downloadUrl}`);

  // 6. Write Firestore metadata doc
  console.log('Writing metadata to Firestore...');
  await setDoc('analytics', 'analyticsMetadata', {
    url: downloadUrl,
    generatedAt: output.generatedAt,
    version: output.version,
  });

  console.log('\nDone!');
}

// ============================================================
// Player Stats Computation
// ============================================================

function computePlayerStats(fParticipations, fRaces, fTournaments, playerMap, tournamentMap) {
  const stats = new Map();

  // 1. Build from participations
  for (const p of fParticipations) {
    const player = playerMap.get(p.playerId);
    if (!player) continue;

    if (!stats.has(p.playerId)) {
      stats.set(p.playerId, {
        playerId: p.playerId,
        tournaments: 0,
        completedTournaments: 0,
        tournamentWins: 0,
        races: 0,
        totalPoints: 0,
        wins: 0,
        opponentsFaced: 0,
        opponentsBeaten: 0,
        // Tracking structures (not in final output)
        _tournamentsRecord: [],
        _umas: new Map(), // umaName -> { tournamentIds, racesPlayed, wins, totalPosition, totalPoints }
      });
    }

    const s = stats.get(p.playerId);
    s.tournaments++;
    s.totalPoints += p.totalPoints || 0;

    const t = tournamentMap.get(p.tournamentId);
    if (t) {
      if (t.status === 'completed') s.completedTournaments++;
      s._tournamentsRecord.push({ tId: t.id, tName: t.name, points: p.totalPoints || 0 });
    }
  }

  // 2. Count Tournament Wins
  for (const t of fTournaments) {
    if (t.status !== 'completed' || !t.teams || t.teams.length === 0) continue;
    const finalistTeams = t.teams.filter(team => team.inFinals);
    if (finalistTeams.length === 0) continue;
    const sorted = [...finalistTeams].sort((a, b) => compareTeams(a, b, true, t, true));
    const winningTeam = sorted[0];
    if (!winningTeam) continue;

    for (const p of fParticipations) {
      if (p.tournamentId === t.id && p.teamId === winningTeam.id) {
        const s = stats.get(p.playerId);
        if (s) s.tournamentWins++;
      }
    }
  }

  // 3. Process races for race-level stats + uma tracking
  for (const race of fRaces) {
    const playersInRace = Object.keys(race.placements || {}).length;
    if (playersInRace <= 1) continue;

    for (const [playerId, position] of Object.entries(race.placements || {})) {
      const pos = Number(position);
      const s = stats.get(playerId);
      if (!s) continue;

      s.races++;
      if (pos === 1) s.wins++;
      s.opponentsFaced += (playersInRace - 1);
      s.opponentsBeaten += (playersInRace - pos);

      const umaName = race.umaMapping?.[playerId];
      if (umaName) {
        if (!s._umas.has(umaName)) {
          s._umas.set(umaName, {
            tournamentIds: new Set(),
            racesPlayed: 0,
            wins: 0,
            totalPosition: 0,
            totalPoints: 0,
          });
        }
        const u = s._umas.get(umaName);
        if (race.tournamentId) u.tournamentIds.add(race.tournamentId);
        u.racesPlayed++;
        u.totalPosition += pos;
        if (pos === 1) u.wins++;

        const t = tournamentMap.get(race.tournamentId);
        const pointSystem = t?.pointsSystem || POINTS_SYSTEM;
        u.totalPoints += pointSystem[pos] || 0;
      }
    }
  }

  // 4. Compute per-player uma dominance from race data
  // We need a second pass for per-player-per-uma dominance
  const playerUmaDominance = new Map(); // "playerId|umaName" -> { faced, beaten }
  for (const race of fRaces) {
    const playersInRace = Object.keys(race.placements || {}).length;
    if (playersInRace <= 1) continue;

    for (const [playerId, position] of Object.entries(race.placements || {})) {
      const pos = Number(position);
      const umaName = race.umaMapping?.[playerId];
      if (!umaName) continue;

      const key = `${playerId}|${umaName}`;
      if (!playerUmaDominance.has(key)) playerUmaDominance.set(key, { faced: 0, beaten: 0 });
      const d = playerUmaDominance.get(key);
      d.faced += (playersInRace - 1);
      d.beaten += (playersInRace - pos);
    }
  }

  // 5. Build tournament details per player
  const playerTournamentDetails = new Map(); // playerId -> tournamentDetail[]
  for (const part of fParticipations) {
    const t = tournamentMap.get(part.tournamentId);
    if (!t) continue;

    const tournamentRaces = fRaces.filter(r => r.tournamentId === part.tournamentId);
    let races = 0, wins = 0, opFaced = 0, opBeaten = 0, totalPos = 0, totalPts = 0;
    const pointSystem = t.pointsSystem || POINTS_SYSTEM;

    for (const race of tournamentRaces) {
      const position = race.placements?.[part.playerId];
      if (position === undefined) continue;
      const playersInRace = Object.keys(race.placements).length;
      if (playersInRace <= 1) continue;
      races++;
      totalPos += position;
      totalPts += pointSystem[position] || 0;
      if (position === 1) wins++;
      opFaced += (playersInRace - 1);
      opBeaten += (playersInRace - position);
    }

    // Determine finals status
    const teams = t.teams || [];
    const playerTeam = teams.find(tm =>
      (part.teamId && tm.id === part.teamId) ||
      tm.captainId === part.playerId ||
      tm.memberIds.includes(part.playerId)
    );
    const uniqueGroups = new Set(teams.map(tm => tm.group));
    const hasGroups = uniqueGroups.size > 1;
    const finalistTeams = teams.filter(tm => tm.inFinals);
    const winningTeam = finalistTeams.length > 0
      ? [...finalistTeams].sort((a, b) => compareTeams(a, b, true, t, true))[0]
      : null;

    const wildcards = t.wildcards || [];
    const playerWildcards = wildcards.filter(wc => wc.playerId === part.playerId);
    const isWildcard = playerWildcards.length > 0;
    const wildcardGroups = playerWildcards.map(wc => wc.group);

    let finalsStatus = '-';
    if (teams.length === 0 && t.status === 'active') {
      finalsStatus = '-';
    } else if (playerTeam) {
      if (winningTeam && playerTeam.id === winningTeam.id && t.status === 'completed') finalsStatus = 'winner';
      else if (!hasGroups) finalsStatus = 'no-groups';
      else if (playerTeam.inFinals) finalsStatus = 'finals';
      else if (hasGroups) finalsStatus = 'eliminated';
    }

    const detail = {
      tournamentId: part.tournamentId,
      tournamentName: t.name,
      status: t.status,
      uma: part.uma || '-',
      isWildcard,
      wildcardGroups,
      finalsStatus,
      races,
      wins,
      winRate: pct1(wins, races),
      totalPoints: totalPts,
      avgPoints: races > 0 ? round1(totalPts / races) : 0,
      dominance: pct1(opBeaten, opFaced),
      avgPosition: races > 0 ? round1(totalPos / races) : 0,
    };

    if (!playerTournamentDetails.has(part.playerId)) playerTournamentDetails.set(part.playerId, []);
    playerTournamentDetails.get(part.playerId).push(detail);
  }

  // 6. Finalize and build output array
  const result = [];

  for (const [playerId, s] of stats) {
    const avgPoints = s.races > 0 ? round1(s.totalPoints / s.races) : 0;
    const dominance = pct1(s.opponentsBeaten, s.opponentsFaced);
    const winRate = pct1(s.wins, s.races);
    const tournamentWinRate = pct1(s.tournamentWins, s.completedTournaments);

    // Best tournament
    let bestTournament = null;
    if (s._tournamentsRecord.length > 0) {
      bestTournament = [...s._tournamentsRecord].sort((a, b) => b.points - a.points)[0] || null;
    }

    // Most picked / most winning umas
    let maxTourneyPicks = 0, maxWins = 0;
    const mostPickedUmas = [];
    const mostWinningUmas = [];

    for (const [name, val] of s._umas) {
      const tourneyCount = val.tournamentIds.size;

      if (tourneyCount > maxTourneyPicks) {
        maxTourneyPicks = tourneyCount;
        mostPickedUmas.length = 0;
        mostPickedUmas.push({
          name, count: tourneyCount, wins: val.wins,
          avgPosition: val.racesPlayed > 0 ? round1(val.totalPosition / val.racesPlayed) : 0
        });
      } else if (tourneyCount === maxTourneyPicks && tourneyCount > 0) {
        mostPickedUmas.push({
          name, count: tourneyCount, wins: val.wins,
          avgPosition: val.racesPlayed > 0 ? round1(val.totalPosition / val.racesPlayed) : 0
        });
      }

      if (val.wins > maxWins) {
        maxWins = val.wins;
        mostWinningUmas.length = 0;
        mostWinningUmas.push({
          name, count: val.racesPlayed, wins: val.wins,
          winRate: val.racesPlayed > 0 ? Math.round((val.wins / val.racesPlayed) * 100) : 0
        });
      } else if (val.wins === maxWins && maxWins > 0) {
        mostWinningUmas.push({
          name, count: val.racesPlayed, wins: val.wins,
          winRate: val.racesPlayed > 0 ? Math.round((val.wins / val.racesPlayed) * 100) : 0
        });
      }
    }

    // Uma details (per-player uma breakdown)
    const umaDetails = [];
    for (const [name, val] of s._umas) {
      const domKey = `${playerId}|${name}`;
      const dom = playerUmaDominance.get(domKey) || { faced: 0, beaten: 0 };
      umaDetails.push({
        name,
        picks: val.tournamentIds.size,
        racesPlayed: val.racesPlayed,
        wins: val.wins,
        winRate: pct1(val.wins, val.racesPlayed),
        totalPoints: val.totalPoints,
        avgPoints: val.racesPlayed > 0 ? round1(val.totalPoints / val.racesPlayed) : 0,
        totalPosition: val.totalPosition,
        avgPosition: val.racesPlayed > 0 ? round1(val.totalPosition / val.racesPlayed) : 0,
        opponentsFaced: dom.faced,
        opponentsBeaten: dom.beaten,
        dominance: pct1(dom.beaten, dom.faced),
      });
    }

    result.push({
      playerId,
      tournaments: s.tournaments,
      completedTournaments: s.completedTournaments,
      tournamentWins: s.tournamentWins,
      tournamentWinRate,
      races: s.races,
      wins: s.wins,
      winRate,
      totalPoints: s.totalPoints,
      avgPoints,
      opponentsFaced: s.opponentsFaced,
      opponentsBeaten: s.opponentsBeaten,
      dominance,
      bestTournament,
      mostPickedUmas,
      mostWinningUmas,
      tournamentDetails: playerTournamentDetails.get(playerId) || [],
      umaDetails,
    });
  }

  return result;
}

// ============================================================
// Uma Stats Computation
// ============================================================

function computeUmaStats(fParticipations, fRaces, fTournaments, playerMap, tournamentMap) {
  const umaData = new Map();

  const initUma = (name) => ({
    name,
    timesPlayed: 0,
    picks: 0,
    wins: 0,
    bans: 0,
    totalPosition: 0,
    totalPoints: 0,
    opponentsFaced: 0,
    opponentsBeaten: 0,
    _tournamentIds: new Set(),
    _presenceTournaments: new Set(),
    _pickInstances: new Set(),
    _teamInstances: new Set(),
    _teamWins: 0,
  });

  // 1. Process Bans
  for (const t of fTournaments) {
    if (t.bans) {
      for (const bannedUma of t.bans) {
        if (!umaData.has(bannedUma)) umaData.set(bannedUma, initUma(bannedUma));
        const s = umaData.get(bannedUma);
        s.bans++;
        s._presenceTournaments.add(t.id);
      }
    }
  }

  // 2. Process Races & Picks
  for (const race of fRaces) {
    const playersInRace = Object.keys(race.placements || {}).length;
    if (playersInRace <= 1) continue;

    for (const [playerId, uma] of Object.entries(race.umaMapping || {})) {
      if (!uma) continue;
      if (!umaData.has(uma)) umaData.set(uma, initUma(uma));
      const s = umaData.get(uma);
      s.timesPlayed++;

      if (race.tournamentId) {
        s._tournamentIds.add(race.tournamentId);
        s._presenceTournaments.add(race.tournamentId);
        s._pickInstances.add(`${race.tournamentId}_${playerId}`);
      }

      const position = race.placements?.[playerId];
      if (position) {
        s.totalPosition += position;
        if (position === 1) s.wins++;
        s.opponentsFaced += (playersInRace - 1);
        s.opponentsBeaten += (playersInRace - position);

        const t = tournamentMap.get(race.tournamentId);
        const pointSystem = t?.pointsSystem || POINTS_SYSTEM;
        s.totalPoints += pointSystem[position] || 0;
      }
    }
  }

  // 2b. Tournament win rate per uma
  const winningTeamByTournament = new Map();
  for (const t of fTournaments) {
    if (t.status !== 'completed' || !t.teams || t.teams.length === 0) continue;
    const finalistTeams = t.teams.filter(team => team.inFinals);
    if (finalistTeams.length === 0) continue;
    const sorted = [...finalistTeams].sort((a, b) => compareTeams(a, b, true, t, true));
    if (sorted[0]) winningTeamByTournament.set(t.id, sorted[0].id);
  }

  const playerTeamMap = new Map();
  for (const p of fParticipations) {
    if (p.teamId) playerTeamMap.set(`${p.tournamentId}_${p.playerId}`, p.teamId);
  }

  for (const race of fRaces) {
    if (!race.tournamentId) continue;
    for (const [playerId, uma] of Object.entries(race.umaMapping || {})) {
      if (!uma) continue;
      const s = umaData.get(uma);
      if (!s) continue;

      const teamId = playerTeamMap.get(`${race.tournamentId}_${playerId}`);
      if (!teamId) continue;

      const teamKey = `${race.tournamentId}_${teamId}`;
      if (!s._teamInstances.has(teamKey)) {
        s._teamInstances.add(teamKey);
        if (winningTeamByTournament.get(race.tournamentId) === teamId) {
          s._teamWins++;
        }
      }
    }
  }

  // 3. Build tournament appearances and player aggregates
  const umaTournamentAppearances = new Map(); // umaName -> row[]
  const umaPlayerAggregates = new Map(); // umaName -> Map<playerId, aggregate>

  for (const part of fParticipations) {
    const umaName = part.uma;
    if (!umaName || !umaData.has(umaName)) continue;

    const t = tournamentMap.get(part.tournamentId);
    if (!t) continue;

    const player = playerMap.get(part.playerId);
    const playerName = player?.name || part.playerId;

    const tournamentRaces = fRaces.filter(r => r.tournamentId === part.tournamentId);
    let races = 0, wins = 0, opFaced = 0, opBeaten = 0, totalPos = 0, totalPts = 0;
    const pointSystem = t.pointsSystem || POINTS_SYSTEM;

    for (const race of tournamentRaces) {
      const position = race.placements?.[part.playerId];
      if (position === undefined) continue;
      const playersInRace = Object.keys(race.placements).length;
      if (playersInRace <= 1) continue;
      races++;
      totalPos += position;
      totalPts += (pointSystem[position] || 0);
      if (position === 1) wins++;
      opFaced += (playersInRace - 1);
      opBeaten += (playersInRace - position);
    }

    // Tournament appearance row
    if (!umaTournamentAppearances.has(umaName)) umaTournamentAppearances.set(umaName, []);
    umaTournamentAppearances.get(umaName).push({
      tournamentId: part.tournamentId,
      tournamentName: t.name,
      playerId: part.playerId,
      playerName,
      races,
      wins,
      winRate: pct1(wins, races),
      totalPoints: totalPts,
      avgPoints: races > 0 ? round1(totalPts / races) : 0,
      dominance: pct1(opBeaten, opFaced),
      avgPosition: races > 0 ? round1(totalPos / races) : 0,
    });

    // Player aggregate
    if (!umaPlayerAggregates.has(umaName)) umaPlayerAggregates.set(umaName, new Map());
    const playerAggs = umaPlayerAggregates.get(umaName);
    if (!playerAggs.has(part.playerId)) {
      playerAggs.set(part.playerId, {
        playerId: part.playerId, playerName,
        tournaments: 0, racesPlayed: 0, wins: 0,
        opFaced: 0, opBeaten: 0, totalPos: 0, totalPts: 0,
      });
    }
    const agg = playerAggs.get(part.playerId);
    agg.tournaments++;
    agg.racesPlayed += races;
    agg.wins += wins;
    agg.opFaced += opFaced;
    agg.opBeaten += opBeaten;
    agg.totalPos += totalPos;
    agg.totalPts += totalPts;
  }

  // 4. Calculate final stats and build output
  const totalTournaments = fTournaments.length;
  let totalOverallPicks = 0;
  for (const s of umaData.values()) {
    s.picks = s._pickInstances.size;
    totalOverallPicks += s.picks;
  }

  const result = [];
  for (const [name, s] of umaData) {
    const tournamentCount = s._presenceTournaments.size;
    const tournamentsPicked = s._tournamentIds.size;

    const winRate = pct1(s.wins, s.timesPlayed);
    const tournamentWinRate = s._teamInstances.size > 0
      ? pct1(s._teamWins, s._teamInstances.size) : 0;
    const avgPoints = s.timesPlayed > 0 ? round1(s.totalPoints / s.timesPlayed) : 0;
    const avgPosition = s.timesPlayed > 0 ? round1(s.totalPosition / s.timesPlayed) : 0;
    const dominance = pct1(s.opponentsBeaten, s.opponentsFaced);
    const banRate = pct1(s.bans, totalTournaments);
    const pickRate = pct1(s.picks, totalOverallPicks);
    const presence = pct1(s._presenceTournaments.size, totalTournaments);

    // Player aggregates for this uma
    const playerAggMap = umaPlayerAggregates.get(name);
    const playerAggregates = playerAggMap ? Array.from(playerAggMap.values()).map(a => ({
      playerId: a.playerId,
      playerName: a.playerName,
      tournaments: a.tournaments,
      racesPlayed: a.racesPlayed,
      wins: a.wins,
      winRate: pct1(a.wins, a.racesPlayed),
      totalPoints: a.totalPts,
      avgPoints: a.racesPlayed > 0 ? round1(a.totalPts / a.racesPlayed) : 0,
      dominance: pct1(a.opBeaten, a.opFaced),
      totalPosition: a.totalPos,
      avgPosition: a.racesPlayed > 0 ? round1(a.totalPos / a.racesPlayed) : 0,
      opponentsFaced: a.opFaced,
      opponentsBeaten: a.opBeaten,
    })) : [];

    result.push({
      name,
      timesPlayed: s.timesPlayed,
      picks: s.picks,
      wins: s.wins,
      bans: s.bans,
      totalPoints: s.totalPoints,
      totalPosition: s.totalPosition,
      avgPoints,
      winRate,
      dominance,
      avgPosition,
      tournamentWinRate,
      banRate,
      pickRate,
      presence,
      tournamentsPicked,
      tournamentCount,
      totalPicks: totalOverallPicks,
      opponentsFaced: s.opponentsFaced,
      opponentsBeaten: s.opponentsBeaten,
      tournamentAppearances: umaTournamentAppearances.get(name) || [],
      playerAggregates,
    });
  }

  return result;
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
