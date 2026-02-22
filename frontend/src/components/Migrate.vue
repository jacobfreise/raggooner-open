// @ts-nocheck
// Claude Info: This is a one-time use component for migrating data. Do not adjust it, unless explicitly stated.
// If this component causes npm run build errors, exclude it in the appropriate config


<script setup lang="ts">
import { ref } from 'vue';
import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Tournament, GlobalPlayer } from '../types';

const APP_ID = 'default-app'; // TODO: Adjust to your app ID

const processing = ref(false);
const logs = ref<string[]>([]);
const currentStep = ref<'idle' | 'players' | 'complete'>('idle');

// Statistics
const stats = ref({
  tournaments: 0,
  players: 0,
  duplicatesFound: 0
});

// Duplicate detection
const duplicatePlayers = ref<Array<{name: string, count: number, variations: string[]}>>([]);

const addLog = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
  const prefix = {
    info: '📋',
    success: '✅',
    warning: '⚠️',
    error: '❌'
  }[type];

  logs.value.push(`${prefix} ${message}`);
};

/**
 * Normalize player names for matching
 * Handles: case, whitespace, special characters
 */
const normalizeName = (name: string): string => {
  return name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')      // Multiple spaces -> single space
      .replace(/[^\w\s]/g, '');  // Remove special chars
};

/**
 * Calculate similarity between two names (for fuzzy matching)
 * Returns 0-1, where 1 is identical
 */
const nameSimilarity = (a: string, b: string): number => {
  const normalized1 = normalizeName(a);
  const normalized2 = normalizeName(b);

  if (normalized1 === normalized2) return 1;

  // Simple Levenshtein distance approximation
  const longer = normalized1.length > normalized2.length ? normalized1 : normalized2;
  const shorter = normalized1.length > normalized2.length ? normalized2 : normalized1;

  if (longer.length === 0) return 1;

  const editDistance = [...longer].reduce((prev, char, i) => {
    return prev + (shorter[i] !== char ? 1 : 0);
  }, 0);

  return 1 - editDistance / longer.length;
};

