#!/usr/bin/env python3
"""
Fix seed data distribution issues:
1. 08_charging_sessions.sql: lines 26348+ use only user 001 and date 2026-06-06
   -> Distribute across 500 users and 1 year
2. 03_transactions.sql: dates concentrated, spread evenly across 1 year
"""
import re
import random
from datetime import datetime, timedelta
from pathlib import Path

random.seed(42)

BASE = Path(__file__).parent
SESSION_FILE = BASE / "session-service" / "08_charging_sessions.sql"
CHARGER_FILE = BASE / "session-service" / "10_charger_state.sql"
TRANS_FILE = BASE / "billing-service" / "03_transactions.sql"

# ============== PART 1: Fix 08_charging_sessions.sql active sessions ==============

with open(SESSION_FILE, "r", encoding="utf-8") as f:
    content = f.read()
    lines = content.splitlines(True)

# Build charger_map from charger state file (030001-030416 -> charger_id)
charger_map = {}
with open(CHARGER_FILE, "r", encoding="utf-8") as f:
    for cline in f:
        if "55555555-1111-4000-8000-000000030" in cline and "occupied" in cline:
            cline = cline.strip()
            if cline.startswith('(') and cline.endswith('),'):
                cline = cline[1:-2]
            parts = [p.strip().strip("'") for p in cline.split(",")]
            if len(parts) >= 3 and parts[1] == 'occupied':
                sid = parts[2]  # active_session_id
                cid = parts[0]  # charger_id
                charger_map[sid] = cid
print(f"Built charger_map with {len(charger_map)} entries from charger state")

# Generate new active sessions matching charger state entries
# Use the actual session IDs from the charger state to ensure charger_map coverage
user_ids = [f"11111111-0000-4000-8000-000000000{i:03d}" for i in range(1, 501)]
today = datetime(2026, 6, 6, 6, 0, 0)
one_year_ago = today - timedelta(days=365)

charger_ids_ordered = sorted(charger_map.keys())
new_sessions = []
for i, session_id in enumerate(charger_ids_ordered):
    user_id = user_ids[i % 500]
    days_offset = (i * 365) // len(charger_ids_ordered)
    minutes_offset = (i * 120) % 1440
    start_time = one_year_ago + timedelta(days=days_offset, minutes=minutes_offset)
    start_str = start_time.strftime("%Y-%m-%d %H:%M:%S")
    new_sessions.append({
        'session_id': session_id,
        'user_id': user_id,
        'start_str': start_str,
    })

# Build the new active session SQL rows
new_rows = []
for i, sess in enumerate(new_sessions):
    sid = sess['session_id']
    uid = sess['user_id']
    cid = charger_map.get(sid)
    cid_sql = f"'{cid}'" if cid else 'NULL'
    start_str = sess['start_str']
    idem_key = f"IDEM-ACTIVE-{i + 1:06d}"
    row = (
        f"  ('{sid}', NULL, '{uid}', {cid_sql},\n"
        f"   '{start_str}', NULL, 0, NULL,\n"
        f"   'active', NULL, 'kiosk', '{idem_key}',\n"
        f"   NULL, 0, NULL, NULL,\n"
        f"   50000, NULL, NULL, '{start_str}', NOW()),"
    )
    new_rows.append(row)

new_rows[-1] = new_rows[-1][:-2] + ");"

# Try to find existing active sessions in the file
first_sid = charger_ids_ordered[0]
active_start = None
for i, line in enumerate(lines):
    if first_sid in line and i + 2 < len(lines) and "active" in lines[i + 2]:
        active_start = i
        break

if active_start is not None:
    # Replace existing active session block
    header = lines[:active_start]
    output_lines = header + [r + "\n" for r in new_rows]
    print(f"Replaced sessions at line {active_start + 1}")
else:
    # Append sessions before the final COMMIT
    full_text = content
    commit_pos = full_text.rfind("\nCOMMIT;")
    if commit_pos == -1:
        commit_pos = full_text.rfind("COMMIT;")
    before_commit = full_text[:commit_pos].rstrip()
    after_commit = full_text[commit_pos:]
    # Change the last ); to ),
    if before_commit.endswith(");"):
        before_commit = before_commit[:-2] + "),"
    new_rows[0] = "\n" + new_rows[0]
    output_text = before_commit + "\n" + "\n".join(new_rows) + "\n" + after_commit
    output_lines = None
    print("Appended sessions before COMMIT")

# Write back
if output_lines is not None:
    with open(SESSION_FILE, "w", encoding="utf-8") as f:
        f.writelines(output_lines)
else:
    with open(SESSION_FILE, "w", encoding="utf-8") as f:
        f.write(output_text)

print(f"Updated {SESSION_FILE}: {len(new_sessions)} sessions with distributed users and dates")

# ============== PART 2: Fix 03_transactions.sql date distribution ==============

