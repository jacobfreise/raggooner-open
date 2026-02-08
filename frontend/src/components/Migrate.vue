<script setup lang="ts">
import { ref } from 'vue';
import { collection, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../firebase'; // Adjust path to your firebase config
import { recalculateTournamentScores } from '../utils/utils'; // Adjust path to your utils
import type { Tournament } from '../types';

const processing = ref(false);
const logs = ref<string[]>([]);

const migrateAll = async (commit: boolean) => {
  processing.value = true;
  logs.value = []; // Clear logs
  logs.value.push(commit ? "🚀 STARTING LIVE MIGRATION..." : "🧪 STARTING DRY RUN...");

  try {
    // 1. Fetch ALL tournaments
    const querySnapshot = await getDocs(collection(db, 'artifacts', 'default_app', 'public', 'data', 'tournaments'));
    const batch = writeBatch(db);
    let updateCount = 0;

    querySnapshot.forEach((docSnap) => {
      const t = docSnap.data() as Tournament;

      // Safety Check: Ensure the object has the minimum required arrays
      if (!t.races || !t.players || !t.teams) {
        logs.value.push(`⚠️ Skipped ${t.name || t.id}: Missing data structures.`);
        return;
      }

      // 2. Run your existing calculation logic
      const result = recalculateTournamentScores(t);

      // 3. Prepare Update
      // We explicitly check if the data actually changed to avoid useless writes,
      // but strictly speaking, we want to ensure the DB matches the code's truth.

      const ref = docSnap.ref;

      if (commit) {
        batch.update(ref, {
          players: result.players,
          teams: result.teams,
          wildcards: result.wildcards
        });
      }

      updateCount++;
      logs.value.push(`✅ ${commit ? 'Queued' : 'Calculated'}: ${t.name} (${t.races.length} races)`);
    });

    // 4. Commit Batch
    if (commit && updateCount > 0) {
      logs.value.push("💾 Committing updates to Firestore...");
      await batch.commit();
      logs.value.push(`🎉 SUCCESS: Updated ${updateCount} tournaments.`);
    } else if (!commit) {
      logs.value.push(`🏁 DRY RUN COMPLETE. ${updateCount} tournaments would be updated.`);
    }

  } catch (e) {
    console.error(e);
    logs.value.push(`❌ ERROR: ${e instanceof Error ? e.message : 'Unknown error'}`);
  } finally {
    processing.value = false;
  }
};
</script>

<template>
  <div class="p-6 bg-slate-800 rounded-xl border border-slate-700">
    <h2 class="text-xl font-bold text-white mb-4">Database Migration</h2>
    <p class="text-sm text-slate-400 mb-6">
      This will fetch all tournaments and recalculate point totals for every team and player
      based on the race history stored in the database.
    </p>

    <div class="flex gap-4 mb-6">
      <button
          @click="migrateAll(false)"
          :disabled="processing"
          class="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600 text-white font-bold transition-colors disabled:opacity-50">
        Test (Dry Run)
      </button>

      <button
          @click="migrateAll(true)"
          :disabled="processing"
          class="px-4 py-2 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold transition-colors disabled:opacity-50">
        {{ processing ? 'Processing...' : 'Execute Migration' }}
      </button>
    </div>

    <div class="bg-black/50 rounded p-4 h-64 overflow-y-auto font-mono text-xs border border-slate-700">
      <div v-for="(log, i) in logs" :key="i" class="mb-1"
           :class="{
             'text-green-400': log.includes('SUCCESS') || log.includes('Queued'),
             'text-yellow-400': log.includes('dry run') || log.includes('Calculated'),
             'text-rose-400': log.includes('ERROR'),
             'text-slate-300': !log.includes('ERROR') && !log.includes('SUCCESS')
           }">
        {{ log }}
      </div>
    </div>
  </div>
</template>