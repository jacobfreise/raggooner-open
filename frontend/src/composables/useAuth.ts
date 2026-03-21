import { ref, computed } from 'vue';
import {
    onAuthStateChanged,
    signInWithPopup,
    signInAnonymously,
    signOut,
    OAuthProvider,
    type User
} from 'firebase/auth';
import { 
    collection, 
    query, 
    where, 
    getDocs, 
    doc, 
    updateDoc, 
    setDoc 
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { GlobalPlayer } from '../types';

const appId = 'default-app';

const user = ref<User | null>(null);
const linkedPlayer = ref<GlobalPlayer | null>(null);
const loading = ref(true);

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
        const provider = new OAuthProvider('oidc.discord.com');
        try {
            await signInWithPopup(auth, provider);
            // user.value and fetchLinkedPlayer are handled by onAuthStateChanged
        } catch (e) {
            console.error('Discord login failed:', e);
            throw e;
        }
    };

    const logout = async () => {
        try {
            await signOut(auth);
            await signInAnonymously(auth);
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
                discordId: discordId || undefined
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
        isDiscordUser,
        loginWithDiscord,
        logout,
        linkToPlayer,
        createAndLinkPlayer,
        updatePlayerProfile,
    };
}
