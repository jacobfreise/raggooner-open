# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "frida",
# ]
# ///
#
# Extract Support Card list + limit breaks from Uma Musume memory (Windows).
# Run as Administrator with the game open on the Support Card list screen.
#
# Strategy: anchor on each "support_card_id" key found in memory, then search
# forward up to 5000 bytes for the associated "limit_break_count" value.
# All (card_id, lb) observations are collected across every memory region;
# the final lb for each card is the most-frequent value seen (mode), so a
# single bad pairing in one region cannot corrupt the result.
#
import frida
import json
import sys
import time

print("=== Uma Musume Support Card Extractor ===\n")
print("Make sure you are on the Support Card list screen before running.\n")
print("Attaching to game process...")

try:
    session = frida.attach("UmamusumePrettyDerby.exe")
except Exception as e:
    print("[X] Could not attach to game process")
    print("  Make sure UmamusumePrettyDerby.exe is running")
    input("\nPress Enter to exit...")
    sys.exit(1)

print("[OK] Connected to game\n")

found_cards = None

def on_message(message, data):
    global found_cards
    if message.get("type") == "send":
        found_cards = message.get("payload")

# ── Pattern reference ────────────────────────────────────────────────────────
# "limit_break_count" key: fixstr(17)=B1 + "limit_break_count" (17 bytes) = 18 bytes total
#   B1 6C 69 6D 69 74 5F 62 72 65 61 6B 5F 63 6F 75 6E 74
#
# "support_card_id" key: fixstr(15)=AF + "support_card_id" (15 bytes) = 16 bytes total
#   AF 73 75 70 70 6F 72 74 5F 63 61 72 64 5F 69 64
#
# In the msgpack map, support_card_id appears BEFORE limit_break_count.
# Confirmed structure: ...support_card_id → <uint16> ... exp → <uint32> ... limit_break_count → <0-4>
# So we search BACKWARDS from limit_break_count for the nearest support_card_id.
#
# msgpack integer encoding:
#   0x00–0x7F  positive fixint (value = byte)
#   0xCC       uint8  (next 1 byte)
#   0xCD       uint16 (next 2 bytes, big-endian)
#   0xCE       uint32 (next 4 bytes, big-endian)
# ─────────────────────────────────────────────────────────────────────────────

