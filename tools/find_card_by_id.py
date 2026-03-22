# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "frida",
# ]
# ///
#
# Search ALL memory regions for a known support card ID (30016 = 0x7540)
# and dump 128 bytes of context around each occurrence.
# This reveals the actual inventory structure regardless of field names.
# Also counts how many support card IDs (10000-39999) appear per region.
#
import frida
import sys
import time

print("=== Uma Musume Card ID Context Finder ===\n")
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
    function bytesToHex(data, start, len) {
        let s = '';
        const end = Math.min(start + len, data.length);
        for (let i = start; i < end; i++) s += data[i].toString(16).padStart(2,'0') + ' ';
        return s.trim();
    }

    // Extract all readable ASCII string keys near a position
    function nearbyKeys(data, center, window) {
        const start = Math.max(0, center - window);
        const end   = Math.min(data.length, center + window);
        const keys = [];
        for (let i = start; i < end - 3; i++) {
            const b = data[i];
            if (b >= 0xA4 && b <= 0xBF) {
                const klen = b & 0x1F;
                if (i + klen >= end) continue;
                let key = '', valid = true;
                for (let k = 0; k < klen; k++) {
                    const c = data[i+1+k];
                    if (c < 0x20 || c > 0x7E) { valid = false; break; }
                    key += String.fromCharCode(c);
                }
                if (valid && klen >= 3) { keys.push(key); i += klen; }
            }
        }
        return [...new Set(keys)];
    }

    // Card 30016 = 0x7540, encoded as uint16: CD 75 40
    // Also try 0xCD as the encoding marker
    const TARGET_HI = 0x75;
    const TARGET_LO = 0x40;

    // Count how many uint16 values in range [10001, 39999] appear per region
    // Range: 0x2711 to 0x9C3F
    // Encoded as CD XX XX where 0x27 <= XX1 <= 0x9C
    function countSupportCardIds(data, len) {
        let count = 0;
        for (let i = 0; i < len - 2; i++) {
            if (data[i] !== 0xCD) continue;
            const val = (data[i+1] << 8) | data[i+2];
            if (val >= 10001 && val <= 39999) count++;
        }
        return count;
    }

    const allRanges = Process.enumerateRanges({protection: "rw-", coalesce: true});
    const ranges = allRanges.filter(r => r.size >= 4096);
    ranges.sort((a, b) => b.size - a.size);

    console.log(`Scanning ${ranges.length} regions...`);

    const target30016Hits = [];  // occurrences of card 30016
    const richRegions = [];      // regions with many support card IDs

    let scanned = 0;

    for (const range of ranges) {
        scanned++;
        if (scanned % 100 === 0) console.log(`Progress: ${scanned}/${ranges.length}...`);

        let data;
        try {
            data = new Uint8Array(range.base.readByteArray(range.size));
        } catch(e) { continue; }

        const len = data.length;

        // Count support card ID hits in this region
        const scCount = countSupportCardIds(data, len);
        if (scCount >= 30) {
            richRegions.push({
                addr: range.base.toString(),
                size: range.size,
                scIdCount: scCount,
            });
        }

        // Find specific card 30016 = CD 75 40
        for (let i = 0; i < len - 2; i++) {
            if (data[i] === 0xCD && data[i+1] === TARGET_HI && data[i+2] === TARGET_LO) {
                if (target30016Hits.length < 8) {
                    const ctx = Math.max(0, i - 64);
                    target30016Hits.push({
                        addr: range.base.toString(),
                        size: range.size,
                        offset: i,
                        before64: bytesToHex(data, ctx, i - ctx),
                        after64:  bytesToHex(data, i, 64),
                        keys:     nearbyKeys(data, i, 200),
                    });
                }
            }
        }
    }

    console.log(`Done. Found ${target30016Hits.length} hits for card 30016.`);
    console.log(`Regions with 30+ support card IDs: ${richRegions.length}`);

    send({ hits: target30016Hits, richRegions: richRegions });
})();
""", runtime='v8')

script.on("message", on_message)

try:
    script.load()
except Exception as e:
    if "timeout" in str(e).lower():
        print("[!] Running in background...\n")
    else:
        print(f"[X] {e}")
        input("\nPress Enter to exit...")
        sys.exit(1)

print("Scanning (up to 120 seconds)...\n")

for _ in range(120):
    time.sleep(1)
    if found_result is not None:
        break

if found_result is None:
    print("[X] Timed out.")
    input("\nPress Enter to exit...")
    sys.exit(1)

print("=" * 60)
print("REGIONS WITH 30+ SUPPORT CARD IDs:")
print("=" * 60)
rich = sorted(found_result.get("richRegions", []), key=lambda r: -r["scIdCount"])
for r in rich:
    print(f"  addr={r['addr']}  size={r['size']:>12,}  sc_id_count={r['scIdCount']}")

print()
print("=" * 60)
print("OCCURRENCES OF CARD 30016 (CD 75 40):")
print("=" * 60)
hits = found_result.get("hits", [])
for idx, h in enumerate(hits):
    print(f"\nHit {idx+1}: addr={h['addr']}  size={h['size']:,}  offset={h['offset']}")
    print(f"  Nearby string keys: {h['keys']}")
    before = h['before64'].split()
    after  = h['after64'].split()
    print("  64 bytes before CD 75 40:")
    for i in range(0, len(before), 16):
        print("    " + " ".join(before[i:i+16]))
    print("  64 bytes from CD 75 40:")
    for i in range(0, len(after), 16):
        print("    " + " ".join(after[i:i+16]))

session.detach()
input("\nPress Enter to exit...")
