# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "frida",
#     "msgpack",
# ]
# ///
#
# Find the support card INVENTORY (all owned cards) in memory.
# The training-deck support_card_list uses fixarray(6)=0x96.
# The inventory support_card_list uses array16(DC xx xx) for 100+ items.
# This script searches for "support_card_list" + DC/DD anywhere in memory,
# dumps the first few entries, and writes support_cards.json.
#
import frida
import msgpack
import json
import sys
import time

print("=== Uma Musume Support Card Inventory Finder ===\n")
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

    // "support_card_list" = fixstr(17) = B1 + 17 bytes
    // B1 73 75 70 70 6F 72 74 5F 63 61 72 64 5F 6C 69 73 74
    const SCL_KEY = [0xB1,0x73,0x75,0x70,0x70,0x6F,0x72,0x74,0x5F,0x63,0x61,0x72,0x64,0x5F,0x6C,0x69,0x73,0x74];
    const SCL_LEN = SCL_KEY.length; // 18

    // After the key, we want: DC (array16) or DD (array32), NOT 96 (fixarray 6 = deck slot)
    const allRanges = Process.enumerateRanges({protection: "rw-", coalesce: true});
    // Scan ALL regions — inventory may be small
    const ranges = allRanges.filter(r => r.size >= 4096);

    console.log(`Scanning ${ranges.length} regions for support_card_list + DC/DD...`);

    const findings = [];
    let scanned = 0;

    for (const range of ranges) {
        scanned++;
        if (scanned % 100 === 0) console.log(`Progress: ${scanned}/${ranges.length}...`);

        let data;
        try {
            data = new Uint8Array(range.base.readByteArray(range.size));
        } catch(e) { continue; }

        const len = data.length;

        for (let i = 0; i < len - SCL_LEN - 3; i++) {
            if (data[i] !== SCL_KEY[0]) continue;
            let ok = true;
            for (let k = 1; k < SCL_LEN; k++) {
                if (data[i+k] !== SCL_KEY[k]) { ok = false; break; }
            }
            if (!ok) continue;

            const arrayMarker = data[i + SCL_LEN];

            // Skip fixarray(6) = deck slot data
            if (arrayMarker === 0x96) continue;

            // We want a large array: DC (array16) or DD (array32)
            // Also try DC with any count > 6
            let arrayCount = 0;
            if (arrayMarker === 0xDC && i + SCL_LEN + 2 < len) {
                arrayCount = (data[i+SCL_LEN+1]<<8) | data[i+SCL_LEN+2];
            } else if (arrayMarker === 0xDD && i + SCL_LEN + 4 < len) {
                arrayCount = ((data[i+SCL_LEN+1]<<24)|(data[i+SCL_LEN+2]<<16)|(data[i+SCL_LEN+3]<<8)|data[i+SCL_LEN+4])>>>0;
            } else if (arrayMarker >= 0x90 && arrayMarker <= 0x9F) {
                arrayCount = arrayMarker & 0x0F;
                if (arrayCount <= 6) continue; // skip small fixarrays
            } else {
                continue;
            }

            console.log(`Found support_card_list + array(${arrayCount}) at region ${range.base} offset ${i}`);

            // Grab up to 5MB of data from the array start for parsing
            const arrayStart = i + SCL_LEN;
            const grabSize = Math.min(5 * 1024 * 1024, len - arrayStart);
            let raw = null;
            try {
                raw = range.base.add(arrayStart).readByteArray(grabSize);
            } catch(e) { continue; }

            // Dump first 256 bytes after array marker as hex
            const preview = bytesToHex(data, arrayStart, 256);

            findings.push({
                addr: range.base.toString(),
                offset: i,
                arrayCount: arrayCount,
                arrayMarker: arrayMarker,
                previewHex: preview,
                rawB64: raw ? _arrayBufferToBase64(raw) : null,
            });

            // Cap at 5 findings
            if (findings.length >= 5) break;
        }
        if (findings.length >= 5) break;
    }

    function _arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < Math.min(bytes.length, 512*1024); i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        // encode as array of numbers instead (base64 is complex in frida JS)
        return Array.from(new Uint8Array(buffer).slice(0, 512*1024));
    }

    console.log(`Done. Found ${findings.length} candidate(s).`);
    send({ findings: findings });
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

print("Scanning all memory regions (up to 120 seconds)...\n")

for _ in range(120):
    time.sleep(1)
    if found_result is not None:
        break

