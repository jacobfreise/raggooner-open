# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "frida",
# ]
# ///
#
# Debug version of support card extractor.
# Logs counters at each step to identify why 0 cards are returned.
#
import frida
import sys
import time

print("=== Uma Musume Support Card DEBUG ===\n")
print("Make sure you are on the Support Card list screen.\n")
print("Attaching to game process...")

try:
    session = frida.attach("UmamusumePrettyDerby.exe")
except Exception as e:
    print("[X] Could not attach to game process")
    input("\nPress Enter to exit...")
    sys.exit(1)

print("[OK] Connected\n")

found_result = None

def on_message(message, data):
    global found_result
    if message.get("type") == "send":
        found_result = message.get("payload")
    elif message.get("type") == "error":
        print(f"[JS ERROR] {message.get('description')}")
        print(f"  stack: {message.get('stack')}")

script = session.create_script(r"""
(function() {
    // ── Helpers ──────────────────────────────────────────────────────────────
    function readInt(data, pos) {
        if (pos >= data.length) return null;
        const b = data[pos];
        if (b <= 0x7F) return b;
        if (b === 0xCC && pos+1 < data.length) return data[pos+1];
        if (b === 0xCD && pos+2 < data.length)
            return (data[pos+1] << 8) | data[pos+2];
        if (b === 0xCE && pos+4 < data.length)
            return ((data[pos+1]<<24)|(data[pos+2]<<16)|(data[pos+3]<<8)|data[pos+4]) >>> 0;
        if (b >= 0xE0) return b - 256;
        return null;
    }

    function bytesToHex(data, start, len) {
        let s = '';
        for (let i = start; i < Math.min(start + len, data.length); i++) {
            s += data[i].toString(16).padStart(2, '0') + ' ';
        }
        return s.trim();
    }

    // Search for a key string within a window, return its value position or null
    function findKey(data, searchStart, searchEnd, keyBytes) {
        const keyLen = keyBytes.length;
        for (let i = searchStart; i < searchEnd - keyLen - 1; i++) {
            let match = true;
            for (let k = 0; k < keyLen; k++) {
                if (data[i+k] !== keyBytes[k]) { match = false; break; }
            }
            if (match) return i + keyLen; // position of value after the key
        }
        return -1;
    }

    // ── Patterns ─────────────────────────────────────────────────────────────
    // limit_break_count: fixstr(17)=B1 + "limit_break_count"
    const LB_KEY = [0xB1,0x6C,0x69,0x6D,0x69,0x74,0x5F,0x62,0x72,0x65,0x61,0x6B,0x5F,0x63,0x6F,0x75,0x6E,0x74];
    const LB_KEY_LEN = LB_KEY.length; // 18

    // card_id: fixstr(7)=A7 + "card_id"
    const CARD_ID_KEY = [0xA7,0x63,0x61,0x72,0x64,0x5F,0x69,0x64];

    // support_card_id: fixstr(15)=AF + "support_card_id"
    const SUPPORT_CARD_ID_KEY = [0xAF,0x73,0x75,0x70,0x70,0x6F,0x72,0x74,0x5F,0x63,0x61,0x72,0x64,0x5F,0x69,0x64];

    // ── Scan only the known large region first ────────────────────────────────
    const allRanges = Process.enumerateRanges({protection: "rw-", coalesce: true});
    const ranges = allRanges
        .filter(r => r.size >= 100000 && r.size <= 500 * 1024 * 1024)
        .sort((a, b) => b.size - a.size);

    console.log(`Total regions to scan: ${ranges.length}`);

    let totalB1 = 0;          // how many times first byte of LB_KEY found
    let totalLBMatch = 0;     // full 18-byte LB_KEY matches
    let totalPassLBVal = 0;   // matches where lbVal is 0-4
    let totalCardIdFound = 0; // matches where card_id found nearby
    let totalSupportCardIdFound = 0; // matches where support_card_id found nearby
    let firstMatchHex = null;
    let firstMatchLBVal = null;
    let firstMatchContext = null;

    const cards = [];
    const seenCardIds = {};
    let scanned = 0;

    for (const range of ranges) {
        scanned++;
        if (scanned % 50 === 0) console.log(`Progress: ${scanned}/${ranges.length}...`);

        let data;
        try {
            data = new Uint8Array(range.base.readByteArray(range.size));
        } catch (e) { continue; }

        const len = data.length;

        for (let i = 0; i < len - LB_KEY_LEN - 1; i++) {
            if (data[i] !== LB_KEY[0]) continue;
            totalB1++;

            // Check full match
            let match = true;
            for (let k = 1; k < LB_KEY_LEN; k++) {
                if (data[i+k] !== LB_KEY[k]) { match = false; break; }
            }
            if (!match) continue;
            totalLBMatch++;

            const lbVal = readInt(data, i + LB_KEY_LEN);

            // Capture first match details
            if (firstMatchHex === null) {
                const ctxStart = Math.max(0, i - 16);
                firstMatchHex = bytesToHex(data, ctxStart, 64);
                firstMatchLBVal = lbVal;
                firstMatchContext = {
                    lbValByte: data[i + LB_KEY_LEN],
                    lbValParsed: lbVal,
                    byteAt18: data[i + LB_KEY_LEN],
                    // What comes after lbVal?
                    next8bytes: bytesToHex(data, i + LB_KEY_LEN, 8),
                    // What's in a 32-byte window before the key?
                    before16: bytesToHex(data, Math.max(0, i-16), 16),
                    // Look for any readable string keys nearby
                    after32: bytesToHex(data, i + LB_KEY_LEN + 1, 32),
                };
            }

            if (lbVal === null || lbVal < 0 || lbVal > 4) continue;
            totalPassLBVal++;

            const windowStart = Math.max(0, i - 500);
            const windowEnd   = Math.min(len, i + 500);

            // Try card_id
            const cardIdPos = findKey(data, windowStart, windowEnd, CARD_ID_KEY);
            if (cardIdPos >= 0) {
                const cardId = readInt(data, cardIdPos);
                if (cardId !== null && cardId > 0) {
                    totalCardIdFound++;
                    if (!seenCardIds[cardId]) {
                        seenCardIds[cardId] = true;
                        cards.push({ card_id: cardId, limit_break_count: lbVal, id_field: 'card_id' });
                    }
                    continue;
                }
            }

            // Try support_card_id
            const scardIdPos = findKey(data, windowStart, windowEnd, SUPPORT_CARD_ID_KEY);
            if (scardIdPos >= 0) {
                const scardId = readInt(data, scardIdPos);
                if (scardId !== null && scardId > 0) {
                    totalSupportCardIdFound++;
                    if (!seenCardIds[scardId]) {
                        seenCardIds[scardId] = true;
                        cards.push({ card_id: scardId, limit_break_count: lbVal, id_field: 'support_card_id' });
                    }
                }
            }
        }
    }

    console.log(`=== DEBUG COUNTERS ===`);
    console.log(`  LB_KEY[0] (0xB1) occurrences: ${totalB1}`);
    console.log(`  Full LB_KEY 18-byte matches:  ${totalLBMatch}`);
    console.log(`  Matches with lbVal 0-4:        ${totalPassLBVal}`);
    console.log(`  card_id found nearby:          ${totalCardIdFound}`);
    console.log(`  support_card_id found nearby:  ${totalSupportCardIdFound}`);
    console.log(`  Total cards collected:         ${cards.length}`);

    send({
        counters: {
            b1_count: totalB1,
            lb_matches: totalLBMatch,
            pass_lbval: totalPassLBVal,
            card_id_found: totalCardIdFound,
            support_card_id_found: totalSupportCardIdFound,
            cards_collected: cards.length,
        },
        firstMatch: firstMatchContext,
        firstMatchHex: firstMatchHex,
        cards: cards.slice(0, 20),  // first 20 results
    });
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
    if found_result is not None:
        break

if found_result is None:
    print("[X] Timed out — no data received.")
    input("\nPress Enter to exit...")
    sys.exit(1)

print("=== RESULTS ===\n")

counters = found_result.get("counters", {})
print("Debug counters:")
for k, v in counters.items():
    print(f"  {k}: {v}")

print()
first_match = found_result.get("firstMatch")
first_hex = found_result.get("firstMatchHex")

if first_match:
    print("First limit_break_count match details:")
    print(f"  lbVal byte (raw):  0x{first_match.get('byteAt18', 0):02X}")
    print(f"  lbVal parsed:      {first_match.get('lbValParsed')}")
    print(f"  Bytes after key:   {first_match.get('next8bytes')}")
    print(f"  Bytes after value: {first_match.get('after32')}")
    print(f"  Bytes before key:  {first_match.get('before16')}")
    print()

if first_hex:
    print(f"Hex context around first match (16 bytes before + 48 bytes):")
    print(f"  {first_hex}")
    print()

cards = found_result.get("cards", [])
if cards:
    print(f"Sample cards found ({len(cards)}):")
    for c in cards[:10]:
        print(f"  card_id={c.get('card_id')}  lb={c.get('limit_break_count')}  field={c.get('id_field')}")
else:
    print("No cards found in sample.")

session.detach()
input("\nPress Enter to exit...")
