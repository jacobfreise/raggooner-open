# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "frida",
#     "msgpack",
# ]
# ///
#
# Extract the player's Uma roster (owned/available umas) from game memory (Windows).
# Run as Administrator with the game open on the Uma selection / Trainee list screen
# (Home -> Uma Musume icon, or Enhance -> Trainee List).
#
import frida
import msgpack
import json
import sys
import time

print("=== Uma Musume Roster Extractor ===\n")
print("Make sure you are on the Uma selection or Trainee list screen before running.\n")
print("Attaching to game process...")

try:
    session = frida.attach("UmamusumePrettyDerby.exe")
except Exception as e:
    print("[X] Error: Could not attach to game process")
    print("  Make sure UmamusumePrettyDerby.exe is running")
    input("\nPress Enter to exit...")
    sys.exit(1)

print("[OK] Connected to game\n")

found_data = None

def on_message(message, data):
    global found_data
    if data and len(data) > 0:
        found_data = data
        print(f"[OK] Received data chunk: {len(data)} bytes")

# ── Pattern reference ────────────────────────────────────────────────────────
# Primary key: "chara_array" (11 chars) → fixstr(11) = 0xAB
#   AB 63 68 61 72 61 5F 61 72 72 61 79 DC
#
# Fallback key: "trainee_chara_array" (19 chars) → fixstr(19) = 0xB3
#   B3 74 72 61 69 6E 65 65 5F 63 68 61 72 61 5F 61 72 72 61 79 DC
#   (note: same length prefix as "trained_chara_array" used in veteran extractor)
#
# Validation key: "chara_id" (8 chars) → fixstr(8) = 0xA8
#   A8 63 68 61 72 61 5F 69 64
# ─────────────────────────────────────────────────────────────────────────────

script = session.create_script(r"""
console.log("Scanning for uma roster data...");

(function() {
    // Try primary pattern: "chara_array"
    // fixstr(11)=AB + "chara_array" + DC
    const patterns = [
        { name: 'chara_array',         pattern: 'AB 63 68 61 72 61 5F 61 72 72 61 79 DC', keyLen: 12 },
        { name: 'trainee_chara_array', pattern: 'B3 74 72 61 69 6E 65 65 5F 63 68 61 72 61 5F 61 72 72 61 79 DC', keyLen: 20 },
    ];

    // Validation: fixstr(8)=A8 + "chara_id"
    // A8 63 68 61 72 61 5F 69 64
    function countCharaIds(view) {
        let count = 0;
        const limit = Math.min(view.length - 9, 5 * 1024 * 1024);
        for (let j = 0; j < limit; j++) {
            if (view[j]   === 0xA8 &&
                view[j+1] === 0x63 && view[j+2] === 0x68 && view[j+3] === 0x61 &&
                view[j+4] === 0x72 && view[j+5] === 0x61 && view[j+6] === 0x5F &&
                view[j+7] === 0x69 && view[j+8] === 0x64) {
                count++;
                if (count >= 500) break;
            }
        }
        return count;
    }

    const allRanges = Process.enumerateRanges({protection: "rw-", coalesce: true});
    const ranges = allRanges
        .filter(r => r.size >= 100000 && r.size <= 500 * 1024 * 1024)
        .sort((a, b) => b.size - a.size);

    console.log(`Scanning ${ranges.length} memory regions (filtered from ${allRanges.length})...`);

    let found = false;
    let scannedCount = 0;

    for (let i = 0; i < ranges.length && !found; i++) {
        const range = ranges[i];
        scannedCount++;

        if (scannedCount % 10 === 0) {
            console.log(`Progress: ${scannedCount}/${ranges.length} regions scanned...`);
        }

        for (const { name, pattern, keyLen } of patterns) {
            if (found) break;
            try {
                const results = Memory.scanSync(range.base, range.size, pattern);
                if (results.length === 0) continue;

                console.log(`[${name}] Found ${results.length} match(es) in region ${scannedCount}`);

                for (const result of results) {
                    const arrayStart = result.address.add(keyLen);
                    const sizes = [5 * 1024 * 1024, 10 * 1024 * 1024, 15 * 1024 * 1024];

                    for (const size of sizes) {
                        try {
                            const maxSize = Math.min(size, range.size - (arrayStart - range.base));
                            const data = arrayStart.readByteArray(maxSize);
                            const view = new Uint8Array(data);
                            const count = countCharaIds(view);

                            console.log(`  Size ${size/(1024*1024)}MB: ${count} chara_id entries`);

                            if (count >= 5) {
                                console.log(`[OK] Found valid roster with ${count} umas! (key: ${name})`);
                                send('found', data);
                                found = true;
                                return;
                            }
                        } catch (e) {
                            continue;
                        }
                    }
                }
            } catch (e) {
                continue;
            }
        }
    }

    if (!found) {
        console.log("No roster data found.");
        console.log("Try: Home -> Uma Musume, or Enhance -> Trainee List");
    }
})();
""", runtime='v8')