if found_result is None:
    print("[X] Timed out.")
    input("\nPress Enter to exit...")
    sys.exit(1)

findings = found_result.get("findings", [])
print(f"Found {len(findings)} candidate region(s).\n")

if not findings:
    print("[X] No support_card_list + large array found.")
    print("\nTroubleshooting:")
    print("  1. Make sure you are on the Support Card list screen (Deck -> Support Cards)")
    print("  2. Scroll through all cards to ensure they are fully loaded")
    print("  3. Run again as Administrator")
    input("\nPress Enter to exit...")
    sys.exit(1)

def decode_obj(obj):
    if isinstance(obj, dict):
        return {(k.decode('utf-8','replace') if isinstance(k,bytes) else k): decode_obj(v) for k,v in obj.items()}
    if isinstance(obj, list):
        return [decode_obj(i) for i in obj]
    if isinstance(obj, bytes):
        try: return obj.decode('utf-8')
        except: return f'<bytes {len(obj)}>'
    return obj

best_cards = []
best_count = 0

for idx, f in enumerate(findings):
    addr = f.get("addr")
    offset = f.get("offset")
    count = f.get("arrayCount", 0)
    marker = f.get("arrayMarker", 0)
    raw_arr = f.get("rawB64")

    print(f"Candidate {idx+1}: addr={addr} offset={offset} array_count={count}")
    print(f"  Array marker: 0x{marker:02X}")
    print(f"  Preview hex (first 64 bytes of array):")
    preview_bytes = f.get("previewHex","").split()
    for i in range(0, min(64, len(preview_bytes)), 16):
        print("    " + " ".join(preview_bytes[i:i+16]))
    print()

    if not raw_arr:
        continue

    raw_bytes = bytes(raw_arr)

    # Parse the msgpack array
    try:
        b = raw_bytes[0]
        if b == 0xDC:
            import struct
            total = struct.unpack_from('>H', raw_bytes, 1)[0]
            item_data = raw_bytes[3:]
        elif b == 0xDD:
            total = struct.unpack_from('>I', raw_bytes, 1)[0]
            item_data = raw_bytes[5:]
        elif 0x90 <= b <= 0x9F:
            total = b & 0x0F
            item_data = raw_bytes[1:]
        else:
            print(f"  Unexpected array byte 0x{b:02X}, skipping")
            continue

        print(f"  Array declares {total} items")
        up = msgpack.Unpacker(raw=True, strict_map_key=False)
        up.feed(item_data)

        items = []
        for item in up:
            items.append(decode_obj(item))
            if len(items) >= total:
                break

        print(f"  Parsed {len(items)} items")

        if items:
            print(f"  First item keys: {list(items[0].keys()) if isinstance(items[0], dict) else type(items[0])}")
            if isinstance(items[0], dict):
                print(f"  First item: {items[0]}")
            print()

        # Extract card data
        cards = []
        for item in items:
            if not isinstance(item, dict):
                continue
            # Try various field name patterns
            card_id = item.get('support_card_id') or item.get('card_id') or item.get('id')
            lb = item.get('limit_break_count') or item.get('limit_break') or item.get('count') or 0
            if card_id and isinstance(card_id, int) and card_id > 0:
                cards.append({'card_id': card_id, 'limit_break_count': lb, '_raw': item})

        print(f"  Extracted {len(cards)} card entries")
        if len(cards) > best_count:
            best_count = len(cards)
            best_cards = cards

    except Exception as e:
        print(f"  Parse error: {e}")
        import traceback
        traceback.print_exc()

if best_cards:
    print(f"\n[OK] Best result: {len(best_cards)} cards\n")
    print(f"  {'card_id':>10}  limit_break  all_fields")
    print("  " + "-"*60)
    for c in sorted(best_cards, key=lambda x: x['card_id'])[:30]:
        raw = {k:v for k,v in c.get('_raw',{}).items() if not isinstance(v,(list,dict))}
        print(f"  {c['card_id']:>10}  {c['limit_break_count']:>5}        {raw}")

    import os
    clean = [{'card_id': c['card_id'], 'limit_break_count': c['limit_break_count']} for c in best_cards]
    out = "support_cards.json"
    try:
        with open(out, 'w') as f:
            json.dump(clean, f, indent=2)
        print(f"\n[OK] Saved {len(clean)} cards to {os.path.abspath(out)}")
    except Exception as e:
        print(f"Save error: {e}")
else:
    print("[X] No card data extracted from candidates.")

session.detach()
input("\nPress Enter to exit...")
