# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "frida",
# ]
# ///
#
# Discover all msgpack array key names present in game memory.
# Run as Administrator with the game on whatever screen you want to inspect.
# Output: array_keys.txt — sorted list of every string key that precedes a
# msgpack array16 (DC) or array32 (DD) marker found in memory.
#
import frida
import json
import sys
import time

print("=== Uma Musume Array Key Discovery ===\n")
print("Attaching to game process...")

try:
    session = frida.attach("UmamusumePrettyDerby.exe")
except Exception as e:
    print("[X] Could not attach to game process")
    print("  Make sure UmamusumePrettyDerby.exe is running")
    input("\nPress Enter to exit...")
    sys.exit(1)

print("[OK] Connected\n")

found_keys = None

def on_message(message, data):
    global found_keys
    if message.get("type") == "send" and message.get("payload"):
        payload = message["payload"]
        # New format: {keys: {...}, lbRegions: [...], lbTotal: N}
        # Old format (plain dict of keys) still supported
        if isinstance(payload, dict) and "keys" in payload:
            found_keys = payload
        else:
            found_keys = {"keys": payload, "lbRegions": [], "lbTotal": 0}

# ── How this works ────────────────────────────────────────────────────────────
# In msgpack a map entry looks like:
#   [fixstr byte: 0xA0-0xBF] [key string bytes] [value bytes...]
# When the value is an array16:  ...key... DC xx xx [array items]
# When the value is an array32:  ...key... DD xx xx xx xx [array items]
#
# Strategy: scan every rw memory region for 0xDC and 0xDD bytes.
# For each one, look backwards up to 32 bytes to find a fixstr prefix
# (0xA0-0xBF), read the key string, and collect it.
# Also handles str8 (0xD9 len byte) for keys longer than 31 chars.
# ─────────────────────────────────────────────────────────────────────────────

script = session.create_script(r"""
(function() {
    const allRanges = Process.enumerateRanges({protection: "rw-", coalesce: true});
    const ranges = allRanges
        .filter(r => r.size >= 100000 && r.size <= 500 * 1024 * 1024)
        .sort((a, b) => b.size - a.size);

    console.log(`Scanning ${ranges.length} regions...`);

    // ── Part 1: find all string keys that precede ANY array marker ────────────
    // Covers array16 (DC), array32 (DD), and fixarray (90-9F).
    const keySet = {};

    // ── Part 2: count occurrences of "limit_break_count" ─────────────────────
    // fixstr(17)=B1 + "limit_break_count"
    // B1 6C 69 6D 69 74 5F 62 72 65 61 6B 5F 63 6F 75 6E 74
    const LB_KEY = [0xB1,0x6C,0x69,0x6D,0x69,0x74,0x5F,0x62,0x72,0x65,0x61,0x6B,0x5F,0x63,0x6F,0x75,0x6E,0x74];
    let lbTotal = 0;
    const lbRegions = []; // regions with many limit_break_count hits

    function tryReadKey(data, arrayMarkerIdx) {
        // Try fixstr (0xA0–0xBF, key length 4–31)
        for (let keyLen = 4; keyLen <= 31; keyLen++) {
            const prefixIdx = arrayMarkerIdx - keyLen - 1;
            if (prefixIdx < 0) break;
            const prefix = data[prefixIdx];
            if (prefix !== (0xA0 | keyLen)) continue;
            let key = '';
            let valid = true;
            for (let k = 0; k < keyLen; k++) {
                const c = data[prefixIdx + 1 + k];
                if (c < 0x20 || c > 0x7E) { valid = false; break; }
                key += String.fromCharCode(c);
            }
            if (valid) return key;
        }
        // Try str8 (0xD9 + length byte, key length 4–64)
        for (let keyLen = 4; keyLen <= 64; keyLen++) {
            const lenIdx  = arrayMarkerIdx - keyLen - 1;
            const typeIdx = arrayMarkerIdx - keyLen - 2;
            if (typeIdx < 0) break;
            if (data[typeIdx] !== 0xD9 || data[lenIdx] !== keyLen) continue;
            let key = '';
            let valid = true;
            for (let k = 0; k < keyLen; k++) {
                const c = data[lenIdx + 1 + k];
                if (c < 0x20 || c > 0x7E) { valid = false; break; }
                key += String.fromCharCode(c);
            }
            if (valid) return key;
        }
        return null;
    }

    let scanned = 0;

    for (const range of ranges) {
        scanned++;
        if (scanned % 50 === 0) {
            console.log(`Progress: ${scanned}/${ranges.length}...`);
        }

        let data;
        try {
            data = new Uint8Array(range.base.readByteArray(range.size));
        } catch (e) {
            continue;
        }

        const len = data.length;
        let lbCount = 0;

        for (let i = 1; i < len; i++) {
            const b = data[i];

            // ── Array marker detection (DC = array16, DD = array32 only) ─────
            // Fixarray (90-9F) omitted — those bytes are too common and produce
            // thousands of false positives that slow the scan to a crawl.
            if (b === 0xDC || b === 0xDD) {
                const key = tryReadKey(data, i);
                if (key) keySet[key] = (keySet[key] || 0) + 1;
            }

            // ── Count limit_break_count occurrences ──────────────────────────
            if (b === LB_KEY[0] && i + LB_KEY.length <= len) {
                let match = true;
                for (let k = 1; k < LB_KEY.length; k++) {
                    if (data[i + k] !== LB_KEY[k]) { match = false; break; }
                }
                if (match) {
                    lbCount++;
                    lbTotal++;
                }
            }
        }

        if (lbCount > 0) {
            lbRegions.push({ addr: range.base.toString(), size: range.size, count: lbCount });
        }
    }

    console.log(`Done. Found ${Object.keys(keySet).length} unique array keys.`);
    console.log(`Total limit_break_count occurrences across all regions: ${lbTotal}`);

    send({ keys: keySet, lbRegions: lbRegions, lbTotal: lbTotal });
})();
""", runtime='v8')

