// src/composables/useAdmin.ts
import { ref, computed, watch, type Ref } from 'vue';
import { doc, setDoc, deleteDoc, collection, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { auth, db } from '../firebase'; // Adjust path if needed
import type { Tournament, FirestoreUpdate } from '../types';

// Define the interface for the update function to ensure type safety
type SecureUpdateFn = (data: FirestoreUpdate<Tournament>) => Promise<void>;
type FetchTournamentsFn = () => Promise<void>;

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

            // Helper: query docs for this tournament and batch-delete them
            const deleteByTournamentId = async (collectionName: string) => {
                const snap = await getDocs(
                    query(col(collectionName), where('tournamentId', '==', tid))
                );
                console.log(`[delete] ${collectionName}: found ${snap.size} docs for tournament ${tid}`);
                if (snap.size === 0) return;

                const docs = [...snap.docs];
                while (docs.length > 0) {
                    const batch = writeBatch(db);
                    docs.splice(0, 500).forEach(d => batch.delete(d.ref));
                    await batch.commit();
                }
            };

            // 1. Delete participations and races FIRST (while admin doc still exists for rule checks)
            await deleteByTournamentId('participations');
            await deleteByTournamentId('races');

            // 2. Delete secret and tournament docs (while admin doc still exists for rule checks)
            await deleteDoc(doc(col('secrets'), tid)).catch(() => {});
            await deleteDoc(getTournamentRef(tid));

            // 3. Delete current user's admin doc LAST (other steps need it for auth)
            const userId = auth.currentUser?.uid;
            if (userId) {
                await deleteDoc(doc(col('admins'), `${tid}_${userId}`)).catch(() => {});
            }

            // 3. Cleanup Local Storage / Session
            sessionStorage.removeItem('active_tid');
            localStorage.removeItem(`admin_pwd_${tid}`);
            localAdminPassword.value = '';

            // 4. Reset State
            tournament.value = null;
            showAdminModal.value = false;

            // 5. Clean URL
            const url = new URL(window.location.href);
            url.searchParams.delete('tid');
            window.history.pushState({}, '', url);

            // 6. Refresh Home List
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
        deleteTournament
    };
}