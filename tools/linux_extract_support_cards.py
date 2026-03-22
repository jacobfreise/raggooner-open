# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "msgpack",
# ]
# ///
#
# Extract Support Card list + limit breaks from Uma Musume memory (Linux/Wine).
# Run with sudo with the game open on the Support Card list screen
# (Deck -> Support Card List).
#
import json
import os
import sys
import time

import msgpack

print("=== Uma Musume Support Card Extractor (Linux Edition) ===\n")
print("Make sure you are on the Support Card list screen before running.\n")

# ── Find game process ────────────────────────────────────────────────────────
print("Searching for game process...")
game_pid = None
game_name = None

try:
    candidates = []
    for pid_dir in os.listdir("/proc"):
        if not pid_dir.isdigit():
            continue
        try:
            with open(f"/proc/{pid_dir}/cmdline", "r") as f:
                cmdline = f.read()
                lower = cmdline.lower()
                if "umamusumeprettyderby.exe" in lower:
                    if (
                        "steamapps" in lower
                        and "reaper" not in lower
                        and not lower.strip().endswith("steam.exe")
                    ):
                        candidates.append((int(pid_dir), cmdline.split("\x00")[0]))
        except (FileNotFoundError, PermissionError):
            continue

    if candidates:
        candidates.sort(key=lambda x: len(x[1]), reverse=True)
        game_pid, game_name = candidates[0]
        print(f"[OK] Found game process: {game_name} (PID: {game_pid})")
    else:
        print("[X] Could not find game process")
        print("  Make sure Uma Musume Pretty Derby is running")
        sys.exit(1)
except Exception as e:
    print(f"[X] Error searching for process: {e}")
    sys.exit(1)

# ── Read memory maps ─────────────────────────────────────────────────────────
print("\nReading process memory maps...")
all_regions = []

try:
    with open(f"/proc/{game_pid}/maps", "r") as f:
        for line in f:
            parts = line.split()
            if len(parts) < 2 or "rw" not in parts[1]:
                continue
            start, end = parts[0].split("-")
            start_addr = int(start, 16)
            end_addr = int(end, 16)
            all_regions.append({"start": start_addr, "end": end_addr, "size": end_addr - start_addr})

    memory_regions = [r for r in all_regions if 100_000 <= r["size"] <= 500 * 1024 * 1024]
    memory_regions.sort(key=lambda r: r["size"], reverse=True)
    print(f"Scanning {len(memory_regions)} regions (filtered from {len(all_regions)})...")
except Exception as e:
    print(f"[X] Error reading memory maps: {e}")
    sys.exit(1)

# ── Pattern reference ────────────────────────────────────────────────────────
# fixstr(18)=0xB2 + "support_card_array" + 0xDC (array16)
# Validation: fixstr(15)=0xAF + "support_card_id"
# ─────────────────────────────────────────────────────────────────────────────

print("\nSearching for support card data...")
print("This may take 30-60 seconds...\n")

pattern = b"\xb2support_card_array\xdc"
validate_key = b"\xafsupport_card_id"

found_data = None

try:
    with open(f"/proc/{game_pid}/mem", "rb") as mem:
        scanned_count = 0

        for region in memory_regions:
            scanned_count += 1
            if scanned_count % 10 == 0:
                print(f"Progress: {scanned_count}/{len(memory_regions)} regions scanned...")

            try:
                mem.seek(region["start"])
                data = mem.read(region["size"])

                offset = data.find(pattern)
                if offset == -1:
                    continue

                print(f"\n[OK] Found pattern at {hex(region['start'] + offset)}")

                # Skip key prefix (0xB2 + 18 bytes) = 19 bytes; keep DC marker
                array_start = offset + 19

                for try_size in [5 * 1024 * 1024, 10 * 1024 * 1024, 15 * 1024 * 1024]:
                    max_read = min(try_size, region["size"] - array_start)
                    if max_read < 64 * 1024:
                        continue

                    chunk = data[array_start : array_start + max_read]

                    # Count occurrences of "support_card_id" key
                    card_count = chunk.count(validate_key)
                    print(f"  Size {try_size // (1024*1024)}MB: {card_count} support_card_id entries")

                    if card_count >= 5:
                        print(f"[OK] Found valid array with {card_count} cards!")
                        found_data = chunk
                        break

                if found_data:
                    break

            except (OSError, IOError):
                continue

except PermissionError:
    print("\n[X] Permission denied — run as root:")
    print(f"  sudo python3 {sys.argv[0]}")
    sys.exit(1)
except Exception as e:
    print(f"\n[X] Error reading memory: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

if found_data is None:
    print("\n[X] No support card data found.")
    print("\nTroubleshooting:")
    print("  1. Open the Support Card list screen (Deck -> Support Cards)")
    print("  2. Wait for it to fully load, then run this script")
    print("  3. Run with sudo")
    sys.exit(1)

# ── Parse msgpack ────────────────────────────────────────────────────────────
print("\nProcessing data...")
try:
    unpacker = msgpack.Unpacker(raw=False)
    unpacker.feed(found_data)
    card_array = unpacker.unpack()

    if not isinstance(card_array, list):
        print(f"[X] Expected list but got {type(card_array)}")
        sys.exit(1)

    print(f"[OK] Parsed {len(card_array)} support cards")

    output = [
        {
            "support_card_id": card.get("support_card_id"),
            "limit_break_count": card.get("limit_break_count", 0),
        }
        for card in card_array
    ]

    output_file = "support_cards.json"
    try:
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2, ensure_ascii=False)
        print(f"[OK] Saved to {os.path.abspath(output_file)}\n")
    except PermissionError:
        output_file = os.path.join(os.path.expanduser("~"), "support_cards.json")
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2, ensure_ascii=False)
        print(f"[OK] Saved to {output_file} (home dir fallback)\n")

    if output:
        print("Sample entry:")
        print(f"  support_card_id:   {output[0]['support_card_id']}")
        print(f"  limit_break_count: {output[0]['limit_break_count']}")

    print(f"\n[SUCCESS] Extracted {len(output)} support cards to {output_file}")

except Exception as e:
    print(f"[X] Error processing data: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