const migrateToNewStructure = async (dryRun: boolean) => {
  processing.value = true;
  logs.value = [];
  stats.value = { tournaments: 0, players: 0, duplicatesFound: 0 };
  duplicatePlayers.value = [];

  addLog(dryRun ? 'Starting DRY RUN...' : 'Starting LIVE MIGRATION...', 'info');
  addLog('This will create players/ collection', 'info');

  try {
    // === STEP 1: FETCH ALL TOURNAMENTS ===
    currentStep.value = 'players';
    addLog('Step 1/4: Fetching tournaments...', 'info');

    const tournamentsRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'tournaments');
    const tournamentsSnap = await getDocs(tournamentsRef);

    const tournaments = tournamentsSnap.docs.map(doc => ({
      ...doc.data(),
      id: doc.id
    } as Tournament));

    stats.value.tournaments = tournaments.length;
    addLog(`Found ${tournaments.length} tournaments`, 'success');

    // === STEP 2: BUILD GLOBAL PLAYER POOL (by NAME) ===
    addLog('Step 2/4: Building global player pool (matching by name)...', 'info');

    const playersMap = new Map<string, GlobalPlayer>(); // Key: normalized name
    const playerIdMapping = new Map<string, string>(); // Old tournament-specific ID -> New global ID
    const nameOccurrences = new Map<string, Set<string>>(); // Track variations

    tournaments.forEach(tournament => {
      tournament.players?.forEach(player => {
        const normalizedName = normalizeName(player.name);

        // Track name variations
        if (!nameOccurrences.has(normalizedName)) {
          nameOccurrences.set(normalizedName, new Set());
        }
        nameOccurrences.get(normalizedName)!.add(player.name);

        // Check if we already have this player (by normalized name)
        if (!playersMap.has(normalizedName)) {
          // Create new global player
          const globalId = crypto.randomUUID();
          playersMap.set(normalizedName, {
            id: globalId,
            name: player.name, // Use first occurrence's exact spelling
            aliases: [],
            createdAt: tournament.createdAt,
            metadata: {
              totalTournaments: 0,
              totalRaces: 0
            }
          });

          addLog(`  New player: "${player.name}"`, 'info');
        } else {
          // Player exists - track alternative spellings
          const existingPlayer = playersMap.get(normalizedName)!;
          if (existingPlayer.name !== player.name) {
            if (!existingPlayer.aliases) existingPlayer.aliases = [];
            if (!existingPlayer.aliases.includes(player.name)) {
              existingPlayer.aliases.push(player.name);
              addLog(`  Merged: "${player.name}" → "${existingPlayer.name}"`, 'info');
              stats.value.duplicatesFound++;
            }
          }
        }

        const globalPlayer = playersMap.get(normalizedName)!;
        globalPlayer.metadata.totalTournaments++;

        // Map old ID to new global ID
        playerIdMapping.set(player.id, globalPlayer.id);
      });
    });

    // Detect potential duplicates (similar names)
    const playerNames = Array.from(playersMap.keys());
    const potentialDuplicates = new Map<string, string[]>();

    for (let i = 0; i < playerNames.length; i++) {
      for (let j = i + 1; j < playerNames.length; j++) {
        const name1 = playerNames[i]!;
        const name2 = playerNames[j]!;
        const player1 = playersMap.get(name1)!;
        const player2 = playersMap.get(name2)!;

        const similarity = nameSimilarity(player1.name, player2.name);

        // Flag if 70%+ similar
        if (similarity > 0.7 && similarity < 1) {
          const key = [player1.name, player2.name].sort().join('|');
          if (!potentialDuplicates.has(key)) {
            potentialDuplicates.set(key, [player1.name, player2.name]);
            addLog(`  ⚠️  Potential duplicate: "${player1.name}" ≈ "${player2.name}" (${Math.round(similarity * 100)}% similar)`, 'warning');
          }
        }
      }
    }

    // Build duplicate report
    nameOccurrences.forEach((variations, normalizedName) => {
      if (variations.size > 1) {
        const player = playersMap.get(normalizedName)!;
        duplicatePlayers.value.push({
          name: player.name,
          count: variations.size,
          variations: Array.from(variations)
        });
      }
    });

    stats.value.players = playersMap.size;
    addLog(`Created ${playersMap.size} unique players (${stats.value.duplicatesFound} duplicates merged)`, 'success');

    if (duplicatePlayers.value.length > 0) {
      addLog(`Found ${duplicatePlayers.value.length} players with name variations`, 'warning');
    }

    // === STEP 3: UPDATE TOURNAMENT DOCS — replace old player IDs with global IDs ===
    addLog('Updating tournament docs with global player IDs...', 'info');
    let tournamentsUpdated = 0;

    for (const tournament of tournaments) {
      let changed = false;

      // Update players[] array
      for (const player of (tournament.players || [])) {
        const globalId = playerIdMapping.get(player.id);
        if (globalId && globalId !== player.id) {
          player.id = globalId;
          changed = true;
        }
      }

      // Update teams[] — captainId and memberIds
      for (const team of (tournament.teams || [])) {
        const newCaptainId = playerIdMapping.get(team.captainId);
        if (newCaptainId && newCaptainId !== team.captainId) {
          team.captainId = newCaptainId;
          changed = true;
        }
        if (team.memberIds) {
          for (let i = 0; i < team.memberIds.length; i++) {
            const newId = playerIdMapping.get(team.memberIds[i]!);
            if (newId && newId !== team.memberIds[i]) {
              team.memberIds[i] = newId;
              changed = true;
            }
          }
        }
      }

      // Update wildcards[] — playerId
      for (const wc of (tournament.wildcards || [])) {
        const newId = playerIdMapping.get(wc.playerId);
        if (newId && newId !== wc.playerId) {
          wc.playerId = newId;
          changed = true;
        }
      }

      if (changed) {
        tournamentsUpdated++;
        addLog(`  Updated tournament: "${tournament.name}"`, 'info');
      }
    }

    addLog(`Tournaments to update: ${tournamentsUpdated}`, 'success');

    // === COMMIT TO FIRESTORE ===
    if (!dryRun) {
      currentStep.value = 'complete';
      addLog('Writing to Firestore...', 'info');

      // Write updated Tournaments (batched)
      let batch = writeBatch(db);
      let batchCount = 0;
      let totalBatches = 0;

      for (const tournament of tournaments) {
        const tournamentRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'tournaments', tournament.id);
        const { id, ...data } = tournament;
        batch.set(tournamentRef, data);
        batchCount++;

        if (batchCount >= 500) {
          await batch.commit();
          totalBatches++;
          addLog(`  Committed batch ${totalBatches} (Tournaments)`, 'info');
          batch = writeBatch(db);
          batchCount = 0;
        }
      }
      if (batchCount > 0) {
        await batch.commit();
        totalBatches++;
      }
      addLog(`✓ Tournaments written (${totalBatches} batches)`, 'success');

      // Write Players (batched)
      batch = writeBatch(db);
      batchCount = 0;
      totalBatches = 0;

      for (const [_, player] of playersMap) {
        const playerRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'players', player.id);
        batch.set(playerRef, player);
        batchCount++;

        if (batchCount >= 500) {
          await batch.commit();
          totalBatches++;
          addLog(`  Committed batch ${totalBatches} (Players)`, 'info');
          batch = writeBatch(db);
          batchCount = 0;
        }
      }
      if (batchCount > 0) {
        await batch.commit();
        totalBatches++;
      }
      addLog(`✓ Players written (${totalBatches} batches)`, 'success');

      addLog('🎉 MIGRATION COMPLETE!', 'success');
    } else {
      addLog('DRY RUN COMPLETE - No data was written', 'warning');
    }

    currentStep.value = 'complete';

  } catch (e) {
    console.error(e);
    addLog(`Migration failed: ${e instanceof Error ? e.message : 'Unknown error'}`, 'error');
    currentStep.value = 'idle';
  } finally {
    processing.value = false;
  }
};