with open(TRANS_FILE, "r", encoding="utf-8") as f:
    content = f.read()

# Find the INSERT line
insert_match = re.search(r"(INSERT INTO transactions.*?VALUES\n)", content, re.DOTALL)
if not insert_match:
    print("ERROR: Could not find INSERT statement in transactions file")
else:
    header_end = insert_match.end()
    
    # Extract all transaction rows
    # Find the data block between VALUES and the final semicolon
    data_start = header_end
    # Find the last COMMIT or semicolon
    data_end = content.rfind("COMMIT;")
    if data_end == -1:
        data_end = content.rfind(";\n")
        if data_end > 0:
            data_end = data_end + 1
    
    data_block = content[data_start:data_end].strip()
    
    # Split into individual rows
    # Each row starts with ( and ends with ), or );
    rows = []
    depth = 0
    current = ""
    for ch in data_block:
        if ch == '(' and depth == 0:
            current = '('
            depth = 1
        elif ch == '(':
            current += ch
            depth += 1
        elif ch == ')':
            depth -= 1
            current += ch
            if depth == 0:
                rows.append(current)
                current = ""
        else:
            if depth > 0:
                current += ch
    
    print(f"Found {len(rows)} transaction rows")
    
    # Parse each row
    parsed_rows = []
    for row_str in rows:
        row_str = row_str.strip()
        # Remove trailing comma or semicolon
        if row_str.endswith(',') or row_str.endswith(';'):
            row_str = row_str[:-1]
        # Remove outer parentheses (SQL tuple wrapper)
        if row_str.startswith('(') and row_str.endswith(')'):
            row_str = row_str[1:-1]
        
        # Parse CSV-like (simple but works for this format)
        # Split by quoted strings and commas
        parts = []
        current_part = ""
        in_quotes = False
        for ch in row_str:
            if ch == "'" and not in_quotes:
                in_quotes = True
                current_part += ch
            elif ch == "'" and in_quotes:
                in_quotes = False
                current_part += ch
            elif ch == ',' and not in_quotes:
                parts.append(current_part.strip())
                current_part = ""
            else:
                current_part += ch
        if current_part:
            parts.append(current_part.strip())
        
        if len(parts) >= 7:
            # parts[0] = id
            # parts[1] = user_id
            # parts[2] = type (payment, topup, refund)
            # parts[3] = amount
            # parts[4] = currency
            # parts[5] = method
            # parts[6] = related_id
            # parts[12] = created_at (ISO timestamp)
            # parts[13] = updated_at (ISO timestamp)
            if len(parts) > 12:
                created_at = parts[12].strip("'")
                updated_at = parts[13].strip("'")
                
                # Parse dates to redistribute
                try:
                    created_dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                    # Store with timezone-naive for now
                    created_dt = created_dt.replace(tzinfo=None)
                except:
                    created_dt = datetime(2025, 6, 7, 0, 0, 0)
                
                parsed_rows.append({
                    'parts': parts,
                    'original_created': created_dt,
                })
            else:
                parsed_rows.append({
                    'parts': parts,
                    'original_created': None,
                })
    
    print(f"Parsed {len(parsed_rows)} transactions")
    
    # Redistribute dates: spread evenly across 1 year from today
    # Sort by original date to maintain relative ordering
    parsed_rows.sort(key=lambda r: r['original_created'] or datetime(2025, 6, 7, 0, 0, 0))
    
    today_dt = datetime(2026, 6, 6, 23, 59, 59)
    year_ago = datetime(2025, 6, 7, 0, 0, 0)
    total_seconds = (today_dt - year_ago).total_seconds()
    
    n = len(parsed_rows)
    new_rows_out = []
    for idx, row_data in enumerate(parsed_rows):
        # Linear interpolation across the year
        fraction = idx / max(n - 1, 1)
        new_dt = year_ago + timedelta(seconds=int(total_seconds * fraction))
        new_ts = new_dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")
        
        parts = row_data['parts']
        # Update created_at (index 12) and updated_at (index 13)
        if len(parts) > 13:
            parts[12] = f"'{new_ts}'"
            parts[13] = f"'{new_ts}'"
        
        # Reconstruct row
        if idx < n - 1:
            row_end = "),"
        else:
            row_end = ");"
        
        new_row = "  (" + ", ".join(parts) + row_end
        new_rows_out.append(new_row)
    
    # Rebuild file
    new_content = content[:header_end] + "\n".join(new_rows_out) + "\n"
    # Find and append the footer (COMMIT, SET, etc.)
    footer_match = re.search(r"(COMMIT;.*)", content[data_end:], re.DOTALL)
    if footer_match:
        new_content += footer_match.group(1)
    
    with open(TRANS_FILE, "w", encoding="utf-8") as f:
        f.write(new_content)
    
    print(f"Updated {TRANS_FILE}: redistributed {n} transaction dates across 1 year")

print("Done!")
