import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../firebase', () => ({ auth: {}, db: {} }));

// vi.hoisted runs before both vi.mock factories AND imports, avoiding TDZ issues
const authCallbackHolder = vi.hoisted(() => ({
    fn: async (_: any) => {},
}));

vi.mock('firebase/auth', () => ({
    onAuthStateChanged: vi.fn((_, cb) => {
        authCallbackHolder.fn = cb;
        return vi.fn();
    }),
    signInWithPopup: vi.fn().mockResolvedValue({ user: {} }),
    signOut: vi.fn().mockResolvedValue(undefined),
    OAuthProvider: vi.fn(function(this: any) { this.addScope = vi.fn(); }),
    getAdditionalUserInfo: vi.fn().mockReturnValue(null),
    updateProfile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('firebase/firestore', () => ({
    collection: vi.fn(() => 'colRef'),
    query: vi.fn(() => 'q'),
    where: vi.fn(),
    getDocs: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
    doc: vi.fn(() => 'docRef'),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    setDoc: vi.fn().mockResolvedValue(undefined),
}));

import { useAuth } from './useAuth';
import { signInWithPopup, signOut } from 'firebase/auth';
import { updateDoc, setDoc } from 'firebase/firestore';
import type { GlobalPlayer } from '../types';

const makeUser = (overrides: any = {}) => ({
    uid: 'uid-123',
    displayName: 'TestUser',
    photoURL: null,
    providerData: [{ providerId: 'discord.com', uid: 'discord-123' }],
    ...overrides,
});

const makePlayer = (overrides: Partial<GlobalPlayer> = {}): GlobalPlayer => ({
    id: 'player-1',
    name: 'Player One',
    createdAt: '2024-01-01T00:00:00.000Z',
    firebaseUid: 'uid-123',
    metadata: { totalTournaments: 0, totalRaces: 0 },
    ...overrides,
});

describe('useAuth', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        await authCallbackHolder.fn(null); // reset to logged-out state
    });

    // ── isDiscordUser ─────────────────────────────────────────────────────────

    describe('isDiscordUser', () => {
        it('returns falsy when not logged in', () => {
            const { isDiscordUser } = useAuth();
            expect(isDiscordUser.value).toBeFalsy();
        });

        it('returns true when user has discord.com provider', async () => {
            const { isDiscordUser } = useAuth();
            await authCallbackHolder.fn(makeUser());
            expect(isDiscordUser.value).toBe(true);
        });

        it('returns false when user has non-discord provider', async () => {
            const { isDiscordUser } = useAuth();
            await authCallbackHolder.fn(makeUser({
                providerData: [{ providerId: 'google.com', uid: 'g-123' }],
            }));
            expect(isDiscordUser.value).toBe(false);
        });
    });

    // ── loginWithDiscord ──────────────────────────────────────────────────────

    describe('loginWithDiscord', () => {
        it('calls signInWithPopup', async () => {
            const { loginWithDiscord } = useAuth();
            await loginWithDiscord();
            expect(signInWithPopup).toHaveBeenCalled();
        });

        it('rethrows on failure', async () => {
            (signInWithPopup as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('popup_closed'));
            const { loginWithDiscord } = useAuth();
            await expect(loginWithDiscord()).rejects.toThrow('popup_closed');
        });
    });

    // ── logout ────────────────────────────────────────────────────────────────

    describe('logout', () => {
        it('calls signOut', async () => {
            const { logout } = useAuth();
            await logout();
            expect(signOut).toHaveBeenCalled();
        });
    });

    // ── linkToPlayer ──────────────────────────────────────────────────────────

    describe('linkToPlayer', () => {
        it('throws when not logged in', async () => {
            const { linkToPlayer } = useAuth();
            await expect(linkToPlayer(makePlayer())).rejects.toThrow('Must be logged in');
        });

        it('calls updateDoc with firebaseUid and discordId', async () => {
            const { linkToPlayer, linkedPlayer } = useAuth();
            await authCallbackHolder.fn(makeUser());

            await linkToPlayer(makePlayer());

            expect(updateDoc).toHaveBeenCalledWith('docRef', expect.objectContaining({
                firebaseUid: 'uid-123',
                discordId: 'discord-123',
            }));
            expect(linkedPlayer.value?.firebaseUid).toBe('uid-123');
        });

        it('omits discordId when no discord provider data', async () => {
            const { linkToPlayer } = useAuth();
            await authCallbackHolder.fn(makeUser({ providerData: [] }));

            await linkToPlayer(makePlayer());

            expect(updateDoc).toHaveBeenCalledWith('docRef', expect.objectContaining({
                firebaseUid: 'uid-123',
                discordId: undefined,
            }));
        });

        it('rethrows on failure', async () => {
            (updateDoc as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('permission-denied'));
            const { linkToPlayer } = useAuth();
            await authCallbackHolder.fn(makeUser());
            await expect(linkToPlayer(makePlayer())).rejects.toThrow('permission-denied');
        });
    });

    // ── createAndLinkPlayer ───────────────────────────────────────────────────

    describe('createAndLinkPlayer', () => {
        it('throws when not logged in', async () => {
            const { createAndLinkPlayer } = useAuth();
            await expect(createAndLinkPlayer('New Player')).rejects.toThrow('Must be logged in');
        });

        it('calls setDoc and sets linkedPlayer', async () => {
            const { createAndLinkPlayer, linkedPlayer } = useAuth();
            await authCallbackHolder.fn(makeUser());
            vi.stubGlobal('crypto', { randomUUID: () => 'uuid-123' });

            const result = await createAndLinkPlayer('New Player');

            expect(setDoc).toHaveBeenCalledWith('docRef', expect.objectContaining({
                id: 'uuid-123',
                name: 'New Player',
                firebaseUid: 'uid-123',
                discordId: 'discord-123',
            }));
            expect(result.name).toBe('New Player');
            expect(linkedPlayer.value?.name).toBe('New Player');
        });

        it('rethrows on failure', async () => {
            (setDoc as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('quota-exceeded'));
            const { createAndLinkPlayer } = useAuth();
            await authCallbackHolder.fn(makeUser());
            await expect(createAndLinkPlayer('Test')).rejects.toThrow('quota-exceeded');
        });
    });

    // ── updatePlayerProfile ───────────────────────────────────────────────────

    describe('updatePlayerProfile', () => {
        it('throws when no linked player', async () => {
            const { updatePlayerProfile } = useAuth();
            await expect(updatePlayerProfile({ roster: [] })).rejects.toThrow('No linked player');
        });

        it('calls updateDoc with given fields', async () => {
            const { updatePlayerProfile, linkedPlayer } = useAuth();
            linkedPlayer.value = makePlayer();

            await updatePlayerProfile({ roster: ['Uma A', 'Uma B'] });

            expect(updateDoc).toHaveBeenCalledWith('docRef', { roster: ['Uma A', 'Uma B'] });
        });

        it('merges fields into linkedPlayer', async () => {
            const { updatePlayerProfile, linkedPlayer } = useAuth();
            linkedPlayer.value = makePlayer({ roster: ['Uma A'] });

            await updatePlayerProfile({ roster: ['Uma A', 'Uma B'] });

            expect(linkedPlayer.value?.roster).toEqual(['Uma A', 'Uma B']);
        });
    });
});
