# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "msgpack",
# ]
# ///
#
# Extract the player's Uma roster (owned/available umas) from game memory (Linux/Wine).
# Run with sudo with the game open on the Uma selection / Trainee list screen
# (Home -> Uma Musume icon, or Enhance -> Trainee List).
#
import json
import os
import sys

import msgpack

print("=== Uma Musume Roster Extractor (Linux Edition) ===\n")
print("Make sure you are on the Uma selection or Trainee list screen before running.\n")

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
# Primary:  fixstr(11)=0xAB + "chara_array" + 0xDC
# Fallback: fixstr(19)=0xB3 + "trainee_chara_array" + 0xDC
# Validation: fixstr(8)=0xA8 + "chara_id"
# ─────────────────────────────────────────────────────────────────────────────

PATTERNS = [
    {
        "name": "chara_array",
        "needle": b"\xabchara_array\xdc",
        "key_len": 12,  # 1 (fixstr) + 11 (key) = 12; DC stays as array marker
    },
    {
        "name": "trainee_chara_array",
        "needle": b"\xb3trainee_chara_array\xdc",
        "key_len": 20,
    },
]
VALIDATE_KEY = b"\xa8chara_id"

print("\nSearching for uma roster data...")
print("This may take 30-60 seconds...\n")

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
            except (OSError, IOError):
                continue

            for pat in PATTERNS:
                offset = data.find(pat["needle"])
                if offset == -1:
                    continue

                print(f"\n[OK] [{pat['name']}] Found pattern at {hex(region['start'] + offset)}")
                array_start = offset + pat["key_len"]

                for try_size in [5 * 1024 * 1024, 10 * 1024 * 1024, 15 * 1024 * 1024]:
                    max_read = min(try_size, region["size"] - array_start)
                    if max_read < 64 * 1024:
                        continue

                    chunk = data[array_start : array_start + max_read]
                    count = chunk.count(VALIDATE_KEY)
                    print(f"  Size {try_size // (1024*1024)}MB: {count} chara_id entries")

                    if count >= 5:
                        print(f"[OK] Found valid roster with {count} umas!")
                        found_data = chunk
                        break

                if found_data:
                    break

            if found_data:
                break

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
    print("\n[X] No roster data found.")
    print("\nTroubleshooting:")
    print("  1. Open the Uma selection screen (Home -> Uma Musume icon)")
    print("     or the Trainee list (Enhance -> Trainee List)")
    print("  2. Wait for the screen to fully load, then run this script")
    print("  3. Run with sudo")
    sys.exit(1)

# ── Parse msgpack ────────────────────────────────────────────────────────────
print("\nProcessing data...")
try:
    unpacker = msgpack.Unpacker(raw=False)
    unpacker.feed(found_data)
    chara_array = unpacker.unpack()

    if not isinstance(chara_array, list):
        print(f"[X] Expected list but got {type(chara_array)}")
        sys.exit(1)

    print(f"[OK] Parsed {len(chara_array)} entries")

    output = []
    for chara in chara_array:
        entry = {"chara_id": chara.get("chara_id")}
        if "card_id" in chara:
            entry["card_id"] = chara["card_id"]
        output.append(entry)

    # Deduplicate — same uma may appear multiple times (multiple trained copies)
    seen = set()
    unique = []
    for entry in output:
        cid = entry.get("chara_id")
        if cid not in seen:
            seen.add(cid)
            unique.append(entry)

    output_file = "uma_roster.json"
    try:
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(unique, f, indent=2, ensure_ascii=False)
        print(f"[OK] Saved to {os.path.abspath(output_file)}\n")
    except PermissionError:
        output_file = os.path.join(os.path.expanduser("~"), "uma_roster.json")
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(unique, f, indent=2, ensure_ascii=False)
        print(f"[OK] Saved to {output_file} (home dir fallback)\n")

    if unique:
        print("Sample entry:")
        print(f"  chara_id: {unique[0]['chara_id']}")
        if "card_id" in unique[0]:
            print(f"  card_id:  {unique[0]['card_id']}")

    print(f"\n[SUCCESS] Extracted {len(unique)} unique umas to {output_file}")
    print(f"          (from {len(output)} total entries including duplicates)")

except Exception as e:
    print(f"[X] Error processing data: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
