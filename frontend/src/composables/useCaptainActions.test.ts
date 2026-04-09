import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import type { Tournament, Team } from '../types';

// Shared callable mock — all httpsCallable results point here
const mockCallable = vi.fn().mockResolvedValue({ data: {} });
vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => mockCallable),
}));
vi.mock('../firebase', () => ({ functions: {} }));

// Control linkedPlayer from tests
const mockLinkedPlayer = ref<{ id: string } | null>(null);
vi.mock('./useAuth', () => ({
  useAuth: () => ({ linkedPlayer: mockLinkedPlayer }),
}));

import { useCaptainActions } from './useCaptainActions';
import { httpsCallable } from 'firebase/functions';

const TWO_STAGE_PRESET = [
  { name: 'groups', label: 'Group Stage', groups: ['A', 'B'], racesRequired: 5, teamsAdvancingPerGroup: 1 },
  { name: 'finals', label: 'Finals', groups: ['A'], racesRequired: 5, teamsAdvancingPerGroup: 0 },
];

const makeTeam = (overrides: Partial<Team> = {}): Team => ({
  id: 'team1', captainId: 'p1', memberIds: ['p2'], name: 'Team 1',
  stagePoints: { groups: 0 }, stageGroups: { groups: 'A' }, qualifiedStages: ['groups'],
  ...overrides,
});

const makeTournament = (overrides: Partial<Tournament> = {}): Tournament => ({
  id: 't1', name: 'Test', status: 'draft',
  stages: TWO_STAGE_PRESET, currentStageIndex: 0,
  playerIds: [], players: {}, teams: [], races: {}, createdAt: new Date().toISOString(),
  captainActionsEnabled: true, ...overrides,
});

