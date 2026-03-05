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

    // Ban phase: click SFX + voiceline for everyone via Firestore watcher
    watch(
        () => tournament.value?.bans,
        (newBans, oldBans) => {
            if (!newBans || !oldBans) return;
            for (const uma of newBans) {
                if (!oldBans.includes(uma)) {
                    playAudio('/assets/sound-effects/sfx-ban-button-click.mp3');
                    const characterId = UMA_DICT[uma]?.characterId;
                    if (characterId) playAudio(`/assets/Voicelines/${characterId}/${characterId}-banned.wav`);
                }
            }
        }
    );

    // Uma draft picks + player draft picks: click SFX (+ voiceline for uma) for everyone
    watch(
        () => tournament.value?.teams,
        (newTeams, oldTeams) => {
            if (!newTeams || !oldTeams) return;
            for (const newTeam of newTeams) {
                const oldTeam = oldTeams.find(t => t.id === newTeam.id);

                // Uma draft picks (umaPool)
                const oldPool = oldTeam?.umaPool ?? [];
                const newPool = newTeam.umaPool ?? [];
                for (const uma of newPool) {
                    if (!oldPool.includes(uma)) {
                        playAudio('/assets/sound-effects/sfx-lockin-button-click.mp3');
                        const characterId = UMA_DICT[uma]?.characterId;
                        if (characterId) playAudio(`/assets/Voicelines/${characterId}/${characterId}-picked.wav`);
                    }
                }

                // Player draft picks (memberIds)
                const oldMembers = oldTeam?.memberIds ?? [];
                const newMembers = newTeam.memberIds ?? [];
                if (newMembers.length > oldMembers.length) {
                    playAudio('/assets/sound-effects/sfx-lockin-button-click.mp3');
                }
            }
        }
    );
}
