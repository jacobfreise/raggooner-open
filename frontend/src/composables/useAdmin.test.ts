import {describe, it, expect, vi, beforeEach, Mock} from 'vitest';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  collection: vi.fn(() => ({})),
}));

vi.mock('../firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'user-123' } },
}));

vi.mock('../utils/metadataSync', () => ({
  claimAndUnsyncMetadata: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../utils/constants', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../utils/constants')>();
  return { ...mod, SUPERADMIN_UIDS: ['superadmin-uid'] };
});

import { ref, nextTick } from 'vue';
import { useAdmin } from './useAdmin';
import { setDoc, deleteDoc } from 'firebase/firestore';
import { auth } from '../firebase';
import { claimAndUnsyncMetadata } from '../utils/metadataSync';
import type {FirestoreUpdate, Tournament} from '../types';

const makeTournament = (overrides: Partial<Tournament> = {}): Tournament => ({
  id: 't1',
  name: 'Test Tournament',
  status: 'active',
  stage: 'groups',
  playerIds: [],
  players: {},
  teams: [],
  races: {},
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe('useAdmin', () => {
  let secureUpdate: Mock<(data: FirestoreUpdate<Tournament>) => Promise<void>>;
  let fetchPublicTournaments: Mock<() => Promise<void>>;
  const appId = 'test-app';

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    (auth as any).currentUser = { uid: 'user-123' };
    vi.stubGlobal('alert', vi.fn());
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
    vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
    secureUpdate = vi.fn().mockResolvedValue(undefined);
    fetchPublicTournaments = vi.fn().mockResolvedValue(undefined);
  });

  // ── isAdmin ─────────────────────────────────────────────────────────────────

  describe('isAdmin', () => {
    it('returns false when tournament is null', () => {
      const { isAdmin } = useAdmin(ref(null), secureUpdate, fetchPublicTournaments, appId);
      expect(isAdmin.value).toBe(false);
    });

    it('returns true for an unsecured tournament', () => {
      const { isAdmin } = useAdmin(ref(makeTournament({ isSecured: false })), secureUpdate, fetchPublicTournaments, appId);
      expect(isAdmin.value).toBe(true);
    });

    it('returns false for a secured tournament with no local password', () => {
      const { isAdmin } = useAdmin(ref(makeTournament({ isSecured: true })), secureUpdate, fetchPublicTournaments, appId);
      expect(isAdmin.value).toBe(false);
    });

    it('returns false when tournament has a non-empty password field', () => {
      const { isAdmin } = useAdmin(ref(makeTournament({ password: 'SECRET' })), secureUpdate, fetchPublicTournaments, appId);
      expect(isAdmin.value).toBe(false);
    });

    it('returns true after successful login sets localAdminPassword', async () => {
      (setDoc as any).mockResolvedValue(undefined);
      const tournament = ref(makeTournament({ isSecured: true }));
      const { isAdmin, adminPasswordInput, loginAsAdmin } = useAdmin(tournament, secureUpdate, fetchPublicTournaments, appId);
      adminPasswordInput.value = 'pass';
      await loginAsAdmin();
      expect(isAdmin.value).toBe(true);
    });
  });

  // ── showAdminModal watcher ───────────────────────────────────────────────────

  describe('showAdminModal watcher', () => {
    it('syncs editedName and editedTiebreaker when modal opens', async () => {
      const tournament = ref(makeTournament({ name: 'My Event', usePlacementTiebreaker: false }));
      const { showAdminModal, editedName, editedTiebreaker } = useAdmin(tournament, secureUpdate, fetchPublicTournaments, appId);
      showAdminModal.value = true;
      await nextTick();
      expect(editedName.value).toBe('My Event');
      expect(editedTiebreaker.value).toBe(false);
    });

    it('defaults editedTiebreaker to true when usePlacementTiebreaker is undefined', async () => {
      const tournament = ref(makeTournament());
      const { showAdminModal, editedTiebreaker } = useAdmin(tournament, secureUpdate, fetchPublicTournaments, appId);
      showAdminModal.value = true;
      await nextTick();
      expect(editedTiebreaker.value).toBe(true);
    });

    it('resets isDangerZoneOpen when modal closes', async () => {
      const tournament = ref(makeTournament());
      const { showAdminModal, isDangerZoneOpen } = useAdmin(tournament, secureUpdate, fetchPublicTournaments, appId);
      showAdminModal.value = true;
      await nextTick();
      isDangerZoneOpen.value = true;
      showAdminModal.value = false;
      await nextTick();
      expect(isDangerZoneOpen.value).toBe(false);
    });
  });

  // ── loginAsAdmin ─────────────────────────────────────────────────────────────

  describe('loginAsAdmin', () => {
    it('does nothing when tournament is null', async () => {
      const { loginAsAdmin } = useAdmin(ref(null), secureUpdate, fetchPublicTournaments, appId);
      await loginAsAdmin();
      expect(setDoc).not.toHaveBeenCalled();
    });

    it('does nothing when there is no auth user', async () => {
      (auth as any).currentUser = null;
      const { loginAsAdmin } = useAdmin(ref(makeTournament({ isSecured: true })), secureUpdate, fetchPublicTournaments, appId);
      await loginAsAdmin();
      expect(setDoc).not.toHaveBeenCalled();
    });

    it('uppercases the password, stores it, closes the modal, and alerts', async () => {
      (setDoc as any).mockResolvedValue(undefined);
      const tournament = ref(makeTournament({ isSecured: true, id: 't1' }));
      const { adminPasswordInput, showAdminModal, localAdminPassword, loginAsAdmin } = useAdmin(tournament, secureUpdate, fetchPublicTournaments, appId);
      adminPasswordInput.value = 'mypassword';
      showAdminModal.value = true;
      await loginAsAdmin();
      expect(localAdminPassword.value).toBe('MYPASSWORD');
      expect(localStorage.getItem('admin_pwd_t1')).toBe('MYPASSWORD');
      expect(showAdminModal.value).toBe(false);
      expect(adminPasswordInput.value).toBe('');
      expect(window.alert).toHaveBeenCalledWith('Access Granted!');
    });

    it('alerts "Incorrect Password" when setDoc is rejected', async () => {
      (setDoc as any).mockRejectedValue(new Error('Permission denied'));
      const tournament = ref(makeTournament({ isSecured: true }));
      const { adminPasswordInput, localAdminPassword, loginAsAdmin } = useAdmin(tournament, secureUpdate, fetchPublicTournaments, appId);
      adminPasswordInput.value = 'wrong';
      await loginAsAdmin();
      expect(localAdminPassword.value).toBe('');
      expect(window.alert).toHaveBeenCalledWith('Incorrect Password');
    });
  });

  // ── autoLoginIfSuperAdmin ────────────────────────────────────────────────────

  describe('autoLoginIfSuperAdmin', () => {
    it('does nothing when tournament is null', async () => {
      const { autoLoginIfSuperAdmin } = useAdmin(ref(null), secureUpdate, fetchPublicTournaments, appId);
      await autoLoginIfSuperAdmin();
      expect(setDoc).not.toHaveBeenCalled();
    });

    it('does nothing when there is no auth user', async () => {
      (auth as any).currentUser = null;
      const { autoLoginIfSuperAdmin } = useAdmin(ref(makeTournament()), secureUpdate, fetchPublicTournaments, appId);
      await autoLoginIfSuperAdmin();
      expect(setDoc).not.toHaveBeenCalled();
    });

    it('does nothing for a non-superadmin UID', async () => {
      (auth as any).currentUser = { uid: 'regular-user' };
      const { autoLoginIfSuperAdmin } = useAdmin(ref(makeTournament()), secureUpdate, fetchPublicTournaments, appId);
      await autoLoginIfSuperAdmin();
      expect(setDoc).not.toHaveBeenCalled();
    });

    it('sets SUPERADMIN credentials and persists to localStorage', async () => {
      (auth as any).currentUser = { uid: 'superadmin-uid' };
      (setDoc as any).mockResolvedValue(undefined);
      const tournament = ref(makeTournament({ id: 't1' }));
      const { autoLoginIfSuperAdmin, localAdminPassword } = useAdmin(tournament, secureUpdate, fetchPublicTournaments, appId);
      await autoLoginIfSuperAdmin();
      expect(localAdminPassword.value).toBe('SUPERADMIN');
      expect(localStorage.getItem('admin_pwd_t1')).toBe('SUPERADMIN');
    });
  });

  // ── copyPassword ─────────────────────────────────────────────────────────────

  describe('copyPassword', () => {
    it('does nothing when no local password is stored', async () => {
      const { copyPassword } = useAdmin(ref(makeTournament({ isSecured: true })), secureUpdate, fetchPublicTournaments, appId);
      await copyPassword();
      expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    });

    it('writes the password to clipboard and alerts', async () => {
      (setDoc as any).mockResolvedValue(undefined);
      const tournament = ref(makeTournament({ isSecured: true }));
      const { adminPasswordInput, loginAsAdmin, copyPassword } = useAdmin(tournament, secureUpdate, fetchPublicTournaments, appId);
      adminPasswordInput.value = 'pwd';
      await loginAsAdmin();
      await copyPassword();
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('PWD');
      expect(window.alert).toHaveBeenLastCalledWith('Password copied to clipboard!');
    });
  });

  // ── updateTournamentName ─────────────────────────────────────────────────────

  describe('updateTournamentName', () => {
    it('does nothing when tournament is null', async () => {
      const { updateTournamentName } = useAdmin(ref(null), secureUpdate, fetchPublicTournaments, appId);
      await updateTournamentName();
      expect(secureUpdate).not.toHaveBeenCalled();
    });

    it('does nothing when editedName is empty', async () => {
      const { updateTournamentName, editedName } = useAdmin(ref(makeTournament()), secureUpdate, fetchPublicTournaments, appId);
      editedName.value = '';
      await updateTournamentName();
      expect(secureUpdate).not.toHaveBeenCalled();
    });

    it('calls secureUpdate with the new name and alerts', async () => {
      const { updateTournamentName, editedName } = useAdmin(ref(makeTournament()), secureUpdate, fetchPublicTournaments, appId);
      editedName.value = 'New Name';
      await updateTournamentName();
      expect(secureUpdate).toHaveBeenCalledWith({ name: 'New Name' });
      expect(window.alert).toHaveBeenCalledWith('Tournament name updated!');
    });
  });

  // ── togglePlacementTiebreaker ────────────────────────────────────────────────

  describe('togglePlacementTiebreaker', () => {
    it('does nothing when tournament is null', async () => {
      const { togglePlacementTiebreaker } = useAdmin(ref(null), secureUpdate, fetchPublicTournaments, appId);
      await togglePlacementTiebreaker();
      expect(secureUpdate).not.toHaveBeenCalled();
    });

    it('flips editedTiebreaker and calls secureUpdate', async () => {
      const { togglePlacementTiebreaker, editedTiebreaker } = useAdmin(ref(makeTournament()), secureUpdate, fetchPublicTournaments, appId);
      expect(editedTiebreaker.value).toBe(true);
      await togglePlacementTiebreaker();
      expect(editedTiebreaker.value).toBe(false);
      expect(secureUpdate).toHaveBeenCalledWith({ usePlacementTiebreaker: false });
      await togglePlacementTiebreaker();
      expect(editedTiebreaker.value).toBe(true);
      expect(secureUpdate).toHaveBeenCalledWith({ usePlacementTiebreaker: true });
    });
  });

  // ── deleteTournament ─────────────────────────────────────────────────────────

  describe('deleteTournament', () => {
    it('does nothing when tournament is null', async () => {
      const { deleteTournament } = useAdmin(ref(null), secureUpdate, fetchPublicTournaments, appId);
      await deleteTournament();
      expect(window.confirm).not.toHaveBeenCalled();
    });

    it('does nothing when not admin (secured tournament, no password)', async () => {
      const { deleteTournament } = useAdmin(ref(makeTournament({ isSecured: true })), secureUpdate, fetchPublicTournaments, appId);
      await deleteTournament();
      expect(window.confirm).not.toHaveBeenCalled();
    });

    it('does nothing when the user cancels the confirm dialog', async () => {
      (window.confirm as ReturnType<typeof vi.fn>).mockReturnValue(false);
      const { deleteTournament } = useAdmin(ref(makeTournament({ isSecured: false })), secureUpdate, fetchPublicTournaments, appId);
      await deleteTournament();
      expect(deleteDoc).not.toHaveBeenCalled();
    });

    it('deletes an active tournament, resets state, and refreshes the list', async () => {
      (deleteDoc as any).mockResolvedValue(undefined);
      const tournament = ref(makeTournament({ status: 'active', isSecured: false }));
      const { deleteTournament } = useAdmin(tournament, secureUpdate, fetchPublicTournaments, appId);
      await deleteTournament();
      expect(claimAndUnsyncMetadata).not.toHaveBeenCalled();
      expect(deleteDoc).toHaveBeenCalled();
      expect(tournament.value).toBeNull();
      expect(fetchPublicTournaments).toHaveBeenCalled();
      expect(window.alert).toHaveBeenCalledWith('Tournament deleted successfully.');
    });

    it('calls claimAndUnsyncMetadata before deleting a completed tournament', async () => {
      (deleteDoc as any).mockResolvedValue(undefined);
      const tournament = ref(makeTournament({ status: 'completed', isSecured: false }));
      const { deleteTournament } = useAdmin(tournament, secureUpdate, fetchPublicTournaments, appId);
      await deleteTournament();
      expect(claimAndUnsyncMetadata).toHaveBeenCalledWith(tournament.value ?? expect.anything(), appId);
    });

    it('cleans up sessionStorage and localStorage on successful delete', async () => {
      (deleteDoc as any).mockResolvedValue(undefined);
      const tournament = ref(makeTournament({ id: 't1', isSecured: false }));
      localStorage.setItem('admin_pwd_t1', 'TEST');
      sessionStorage.setItem('active_tid', 't1');
      const { deleteTournament } = useAdmin(tournament, secureUpdate, fetchPublicTournaments, appId);
      await deleteTournament();
      expect(localStorage.getItem('admin_pwd_t1')).toBeNull();
      expect(sessionStorage.getItem('active_tid')).toBeNull();
    });

    it('alerts on error and ensures isDeleting is reset to false', async () => {
      (deleteDoc as any).mockRejectedValue(new Error('Permission denied'));
      const tournament = ref(makeTournament({ isSecured: false }));
      const { deleteTournament, isDeleting } = useAdmin(tournament, secureUpdate, fetchPublicTournaments, appId);
      await deleteTournament();
      expect(window.alert).toHaveBeenCalledWith('Failed to delete tournament. Check console for permissions error.');
      expect(isDeleting.value).toBe(false);
    });
  });
});
