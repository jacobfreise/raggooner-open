# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "frida",
#     "msgpack",
# ]
# ///
#
# Extract Support Card list + limit breaks from Uma Musume memory (Windows).
# Run as Administrator with the game open on the Support Card list screen
# (Deck -> Support Card List).
#
import frida
import msgpack
import json
import sys
import time

print("=== Uma Musume Support Card Extractor ===\n")
print("Make sure you are on the Support Card list screen before running.\n")
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
# Key: "support_card_array" (18 chars) → fixstr(18) = 0xB2
#   B2 73 75 70 70 6F 72 74 5F 63 61 72 64 5F 61 72 72 61 79
# Followed by DC (array16 marker)
#
# Validation key: "support_card_id" (15 chars) → fixstr(15) = 0xAF
#   AF 73 75 70 70 6F 72 74 5F 63 61 72 64 5F 69 64
# ─────────────────────────────────────────────────────────────────────────────

script = session.create_script(r"""
console.log("Scanning for support card data...");

(function() {
    // fixstr(18) + "support_card_array" + DC (array16 marker)
    const pattern = 'B2 73 75 70 70 6F 72 74 5F 63 61 72 64 5F 61 72 72 61 79 DC';

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

        try {
            const results = Memory.scanSync(range.base, range.size, pattern);

            if (results.length > 0) {
                console.log(`Found ${results.length} potential matches in region ${scannedCount}`);

                for (const result of results) {
                    // Skip key prefix (0xB2 + 18 bytes key) = 19 bytes; keep DC marker
                    const arrayStart = result.address.add(19);

                    const sizes = [5 * 1024 * 1024, 10 * 1024 * 1024, 15 * 1024 * 1024];

                    for (const size of sizes) {
                        try {
                            const maxSize = Math.min(size, range.size - (arrayStart - range.base));
                            const data = arrayStart.readByteArray(maxSize);

                            // Validate: count "support_card_id" occurrences
                            // fixstr(15)=AF + "support_card_id" = AF 73 75 70 70 6F 72 74 5F 63 61 72 64 5F 69 64
                            const view = new Uint8Array(data);
                            let cardCount = 0;
                            const checkLen = Math.min(view.length - 16, 5 * 1024 * 1024);
                            for (let j = 0; j < checkLen; j++) {
                                if (view[j]   === 0xAF &&
                                    view[j+1] === 0x73 && view[j+2]  === 0x75 && view[j+3]  === 0x70 &&
                                    view[j+4] === 0x70 && view[j+5]  === 0x6F && view[j+6]  === 0x72 &&
                                    view[j+7] === 0x74 && view[j+8]  === 0x5F && view[j+9]  === 0x63 &&
                                    view[j+10]=== 0x61 && view[j+11] === 0x72 && view[j+12] === 0x64 &&
                                    view[j+13]=== 0x5F && view[j+14] === 0x69 && view[j+15] === 0x64) {
                                    cardCount++;
                                    if (cardCount >= 100) break;
                                }
                            }

                            console.log(`Size ${size / (1024*1024)}MB: found ${cardCount} support_card_id entries`);

                            if (cardCount >= 5) {
                                console.log(`[OK] Found valid support card array with ${cardCount} cards!`);
                                send('found', data);
                                found = true;
                                return;
                            }
                        } catch (e) {
                            continue;
                        }
                    }
                }
            }
        } catch (e) {
            continue;
        }
    }

    if (!found) {
        console.log("No support card data found.");
        console.log("Make sure you are on the Support Card list screen.");
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
        card_array = unpacker.unpack()

        if isinstance(card_array, list):
            print(f"[OK] Parsed {len(card_array)} support cards")

            # Extract only the fields we care about
            output = []
            for card in card_array:
                entry = {
                    "support_card_id": card.get("support_card_id"),
                    "limit_break_count": card.get("limit_break_count", 0),
                }
                output.append(entry)

            import os
            output_file = "support_cards.json"
            try:
                with open(output_file, "w", encoding="utf-8") as f:
                    json.dump(output, f, indent=2, ensure_ascii=False)
                print(f"[OK] Saved to {os.path.abspath(output_file)}\n")
            except PermissionError:
                output_file = os.path.join(os.path.expanduser("~"), "Documents", "support_cards.json")
                with open(output_file, "w", encoding="utf-8") as f:
                    json.dump(output, f, indent=2, ensure_ascii=False)
                print(f"[OK] Saved to {output_file}\n")

            if output:
                print("Sample entry:")
                print(f"  support_card_id:   {output[0]['support_card_id']}")
                print(f"  limit_break_count: {output[0]['limit_break_count']}")

            print(f"\n[SUCCESS] Extracted {len(output)} support cards to {output_file}")
        else:
            print(f"[X] Error: Expected list but got {type(card_array)}")
    except Exception as e:
        print(f"[X] Error processing data: {e}")
        import traceback
        traceback.print_exc()
else:
    print("[X] No data found.")
    print("\nTroubleshooting:")
    print("  1. Open the Support Card list screen (Deck -> Support Cards)")
    print("  2. Wait for it to fully load, then run this script")
    print("  3. Run as Administrator")

session.detach()
input("\nPress Enter to exit...")
