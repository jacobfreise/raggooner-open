import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase/firestore', () => ({
  arrayUnion: vi.fn((val) => ({ _union: val })),
  arrayRemove: vi.fn((val) => ({ _remove: val })),
  deleteField: vi.fn(() => ({ _delete: true })),
}));

vi.mock('../utils/umaData', () => ({
  UMA_DICT: {
    'Silence Suzuka': {},
    'Special Week': {},
    'Tokai Teio': {},
  },
  getUmaImagePath: vi.fn(),
}));

import { ref } from 'vue';
import { useRoster } from './useRoster';
import type { Tournament, Team } from '../types';

const makePlayer = (id: string, isCaptain = false, uma = '') => ({
  id, name: `Player ${id}`, isCaptain, uma,
});

const SMALL_PRESET = [
  { name: 'finals', label: 'Finals', groups: ['A'], racesRequired: 5, teamsAdvancingPerGroup: 0 },
];

const makeTeam = (overrides: Partial<Team> = {}): Team => ({
  id: 'team1', captainId: 'p1', memberIds: [], name: 'Team 1',
  stagePoints: { finals: 0 }, stageGroups: { finals: 'A' }, qualifiedStages: ['finals'],
  ...overrides,
});

const makeTournament = (overrides: Partial<Tournament> = {}): Tournament => ({
  id: 't1',
  name: 'Test',
  status: 'registration',
  stages: SMALL_PRESET,
  currentStageIndex: 0,
  playerIds: [],
  players: {},
  teams: [],
  races: {},
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe('useRoster', () => {
  let secureUpdate: ReturnType<typeof vi.fn>;
  let isAdmin: ReturnType<typeof ref<boolean>>;

  beforeEach(() => {
    vi.clearAllMocks();
    secureUpdate = vi.fn().mockResolvedValue(undefined);
    isAdmin = ref(true);
    vi.stubGlobal('alert', vi.fn());
  });

  // ── validTeamCount ────────────────────────────────────────────────────────────

  describe('validTeamCount', () => {
    it('returns false when tournament is null', () => {
      const { validTeamCount } = useRoster(ref(null), secureUpdate, isAdmin);
      expect(validTeamCount.value).toBe(false);
    });

    it('returns false for fewer than 3 captains', () => {
      const players = { p1: makePlayer('p1', true), p2: makePlayer('p2', false) };
      const { validTeamCount } = useRoster(ref(makeTournament({ players })), secureUpdate, isAdmin);
      expect(validTeamCount.value).toBe(false);
    });

    it('returns false for exactly 7 captains (forbidden count)', () => {
      const players = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`p${i}`, makePlayer(`p${i}`, true)]));
      const { validTeamCount } = useRoster(ref(makeTournament({ players })), secureUpdate, isAdmin);
      expect(validTeamCount.value).toBe(false);
    });

    it('returns false for more than 9 captains', () => {
      const players = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`p${i}`, makePlayer(`p${i}`, true)]));
      const { validTeamCount } = useRoster(ref(makeTournament({ players })), secureUpdate, isAdmin);
      expect(validTeamCount.value).toBe(false);
    });

    it('returns true for 3 captains', () => {
      const players = Object.fromEntries(Array.from({ length: 3 }, (_, i) => [`p${i}`, makePlayer(`p${i}`, true)]));
      const { validTeamCount } = useRoster(ref(makeTournament({ players })), secureUpdate, isAdmin);
      expect(validTeamCount.value).toBe(true);
    });

    it('returns true for 9 captains', () => {
      const players = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`p${i}`, makePlayer(`p${i}`, true)]));
      const { validTeamCount } = useRoster(ref(makeTournament({ players })), secureUpdate, isAdmin);
      expect(validTeamCount.value).toBe(true);
    });
  });

  // ── validTotalPlayers ─────────────────────────────────────────────────────────

  describe('validTotalPlayers', () => {
    it('returns false when tournament is null', () => {
      const { validTotalPlayers } = useRoster(ref(null), secureUpdate, isAdmin);
      expect(validTotalPlayers.value).toBe(false);
    });

    it('returns true when total players equals captains * 3', () => {
      const players: Record<string, any> = {};
      for (let i = 0; i < 3; i++) players[`c${i}`] = makePlayer(`c${i}`, true);
      for (let i = 0; i < 6; i++) players[`m${i}`] = makePlayer(`m${i}`, false);
      const { validTotalPlayers } = useRoster(ref(makeTournament({ players })), secureUpdate, isAdmin);
      expect(validTotalPlayers.value).toBe(true);
    });

    it('returns false when player count does not match captains * 3', () => {
      const players = {
        c0: makePlayer('c0', true), c1: makePlayer('c1', true), c2: makePlayer('c2', true),
        m0: makePlayer('m0', false),
      };
      const { validTotalPlayers } = useRoster(ref(makeTournament({ players })), secureUpdate, isAdmin);
      expect(validTotalPlayers.value).toBe(false);
    });
  });

  // ── canStartDraft ─────────────────────────────────────────────────────────────

  describe('canStartDraft', () => {
    it('is true when both validTeamCount and validTotalPlayers are satisfied', () => {
      const players: Record<string, any> = {};
      for (let i = 0; i < 3; i++) players[`c${i}`] = makePlayer(`c${i}`, true);
      for (let i = 0; i < 6; i++) players[`m${i}`] = makePlayer(`m${i}`, false);
      const { canStartDraft } = useRoster(ref(makeTournament({ players })), secureUpdate, isAdmin);
      expect(canStartDraft.value).toBe(true);
    });

    it('is false when validTeamCount is satisfied but validTotalPlayers is not', () => {
      const players = Object.fromEntries(Array.from({ length: 3 }, (_, i) => [`p${i}`, makePlayer(`p${i}`, true)]));
      const { canStartDraft } = useRoster(ref(makeTournament({ players })), secureUpdate, isAdmin);
      expect(canStartDraft.value).toBe(false);
    });
  });

  // ── getUmaList ────────────────────────────────────────────────────────────────

  describe('getUmaList', () => {
    it('returns the full sorted uma list for non-draft format', () => {
      const { getUmaList } = useRoster(ref(makeTournament({ format: 'uma-ban' })), secureUpdate, isAdmin);
      expect(getUmaList('p1')).toEqual(['Silence Suzuka', 'Special Week', 'Tokai Teio']);
    });

    it('returns the full list when the player has no team in uma-draft', () => {
      const { getUmaList } = useRoster(ref(makeTournament({ format: 'uma-draft', teams: [] })), secureUpdate, isAdmin);
      expect(getUmaList('p1')).toEqual(['Silence Suzuka', 'Special Week', 'Tokai Teio']);
    });

    it('returns team pool minus umas held by teammates', () => {
      const tournament = ref(makeTournament({
        format: 'uma-draft',
        teams: [makeTeam({
          captainId: 'p1', memberIds: ['p2'],
          umaPool: ['Special Week', 'Silence Suzuka', 'Tokai Teio'],
        })],
        players: {
          p1: makePlayer('p1', true, ''),
          p2: makePlayer('p2', false, 'Special Week'),
        },
      }));
      const { getUmaList } = useRoster(tournament, secureUpdate, isAdmin);
      // p2 holds Special Week, so p1 should see the remaining two
      expect(getUmaList('p1')).toEqual(['Silence Suzuka', 'Tokai Teio']);
    });

    it('returns full list for a wildcard player (not on any team) in uma-draft', () => {
      const tournament = ref(makeTournament({
        format: 'uma-draft',
        teams: [makeTeam({ captainId: 'p1', memberIds: [] })],
        players: { wc: makePlayer('wc') },
      }));
      const { getUmaList } = useRoster(tournament, secureUpdate, isAdmin);
      expect(getUmaList('wc')).toEqual(['Silence Suzuka', 'Special Week', 'Tokai Teio']);
    });
  });

  // ── addPlayer ─────────────────────────────────────────────────────────────────

  describe('addPlayer', () => {
    it('does nothing when tournament is null', async () => {
      const { addPlayer } = useRoster(ref(null), secureUpdate, isAdmin);
      await addPlayer();
      expect(secureUpdate).not.toHaveBeenCalled();
    });

    it('does nothing when called without a global player and newPlayerName is empty', async () => {
      const { addPlayer } = useRoster(ref(makeTournament()), secureUpdate, isAdmin);
      await addPlayer();
      expect(secureUpdate).not.toHaveBeenCalled();
    });

    it('adds a global player using their existing id and name', async () => {
      const { addPlayer } = useRoster(ref(makeTournament()), secureUpdate, isAdmin);
      await addPlayer({ id: 'gp1', name: 'Global Player' });
      expect(secureUpdate).toHaveBeenCalledWith(expect.objectContaining({
        'players.gp1': expect.objectContaining({ id: 'gp1', name: 'Global Player', isCaptain: false, uma: '' }),
      }));
    });

    it('adds a local player from newPlayerName and resets the field', async () => {
      const { addPlayer, newPlayerName } = useRoster(ref(makeTournament()), secureUpdate, isAdmin);
      newPlayerName.value = 'Local Player';
      await addPlayer();
      expect(secureUpdate).toHaveBeenCalled();
      expect(newPlayerName.value).toBe('');
    });
  });

  // ── removePlayer ──────────────────────────────────────────────────────────────

  describe('removePlayer', () => {
    it('does nothing when tournament is null', async () => {
      const { removePlayer } = useRoster(ref(null), secureUpdate, isAdmin);
      await removePlayer('p1');
      expect(secureUpdate).not.toHaveBeenCalled();
    });

    it('does nothing when not admin', async () => {
      isAdmin.value = false;
      const { removePlayer } = useRoster(ref(makeTournament({ players: { p1: makePlayer('p1') } })), secureUpdate, isAdmin);
      await removePlayer('p1');
      expect(secureUpdate).not.toHaveBeenCalled();
    });

    it('calls secureUpdate with deleteField for the player and arrayRemove for playerIds', async () => {
      const tournament = ref(makeTournament({ players: { p1: makePlayer('p1'), p2: makePlayer('p2') } }));
      const { removePlayer } = useRoster(tournament, secureUpdate, isAdmin);
      await removePlayer('p1');
      expect(secureUpdate).toHaveBeenCalledWith(expect.objectContaining({
        'players.p1': expect.objectContaining({ _delete: true }),
        playerIds: expect.objectContaining({ _remove: 'p1' }),
      }));
    });
  });

  // ── toggleCaptain ─────────────────────────────────────────────────────────────

  describe('toggleCaptain', () => {
    it('does nothing when tournament is null', async () => {
      const { toggleCaptain } = useRoster(ref(null), secureUpdate, isAdmin);
      await toggleCaptain('p1');
      expect(secureUpdate).not.toHaveBeenCalled();
    });

    it('does nothing when not admin', async () => {
      isAdmin.value = false;
      const { toggleCaptain } = useRoster(ref(makeTournament({ players: { p1: makePlayer('p1') } })), secureUpdate, isAdmin);
      await toggleCaptain('p1');
      expect(secureUpdate).not.toHaveBeenCalled();
    });

    it('does nothing when the player is not found', async () => {
      const { toggleCaptain } = useRoster(ref(makeTournament({ players: {} })), secureUpdate, isAdmin);
      await toggleCaptain('nonexistent');
      expect(secureUpdate).not.toHaveBeenCalled();
    });

    it('promotes a non-captain to captain', async () => {
      const { toggleCaptain } = useRoster(ref(makeTournament({ players: { p1: makePlayer('p1', false) } })), secureUpdate, isAdmin);
      await toggleCaptain('p1');
      expect(secureUpdate).toHaveBeenCalledWith({ 'players.p1.isCaptain': true });
    });

    it('demotes a captain to non-captain', async () => {
      const { toggleCaptain } = useRoster(ref(makeTournament({ players: { p1: makePlayer('p1', true) } })), secureUpdate, isAdmin);
      await toggleCaptain('p1');
      expect(secureUpdate).toHaveBeenCalledWith({ 'players.p1.isCaptain': false });
    });
  });

  // ── openWildcardModal ─────────────────────────────────────────────────────────

  describe('openWildcardModal', () => {
    it('does nothing when not admin', () => {
      isAdmin.value = false;
      const { openWildcardModal, showWildcardModal } = useRoster(ref(makeTournament()), secureUpdate, isAdmin);
      openWildcardModal('A');
      expect(showWildcardModal.value).toBe(false);
    });

    it('sets wildcardTargetGroup and opens the modal when admin', () => {
      const { openWildcardModal, showWildcardModal, wildcardTargetGroup } = useRoster(ref(makeTournament()), secureUpdate, isAdmin);
      openWildcardModal('B');
      expect(showWildcardModal.value).toBe(true);
      expect(wildcardTargetGroup.value).toBe('B');
    });
  });

  // ── addWildcard ───────────────────────────────────────────────────────────────

  describe('addWildcard', () => {
    it('does nothing when tournament is null', async () => {
      const { addWildcard } = useRoster(ref(null), secureUpdate, isAdmin);
      await addWildcard({ id: 'wc1', name: 'Wildcard' });
      expect(secureUpdate).not.toHaveBeenCalled();
    });

    it('does nothing when no wildcardTargetGroup is set', async () => {
      const { addWildcard } = useRoster(ref(makeTournament()), secureUpdate, isAdmin);
      await addWildcard({ id: 'wc1', name: 'Wildcard' });
      expect(secureUpdate).not.toHaveBeenCalled();
    });

    it('adds wildcard player to Firestore and closes the modal', async () => {
      const { openWildcardModal, addWildcard, showWildcardModal } = useRoster(ref(makeTournament()), secureUpdate, isAdmin);
      openWildcardModal('Finals');
      await addWildcard({ id: 'wc1', name: 'Wildcard Player' });
      expect(secureUpdate).toHaveBeenCalledWith(expect.objectContaining({
        'players.wc1': expect.objectContaining({ id: 'wc1', name: 'Wildcard Player', isCaptain: false }),
        wildcards: expect.objectContaining({ _union: expect.objectContaining({ playerId: 'wc1', group: 'Finals' }) }),
      }));
      expect(showWildcardModal.value).toBe(false);
    });
  });

  // ── submitUmaForPlayer ────────────────────────────────────────────────────────

  describe('submitUmaForPlayer', () => {
    it('does nothing when tournament is null', async () => {
      const { submitUmaForPlayer } = useRoster(ref(null), secureUpdate, isAdmin);
      await submitUmaForPlayer('p1', 'Special Week');
      expect(secureUpdate).not.toHaveBeenCalled();
    });

    it('calls secureUpdate with the new uma assignment', async () => {
      const { submitUmaForPlayer } = useRoster(ref(makeTournament()), secureUpdate, isAdmin);
      await submitUmaForPlayer('p1', 'Special Week');
      expect(secureUpdate).toHaveBeenCalledWith({ 'players.p1.uma': 'Special Week' });
    });

    it('alerts on secureUpdate failure', async () => {
      secureUpdate.mockRejectedValueOnce(new Error('Network error'));
      const { submitUmaForPlayer } = useRoster(ref(makeTournament()), secureUpdate, isAdmin);
      await submitUmaForPlayer('p1', 'Special Week');
      expect(window.alert).toHaveBeenCalledWith('Failed to sync character selection. Please try again.');
    });
  });

  // ── closeUmaModal ─────────────────────────────────────────────────────────────

  describe('closeUmaModal', () => {
    it('sets showUmaModal to false', () => {
      const { closeUmaModal, showUmaModal } = useRoster(ref(makeTournament()), secureUpdate, isAdmin);
      closeUmaModal();
      expect(showUmaModal.value).toBe(false);
    });
  });

  // ── getPlayerColor ────────────────────────────────────────────────────────────

  describe('getPlayerColor', () => {
    it('returns default color when tournament is null', () => {
      const { getPlayerColor } = useRoster(ref(null), secureUpdate, isAdmin);
      expect(getPlayerColor('p1')).toBe('#e2e8f0');
    });

    it('returns the team color for a captain on a team', () => {
      const tournament = ref(makeTournament({
        teams: [makeTeam({ captainId: 'p1', memberIds: [], color: '#ff0000' })],
      }));
      const { getPlayerColor } = useRoster(tournament, secureUpdate, isAdmin);
      expect(getPlayerColor('p1')).toBe('#ff0000');
    });

    it('returns the team color for a member on a team', () => {
      const tournament = ref(makeTournament({
        teams: [makeTeam({ captainId: 'p1', memberIds: ['p2'], color: '#00ff00' })],
      }));
      const { getPlayerColor } = useRoster(tournament, secureUpdate, isAdmin);
      expect(getPlayerColor('p2')).toBe('#00ff00');
    });

    it('returns the wildcard color for a wildcard player', () => {
      const tournament = ref(makeTournament({
        wildcards: [{ playerId: 'wc1', group: 'A' }],
      }));
      const { getPlayerColor } = useRoster(tournament, secureUpdate, isAdmin);
      expect(getPlayerColor('wc1')).toBe('#94a3b8');
    });

    it('returns the unassigned color for a player not on any team', () => {
      const { getPlayerColor } = useRoster(ref(makeTournament()), secureUpdate, isAdmin);
      expect(getPlayerColor('p99')).toBe('#475569');
    });
  });

  // ── getPlayerNameOrUma ────────────────────────────────────────────────────────

  describe('getPlayerNameOrUma', () => {
    const tournament = ref(makeTournament({
      players: { p1: { id: 'p1', name: 'Alice', isCaptain: false, uma: 'Special Week' } },
    }));

    it('returns player name when showName is true', () => {
      const { getPlayerNameOrUma } = useRoster(tournament, secureUpdate, isAdmin);
      expect(getPlayerNameOrUma('p1', true)).toBe('Alice');
    });

    it('returns player uma when showName is false', () => {
      const { getPlayerNameOrUma } = useRoster(tournament, secureUpdate, isAdmin);
      expect(getPlayerNameOrUma('p1', false)).toBe('Special Week');
    });
  });
});
