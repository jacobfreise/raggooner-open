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
# Candidates (tried in order):
#   "card_list"           (9 chars)  → fixstr(9)  = 0xA9  A9 63 61 72 64 5F 6C 69 73 74 DC
#   "chara_array"         (11 chars) → fixstr(11) = 0xAB  AB 63 68 61 72 61 5F 61 72 72 61 79 DC
#   "trainee_chara_array" (19 chars) → fixstr(19) = 0xB3  B3 74 72 61 69 6E 65 65 ... DC
#
# Validation key: "chara_id" (8 chars) → fixstr(8) = 0xA8
#   A8 63 68 61 72 61 5F 69 64
# ─────────────────────────────────────────────────────────────────────────────

script = session.create_script(r"""
console.log("Scanning for uma roster data...");

(function() {
    const patterns = [
        { name: 'card_list',           pattern: 'A9 63 61 72 64 5F 6C 69 73 74 DC',                                           keyLen: 10 },
        { name: 'chara_array',         pattern: 'AB 63 68 61 72 61 5F 61 72 72 61 79 DC',                                     keyLen: 12 },
        { name: 'trainee_chara_array', pattern: 'B3 74 72 61 69 6E 65 65 5F 63 68 61 72 61 5F 61 72 72 61 79 DC',             keyLen: 20 },
    ];

    // Validation: fixstr(8)=A8 + "chara_id"
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

                    const regionRemaining = range.size - (arrayStart - range.base);
                    const extendedSizes = [5, 10, 20, 30]
                        .map(x => x * 1024 * 1024)
                        .filter(s => s > regionRemaining);
                    const allSizes = [regionRemaining, ...extendedSizes];

                    let bestData = null;
                    let bestCount = 0;

                    for (const size of allSizes) {
                        try {
                            const data = arrayStart.readByteArray(size);
                            const view = new Uint8Array(data);
                            const count = countCharaIds(view);

                            console.log(`  Size ${(size/1024/1024).toFixed(1)}MB: ${count} chara_id entries`);

                            if (count >= 3 && count >= bestCount) {
                                bestData = data;
                                bestCount = count;
                            }

                            if (bestCount > 0 && count === bestCount && size > regionRemaining) {
                                break;
                            }
                        } catch (e) {
                            break;
                        }
                    }

                    if (bestData) {
                        console.log(`[OK] Found valid roster with ${bestCount} entries! (key: ${name})`);
                        send('found', bestData);
                        found = true;
                        return;
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

def decode_obj(obj):
    """Recursively decode msgpack output: bytes keys/values → str where possible."""
    if isinstance(obj, dict):
        return {
            (k.decode('utf-8', errors='replace') if isinstance(k, bytes) else k): decode_obj(v)
            for k, v in obj.items()
        }
    if isinstance(obj, list):
        return [decode_obj(i) for i in obj]
    if isinstance(obj, bytes):
        try:
            return obj.decode('utf-8')
        except UnicodeDecodeError:
            return f'<binary {len(obj)}B>'
    return obj


def parse_partial_array(data: bytes):
    """Parse a msgpack array, yielding as many complete items as the buffer contains."""
    import struct
    b = data[0]
    if b == 0xDC:
        total = struct.unpack_from('>H', data, 1)[0]
        item_data = data[3:]
    elif b == 0xDD:
        total = struct.unpack_from('>I', data, 1)[0]
        item_data = data[5:]
    elif 0x90 <= b <= 0x9F:
        total = b & 0x0F
        item_data = data[1:]
    else:
        raise ValueError(f"Expected msgpack array, got byte 0x{b:02X}")

    print(f"Array declares {total} items — parsing...")

    up = msgpack.Unpacker(raw=True, strict_map_key=False)
    up.feed(item_data)

    items = []
    for item in up:
        items.append(decode_obj(item))
        if len(items) >= total:
            break

    if len(items) < total:
        print(f"  Data truncated — got {len(items)} of {total} complete items")
    return items


if found_data:
    print("Processing data...")
    try:
        chara_array = parse_partial_array(bytes(found_data))

        if isinstance(chara_array, list):
            print(f"[OK] Parsed {len(chara_array)} entries\n")

            # ── Inspect field names in the first entry ────────────────────────
            if chara_array and isinstance(chara_array[0], dict):
                print("Fields found in first entry:")
                for k, v in chara_array[0].items():
                    print(f"  {k}: {v}")
                print()
            # ─────────────────────────────────────────────────────────────────

            output = []
            for chara in chara_array:
                if not isinstance(chara, dict):
                    continue
                entry = {
                    "chara_id": chara.get("chara_id"),
                    # keep all scalar fields for inspection
                    "_raw": {k: v for k, v in chara.items() if not isinstance(v, (list, dict))},
                }
                if "card_id" in chara:
                    entry["card_id"] = chara["card_id"]
                output.append(entry)

            # Deduplicate by chara_id
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
                print(f"  chara_id: {unique[0].get('chara_id')}")

            print(f"\n[SUCCESS] Extracted {len(unique)} unique umas to {output_file}")
            print(f"          (from {len(output)} total entries including duplicates)")
            print("Check the file — the '_raw' fields show all available keys per entry.")
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
