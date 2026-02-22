// src/composables/useAdmin.ts
import { ref, computed, watch, type Ref } from 'vue';
import { doc, setDoc, deleteDoc, collection, writeBatch, increment } from 'firebase/firestore';
import { auth, db } from '../firebase'; // Adjust path if needed
import type { Tournament, FirestoreUpdate } from '../types';

// Define the interface for the update function to ensure type safety
type SecureUpdateFn = (data: FirestoreUpdate<Tournament>) => Promise<void>;
type FetchTournamentsFn = () => Promise<void>;

const SUPERADMIN_UIDS = ['mehTFP5BuqdrT6mw4xqnaNrHSMk1', 'j7kIBg1mIXO5m824GeBQmXYfb6q2'];

export function useAdmin(
    tournament: Ref<Tournament | null>,
    secureUpdate: SecureUpdateFn,
    fetchPublicTournaments: FetchTournamentsFn,
    appId: string
) {
    // --- STATE ---
    const adminPasswordInput = ref('');
    const localAdminPassword = ref('');
    const showAdminModal = ref(false);
    const isDangerZoneOpen = ref(false);
    const isDeleting = ref(false);

    // Settings Editing State
    const editedName = ref('');
    const editedTiebreaker = ref(true);

    // --- COMPUTED ---
    const isPublicTournament = computed(() => {
        if (!tournament.value) return false;
        // Logic copied from your snapshot listener:
        // It is public if NOT secured OR if password field exists but is empty
        return !(tournament.value.isSecured || (tournament.value.password && tournament.value.password !== ''));
    });

    const isAdmin = computed(() => {
        if (!tournament.value) return false;
        if (isPublicTournament.value) return true;
        return localAdminPassword.value !== '';
    });

    // --- WATCHER ---
    // Syncs local state when the modal opens
    watch(showAdminModal, (isOpen) => {
        if (isOpen && tournament.value) {
            editedName.value = tournament.value.name;
            editedTiebreaker.value = tournament.value.usePlacementTiebreaker ?? true;
        } else {
            isDangerZoneOpen.value = false;
        }
    });

    // --- ACTIONS ---

    const loginAsAdmin = async () => {
        if (!tournament.value) return;
        // Note: We assume signInAnonymously is handled in App.vue init,
        // but checking currentUser is safe here.
        if (!auth.currentUser) return;

        const pwd = adminPasswordInput.value.toUpperCase();
        const userId = auth.currentUser.uid;
        const tId = tournament.value.id;

        try {
            const adminRef = doc(db, 'artifacts', appId, 'public', 'data', 'admins', `${tId}_${userId}`);

            // Try to create the "Permission Slip"
            await setDoc(adminRef, {
                tournamentId: tId,
                userId: userId,
                password: pwd
            });

            // Access Granted
            localAdminPassword.value = pwd;
            localStorage.setItem(`admin_pwd_${tId}`, pwd);
            showAdminModal.value = false;
            adminPasswordInput.value = '';
            alert("Access Granted!");

        } catch (e: any) {
            console.error("Login failed", e);
            alert("Incorrect Password");
        }
    };

    const autoLoginIfSuperAdmin = async () => {
        if (!tournament.value) return;
        if (!auth.currentUser) return;

        const uid = auth.currentUser.uid;
        if (!SUPERADMIN_UIDS.includes(uid)) return;

        const tId = tournament.value.id;

        try {
            const adminRef = doc(db, 'artifacts', appId, 'public', 'data', 'admins', `${tId}_${uid}`);
            await setDoc(adminRef, {
                tournamentId: tId,
                userId: uid,
                password: 'SUPERADMIN'
            });

            localAdminPassword.value = 'SUPERADMIN';
            localStorage.setItem(`admin_pwd_${tId}`, 'SUPERADMIN');
        } catch (e) {
            console.error('Superadmin auto-login failed', e);
        }
    };

    const copyPassword = () => {
        if (localAdminPassword.value) {
            navigator.clipboard.writeText(localAdminPassword.value);
            alert("Password copied to clipboard!");
        }
    };

    const updateTournamentName = async () => {
        if (!tournament.value || !editedName.value) return;
        await secureUpdate({ name: editedName.value });
        alert("Tournament name updated!");
    };

    const togglePlacementTiebreaker = async () => {
        if (!tournament.value) return;
        editedTiebreaker.value = !editedTiebreaker.value;
        await secureUpdate({ usePlacementTiebreaker: editedTiebreaker.value });
    };

    const getTournamentRef = (id: string) => {
        return doc(db, 'artifacts', appId, 'public', 'data', 'tournaments', id);
    };

    const deleteTournament = async () => {
        if (!tournament.value || !isAdmin.value) return;

        const confirmed = confirm(
            `DANGER: Are you sure you want to delete "${tournament.value.name}"?\n\nThis action cannot be undone.`
        );

        if (!confirmed) return;

        isDeleting.value = true;
        const tid = tournament.value.id;

        try {
            const col = (name: string) => collection(db, 'artifacts', appId, 'public', 'data', name);

            // 1. If tournament was completed, reverse player metadata before deleting
            if (tournament.value.status === 'completed') {
                const t = tournament.value;
                const batch = writeBatch(db);

                Object.values(t.players).forEach(player => {
                    const playerRef = doc(db, 'artifacts', appId, 'public', 'data', 'players', player.id);
                    const allRaces = Object.values(t.races);
                    const playerRaceCount = allRaces.filter(r =>
                        Object.keys(r.placements).includes(player.id)
                    ).length;

                    let totalBeaten = 0;
                    let totalFaced = 0;
                    allRaces.forEach(race => {
                        const position = race.placements[player.id];
                        if (position == null) return;
                        const playersInRace = Object.keys(race.placements).length;
                        totalBeaten += playersInRace - position;
                        totalFaced += playersInRace - 1;
                    });

                    const updateData: Record<string, any> = {
                        'metadata.totalTournaments': increment(-1),
                        'metadata.totalRaces': increment(-playerRaceCount),
                        'metadata.opponentsFaced': increment(-totalFaced),
                        'metadata.opponentsBeaten': increment(-totalBeaten),
                    };

                    if (t.seasonId) {
                        updateData[`metadata.seasons.${t.seasonId}.opponentsFaced`] = increment(-totalFaced);
                        updateData[`metadata.seasons.${t.seasonId}.opponentsBeaten`] = increment(-totalBeaten);
                    }

                    batch.update(playerRef, updateData);
                });

                await batch.commit();
            }

            // 2. Delete secret and tournament docs (while admin doc still exists for rule checks)
            await deleteDoc(doc(col('secrets'), tid)).catch(() => {});
            await deleteDoc(getTournamentRef(tid));

            // 3. Delete current user's admin doc LAST (other steps need it for auth)
            const userId = auth.currentUser?.uid;
            if (userId) {
                await deleteDoc(doc(col('admins'), `${tid}_${userId}`)).catch(() => {});
            }

            // 4. Cleanup Local Storage / Session
            sessionStorage.removeItem('active_tid');
            localStorage.removeItem(`admin_pwd_${tid}`);
            localAdminPassword.value = '';

            // 5. Reset State
            tournament.value = null;
            showAdminModal.value = false;

            // 6. Clean URL
            const url = new URL(window.location.href);
            url.searchParams.delete('tid');
            window.history.pushState({}, '', url);

            // 7. Refresh Home List
            await fetchPublicTournaments();

            alert("Tournament deleted successfully.");
        } catch (e) {
            console.error("Error deleting tournament:", e);
            alert("Failed to delete tournament. Check console for permissions error.");
        } finally {
            isDeleting.value = false;
        }
    };

    // Return everything the template needs
    return {
        // State
        adminPasswordInput,
        localAdminPassword,
        showAdminModal,
        isDangerZoneOpen,
        isDeleting,
        editedName,
        editedTiebreaker,
        // Computed
        isAdmin,
        // Actions
        loginAsAdmin,
        copyPassword,
        updateTournamentName,
        togglePlacementTiebreaker,
        deleteTournament,
        autoLoginIfSuperAdmin
    };
}