import { onCall, HttpsError } from "firebase-functions/v2/https";
import { resolveCaptainTeam } from "./captain";

// ---------------------------------------------------------------------------
// recalculateTeams
//
// Replicates the client-side recalculateTournamentScores() for teams only.
// Points are summed from all races then adjustments are applied.
// ---------------------------------------------------------------------------
function recalculateTeams(tournament: any): any[] {
  const pointsSystem = tournament.pointsSystem || {};
  const defaultPoints: Record<number, number> = {
    1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2,
  };
  const activePoints =
    Object.keys(pointsSystem).length > 0 ? pointsSystem : defaultPoints;

  const teams = ((tournament.teams ?? []) as any[]).map((t: any) => ({
    ...t,
    stagePoints: {},
    adjustments: t.adjustments || [],
  }));

  const findTeamIdx = (pid: string) =>
    teams.findIndex(
      (t: any) => t.captainId === pid || (t.memberIds ?? []).includes(pid)
    );

  Object.values(tournament.races ?? {}).forEach((race: any) => {
    const stageName = race.stage as string;
    Object.entries(race.placements ?? {}).forEach(([pid, pos]) => {
      const pts = activePoints[Number(pos)] || 0;
      const idx = findTeamIdx(pid);
      if (idx !== -1) {
        teams[idx].stagePoints[stageName] = (teams[idx].stagePoints[stageName] ?? 0) + pts;
      }
    });
  });

  teams.forEach((t: any) => {
    (t.adjustments || []).forEach((adj: any) => {
      const adjStage = adj.stage as string;
      t.stagePoints[adjStage] = (t.stagePoints[adjStage] ?? 0) + adj.amount;
    });
  });

  return teams;
}

// ---------------------------------------------------------------------------
// captainSaveTapResults
//
// Callable: captain submits a full set of race placements (tap-to-rank style).
// Replaces the race document and recalculates team scores.
// ---------------------------------------------------------------------------
export const captainSaveTapResults = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const { tournamentId, appId: clientAppId, group, raceNumber, placements } =
    request.data as {
      tournamentId: string;
      appId: string;
      group: string;
      raceNumber: number;
      placements: Record<string, number>;
    };
  if (!tournamentId || !group || !raceNumber || !placements) {
    throw new HttpsError("invalid-argument", "Missing required fields.");
  }
  const appId = clientAppId || "default-app";

  const { team, tournament, tournamentRef } =
    await resolveCaptainTeam(request.auth.uid, appId, tournamentId);

  if (tournament.status !== "active") {
    throw new HttpsError("failed-precondition", "Tournament is not active.");
  }

  const currentStageConfig = (tournament.stages ?? [])[tournament.currentStageIndex ?? 0];
  const stageName = (currentStageConfig?.name ?? tournament.stage ?? "") as string;
  const teamGroup = (team.stageGroups ?? {})[stageName];
  if (teamGroup !== group) {
    throw new HttpsError("permission-denied", "Your team is not in that group.");
  }
  const isQualified = (team.qualifiedStages ?? []).includes(stageName);
  if (!isQualified) {
    throw new HttpsError("permission-denied", "Your team did not qualify for this stage.");
  }

  const key = `${stageName}-${group}-${raceNumber}`;
  const existingRaces = tournament.races ?? {};
  const raceData = {
    id: existingRaces[key]?.id || crypto.randomUUID(),
    stage: stageName,
    group,
    raceNumber: Number(raceNumber),
    timestamp: new Date().toISOString(),
    placements,
  };

  const updatedTeams = recalculateTeams({
    ...tournament,
    races: { ...existingRaces, [key]: raceData },
  });

  await tournamentRef.update({
    [`races.${key}`]: raceData,
    teams: updatedTeams,
  });

  return { success: true };
});

// ---------------------------------------------------------------------------
// captainUpdateRacePlacement
//
// Callable: captain updates a single player's position in a race (dropdown
// style). Read-modify-write is performed server-side to stay atomic.
// ---------------------------------------------------------------------------
export const captainUpdateRacePlacement = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
  const {
    tournamentId,
    appId: clientAppId,
    group,
    raceNumber,
    position,
    playerId: targetPlayerId,
  } = request.data as {
    tournamentId: string;
    appId: string;
    group: string;
    raceNumber: number;
    position: number;
    playerId: string;
  };
  if (!tournamentId || !group || !raceNumber || position === undefined) {
    throw new HttpsError("invalid-argument", "Missing required fields.");
  }
  const appId = clientAppId || "default-app";

  const { team, tournament, tournamentRef } =
    await resolveCaptainTeam(request.auth.uid, appId, tournamentId);

  if (tournament.status !== "active") {
    throw new HttpsError("failed-precondition", "Tournament is not active.");
  }

  const currentStageConfig = (tournament.stages ?? [])[tournament.currentStageIndex ?? 0];
  const stageName = (currentStageConfig?.name ?? tournament.stage ?? "") as string;
  const teamGroup = (team.stageGroups ?? {})[stageName];
  if (teamGroup !== group) {
    throw new HttpsError("permission-denied", "Your team is not in that group.");
  }
  const isQualified = (team.qualifiedStages ?? []).includes(stageName);
  if (!isQualified) {
    throw new HttpsError("permission-denied", "Your team did not qualify for this stage.");
  }

  const key = `${stageName}-${group}-${raceNumber}`;
  const existingRaces = tournament.races ?? {};
  const existingRace = existingRaces[key];
  const raceData = existingRace ?
    { ...existingRace } :
    {
      "id": crypto.randomUUID(),
      "stage": stageName,
      "group": group,
      "raceNumber": Number(raceNumber),
      "timestamp": new Date().toISOString(),
      "placements": {},
    };

  const newPlacements: Record<string, number> = { ...(raceData.placements ?? {}) };

  // Remove player from their current slot
  if (targetPlayerId) {
    delete newPlacements[targetPlayerId];
  }
  // Evict whoever was at this position
  for (const [pid, pos] of Object.entries(newPlacements)) {
    if (pos === Number(position)) delete newPlacements[pid];
  }
  // Place the player
  if (targetPlayerId) {
    newPlacements[targetPlayerId] = Number(position);
  }

  raceData.placements = newPlacements;
  raceData.timestamp = new Date().toISOString();

  const updatedTeams = recalculateTeams({
    ...tournament,
    races: { ...existingRaces, [key]: raceData },
  });

  await tournamentRef.update({
    [`races.${key}`]: raceData,
    teams: updatedTeams,
  });

  return { success: true };
});
