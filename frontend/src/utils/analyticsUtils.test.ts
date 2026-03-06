import { describe, it, expect, vi } from 'vitest';
import { 
  assignTier, 
  getStatValue, 
  createSortState, 
  getWinningTeam, 
  deriveFromTournaments 
} from './analyticsUtils';

describe('analyticsUtils', () => {
  describe('assignTier', () => {
    it('returns S for high dominance', () => {
      expect(assignTier(70, 'dominance')).toBe('S');
    });
    it('returns F for low values', () => {
      expect(assignTier(0, 'dominance')).toBe('F');
      expect(assignTier(-1, 'winRate')).toBe('F');
    });
  });

  describe('getStatValue', () => {
    it('returns the value if present', () => {
      expect(getStatValue({ dominance: 50 }, 'dominance')).toBe(50);
    });
    it('returns 0 if value is missing or null', () => {
      expect(getStatValue({}, 'dominance')).toBe(0);
      expect(getStatValue({ dominance: null }, 'dominance')).toBe(0);
    });
  });

  describe('createSortState', () => {
    it('toggles sort direction if same key', () => {
      const { sortKey, sortDesc, toggle } = createSortState('key1', true);
      toggle('key1');
      expect(sortDesc.value).toBe(false);
      toggle('key1');
      expect(sortDesc.value).toBe(true);
    });

    it('sets new key and resets direction if different key', () => {
      const { sortKey, sortDesc, toggle } = createSortState('key1', true);
      sortDesc.value = false;
      toggle('key2');
      expect(sortKey.value).toBe('key2');
      expect(sortDesc.value).toBe(true);
    });

    it('resets to default values', () => {
      const { sortKey, sortDesc, toggle, reset } = createSortState('key1', true);
      toggle('key2');
      reset();
      expect(sortKey.value).toBe('key1');
      expect(sortDesc.value).toBe(true);
    });
  });

  describe('getWinningTeam', () => {
    it('returns undefined for no teams', () => {
      expect(getWinningTeam({ teams: [] } as any)).toBeUndefined();
      expect(getWinningTeam({ teams: null as any } as any)).toBeUndefined();
    });

    it('returns finalist winner if finalists exist', () => {
      const tournament = {
        teams: [
          { id: 't1', inFinals: true, finalsPoints: 10, points: 50 },
          { id: 't2', inFinals: true, finalsPoints: 20, points: 40 },
        ],
        players: {},
        races: {}
      } as any;
      // t2 should win due to higher finals points (using compareTeams logic)
      expect(getWinningTeam(tournament)?.id).toBe('t2');
    });

    it('returns undefined if multiple groups exist and no finalists', () => {
      const tournament = {
        teams: [
          { id: 't1', group: 'A', inFinals: false },
          { id: 't2', group: 'B', inFinals: false },
        ]
      } as any;
      expect(getWinningTeam(tournament)).toBeUndefined();
    });

    it('returns top team if single group and no finalists', () => {
      const tournament = {
        teams: [
          { id: 't1', group: 'A', inFinals: false, points: 100 },
          { id: 't2', group: 'A', inFinals: false, points: 80 },
        ],
        players: {},
        races: {},
        pointsSystem: {}
      } as any;
      expect(getWinningTeam(tournament)?.id).toBe('t1');
    });

    it('breaks ties in getWinningTeam using ID comparison', () => {
      const tournament = {
        teams: [
          { id: 'team_b', group: 'A', inFinals: false, points: 100 },
          { id: 'team_a', group: 'A', inFinals: false, points: 100 },
        ],
        players: {},
        races: {},
        pointsSystem: {}
      } as any;
      // team_a should win because 'team_a' < 'team_b' in localeCompare
      expect(getWinningTeam(tournament)?.id).toBe('team_a');
    });
  });

  describe('deriveFromTournaments', () => {
    it('derives participations and races correctly', () => {
      const tournament = {
        id: 'tourney1',
        players: {
          p1: { id: 'p1', uma: 'Special Week' },
          p2: { id: 'p2' },
          p3: { id: 'p3', uma: '' }
        },
        teams: [
          { id: 'team1', captainId: 'p1', memberIds: ['p2', 'p3'], group: 'A' }
        ],
        races: {
          r1: { stage: 'groups', group: 'A', raceNumber: 1, placements: { p1: 1, p2: 2, p3: 3 } }
        }
      } as any;

      const { derivedParticipations, derivedRaces } = deriveFromTournaments([tournament]);

      expect(derivedParticipations).toHaveLength(3);
      expect(derivedParticipations.find(p => p.playerId === 'p1')?.uma).toBe('Special Week');
      expect(derivedParticipations.find(p => p.playerId === 'p2')?.uma).toBe('');
      expect(derivedParticipations.find(p => p.playerId === 'p3')?.uma).toBe('');
      
      expect(derivedRaces).toHaveLength(1);
      expect(derivedRaces[0].umaMapping['p1']).toBe('Special Week');
      expect(derivedRaces[0].umaMapping['p2']).toBeUndefined();
      expect(derivedRaces[0].umaMapping['p3']).toBeUndefined();
    });
  });
});
