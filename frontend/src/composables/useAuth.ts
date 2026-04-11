import { ref, computed } from 'vue';
import {
    onAuthStateChanged,
    signInWithPopup,
    signOut,
    OAuthProvider,
    getAdditionalUserInfo,
    updateProfile,
    type User
} from 'firebase/auth';
import {
    collection,
    query,
    where,
    getDocs,
    doc,
    updateDoc,
    deleteField,
    setDoc
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { GlobalPlayer } from '../types';

const appId = 'default-app';

const user = ref<User | null>(null);
const linkedPlayer = ref<GlobalPlayer | null>(null);
const loading = ref(true);
const loginError = ref<string | null>(null);

const fetchLinkedPlayerInternal = async (uid: string) => {
    try {
        const playersRef = collection(db, 'artifacts', appId, 'public', 'data', 'players');
        const q = query(playersRef, where('firebaseUid', '==', uid));
        const snap = await getDocs(q);

        if (!snap.empty) {
            const docSnap = snap.docs[0];
            if (docSnap) {
                linkedPlayer.value = { id: docSnap.id, ...docSnap.data() } as GlobalPlayer;
            }
        } else {
            linkedPlayer.value = null;
        }
    } catch (e) {
        console.error('Error fetching linked player:', e);
        linkedPlayer.value = null;
    }
};

onAuthStateChanged(auth, async (u) => {
    user.value = u;
    if (u) {
        await fetchLinkedPlayerInternal(u.uid);
        // Sync avatar if Firebase Auth has a newer URL than what's stored in Firestore
        if (u.photoURL && linkedPlayer.value && linkedPlayer.value.avatarUrl !== u.photoURL) {
            const playerRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', linkedPlayer.value.id);
            await updateDoc(playerRef, { avatarUrl: u.photoURL });
            linkedPlayer.value = { ...linkedPlayer.value, avatarUrl: u.photoURL };
        }
    } else {
        linkedPlayer.value = null;
    }
    loading.value = false;
});

export function useAuth() {
    const isDiscordUser = computed(() => {
        return user.value?.providerData.some(p => p.providerId.includes('discord'));
    });

    const loginWithDiscord = async () => {
        loginError.value = null;
        const provider = new OAuthProvider('oidc.discord.com');
        provider.addScope('identify');

        const attemptSignIn = async () => {
            const result = await signInWithPopup(auth, provider);
            const profile = getAdditionalUserInfo(result)?.profile as Record<string, any> | null;
            const avatarUrl: string | null = profile?.picture ?? null;
            if (avatarUrl) {
                await updateProfile(result.user, { photoURL: avatarUrl });
                user.value = auth.currentUser;
                if (linkedPlayer.value) {
                    const playerRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', linkedPlayer.value.id);
                    await updateDoc(playerRef, { avatarUrl });
                    linkedPlayer.value = { ...linkedPlayer.value, avatarUrl };
                }
            }
        };

        try {
            await attemptSignIn();
        } catch (e: any) {
            // 503 / service-unavailable: retry once after a short delay
            if (e?.code === 'auth/the-service-is-currently-unavailable' || e?.code === 'auth/network-request-failed') {
                try {
                    await new Promise(r => setTimeout(r, 1500));
                    await attemptSignIn();
                    return;
                } catch (retryErr) {
                    console.error('Discord login retry failed:', retryErr);
                    loginError.value = 'Login failed. Please try again.';
                    return;
                }
            }
            // User closed the popup — not an error worth surfacing
            if (e?.code === 'auth/popup-closed-by-user' || e?.code === 'auth/cancelled-popup-request') return;
            console.error('Discord login failed:', e);
            loginError.value = 'Login failed. Please try again.';
        }
    };

    const logout = async () => {
        try {
            await signOut(auth);
        } catch (e) {
            console.error('Logout failed:', e);
        }
    };

    const linkToPlayer = async (globalPlayer: GlobalPlayer) => {
        if (!user.value) throw new Error('Must be logged in to link a player');
        
        const discordProfile = user.value.providerData.find(p => p.providerId.includes('discord'));
        const discordId = discordProfile?.uid;

        try {
            const playerRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', globalPlayer.id);
            const updateData: Partial<GlobalPlayer> = {
                firebaseUid: user.value.uid,
                discordId: discordId || undefined,
                avatarUrl: user.value.photoURL || undefined,
            };

            await updateDoc(playerRef, updateData);
            
            linkedPlayer.value = { 
                ...globalPlayer, 
                ...updateData 
            };
        } catch (e) {
            console.error('Failed to link player:', e);
            throw e;
        }
    };

    const createAndLinkPlayer = async (name: string) => {
        if (!user.value) throw new Error('Must be logged in to create a player');
        
        const discordProfile = user.value.providerData.find(p => p.providerId.includes('discord'));
        const discordId = discordProfile?.uid;
        const playerId = crypto.randomUUID();

        const newPlayer: GlobalPlayer = {
            id: playerId,
            name,
            createdAt: new Date().toISOString(),
            firebaseUid: user.value.uid,
            discordId: discordId || undefined,
            avatarUrl: user.value.photoURL || undefined,
            metadata: {
                totalTournaments: 0,
                totalRaces: 0
            }
        };

        try {
            const playerRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', playerId);
            await setDoc(playerRef, newPlayer);
            linkedPlayer.value = newPlayer;
            return newPlayer;
        } catch (e) {
            console.error('Failed to create and link player:', e);
            throw e;
        }
    };

    const unlinkOwnAccount = async () => {
        if (!linkedPlayer.value) throw new Error('No linked player');
        const playerRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', linkedPlayer.value.id);
        await updateDoc(playerRef, {
            firebaseUid: deleteField(),
            discordId: deleteField(),
            avatarUrl: deleteField(),
        });
        linkedPlayer.value = null;
    };

    const updatePlayerProfile = async (fields: Partial<Pick<GlobalPlayer, 'roster' | 'supportCards'>>) => {
        if (!linkedPlayer.value) throw new Error('No linked player');
        const playerRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', linkedPlayer.value.id);
        await updateDoc(playerRef, fields);
        linkedPlayer.value = { ...linkedPlayer.value, ...fields };
    };

    return {
        user,
        linkedPlayer,
        loading,
        loginError,
        isDiscordUser,
        loginWithDiscord,
        logout,
        linkToPlayer,
        createAndLinkPlayer,
        unlinkOwnAccount,
        updatePlayerProfile,
    };
}