describe('useCaptainActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLinkedPlayer.value = null;
    mockCallable.mockResolvedValue({ data: {} });
  });

  // ── captainTeam ───────────────────────────────────────────────────────────

  describe('captainTeam', () => {
    it('is null when tournament is null', () => {
      const { captainTeam } = useCaptainActions(ref(null));
      expect(captainTeam.value).toBeNull();
    });

    it('is null when linkedPlayer is null', () => {
      mockLinkedPlayer.value = null;
      const { captainTeam } = useCaptainActions(ref(makeTournament({ teams: [makeTeam()] })));
      expect(captainTeam.value).toBeNull();
    });

    it('returns the team the linked player captains', () => {
      mockLinkedPlayer.value = { id: 'p1' };
      const team = makeTeam({ captainId: 'p1' });
      const { captainTeam } = useCaptainActions(ref(makeTournament({ teams: [team] })));
      expect(captainTeam.value?.id).toBe('team1');
    });

    it('is null when linked player does not captain any team', () => {
      mockLinkedPlayer.value = { id: 'p99' };
      const { captainTeam } = useCaptainActions(ref(makeTournament({ teams: [makeTeam()] })));
      expect(captainTeam.value).toBeNull();
    });
  });

  // ── isCaptain ────────────────────────────────────────────────────────────

  describe('isCaptain', () => {
    it('is false when captainActionsEnabled is false', () => {
      mockLinkedPlayer.value = { id: 'p1' };
      const team = makeTeam({ captainId: 'p1' });
      const { isCaptain } = useCaptainActions(
        ref(makeTournament({ teams: [team], captainActionsEnabled: false }))
      );
      expect(isCaptain.value).toBe(false);
    });

    it('is false when user does not captain a team', () => {
      mockLinkedPlayer.value = { id: 'p99' };
      const { isCaptain } = useCaptainActions(ref(makeTournament({ teams: [makeTeam()] })));
      expect(isCaptain.value).toBe(false);
    });

    it('is true when captainActionsEnabled and user captains a team', () => {
      mockLinkedPlayer.value = { id: 'p1' };
      const team = makeTeam({ captainId: 'p1' });
      const { isCaptain } = useCaptainActions(ref(makeTournament({ teams: [team] })));
      expect(isCaptain.value).toBe(true);
    });
  });

  // ── isMyPlayerDraftTurn ───────────────────────────────────────────────────

  describe('isMyPlayerDraftTurn', () => {
    it('is false when not a captain', () => {
      mockLinkedPlayer.value = null;
      const { isMyPlayerDraftTurn } = useCaptainActions(ref(makeTournament()));
      expect(isMyPlayerDraftTurn.value).toBe(false);
    });

    it('is false when no draft on tournament', () => {
      mockLinkedPlayer.value = { id: 'p1' };
      const team = makeTeam({ captainId: 'p1' });
      const { isMyPlayerDraftTurn } = useCaptainActions(ref(makeTournament({ teams: [team] })));
      expect(isMyPlayerDraftTurn.value).toBe(false);
    });

    it('is true when it is this team\'s turn', () => {
      mockLinkedPlayer.value = { id: 'p1' };
      const team = makeTeam({ id: 'team1', captainId: 'p1' });
      const t = makeTournament({ teams: [team], draft: { order: ['team1', 'team2'], currentIdx: 0 } });
      const { isMyPlayerDraftTurn } = useCaptainActions(ref(t));
      expect(isMyPlayerDraftTurn.value).toBe(true);
    });

    it('is false when it is another team\'s turn', () => {
      mockLinkedPlayer.value = { id: 'p1' };
      const team = makeTeam({ id: 'team1', captainId: 'p1' });
      const t = makeTournament({ teams: [team], draft: { order: ['team2', 'team1'], currentIdx: 0 } });
      const { isMyPlayerDraftTurn } = useCaptainActions(ref(t));
      expect(isMyPlayerDraftTurn.value).toBe(false);
    });
  });

  // ── isMyUmaDraftTurn ──────────────────────────────────────────────────────

  describe('isMyUmaDraftTurn', () => {
    it('mirrors isMyPlayerDraftTurn logic', () => {
      mockLinkedPlayer.value = { id: 'p1' };
      const team = makeTeam({ id: 'team1', captainId: 'p1' });
      const t = makeTournament({ teams: [team], draft: { order: ['team1'], currentIdx: 0 } });
      const { isMyUmaDraftTurn } = useCaptainActions(ref(t));
      expect(isMyUmaDraftTurn.value).toBe(true);
    });
  });

  // ── canCaptainEditGroup ───────────────────────────────────────────────────

  describe('canCaptainEditGroup', () => {
    it('returns false when not a captain', () => {
      mockLinkedPlayer.value = null;
      const { canCaptainEditGroup } = useCaptainActions(ref(makeTournament()));
      expect(canCaptainEditGroup('A')).toBe(false);
    });

    it('returns true for correct group in groups stage', () => {
      mockLinkedPlayer.value = { id: 'p1' };
      const team = makeTeam({ captainId: 'p1', stageGroups: { groups: 'B' }, qualifiedStages: ['groups'] });
      const t = makeTournament({ teams: [team], currentStageIndex: 0 });
      const { canCaptainEditGroup } = useCaptainActions(ref(t));
      expect(canCaptainEditGroup('B')).toBe(true);
      expect(canCaptainEditGroup('A')).toBe(false);
    });

    it('returns true in finals stage when team qualified', () => {
      mockLinkedPlayer.value = { id: 'p1' };
      const team = makeTeam({ captainId: 'p1', stageGroups: { groups: 'A', finals: 'A' }, qualifiedStages: ['groups', 'finals'] });
      const t = makeTournament({ teams: [team], currentStageIndex: 1 });
      const { canCaptainEditGroup } = useCaptainActions(ref(t));
      expect(canCaptainEditGroup('A')).toBe(true);
    });

    it('returns false in finals stage when team did not qualify', () => {
      mockLinkedPlayer.value = { id: 'p1' };
      const team = makeTeam({ captainId: 'p1', stageGroups: { groups: 'A' }, qualifiedStages: ['groups'] });
      const t = makeTournament({ teams: [team], currentStageIndex: 1 });
      const { canCaptainEditGroup } = useCaptainActions(ref(t));
      expect(canCaptainEditGroup('A')).toBe(false);
    });
  });

  // ── cloud function callers ────────────────────────────────────────────────

  describe('httpsCallable registration', () => {
    it('registers all five cloud functions', () => {
      useCaptainActions(ref(null));
      const names = (vi.mocked(httpsCallable).mock.calls as any[]).map(c => c[1]);
      expect(names).toContain('captainDraftPlayer');
      expect(names).toContain('captainPickUma');
      expect(names).toContain('captainSubmitUma');
      expect(names).toContain('captainSaveTapResults');
      expect(names).toContain('captainUpdateRacePlacement');
    });
  });

  describe('captainDraftPlayer', () => {
    it('does nothing when tournament is null', async () => {
      const { captainDraftPlayer } = useCaptainActions(ref(null));
      await captainDraftPlayer('p2');
      expect(mockCallable).not.toHaveBeenCalled();
    });

    it('calls the cloud function with correct args', async () => {
      const { captainDraftPlayer } = useCaptainActions(ref(makeTournament({ id: 't1' })));
      await captainDraftPlayer('p2');
      expect(mockCallable).toHaveBeenCalledWith({ tournamentId: 't1', appId: 'default-app', targetPlayerId: 'p2' });
    });
  });

  describe('captainPickUma', () => {
    it('does nothing when tournament is null', async () => {
      const { captainPickUma } = useCaptainActions(ref(null));
      await captainPickUma('Gold Ship');
      expect(mockCallable).not.toHaveBeenCalled();
    });

    it('calls the cloud function with correct args', async () => {
      const { captainPickUma } = useCaptainActions(ref(makeTournament({ id: 't1' })));
      await captainPickUma('Gold Ship');
      expect(mockCallable).toHaveBeenCalledWith({ tournamentId: 't1', appId: 'default-app', umaId: 'Gold Ship' });
    });
  });

  describe('captainSubmitUma', () => {
    it('does nothing when tournament is null', async () => {
      const { captainSubmitUma } = useCaptainActions(ref(null));
      await captainSubmitUma('p2', 'Gold Ship');
      expect(mockCallable).not.toHaveBeenCalled();
    });

    it('calls the cloud function with correct args', async () => {
      const { captainSubmitUma } = useCaptainActions(ref(makeTournament({ id: 't1' })));
      await captainSubmitUma('p2', 'Gold Ship');
      expect(mockCallable).toHaveBeenCalledWith({ tournamentId: 't1', appId: 'default-app', playerId: 'p2', umaId: 'Gold Ship' });
    });
  });

  describe('captainSaveTapResults', () => {
    it('does nothing when tournament is null', async () => {
      const { captainSaveTapResults } = useCaptainActions(ref(null));
      await captainSaveTapResults('A', 1, {});
      expect(mockCallable).not.toHaveBeenCalled();
    });

    it('calls the cloud function with correct args', async () => {
      const { captainSaveTapResults } = useCaptainActions(ref(makeTournament({ id: 't1' })));
      const placements = { p1: 1, p2: 2 };
      await captainSaveTapResults('A', 3, placements);
      expect(mockCallable).toHaveBeenCalledWith({ tournamentId: 't1', appId: 'default-app', group: 'A', raceNumber: 3, placements });
    });
  });

  describe('captainUpdateRacePlacement', () => {
    it('does nothing when tournament is null', async () => {
      const { captainUpdateRacePlacement } = useCaptainActions(ref(null));
      await captainUpdateRacePlacement('A', 1, 2, 'p1');
      expect(mockCallable).not.toHaveBeenCalled();
    });

    it('calls the cloud function with correct args', async () => {
      const { captainUpdateRacePlacement } = useCaptainActions(ref(makeTournament({ id: 't1' })));
      await captainUpdateRacePlacement('B', 2, 3, 'p1');
      expect(mockCallable).toHaveBeenCalledWith({ tournamentId: 't1', appId: 'default-app', group: 'B', raceNumber: 2, position: 3, playerId: 'p1' });
    });
  });
});
