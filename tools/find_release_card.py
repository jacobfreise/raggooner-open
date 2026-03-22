# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "frida",
#     "msgpack",
# ]
# ///
#
# Search memory for "release_card_array" (unique to the Support Card list
# screen) and also for compact support_card_id+limit_break_count fixmap
# entries with no uma-specific context.
#
import frida
import msgpack
import json
import sys
import time

print("=== Uma Musume Release Card Finder ===\n")
print("Make sure you are on the Support Card list screen.\n")
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

    function readInt(data, pos) {
        if (pos >= data.length) return null;
        const b = data[pos];
        if (b <= 0x7F) return b;
        if (b === 0xCC && pos+1 < data.length) return data[pos+1];
        if (b === 0xCD && pos+2 < data.length) return (data[pos+1]<<8)|data[pos+2];
        if (b === 0xCE && pos+4 < data.length)
            return ((data[pos+1]<<24)|(data[pos+2]<<16)|(data[pos+3]<<8)|data[pos+4])>>>0;
        return null;
    }

    // ── Key byte patterns ──────────────────────────────────────────────────────
    // "release_card_array" = 18 chars, fixstr(18) = B2
    // B2 72 65 6C 65 61 73 65 5F 63 61 72 64 5F 61 72 72 61 79
    const RCA_KEY = [0xB2,0x72,0x65,0x6C,0x65,0x61,0x73,0x65,0x5F,0x63,0x61,0x72,0x64,0x5F,0x61,0x72,0x72,0x61,0x79];
    const RCA_LEN = RCA_KEY.length; // 19

    // "support_card_id" = fixstr(15) = AF
    const SC_KEY = [0xAF,0x73,0x75,0x70,0x70,0x6F,0x72,0x74,0x5F,0x63,0x61,0x72,0x64,0x5F,0x69,0x64];
    const SC_LEN = SC_KEY.length; // 16

    // "limit_break_count" = fixstr(17) = B1
    const LB_KEY = [0xB1,0x6C,0x69,0x6D,0x69,0x74,0x5F,0x62,0x72,0x65,0x61,0x6B,0x5F,0x63,0x6F,0x75,0x6E,0x74];
    const LB_LEN = LB_KEY.length; // 18

    // "skill_array" = fixstr(11) = AB (marks uma training data — used to EXCLUDE these)
    const SKILL_KEY = [0xAB,0x73,0x6B,0x69,0x6C,0x6C,0x5F,0x61,0x72,0x72,0x61,0x79];
    const SKILL_LEN = SKILL_KEY.length;

    const allRanges = Process.enumerateRanges({protection: "rw-", coalesce: true});
    const ranges = allRanges.filter(r => r.size >= 4096);

    console.log(`Scanning ${ranges.length} regions...`);

    const rcaFindings = [];    // release_card_array hits
    const compactCards = {};   // cardId → [lb counts from compact fixmap(2/3) entries]
    let scanned = 0;

    for (const range of ranges) {
        scanned++;
        if (scanned % 100 === 0) console.log(`Progress: ${scanned}/${ranges.length}...`);

        let data;
        try {
            data = new Uint8Array(range.base.readByteArray(range.size));
        } catch(e) { continue; }

        const len = data.length;

        for (let i = 0; i < len; i++) {
            const b = data[i];

            // ── 1. release_card_array key ────────────────────────────────────
            if (b === RCA_KEY[0] && i + RCA_LEN + 3 < len) {
                let ok = true;
                for (let k = 1; k < RCA_LEN; k++) {
                    if (data[i+k] !== RCA_KEY[k]) { ok = false; break; }
                }
                if (ok) {
                    const afterKey = i + RCA_LEN;
                    const marker = data[afterKey];
                    let count = 0;
                    if (marker === 0xDC && afterKey+2 < len)
                        count = (data[afterKey+1]<<8)|data[afterKey+2];
                    else if (marker === 0xDD && afterKey+4 < len)
                        count = ((data[afterKey+1]<<24)|(data[afterKey+2]<<16)|(data[afterKey+3]<<8)|data[afterKey+4])>>>0;
                    else if (marker >= 0x90 && marker <= 0x9F)
                        count = marker & 0x0F;
                    else
                        count = -1; // unknown marker

                    const grabSize = Math.min(512*1024, len - afterKey);
                    let raw = null;
                    try { raw = range.base.add(afterKey).readByteArray(grabSize); } catch(e) {}

                    rcaFindings.push({
                        addr: range.base.toString(),
                        offset: i,
                        marker: marker,
                        count: count,
                        preview: bytesToHex(data, afterKey, 128),
                        raw: raw ? Array.from(new Uint8Array(raw)) : null,
                    });
                    i += RCA_LEN - 1;
                    continue;
                }
            }

            // ── 2. Compact fixmap(2) containing support_card_id + limit_break_count ──
            // Pattern: 82 AF[support_card_id key 15 bytes] CD xx xx B1[limit_break_count key 17 bytes] xx
            // Total: 1 + 16 + 3 + 18 + 1 = 39 bytes
            if (b === 0x82 && i + 39 < len) {
                // Check for support_card_id key right after 82
                let scOk = true;
                for (let k = 0; k < SC_LEN; k++) {
                    if (data[i+1+k] !== SC_KEY[k]) { scOk = false; break; }
                }
                if (!scOk) continue;

                const cardId = readInt(data, i + 1 + SC_LEN);
                if (cardId === null || cardId <= 0 || cardId > 40000) continue;

                // Check for limit_break_count key after the card id value
                // Card id is uint16 (3 bytes: CD xx xx), so next key starts at i+1+16+3 = i+20
                const lbKeyStart = i + 1 + SC_LEN + 3;
                if (lbKeyStart + LB_LEN + 1 >= len) continue;
                let lbOk = true;
                for (let k = 0; k < LB_LEN; k++) {
                    if (data[lbKeyStart+k] !== LB_KEY[k]) { lbOk = false; break; }
                }
                if (!lbOk) continue;

                const lbVal = readInt(data, lbKeyStart + LB_LEN);
                if (lbVal === null || lbVal < 0 || lbVal > 4) continue;

                // Make sure this is NOT inside uma training data (check for skill_array nearby)
                let inUmaData = false;
                const checkStart = Math.max(0, i - 200);
                for (let j = checkStart; j < i; j++) {
                    if (data[j] === SKILL_KEY[0]) {
                        let sOk = true;
                        for (let k = 1; k < SKILL_LEN; k++) {
                            if (data[j+k] !== SKILL_KEY[k]) { sOk = false; break; }
                        }
                        if (sOk) { inUmaData = true; break; }
                    }
                }
                if (inUmaData) continue;

                if (!compactCards[cardId]) compactCards[cardId] = [0,0,0,0,0];
                compactCards[cardId][lbVal]++;
            }
        }
    }

    console.log(`Done. release_card_array hits: ${rcaFindings.length}`);
    console.log(`Compact fixmap(2) card entries (non-uma): ${Object.keys(compactCards).length} unique cards`);

    send({ rcaFindings: rcaFindings, compactCards: compactCards });
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