script = session.create_script(r"""
(function() {
    // ── helpers ──────────────────────────────────────────────────────────────
    function readInt(data, pos) {
        if (pos >= data.length) return null;
        const b = data[pos];
        if (b <= 0x7F) return b;
        if (b === 0xCC && pos+1 < data.length) return data[pos+1];
        if (b === 0xCD && pos+2 < data.length)
            return (data[pos+1] << 8) | data[pos+2];
        if (b === 0xCE && pos+4 < data.length)
            return ((data[pos+1]<<24)|(data[pos+2]<<16)|(data[pos+3]<<8)|data[pos+4]) >>> 0;
        return null;
    }

    // ── key byte patterns ─────────────────────────────────────────────────────
    // support_card_id: fixstr(15)=AF + "support_card_id" = 16 bytes
    const SC_KEY  = [0xAF,0x73,0x75,0x70,0x70,0x6F,0x72,0x74,0x5F,0x63,0x61,0x72,0x64,0x5F,0x69,0x64];
    const SC_LEN  = SC_KEY.length; // 16
    // limit_break_count: fixstr(17)=B1 + "limit_break_count" = 18 bytes
    const LB_KEY  = [0xB1,0x6C,0x69,0x6D,0x69,0x74,0x5F,0x62,0x72,0x65,0x61,0x6B,0x5F,0x63,0x6F,0x75,0x6E,0x74];
    const LB_LEN  = LB_KEY.length; // 18

    // Search forward from valuePos for the first limit_break_count within maxDist bytes.
    function findLimitBreak(data, valuePos, len, maxDist) {
        const end = Math.min(len - LB_LEN - 1, valuePos + maxDist);
        for (let i = valuePos; i < end; i++) {
            if (data[i] !== LB_KEY[0]) continue;
            let ok = true;
            for (let k = 1; k < LB_LEN; k++) {
                if (data[i+k] !== LB_KEY[k]) { ok = false; break; }
            }
            if (!ok) continue;
            const lbVal = readInt(data, i + LB_LEN);
            if (lbVal !== null && lbVal >= 0 && lbVal <= 4) return lbVal;
        }
        return null;
    }

    // ── scan ──────────────────────────────────────────────────────────────────
    const allRanges = Process.enumerateRanges({protection: "rw-", coalesce: true});
    const ranges = allRanges
        .filter(r => r.size >= 100000 && r.size <= 500 * 1024 * 1024)
        .sort((a, b) => b.size - a.size);

    console.log(`Scanning ${ranges.length} regions (anchored on support_card_id)...`);

    // Collect ALL (cardId, lbVal) observations across all regions.
    // Key: cardId, Value: array of 5 counters [lb0, lb1, lb2, lb3, lb4]
    const lbCounts = {};
    let scanned = 0;

    for (const range of ranges) {
        scanned++;
        if (scanned % 50 === 0) console.log(`Progress: ${scanned}/${ranges.length}...`);

        let data;
        try {
            data = new Uint8Array(range.base.readByteArray(range.size));
        } catch (e) { continue; }

        const len = data.length;

        for (let i = 0; i < len - SC_LEN - 1; i++) {
            if (data[i] !== SC_KEY[0]) continue;
            let ok = true;
            for (let k = 1; k < SC_LEN; k++) {
                if (data[i+k] !== SC_KEY[k]) { ok = false; break; }
            }
            if (!ok) continue;

            // Read support_card_id value (immediately after the 16-byte key)
            const cardId = readInt(data, i + SC_LEN);
            if (cardId === null || cardId <= 0) continue;

            // Search forward up to 5000 bytes for the matching limit_break_count
            const lbVal = findLimitBreak(data, i + SC_LEN, len, 5000);
            if (lbVal === null) continue;

            // Tally this observation
            if (!lbCounts[cardId]) lbCounts[cardId] = [0,0,0,0,0];
            lbCounts[cardId][lbVal]++;
        }
    }

    // Pick the most-frequently-observed lb value for each card (mode).
    // Ties broken in favour of the higher lb value.
    const cards = [];
    for (const cardId in lbCounts) {
        const counts = lbCounts[cardId];
        let bestLb = 0, bestCount = -1;
        for (let lb = 0; lb <= 4; lb++) {
            if (counts[lb] > bestCount) { bestCount = counts[lb]; bestLb = lb; }
        }
        cards.push({ card_id: parseInt(cardId, 10), limit_break_count: bestLb });
    }

    console.log(`Done. Found ${cards.length} support cards.`);
    send(cards);
})();
""", runtime='v8')

script.on("message", on_message)

try:
    script.load()
except Exception as e:
    if "timeout" in str(e).lower():
        print("[!] Scan running in background, waiting...\n")
    else:
        print(f"[X] Error: {e}")
        input("\nPress Enter to exit...")
        sys.exit(1)

print("Scanning memory (please wait, up to 120 seconds)...\n")

for _ in range(120):
    time.sleep(1)
    if found_cards is not None:
        break

if found_cards is None:
    print("[X] Timed out — no data received.")
    input("\nPress Enter to exit...")
    sys.exit(1)

print(f"Processing data...")

if not isinstance(found_cards, list) or len(found_cards) == 0:
    print("[X] No support cards found.")
    print("\nTroubleshooting:")
    print("  1. Open the Support Card list screen (Deck -> Support Cards)")
    print("  2. Scroll through all cards so they are fully loaded")
    print("  3. Run this script again as Administrator")
    input("\nPress Enter to exit...")
    sys.exit(1)

print(f"[OK] Found {len(found_cards)} support cards\n")

# Print all results to console for verification
print(f"  {'card_id':>10}  limit_break")
print("  " + "-" * 25)
for c in sorted(found_cards, key=lambda x: x['card_id']):
    print(f"  {c['card_id']:>10}  {c['limit_break_count']}")

import os
output_file = "support_cards.json"
try:
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(found_cards, f, indent=2)
    print(f"\n[OK] Saved to {os.path.abspath(output_file)}")
except PermissionError:
    output_file = os.path.join(os.path.expanduser("~"), "Documents", "support_cards.json")
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(found_cards, f, indent=2)
    print(f"\n[OK] Saved to {output_file}")

print(f"\n[SUCCESS] Extracted {len(found_cards)} support cards to {output_file}")

session.detach()
input("\nPress Enter to exit...")