// Export data as JSON for backup
const exportData = () => {
  const data = {
    stats: stats.value,
    duplicates: duplicatePlayers.value,
    logs: logs.value,
    timestamp: new Date().toISOString()
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `migration-log-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
};
</script>

<template>
  <div class="p-6 bg-slate-800 rounded-xl border border-slate-700 max-w-5xl mx-auto">
    <div class="flex items-center gap-3 mb-4">
      <i class="ph-fill ph-database text-3xl text-indigo-400"></i>
      <div>
        <h2 class="text-2xl font-bold text-white">Data Structure Migration</h2>
        <p class="text-sm text-slate-400">Migrate to normalized database structure with intelligent name matching</p>
      </div>
    </div>

    <!-- Migration Info -->
    <div class="bg-slate-900/50 border border-slate-700 rounded-lg p-4 mb-6">
      <h3 class="text-sm font-bold text-white mb-3 uppercase tracking-wider">What this does:</h3>
      <ul class="space-y-2 text-sm text-slate-300">
        <li class="flex items-start gap-2">
          <i class="ph-fill ph-check-circle text-green-400 mt-0.5"></i>
          <span>Creates <code class="text-indigo-400">players/</code> collection with global player pool</span>
        </li>
        <li class="flex items-start gap-2">
          <i class="ph-fill ph-check-circle text-green-400 mt-0.5"></i>
          <span>Merges duplicate players by name (case-insensitive, whitespace-tolerant)</span>
        </li>
        <li class="flex items-start gap-2">
          <i class="ph-fill ph-check-circle text-green-400 mt-0.5"></i>
          <span>Detects potential duplicate names with fuzzy matching</span>
        </li>
      </ul>
    </div>

    <!-- Statistics -->
    <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
      <div class="bg-slate-900/50 border border-slate-700 rounded-lg p-3 text-center">
        <div class="text-2xl font-bold text-white">{{ stats.tournaments }}</div>
        <div class="text-xs text-slate-400 uppercase tracking-wider">Tournaments</div>
      </div>
      <div class="bg-slate-900/50 border border-slate-700 rounded-lg p-3 text-center">
        <div class="text-2xl font-bold text-indigo-400">{{ stats.players }}</div>
        <div class="text-xs text-slate-400 uppercase tracking-wider">Players</div>
      </div>
      <div class="bg-slate-900/50 border border-slate-700 rounded-lg p-3 text-center">
        <div class="text-2xl font-bold text-amber-400">{{ stats.duplicatesFound }}</div>
        <div class="text-xs text-slate-400 uppercase tracking-wider">Merged</div>
      </div>
    </div>

    <!-- Duplicate Report -->
    <div v-if="duplicatePlayers.length > 0" class="bg-amber-900/20 border border-amber-500/30 rounded-lg p-4 mb-6">
      <div class="flex items-start gap-2 mb-3">
        <i class="ph-fill ph-warning text-amber-400 text-xl mt-0.5"></i>
        <div>
          <h3 class="text-sm font-bold text-amber-200">Name Variations Detected</h3>
          <p class="text-xs text-amber-300/70">These players had different capitalizations or spellings</p>
        </div>
      </div>

      <div class="space-y-2 max-h-40 overflow-y-auto">
        <div
            v-for="dup in duplicatePlayers"
            :key="dup.name"
            class="text-xs bg-slate-900/50 rounded p-2"
        >
          <div class="font-bold text-white mb-1">{{ dup.name }} ({{ dup.count }} variations)</div>
          <div class="text-slate-400">{{ dup.variations.join(', ') }}</div>
        </div>
      </div>
    </div>

    <!-- Progress -->
    <div v-if="processing" class="mb-6">
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm font-bold text-white">Migration Progress</span>
        <span class="text-xs text-slate-400">{{ currentStep }}</span>
      </div>
      <div class="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
            class="h-full bg-indigo-500 transition-all duration-500"
            :style="{
            width: currentStep === 'players' ? '50%' :
                   currentStep === 'complete' ? '100%' : '0%'
          }"
        ></div>
      </div>
    </div>

    <!-- Controls -->
    <div class="flex gap-3 mb-6">
      <button
          @click="migrateToNewStructure(true)"
          :disabled="processing"
          class="flex-1 px-4 py-3 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        <i class="ph-bold ph-flask"></i>
        Test (Dry Run)
      </button>

      <button
          @click="migrateToNewStructure(false)"
          :disabled="processing"
          class="flex-1 px-4 py-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        <i class="ph-bold ph-rocket-launch"></i>
        {{ processing ? 'Processing...' : 'Execute Migration' }}
      </button>

      <button
          @click="exportData"
          :disabled="logs.length === 0"
          class="px-4 py-3 rounded-lg bg-slate-700 hover:bg-slate-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          title="Export logs"
      >
        <i class="ph-bold ph-download-simple"></i>
      </button>
    </div>

    <!-- Logs -->
    <div class="bg-black/50 rounded-lg p-4 h-96 overflow-y-auto font-mono text-xs border border-slate-700">
      <div v-if="logs.length === 0" class="flex items-center justify-center h-full text-slate-500">
        <div class="text-center">
          <i class="ph ph-info text-4xl mb-2"></i>
          <p>Run a dry run or migration to see logs</p>
        </div>
      </div>

      <div
          v-for="(log, i) in logs"
          :key="i"
          class="mb-1"
          :class="{
          'text-green-400': log.includes('✅'),
          'text-yellow-400': log.includes('⚠️'),
          'text-rose-400': log.includes('❌'),
          'text-blue-400': log.includes('📋'),
          'text-slate-300': !log.includes('✅') && !log.includes('⚠️') && !log.includes('❌') && !log.includes('📋')
        }"
      >
        {{ log }}
      </div>
    </div>
  </div>
</template>