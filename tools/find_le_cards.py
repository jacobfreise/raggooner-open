# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "frida",
# ]
# ///
#
# Scan for support card IDs stored as little-endian int32 (C# / IL2CPP format).
# Pattern: XX 75 00 00 for SSR (30xxx), XX 4E 00 00 for SR (20xxx), XX 27 00 00 for R (10xxx)
# Finds regions where 20+ card IDs are concentrated within a 5KB window.
#
import frida
import sys
import time

print("=== Uma Musume LE Int32 Card Scanner ===\n")
print("Try running this on the TRAINING SETUP screen (support card selection).\n")
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

    // Read LE int32
    function readLE32(data, i) {
        if (i + 3 >= data.length) return null;
        return data[i] | (data[i+1]<<8) | (data[i+2]<<16) | (data[i+3]<<24);
    }

    // Is this a support card ID? (10001–39999)
    function isCardId(v) {
        return v >= 10001 && v <= 39999;
    }

    const allRanges = Process.enumerateRanges({protection: "rw-", coalesce: true});
    const ranges = allRanges.filter(r => r.size >= 4096 && r.size <= 200 * 1024 * 1024);

    console.log(`Scanning ${ranges.length} regions for LE int32 card IDs...`);

    const WINDOW = 5120; // 5KB sliding window
    const MIN_HITS = 20;  // minimum card IDs in window to be interesting

    const hotWindows = [];
    let scanned = 0;

    for (const range of ranges) {
        scanned++;
        if (scanned % 100 === 0) console.log(`Progress: ${scanned}/${ranges.length}...`);

        let data;
        try {
            data = new Uint8Array(range.base.readByteArray(range.size));
        } catch(e) { continue; }

        const len = data.length;

        // First pass: mark positions of card IDs
        const cardPositions = [];
        for (let i = 0; i <= len - 4; i += 4) {
            const v = readLE32(data, i);
            if (isCardId(v)) cardPositions.push(i);
        }

        if (cardPositions.length < MIN_HITS) continue;

        // Sliding window to find dense regions
        let best = { count: 0, startIdx: 0 };
        let left = 0;
        for (let right = 0; right < cardPositions.length; right++) {
            while (cardPositions[right] - cardPositions[left] > WINDOW) left++;
            const count = right - left + 1;
            if (count > best.count) {
                best = { count, startIdx: left, endIdx: right };
            }
        }

        if (best.count < MIN_HITS) continue;

        const windowStart = cardPositions[best.startIdx];
        const windowEnd   = Math.min(len, cardPositions[best.endIdx] + 4 + WINDOW);

        // Collect all card IDs in best window with their positions
        const cardsInWindow = [];
        for (let i = best.startIdx; i <= best.endIdx; i++) {
            const pos = cardPositions[i];
            const cardId = readLE32(data, pos);
            // Look for a small int32 (0-4) at various offsets from this card ID
            let lbVal = null;
            let lbOffset = null;
            for (const off of [4, 8, 12, 16, 20, 24, -4, -8]) {
                const p2 = pos + off;
                if (p2 < 0 || p2 + 3 >= len) continue;
                const v2 = readLE32(data, p2);
                if (v2 >= 0 && v2 <= 4) {
                    lbVal = v2;
                    lbOffset = off;
                    break;
                }
            }
            cardsInWindow.push({ pos: pos - windowStart, cardId, lbVal, lbOffset });
        }

        hotWindows.push({
            addr: range.base.toString(),
            regionSize: range.size,
            windowOffset: windowStart,
            cardCount: best.count,
            cards: cardsInWindow,
            hexDump: bytesToHex(data, windowStart, Math.min(256, windowEnd - windowStart)),
        });

        if (hotWindows.length >= 5) break;
    }

    console.log(`Done. Found ${hotWindows.length} hot window(s).`);
    send({ hotWindows: hotWindows });
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

windows = found_result.get("hotWindows", [])
print(f"Hot windows found: {len(windows)}\n")

if not windows:
    print("[X] No dense card ID clusters found in LE int32 format.")
    print("\nThe support card data is likely not accessible via memory scanning.")
    print("Try running while on the Training Setup screen (support card selection screen).")
else:
    for idx, w in enumerate(windows):
        print(f"Window {idx+1}: addr={w['addr']}  region={w['regionSize']:,}B  offset={w['windowOffset']}")
        print(f"  Card IDs found: {w['cardCount']}")
        cards = w.get("cards", [])
        # Show cards that have a likely lb value
        with_lb = [c for c in cards if c.get("lbVal") is not None]
        print(f"  Cards with nearby small int (0-4): {len(with_lb)}")
        for c in sorted(cards, key=lambda x: x["cardId"])[:20]:
            lb_str = f"lb={c['lbVal']} (off={c['lbOffset']})" if c["lbVal"] is not None else "lb=?"
            print(f"    card_id={c['cardId']:>6}  {lb_str}")
        print()
        print("  First 256 bytes of window (hex):")
        hexbytes = w.get("hexDump","").split()
        for i in range(0, min(64, len(hexbytes)), 16):
            print("    " + " ".join(hexbytes[i:i+16]))

session.detach()
input("\nPress Enter to exit...")