script.on("message", on_message)

try:
    script.load()
except Exception as e:
    if "timeout" in str(e).lower():
        print("[!] Scan still running in background, waiting...\n")
    else:
        print(f"[X] Error: {e}")
        input("\nPress Enter to exit...")
        sys.exit(1)

print("Scanning all memory regions (this may take 60–120 seconds)...\n")

for _ in range(120):
    time.sleep(1)
    if found_keys is not None:
        break

if found_keys is None:
    print("[X] Scan timed out or found nothing.")
    input("\nPress Enter to exit...")
    sys.exit(1)

import os

key_dict   = found_keys.get("keys", {})
lb_regions = found_keys.get("lbRegions", [])
lb_total   = found_keys.get("lbTotal", 0)

sorted_keys = sorted(key_dict.items(), key=lambda x: -x[1])

output_file = "array_keys.txt"
try:
    path = os.path.abspath(output_file)
except Exception:
    path = os.path.join(os.path.expanduser("~"), "Documents", output_file)

with open(path, "w", encoding="utf-8") as f:
    f.write(f"Found {len(sorted_keys)} unique array key names\n")
    f.write("=" * 50 + "\n\n")
    f.write(f"{'occurrences':>12}  key\n")
    f.write("-" * 50 + "\n")
    for key, count in sorted_keys:
        f.write(f"{count:>12}  {key}\n")

    f.write(f"\n\n{'=' * 50}\n")
    f.write(f"limit_break_count occurrences: {lb_total} total\n")
    f.write(f"{'=' * 50}\n\n")
    if lb_regions:
        f.write(f"{'count':>8}  {'size':>12}  address\n")
        f.write("-" * 50 + "\n")
        for r in sorted(lb_regions, key=lambda x: -x['count']):
            f.write(f"{r['count']:>8}  {r['size']:>12}  {r['addr']}\n")
    else:
        f.write("None found — make sure you are on the Support Card list screen.\n")

print(f"[OK] Saved to {path}\n")
print("Top 40 array keys:\n")
print(f"  {'occurrences':>12}  key")
print("  " + "-" * 40)
for key, count in sorted_keys[:40]:
    print(f"  {count:>12}  {key}")

print(f"\n--- limit_break_count occurrences: {lb_total} total ---")
if lb_regions:
    print("Regions containing limit_break_count:")
    for r in sorted(lb_regions, key=lambda x: -x['count'])[:10]:
        print(f"  count={r['count']}  size={r['size']}  addr={r['addr']}")
else:
    print("NONE — navigate to the Support Card list screen and try again.")

print(f"\nFull output saved to: {path}")

session.detach()
input("\nPress Enter to exit...")