script.on("message", on_message)

try:
    script.load()
except Exception as e:
    if "timeout" in str(e).lower():
        print("[!] Script load timed out, scan still running in background...")
        print("    Waiting for results (this may take a minute)...\n")
    else:
        print(f"[X] Error loading script: {e}")
        input("\nPress Enter to exit...")
        sys.exit(1)

print("Scanning memory (please wait, up to 60 seconds)...\n")

for _ in range(60):
    time.sleep(1)
    if found_data:
        break

if found_data:
    print("Processing data...")
    try:
        unpacker = msgpack.Unpacker(raw=False)
        unpacker.feed(found_data)
        chara_array = unpacker.unpack()

        if isinstance(chara_array, list):
            print(f"[OK] Parsed {len(chara_array)} umas")

            output = []
            for chara in chara_array:
                entry = {
                    "chara_id": chara.get("chara_id"),
                }
                # Include card_id (uma variant) if present
                if "card_id" in chara:
                    entry["card_id"] = chara["card_id"]
                output.append(entry)

            # Deduplicate by chara_id — same uma can appear multiple times
            # (e.g. multiple trained copies); keep unique chara_ids
            seen = set()
            unique = []
            for entry in output:
                cid = entry.get("chara_id")
                if cid not in seen:
                    seen.add(cid)
                    unique.append(entry)

            import os
            output_file = "uma_roster.json"
            try:
                with open(output_file, "w", encoding="utf-8") as f:
                    json.dump(unique, f, indent=2, ensure_ascii=False)
                print(f"[OK] Saved to {os.path.abspath(output_file)}\n")
            except PermissionError:
                output_file = os.path.join(os.path.expanduser("~"), "Documents", "uma_roster.json")
                with open(output_file, "w", encoding="utf-8") as f:
                    json.dump(unique, f, indent=2, ensure_ascii=False)
                print(f"[OK] Saved to {output_file}\n")

            if unique:
                print("Sample entry:")
                print(f"  chara_id: {unique[0]['chara_id']}")
                if "card_id" in unique[0]:
                    print(f"  card_id:  {unique[0]['card_id']}")

            print(f"\n[SUCCESS] Extracted {len(unique)} unique umas to {output_file}")
            print(f"          (from {len(output)} total entries including duplicates)")
        else:
            print(f"[X] Expected list but got {type(chara_array)}")
    except Exception as e:
        print(f"[X] Error processing data: {e}")
        import traceback
        traceback.print_exc()
else:
    print("[X] No data found.")
    print("\nTroubleshooting:")
    print("  1. Open the Uma selection screen (Home -> Uma Musume icon)")
    print("     or the Trainee list (Enhance -> Trainee List)")
    print("  2. Wait for the screen to fully load, then run this script")
    print("  3. Run as Administrator")

session.detach()
input("\nPress Enter to exit...")
