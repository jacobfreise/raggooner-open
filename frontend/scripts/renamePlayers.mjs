#!/usr/bin/env node

/**
 * Renames GlobalPlayer entries in Firestore.
 * Updates the player doc name and adds the old name as an alias.
 *
 * Usage:
 *   node scripts/renamePlayers.mjs                        # emulator (default)
 *   node scripts/renamePlayers.mjs --live --token <TOKEN>  # live database
 */

import { confirmLiveMode, IS_LIVE, setDoc, listAll } from './config.mjs';

// ============================================================
// CONFIGURE RENAMES HERE: [currentName, newName]
// ============================================================
const RENAME_PAIRS = [
  // ['OldName', 'NewName'],
];

// --- Main ---

async function main() {
  if (RENAME_PAIRS.length === 0) {
    console.log('No renames configured. Edit RENAME_PAIRS in the script.');
    process.exit(0);
  }

  await confirmLiveMode();

  console.log(`=== Player Rename Tool${IS_LIVE ? ' (LIVE)' : ''} ===\n`);

  // Load all players
  console.log('Loading players...');
  const allPlayers = await listAll('players');
  console.log(`  Found ${allPlayers.length} players`);

  const playerByName = new Map();
  for (const p of allPlayers) {
    playerByName.set(p.name, p);
    // Also index by aliases so we can find players even if already renamed
    for (const alias of (p.aliases || [])) {
      if (!playerByName.has(alias)) playerByName.set(alias, p);
    }
  }

  // Validate rename pairs
  for (const [currentName, newName] of RENAME_PAIRS) {
    const player = playerByName.get(currentName);
    if (!player) {
      console.error(`Player "${currentName}" not found!`);
      process.exit(1);
    }
    // Check if new name conflicts with an existing different player
    const conflict = playerByName.get(newName);
    if (conflict && conflict.id !== player.id) {
      console.error(`Cannot rename "${currentName}" to "${newName}" — a different player with that name already exists (${conflict.id})!`);
      process.exit(1);
    }
    console.log(`  Will rename: "${currentName}" (${player.id}) → "${newName}"`);
  }

  // Process renames
  for (const [currentName, newName] of RENAME_PAIRS) {
    const player = playerByName.get(currentName);

    console.log(`\n--- Renaming "${currentName}" → "${newName}" ---`);

    // Add old name as alias if not already there
    const aliases = player.aliases || [];
    if (!aliases.includes(currentName) && currentName !== newName) {
      aliases.push(currentName);
    }

    const updated = { ...player };
    delete updated._docId;
    updated.name = newName;
    updated.aliases = aliases;

    await setDoc('players', player.id, updated);
    console.log(`  Updated player doc: name="${newName}", aliases=${JSON.stringify(aliases)}`);
  }

  console.log('\nAll renames complete!');
  process.exit(0);
}

main().catch(err => {
  console.error('\nFailed:', err.message);
  process.exit(1);
});