# ── release_card_array results ─────────────────────────────────────────────
rca = found_result.get("rcaFindings", [])
print(f"release_card_array occurrences: {len(rca)}")
for idx, f in enumerate(rca):
    print(f"\n  Hit {idx+1}: addr={f['addr']} offset={f['offset']}")
    print(f"    Array marker: 0x{f['marker']:02X}  count={f['count']}")
    print(f"    First 128 bytes: {f['preview'][:80]}...")

    raw = f.get("raw")
    if raw:
        raw_bytes = bytes(raw)
        try:
            b = raw_bytes[0]
            import struct
            if b == 0xDC:
                total = struct.unpack_from('>H', raw_bytes, 1)[0]
                item_data = raw_bytes[3:]
            elif b == 0xDD:
                total = struct.unpack_from('>I', raw_bytes, 1)[0]
                item_data = raw_bytes[5:]
            elif 0x90 <= b <= 0x9F:
                total = b & 0x0F
                item_data = raw_bytes[1:]
            else:
                print(f"    Unexpected byte 0x{b:02X}")
                continue

            def decode_obj(obj):
                if isinstance(obj, dict):
                    return {(k.decode('utf-8','replace') if isinstance(k,bytes) else k): decode_obj(v) for k,v in obj.items()}
                if isinstance(obj, list): return [decode_obj(i) for i in obj]
                if isinstance(obj, bytes):
                    try: return obj.decode('utf-8')
                    except: return f'<bytes {len(obj)}>'
                return obj

            up = msgpack.Unpacker(raw=True, strict_map_key=False)
            up.feed(item_data)
            items = []
            for item in up:
                items.append(decode_obj(item))
                if len(items) >= total: break

            print(f"    Array has {total} items, parsed {len(items)}")
            if items:
                print(f"    First item: {items[0]}")
                if len(items) > 1:
                    print(f"    Second item: {items[1]}")
        except Exception as e:
            print(f"    Parse error: {e}")

# ── compact fixmap(2) results ──────────────────────────────────────────────
compact = found_result.get("compactCards", {})
print(f"\nCompact fixmap(2) unique cards found: {len(compact)}")
if compact:
    output_cards = []
    for cid_str, counts in sorted(compact.items(), key=lambda x: int(x[0])):
        cid = int(cid_str)
        best_lb = max(range(5), key=lambda lb: counts[lb])
        output_cards.append({"card_id": cid, "limit_break_count": best_lb, "_counts": counts})
        print(f"  card_id={cid:>6}  lb={best_lb}  (counts: {counts})")

    import os
    clean = [{"card_id": c["card_id"], "limit_break_count": c["limit_break_count"]} for c in output_cards]
    out = "support_cards_compact.json"
    try:
        with open(out, "w") as f:
            json.dump(clean, f, indent=2)
        print(f"\n[OK] Saved {len(clean)} cards to {os.path.abspath(out)}")
    except Exception as e:
        print(f"Save error: {e}")

session.detach()
input("\nPress Enter to exit...")
