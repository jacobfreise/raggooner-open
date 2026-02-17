<script setup lang="ts">
import { ref } from 'vue';
import { collection, getDocs, writeBatch, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Season } from '../types';

const APP_ID = 'default-app'; // TODO: Adjust to your app ID

const processing = ref(false);
const logs = ref<string[]>([]);

const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
  const prefix = {
    info: '📋',
    success: '✅',
    error: '❌'
  }[type];
  logs.value.push(`${prefix} ${message}`);
};

const setupSeasons = async () => {
  processing.value = true;
  logs.value = [];

  addLog('Starting Season Setup...', 'info');

  try {
    // Step 1: Create Seasons
    addLog('Step 1/2: Creating seasons...', 'info');

    const season1: Season = {
      id: 'season-1',
      name: 'Season 1',
      startDate: new Date('2025-09-01').toISOString(),
      endDate: new Date('2025-12-31').toISOString(),
      tournamentIds: [],
      description: 'First season'
    };

    const season2: Season = {
      id: 'season-2',
      name: 'Season 2',
      startDate: new Date('2026-01-01').toISOString(),
      tournamentIds: [],
      description: 'Second season'
    };

    const season1Ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'seasons', season1.id);
    const season2Ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'seasons', season2.id);

    await setDoc(season1Ref, season1);
    await setDoc(season2Ref, season2);

    addLog('Created Season 1 & Season 2', 'success');

    // Step 2: Assign tournaments to seasons
    addLog('Step 2/2: Assigning seasons based on Tournament name...', 'info');

    const tournamentsRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'tournaments');
    const tournamentsSnap = await getDocs(tournamentsRef);

    // Track IDs separately!
    const season1TournamentIds: string[] = [];
    const season2TournamentIds: string[] = [];

    let batch = writeBatch(db);
    let batchCount = 0;

    // Use a for...of loop so 'await batch.commit()' pauses the loop safely
    for (const docSnap of tournamentsSnap.docs) {
      // 1. Correctly call data() as a function
      const data = docSnap.data();
      const name = data.name || '';

      // 2. Determine the season
      const isSeasonTwo = name.includes('S2') || name.includes('Season 2');
      const targetSeasonId = isSeasonTwo ? 'season-2' : 'season-1';

      // 3. Update the tournament document
      const tournamentRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'tournaments', docSnap.id);
      batch.update(tournamentRef, { seasonId: targetSeasonId });

      // 4. Push to the correct array
      if (isSeasonTwo) {
        season2TournamentIds.push(docSnap.id);
      } else {
        season1TournamentIds.push(docSnap.id);
      }

      batchCount++;

      // 5. Safely await the batch commit
      if (batchCount >= 500) {
        await batch.commit();
        batch = writeBatch(db);
        batchCount = 0;
      }
    }

    // Commit any remaining updates
    if (batchCount > 0) {
      await batch.commit();
    }

    addLog(`Assigned ${season1TournamentIds.length} to Season 1`, 'success');
    addLog(`Assigned ${season2TournamentIds.length} to Season 2`, 'success');

    // Step 3: Update BOTH Seasons with their specific tournament IDs
    addLog('Updating Season documents with tournament references...', 'info');
    await setDoc(season1Ref, {
      ...season1,
      tournamentIds: season1TournamentIds
    });

    await setDoc(season2Ref, {
      ...season2,
      tournamentIds: season2TournamentIds
    });

    addLog('🎉 Season Setup Complete!', 'success');

  } catch (e) {
    console.error(e);
    addLog(`Setup failed: ${e instanceof Error ? e.message : 'Unknown error'}`, 'error');
  } finally {
    processing.value = false;
  }
};

</script>

<template>
  <div class="p-6 bg-slate-800 rounded-xl border border-slate-700 max-w-3xl mx-auto">
    <div class="flex items-center gap-3 mb-4">
      <i class="ph-fill ph-calendar-check text-3xl text-indigo-400"></i>
      <div>
        <h2 class="text-2xl font-bold text-white">Season Setup</h2>
        <p class="text-sm text-slate-400">Create seasons and assign tournaments before migration</p>
      </div>
    </div>

    <!-- Info Box -->
    <div class="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4 mb-6">
      <div class="flex items-start gap-2">
        <i class="ph-fill ph-info text-blue-400 text-xl mt-0.5"></i>
        <div>
          <h3 class="text-sm font-bold text-blue-200 mb-2">What this does:</h3>
          <ul class="text-xs text-blue-300/80 space-y-1">
            <li>• Creates <strong>Season 1</strong> (2025) and <strong>Season 2</strong> (2026)</li>
            <li>• Tries to assign <strong>all existing tournaments</strong> to Seasons based on Tournament Name</li>
            <li>• Prevents <code class="bg-blue-950/50 px-1 rounded">undefined seasonId</code> errors in migration</li>
            <li>• You can manually reassign tournaments to Seasons later</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Warning -->
    <div class="bg-amber-900/20 border border-amber-500/30 rounded-lg p-4 mb-6">
      <div class="flex items-start gap-2">
        <i class="ph-fill ph-warning text-amber-400 text-xl mt-0.5"></i>
        <div class="text-xs text-amber-300/80">
          <p class="font-bold mb-1">Run this BEFORE the migration!</p>
          <p>This will add a <code class="bg-amber-950/50 px-1 rounded">seasonId</code> field to all tournaments.</p>
        </div>
      </div>
    </div>

    <!-- Action Button -->
    <button
        @click="setupSeasons"
        :disabled="processing"
        class="w-full px-6 py-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg"
    >
      <i class="ph-bold ph-play-circle text-xl"></i>
      {{ processing ? 'Setting up...' : 'Setup Seasons' }}
    </button>

    <!-- Logs -->
    <div v-if="logs.length > 0" class="mt-6 bg-black/50 rounded-lg p-4 h-64 overflow-y-auto font-mono text-xs border border-slate-700">
      <div
          v-for="(log, i) in logs"
          :key="i"
          class="mb-1"
          :class="{
          'text-green-400': log.includes('✅'),
          'text-rose-400': log.includes('❌'),
          'text-slate-300': !log.includes('✅') && !log.includes('❌')
        }"
      >
        {{ log }}
      </div>
    </div>
  </div>
</template>