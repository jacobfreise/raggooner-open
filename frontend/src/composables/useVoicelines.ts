import { watch, ref, type Ref } from 'vue';
import type { Tournament } from '../types';
import { UMA_DICT } from '../utils/umaData';

const saved = localStorage.getItem('voicelineVolume');
export const voicelineVolume = ref(saved !== null ? parseFloat(saved) : 0.8);

const playAudio = (path: string) => {
    const audio = new Audio(path);
    audio.volume = voicelineVolume.value;
    audio.play().catch(() => {});
};

// For hover sounds — plays only on the local client
export const playLocalSfx = (path: string) => playAudio(path);

export function useVoicelines(tournament: Ref<Tournament | null>) {
    watch(voicelineVolume, (v) => localStorage.setItem('voicelineVolume', String(v)));

    // Snapshots of state at page-load time. Only changes after these are populated trigger sounds.
    // Initialized explicitly via setBaseline() from TournamentView once the first server-confirmed
    // Firestore snapshot arrives, preventing retroactive sounds from stale cached data.
    let seenBans: Set<string> | null = null;
    let seenUmaPools: Map<string, Set<string>> | null = null;
    let seenMembers: Map<string, Set<string>> | null = null;

    const setBaseline = (t: Tournament) => {
        seenBans = new Set(t.bans ?? []);
        seenUmaPools = new Map(t.teams.map(team => [team.id, new Set(team.umaPool ?? [])]));
        seenMembers = new Map(t.teams.map(team => [team.id, new Set(team.memberIds ?? [])]));
    };

    // Ban phase
    watch(
        () => tournament.value?.bans,
        (newBans) => {
            if (!newBans || seenBans === null) return;
            for (const uma of newBans) {
                if (!seenBans.has(uma)) {
                    seenBans.add(uma);
                    playAudio('/assets/sound-effects/sfx-ban-button-click.mp3');
                    const characterId = UMA_DICT[uma]?.characterId;
                    if (characterId) playAudio(`/assets/Voicelines/${characterId}/${characterId}-banned.wav`);
                }
            }
        }
    );

    // Uma draft picks + player draft picks
    watch(
        () => tournament.value?.teams,
        (newTeams) => {
            if (!newTeams || seenUmaPools === null || seenMembers === null) return;
            for (const team of newTeams) {
                // Uma pool picks
                const poolSeen = seenUmaPools.get(team.id) ?? new Set<string>();
                for (const uma of team.umaPool ?? []) {
                    if (!poolSeen.has(uma)) {
                        poolSeen.add(uma);
                        seenUmaPools.set(team.id, poolSeen);
                        playAudio('/assets/sound-effects/sfx-lockin-button-click.mp3');
                        const characterId = UMA_DICT[uma]?.characterId;
                        if (characterId) playAudio(`/assets/Voicelines/${characterId}/${characterId}-picked.wav`);
                    }
                }

                // Player draft picks
                const membersSeen = seenMembers.get(team.id) ?? new Set<string>();
                for (const memberId of team.memberIds ?? []) {
                    if (!membersSeen.has(memberId)) {
                        membersSeen.add(memberId);
                        seenMembers.set(team.id, membersSeen);
                        playAudio('/assets/sound-effects/sfx-lockin-button-click.mp3');
                    }
                }
            }
        }
    );

    return { setBaseline };
}
