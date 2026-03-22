# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "frida",
# ]
# ///
#
# Dump the raw bytes around the first few limit_break_count hits in the
# LARGEST memory region, and extract all msgpack string keys within 1KB
# of each hit. This reveals what field names surround limit_break_count
# in the main support card data structure.
#
import frida
import sys
import time

print("=== Uma Musume LB Context Dump ===\n")
print("Attaching to game process...")

try:
    session = frida.attach("UmamusumePrettyDerby.exe")
except Exception as e:
    print("[X] Could not attach")
    input("\nPress Enter to exit...")
    sys.exit(1)

print("[OK] Connected\n")

found_result = None

def on_message(message, data):
    global found_result
    if message.get("type") == "send":
        found_result = message.get("payload")
    elif message.get("type") == "error":
        print(f"[JS ERROR] {message['description']}")

script = session.create_script(r"""
(function() {
    const LB_KEY = [0xB1,0x6C,0x69,0x6D,0x69,0x74,0x5F,0x62,0x72,0x65,0x61,0x6B,0x5F,0x63,0x6F,0x75,0x6E,0x74];
    const LB_LEN = LB_KEY.length; // 18

    function bytesToHex(data, start, len) {
        let s = '';
        const end = Math.min(start + len, data.length);
        for (let i = start; i < end; i++) {
            s += data[i].toString(16).padStart(2, '0') + ' ';
        }
        return s.trim();
    }

    // Extract all readable msgpack string keys within a window.
    // Looks for fixstr (A0-BF), str8 (D9 len), str16 (DA len16).
    function extractStringKeys(data, start, end) {
        const keys = [];
        for (let i = start; i < end - 2; i++) {
            const b = data[i];
            // fixstr: A4-BF (length 4-31)
            if (b >= 0xA4 && b <= 0xBF) {
                const keyLen = b & 0x1F;
                if (i + keyLen >= end) continue;
                let key = '';
                let valid = true;
                for (let k = 0; k < keyLen; k++) {
                    const c = data[i + 1 + k];
                    if (c < 0x20 || c > 0x7E) { valid = false; break; }
                    key += String.fromCharCode(c);
                }
                if (valid && key.length >= 4) {
                    keys.push({ offset: i - start, key });
                    i += keyLen; // skip past
                }
            }
            // str8: D9 <len> <bytes>
            else if (b === 0xD9 && i + 2 < end) {
                const keyLen = data[i+1];
                if (keyLen < 4 || keyLen > 64 || i + 2 + keyLen >= end) continue;
                let key = '';
                let valid = true;
                for (let k = 0; k < keyLen; k++) {
                    const c = data[i + 2 + k];
                    if (c < 0x20 || c > 0x7E) { valid = false; break; }
                    key += String.fromCharCode(c);
                }
                if (valid) {
                    keys.push({ offset: i - start, key: '(str8)' + key });
                    i += 2 + keyLen;
                }
            }
        }
        return keys;
    }

    // Scan ALL rw- regions, find the ones that contain limit_break_count.
    // Dump context from the first 3 regions that have LB hits.
    const allRanges = Process.enumerateRanges({protection: "rw-", coalesce: true});
    const filtered = allRanges.filter(r => r.size >= 100000 && r.size <= 500 * 1024 * 1024);
    // Sort by size descending (biggest first = most likely to contain card data)
    const sorted = filtered.sort((a, b) => b.size - a.size);

    console.log(`Total regions to scan: ${sorted.length}`);

    const results = [];
    let regionsWithLB = 0;

    for (let ri = 0; ri < sorted.length && regionsWithLB < 3; ri++) {
        const range = sorted[ri];
        let data;
        try {
            data = new Uint8Array(range.base.readByteArray(range.size));
        } catch(e) { continue; }

        const len = data.length;
        let hitsFound = 0;

        for (let i = 0; i < len - LB_LEN - 1 && hitsFound < 3; i++) {
            if (data[i] !== LB_KEY[0]) continue;
            let ok = true;
            for (let k = 1; k < LB_LEN; k++) {
                if (data[i+k] !== LB_KEY[k]) { ok = false; break; }
            }
            if (!ok) continue;

            const lbByte = data[i + LB_LEN];
            const ctxStart = Math.max(0, i - 512);
            const ctxEnd   = Math.min(len, i + LB_LEN + 64);

            results.push({
                region: ri,
                regionAddr: range.base.toString(),
                regionSize: range.size,
                lbOffset: i,
                lbByte: lbByte,
                before512hex: bytesToHex(data, ctxStart, i - ctxStart),
                after64hex:   bytesToHex(data, i + LB_LEN, 64),
                nearbyKeys:   extractStringKeys(data, ctxStart, ctxEnd),
            });
            hitsFound++;
        }

        if (hitsFound > 0) {
            regionsWithLB++;
            console.log(`Region ${ri} (addr=${range.base}, size=${range.size}): ${hitsFound} LB hits sampled`);
        }
    }

    console.log(`Sampled ${regionsWithLB} regions with LB hits.`);

    send(results);
})();
""", runtime='v8')

script.on("message", on_message)

try:
    script.load()
except Exception as e:
    if "timeout" in str(e).lower():
        print("[!] Running in background, waiting...\n")
    else:
        print(f"[X] {e}")
        input("\nPress Enter to exit...")
        sys.exit(1)

print("Scanning (up to 60 seconds)...\n")

for _ in range(60):
    time.sleep(1)
    if found_result is not None:
        break

if found_result is None:
    print("[X] Timed out.")
    input("\nPress Enter to exit...")
    sys.exit(1)

for entry in found_result:
    ri    = entry.get("region", "?")
    addr  = entry.get("regionAddr", "?")
    size  = entry.get("regionSize", 0)
    print(f"\n{'='*60}")
    print(f"Region {ri}: addr={addr}  size={size:,} bytes  ({size//1024//1024} MB)")
    if entry.get("note"):
        print(f"  {entry['note']}")
        continue

    lbByte = entry.get("lbByte")
    print(f"  First LB hit at offset {entry['lbOffset']:,}  lbVal byte=0x{lbByte:02X} ({lbByte})")
    print()

    keys = entry.get("nearbyKeys", [])
    if keys:
        print("  String keys found within 512 bytes before + 64 bytes after LB key:")
        for k in keys:
            print(f"    offset {k['offset']:>5}: {k['key']}")
    else:
        print("  (no string keys found nearby)")

    print()
    before = entry.get("before512hex", "")
    after  = entry.get("after64hex", "")

    # Print last 128 hex bytes before LB key (most relevant context)
    before_bytes = before.split()
    tail = before_bytes[-128:] if len(before_bytes) > 128 else before_bytes
    grouped = []
    for i in range(0, len(tail), 16):
        grouped.append(' '.join(tail[i:i+16]))
    print("  Last 128 bytes before limit_break_count key:")
    for line in grouped:
        print(f"    {line}")

    print()
    after_bytes = after.split()
    grouped2 = []
    for i in range(0, len(after_bytes), 16):
        grouped2.append(' '.join(after_bytes[i:i+16]))
    print("  64 bytes after limit_break_count key (starts with lbVal):")
    for line in grouped2:
        print(f"    {line}")

session.detach()
input("\nPress Enter to exit...")
