#!/usr/bin/env python3
"""
Regenerate analytics-service seed data from actual session, transaction, and booking seeds.
Computes aggregates and writes all 7 analytics SQL files.
"""
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from collections import defaultdict

BASE = Path(__file__).parent

def parse_csv_row(row_str):
    """Split a CSV row respecting quoted strings."""
    parts = []
    current = ""
    in_quotes = False
    for ch in row_str:
        if ch == "'" and not in_quotes:
            in_quotes = True
            current += ch
        elif ch == "'" and in_quotes:
            in_quotes = False
            current += ch
        elif ch == ',' and not in_quotes:
            parts.append(current.strip())
            current = ""
        else:
            current += ch
    if current:
        parts.append(current.strip())
    return parts

def parse_sql_rows(content, start_marker="VALUES\n"):
    """Parse SQL INSERT rows into list of parts lists."""
    idx = content.find(start_marker)
    if idx == -1:
        return []
    data = content[idx + len(start_marker):]
    commit_idx = data.rfind("COMMIT;")
    if commit_idx != -1:
        data = data[:commit_idx]
    
    rows = []
    depth = 0
    current = ""
    for ch in data:
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
    
    result = []
    for row_str in rows:
        row_str = row_str.strip()
        if row_str.endswith(',') or row_str.endswith(';'):
            row_str = row_str[:-1]
        if row_str.startswith('(') and row_str.endswith(')'):
            row_str = row_str[1:-1]
        parts = parse_csv_row(row_str)
        result.append(parts)
    return result

def parse_timestamp(ts_str):
    """Parse various timestamp formats to datetime."""
    ts = ts_str.strip().strip("'")
    if ts == 'NULL' or not ts:
        return None
    for fmt in [
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S.000Z",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S",
    ]:
        try:
            return datetime.strptime(ts, fmt)
        except ValueError:
            continue
    return None

def parse_date_only(ts_str):
    """Parse date-only string (YYYY-MM-DD)."""
    ts = ts_str.strip().strip("'")
    try:
        return datetime.strptime(ts, "%Y-%m-%d")
    except ValueError:
        return None

def fmt_timestamp(dt):
    """Format datetime to SQL timestamp string."""
    if dt is None:
        return 'NULL'
    return f"'{dt.strftime('%Y-%m-%d %H:%M:%S')}'"

def fmt_date(dt):
    """Format to date string."""
    return dt.strftime('%Y-%m-%d')

def fmt_ts_iso(dt):
    """Format to ISO timestamp with Z."""
    return f"'{dt.strftime('%Y-%m-%dT%H:%M:%S.000Z')}'"

# ========================
# 1. PARSE CHARGER-STATION MAPPING
# ========================
print("Parsing charger-station mapping...")
charger_to_station = {}
with open(BASE / "ev-infrastructure-service" / "03_charging_points.sql", "r", encoding="utf-8") as f:
    content = f.read()
for parts in parse_sql_rows(content):
    if len(parts) >= 2:
        cid = parts[0].strip().strip("'")
        sid = parts[1].strip().strip("'")
        charger_to_station[cid] = sid

print(f"  Loaded {len(charger_to_station)} charger-to-station mappings")

# Get all stations
all_stations = set(charger_to_station.values())
print(f"  Total stations: {len(all_stations)}")

# ========================
# 2. PARSE CHARGER STATE
# ========================
print("Parsing charger state...")
charger_state = {}  # charger_id -> status
with open(BASE / "session-service" / "10_charger_state.sql", "r", encoding="utf-8") as f:
    content = f.read()
for parts in parse_sql_rows(content):
    if len(parts) >= 4:
        cid = parts[0].strip().strip("'")
        status = parts[4].strip().strip("'") if len(parts) > 4 else 'available'
        charger_state[cid] = status

print(f"  Loaded {len(charger_state)} charger states")

# ========================
# 3. PARSE SESSIONS
# ========================
print("Parsing sessions...")
# Session columns: id, booking_id, user_id, charger_id, start_time, end_time,
# start_meter_wh, end_meter_wh, status, error_reason, initiated_by,
# idempotency_key, energy_fee_vnd, idle_fee_vnd, stopped_at, billed_at,
# deposit_amount, deposit_transaction_id, scheduled_stop_at, created_at, updated_at

sessions = []
with open(BASE / "session-service" / "08_charging_sessions.sql", "r", encoding="utf-8") as f:
    content = f.read()

for parts in parse_sql_rows(content):
    if len(parts) < 21:
        continue
    sid = parts[0].strip().strip("'")
    booking_id = parts[1].strip().strip("'") if parts[1].strip().strip("'") != 'NULL' else None
    user_id = parts[2].strip().strip("'") if parts[2].strip().strip("'") != 'NULL' else None
    charger_id = parts[3].strip().strip("'") if parts[3].strip().strip("'") != 'NULL' else None
    
    start_time = parse_timestamp(parts[4])
    end_time = parse_timestamp(parts[5])
    
    start_meter_wh = int(parts[6].strip()) if parts[6].strip() not in ('NULL', '') else 0
    end_meter_wh = None
    if parts[7].strip() not in ('NULL', ''):
        try:
            end_meter_wh = int(parts[7].strip())
        except ValueError:
            pass
    
    status = parts[8].strip().strip("'") if parts[8].strip().strip("'") != 'NULL' else None
    
    energy_fee_vnd = None
    if parts[12].strip() not in ('NULL', ''):
        try:
            energy_fee_vnd = max(int(parts[12].strip()), 0)
        except ValueError:
            pass
    
    deposit_amount = None
    if len(parts) > 16 and parts[16].strip() not in ('NULL', ''):
        try:
            deposit_amount = int(parts[16].strip())
        except ValueError:
            pass
    
    kwh = None
    if end_meter_wh is not None and start_meter_wh is not None and end_meter_wh >= start_meter_wh:
        kwh = (end_meter_wh - start_meter_wh) / 1000.0
    
    duration_min = None
    if start_time and end_time:
        duration_min = (end_time - start_time).total_seconds() / 60.0
        if duration_min < 0:
            # Overnight session: end_time is on the next day
            duration_min += 24 * 60
    
    station_id = charger_to_station.get(charger_id)
    
    sessions.append({
        'id': sid,
        'booking_id': booking_id,
        'user_id': user_id,
        'charger_id': charger_id,
        'station_id': station_id,
        'start_time': start_time,
        'end_time': end_time,
        'status': status,
        'kwh': kwh,
        'energy_fee_vnd': energy_fee_vnd,
        'deposit_amount': deposit_amount,
        'duration_min': duration_min,
    })

print(f"  Parsed {len(sessions)} sessions")

# ========================
# 4. PARSE TRANSACTIONS
# ========================
print("Parsing transactions...")
# Transaction columns: id, user_id, type, amount, currency, method, related_id,
# related_type, external_id, reference_code, status, meta, created_at, updated_at

transactions = []
with open(BASE / "billing-service" / "03_transactions.sql", "r", encoding="utf-8") as f:
    content = f.read()

for parts in parse_sql_rows(content):
    if len(parts) < 14:
        continue
    user_id = parts[1].strip().strip("'")
    txn_type = parts[2].strip().strip("'")
    amount = None
    try:
        amount = int(parts[3].strip())
    except ValueError:
        pass
    currency = parts[4].strip().strip("'")
    method = parts[5].strip().strip("'")
    related_id = parts[6].strip().strip("'") if parts[6].strip().strip("'") != 'NULL' else None
    related_type = parts[7].strip().strip("'") if len(parts) > 7 and parts[7].strip().strip("'") != 'NULL' else None
    status = parts[10].strip().strip("'")
    created_at = parse_timestamp(parts[12])
    
    transactions.append({
        'user_id': user_id,
        'type': txn_type,
        'amount': amount,
        'method': method,
        'related_id': related_id,
        'related_type': related_type,
        'status': status,
        'created_at': created_at,
    })

print(f"  Parsed {len(transactions)} transactions")

# ========================
# 5. PARSE BOOKINGS
# ========================
print("Parsing bookings...")
# Booking columns: id, user_id, vehicle_id, charger_id, pricing_snapshot_id,
# start_time, end_time, status, expires_at, notes, deposit_amount,
# deposit_transaction_id, qr_token, penalty_amount, connector_type,
# price_per_kwh_snapshot, idempotency_key, created_at, updated_at

bookings = []
with open(BASE / "session-service" / "06_bookings.sql", "r", encoding="utf-8") as f:
    content = f.read()

for parts in parse_sql_rows(content):
    if len(parts) < 19:
        continue
    bid = parts[0].strip().strip("'")
    charger_id = parts[3].strip().strip("'") if parts[3].strip().strip("'") != 'NULL' else None
    status = parts[7].strip().strip("'")
    start_time = parse_timestamp(parts[5])
    end_time = parse_timestamp(parts[6])
    
    station_id = charger_to_station.get(charger_id)
    
    bookings.append({
        'id': bid,
        'charger_id': charger_id,
        'station_id': station_id,
        'status': status,
        'start_time': start_time,
        'end_time': end_time,
    })

print(f"  Parsed {len(bookings)} bookings")

# ========================
# 6. COMPUTE DATE RANGE
# ========================
all_dates = set()
for s in sessions:
    if s['start_time']:
        all_dates.add(s['start_time'].date())
    if s['end_time']:
        all_dates.add(s['end_time'].date())
for t in transactions:
    if t['created_at']:
        all_dates.add(t['created_at'].date())
for b in bookings:
    if b['start_time']:
        all_dates.add(b['start_time'].date())

if all_dates:
    min_date = min(all_dates)
    max_date = max(all_dates)
else:
    min_date = datetime(2025, 6, 6).date()
    max_date = datetime(2026, 6, 6).date()

print(f"  Date range: {min_date} to {max_date}")

# ========================
# 7. BUILD DATE-INDEXED AGGREGATES
# ========================

# Group sessions by (station_id, date)
station_date_sessions = defaultdict(list)
for s in sessions:
    if s['station_id'] and s['start_time']:
        station_date_sessions[(s['station_id'], s['start_time'].date())].append(s)
    if s['station_id'] and s['end_time']:
        station_date_sessions[(s['station_id'], s['end_time'].date())].append(s)

# Group sessions by (user_id, date)
user_date_sessions = defaultdict(list)
for s in sessions:
    if s['user_id'] and s['start_time']:
        user_date_sessions[(s['user_id'], s['start_time'].date())].append(s)

# Group sessions by (charger_id, hour_bucket)
charger_hour_sessions = defaultdict(list)
for s in sessions:
    if s['charger_id'] and s['start_time']:
        hour_bucket = s['start_time'].replace(minute=0, second=0, microsecond=0)
        charger_hour_sessions[(s['charger_id'], hour_bucket)].append(s)

# Group transactions by (date)
date_transactions = defaultdict(list)
for t in transactions:
    if t['created_at']:
        date_transactions[t['created_at'].date()].append(t)

# Group transactions by (station_id, month)
station_month_transactions = defaultdict(list)
for t in transactions:
    if t['related_type'] == 'charging_session' and t['related_id']:
        # Find the session to get the station
        for s in sessions:
            if s['id'] == t['related_id'] and s['station_id']:
                key = (s['station_id'], t['created_at'].strftime('%Y-%m') if t['created_at'] else 'unknown')
                station_month_transactions[key].append(t)
                break

# Group bookings by (station_id, date)
station_date_bookings = defaultdict(list)
for b in bookings:
    if b['station_id'] and b['start_time']:
        station_date_bookings[(b['station_id'], b['start_time'].date())].append(b)

# Group bookings by (date) for platform KPIs
date_bookings = defaultdict(list)
for b in bookings:
    if b['start_time']:
        date_bookings[b['start_time'].date()].append(b)

# ========================
# 8. GENERATE ANALYTICS FILES
# ========================

def gen_id(prefix, seq):
    return f"'{prefix}-{seq:012d}'"

now = datetime.now(timezone.utc)

# ---- 01_platform_kpi_snapshots ----
print("Generating 01_platform_kpi_snapshots...")
total_chargers = len(charger_to_station)
rows = []
seq = 1
current = min_date
while current <= max_date:
    active = 0
    for s in sessions:
        if s['status'] == 'active' and s['start_time'] and s['start_time'].date() <= current:
            if s['end_time'] is None or s['end_time'].date() >= current:
                active += 1
    
    available = total_chargers - active
    if available < 0:
        available = 0
    
    bookings_count = len(date_bookings.get(current, []))
    
    revenue = 0
    for t in date_transactions.get(current, []):
        if t['type'] == 'payment' and t['status'] == 'completed' and t['amount']:
            revenue += t['amount']
    
    captured = datetime(current.year, current.month, current.day, 23, 59, 59)
    
    rows.append(
        f"  ({gen_id('49244444-0000-4000-8000', seq)}, {fmt_ts_iso(captured)}, 'daily', "
        f"{active}, {total_chargers}, {available}, {bookings_count}, {revenue})"
    )
    seq += 1
    current += timedelta(days=1)

last_comma = rows[-1][-1] == ')'
if last_comma:
    rows[-1] = rows[-1] + ';'
else:
    # It already has a comma or semicolon, ensure it ends with ;
    pass
# Remove trailing comma if any and add ;
for i in range(len(rows)):
    if rows[i].endswith('),'):
        rows[i] = rows[i][:-2] + '),'
    elif rows[i].endswith('),'):
        rows[i] = rows[i][:-2] + '),'
    if i < len(rows) - 1:
        if not rows[i].endswith(','):
            rows[i] = rows[i] + ','
    else:
        if rows[i].endswith(','):
            rows[i] = rows[i][:-1] + ';'
        elif rows[i].endswith(')'):
            rows[i] = rows[i] + ';'

# Actually, let me build them properly: all rows end with ), except last which ends with );
for i in range(len(rows)):
    row = rows[i]
    # Remove any trailing , or ;
    if row.endswith(',') or row.endswith(';'):
        row = row[:-1]
    if i < len(rows) - 1:
        rows[i] = row + ','
    else:
        rows[i] = row + ';'

output = [
    "-- ============================================",
    "-- Service : analytics-service",
    "-- Table   : platform_kpi_snapshots",
    f"-- File    : database/seeds/analytics-service/01_platform_kpi_snapshots.sql",
    "-- Depends : none",
    f"-- Records : {len(rows)}",
    "-- ============================================",
    "SET session_replication_role = replica;",
    "BEGIN;",
    "  TRUNCATE TABLE platform_kpi_snapshots CASCADE;",
    "INSERT INTO platform_kpi_snapshots (id, captured_at, period, active_sessions, total_chargers, available_chargers, bookings_last_hour, revenue_last_hour_vnd) VALUES",
    "\n".join(rows),
    "COMMIT;",
    "SET session_replication_role = DEFAULT;",
    "",
]
with open(BASE / "analytics-service" / "01_platform_kpi_snapshots.sql", "w", encoding="utf-8") as f:
    f.write("\n".join(output))
print(f"  Wrote {len(rows)} rows")

# ---- 02_daily_station_metrics ----
print("Generating 02_daily_station_metrics...")
rows = []
seq = 1
stations_list = sorted(all_stations)
if not stations_list:
    stations_list = sorted(set(s['station_id'] for s in sessions if s['station_id']))

for station_id in stations_list:
    current = min_date
    while current <= max_date:
        key = (station_id, current)
        s_list = station_date_sessions.get(key, [])
        
        total_sessions = len(set(s['id'] for s in s_list))
        
        total_kwh = 0.0
        total_revenue = 0
        total_duration = 0.0
        count_with_data = 0
        
        for s in s_list:
            if s['kwh'] is not None and s['kwh'] > 0:
                total_kwh += s['kwh']
            if s['energy_fee_vnd'] is not None:
                total_revenue += s['energy_fee_vnd']
            if s['duration_min'] is not None:
                total_duration += s['duration_min']
                count_with_data += 1
        
        avg_duration = round(total_duration / count_with_data, 2) if count_with_data > 0 else 0
        
        # utilization rate: occupied chargers / total chargers at this station
        station_chargers = [c for c, s in charger_to_station.items() if s == station_id]
        total_station_chargers = len(station_chargers)
        utilization = round(total_sessions / (total_station_chargers * 24) if total_station_chargers > 0 else 0.0, 4)
        if utilization > 1.0:
            utilization = 1.0
        
        if total_sessions > 0 or total_kwh > 0 or total_revenue > 0:
            rows.append(
                f"  ({gen_id('dc6ddddd-0000-4000-8000', seq)}, '{station_id}', '{fmt_date(current)}', "
                f"{total_sessions}, {round(total_kwh, 2)}, {total_revenue}, {avg_duration}, {utilization})"
            )
            seq += 1
        
        current += timedelta(days=1)

for i in range(len(rows)):
    row = rows[i]
    if row.endswith(',') or row.endswith(';'):
        row = row[:-1]
    if i < len(rows) - 1:
        rows[i] = row + ','
    else:
        rows[i] = row + ';'

output = [
    "-- ============================================",
    "-- Service : analytics-service",
    "-- Table   : daily_station_metrics",
    f"-- File    : database/seeds/analytics-service/02_daily_station_metrics.sql",
    "-- Depends : none",
    f"-- Records : {len(rows)}",
    "-- ============================================",
    "SET session_replication_role = replica;",
    "BEGIN;",
    "  TRUNCATE TABLE daily_station_metrics CASCADE;",
    "INSERT INTO daily_station_metrics (id, station_id, metric_date, total_sessions, total_kwh, total_revenue_vnd, avg_session_min, utilization_rate) VALUES",
    "\n".join(rows),
    "COMMIT;",
    "SET session_replication_role = DEFAULT;",
    "",
]
with open(BASE / "analytics-service" / "02_daily_station_metrics.sql", "w", encoding="utf-8") as f:
    f.write("\n".join(output))
print(f"  Wrote {len(rows)} rows")

# ---- 03_daily_user_metrics ----
print("Generating 03_daily_user_metrics...")
rows = []
seq = 1

# Get all unique users from sessions
all_users = sorted(set(s['user_id'] for s in sessions if s['user_id']))

for user_id in all_users:
    current = min_date
    while current <= max_date:
        key = (user_id, current)
        s_list = user_date_sessions.get(key, [])
        
        count = len(s_list)
        kwh = sum(s['kwh'] for s in s_list if s['kwh'] is not None)
        spent = sum(s['energy_fee_vnd'] for s in s_list if s['energy_fee_vnd'] is not None)
        
        # Also add transaction amounts for this user on this date
        for t in date_transactions.get(current, []):
            if t['user_id'] == user_id and t['type'] == 'payment' and t['amount'] and t['status'] == 'completed':
                if spent is None:
                    spent = t['amount']
                else:
                    spent += t['amount']
        
        if count > 0 or kwh > 0 or (spent and spent > 0):
            spent_val = spent if spent else 0
            rows.append(
                f"  ({gen_id('de6ddddd-0000-4000-8000', seq)}, '{user_id}', '{fmt_date(current)}', "
                f"{count}, {round(kwh, 2)}, {spent_val})"
            )
            seq += 1
        
        current += timedelta(days=1)

for i in range(len(rows)):
    row = rows[i]
    if row.endswith(',') or row.endswith(';'):
        row = row[:-1]
    if i < len(rows) - 1:
        rows[i] = row + ','
    else:
        rows[i] = row + ';'

output = [
    "-- ============================================",
    "-- Service : analytics-service",
    "-- Table   : daily_user_metrics",
    f"-- File    : database/seeds/analytics-service/03_daily_user_metrics.sql",
    "-- Depends : none",
    f"-- Records : {len(rows)}",
    "-- ============================================",
    "SET session_replication_role = replica;",
    "BEGIN;",
    "  TRUNCATE TABLE daily_user_metrics CASCADE;",
    "INSERT INTO daily_user_metrics (id, user_id, metric_date, sessions_count, kwh_consumed, amount_spent_vnd) VALUES",
    "\n".join(rows),
    "COMMIT;",
    "SET session_replication_role = DEFAULT;",
    "",
]
with open(BASE / "analytics-service" / "03_daily_user_metrics.sql", "w", encoding="utf-8") as f:
    f.write("\n".join(output))
print(f"  Wrote {len(rows)} rows")

# ---- 04_hourly_usage_stats ----
print("Generating 04_hourly_usage_stats...")
rows = []
seq = 1

# Group sessions by charger + hour, then by station
charger_hour_agg = defaultdict(lambda: {'count': 0, 'kwh': 0.0, 'duration': 0.0})
for key, s_list in charger_hour_sessions.items():
    charger_id, hour_bucket = key
    count = len(set(s['id'] for s in s_list))
    kwh = sum(s['kwh'] for s in s_list if s['kwh'] is not None)
    duration = sum(s['duration_min'] for s in s_list if s['duration_min'] is not None)
    charger_hour_agg[key] = {'count': count, 'kwh': kwh, 'duration': duration}

# Sort for deterministic output
for (charger_id, hour_bucket), agg in sorted(charger_hour_agg.items(), key=lambda x: (x[0][0], x[0][1])):
    station_id = charger_to_station.get(charger_id)
    if not station_id:
        continue
    
    hour_of_day = hour_bucket.hour
    
    if agg['count'] <= 0:
        continue
    
    rows.append(
        f"  ({gen_id('1ec11111-0000-4000-8000', seq)}, '{station_id}', '{charger_id}', "
        f"{fmt_ts_iso(hour_bucket)}, {hour_of_day}, "
        f"{agg['count']}, {round(agg['kwh'], 2)}, {round(agg['duration'], 2)})"
    )
    seq += 1

for i in range(len(rows)):
    row = rows[i]
    if row.endswith(',') or row.endswith(';'):
        row = row[:-1]
    if i < len(rows) - 1:
        rows[i] = row + ','
    else:
        rows[i] = row + ';'

output = [
    "-- ============================================",
    "-- Service : analytics-service",
    "-- Table   : hourly_usage_stats",
    f"-- File    : database/seeds/analytics-service/04_hourly_usage_stats.sql",
    "-- Depends : none",
    f"-- Records : {len(rows)}",
    "-- ============================================",
    "SET session_replication_role = replica;",
    "BEGIN;",
    "  TRUNCATE TABLE hourly_usage_stats CASCADE;",
    "INSERT INTO hourly_usage_stats (id, station_id, charger_id, hour_bucket, hour_of_day, sessions_count, kwh_consumed, total_duration_min) VALUES",
    "\n".join(rows),
    "COMMIT;",
    "SET session_replication_role = DEFAULT;",
    "",
]
with open(BASE / "analytics-service" / "04_hourly_usage_stats.sql", "w", encoding="utf-8") as f:
    f.write("\n".join(output))
print(f"  Wrote {len(rows)} rows")

# ---- 05_revenue_stats ----
print("Generating 05_revenue_stats...")
rows = []
seq = 1

for (station_id, month), t_list in sorted(station_month_transactions.items(), key=lambda x: (x[0][0], x[0][1])):
    total_revenue = 0
    total_count = 0
    for t in t_list:
        if t['type'] == 'payment' and t['status'] == 'completed' and t['amount']:
            total_revenue += t['amount']
            total_count += 1
    
    if total_count > 0:
        rows.append(
            f"  ({gen_id('befbbbbb-0000-4000-8000', seq)}, '{station_id}', '{month}', "
            f"{total_revenue}, {total_count})"
        )
        seq += 1

for i in range(len(rows)):
    row = rows[i]
    if row.endswith(',') or row.endswith(';'):
        row = row[:-1]
    if i < len(rows) - 1:
        rows[i] = row + ','
    else:
        rows[i] = row + ';'

output = [
    "-- ============================================",
    "-- Service : analytics-service",
    "-- Table   : revenue_stats",
    f"-- File    : database/seeds/analytics-service/05_revenue_stats.sql",
    "-- Depends : none",
    f"-- Records : {len(rows)}",
    "-- ============================================",
    "SET session_replication_role = replica;",
    "BEGIN;",
    "  TRUNCATE TABLE revenue_stats CASCADE;",
    "INSERT INTO revenue_stats (id, station_id, billing_month, total_revenue_vnd, total_transactions) VALUES",
    "\n".join(rows),
    "COMMIT;",
    "SET session_replication_role = DEFAULT;",
    "",
]
with open(BASE / "analytics-service" / "05_revenue_stats.sql", "w", encoding="utf-8") as f:
    f.write("\n".join(output))
print(f"  Wrote {len(rows)} rows")

# ---- 06_booking_stats ----
print("Generating 06_booking_stats...")
rows = []
seq = 1

for (station_id, date), b_list in sorted(station_date_bookings.items(), key=lambda x: (x[0][0], x[0][1])):
    created = len(b_list)
    confirmed = sum(1 for b in b_list if b['status'] == 'confirmed')
    cancelled = sum(1 for b in b_list if b['status'] == 'cancelled')
    
    rows.append(
        f"  ({gen_id('bcbbbbbb-0000-4000-8000', seq)}, '{station_id}', '{fmt_date(date)}', "
        f"{created}, {confirmed}, {cancelled})"
    )
    seq += 1

for i in range(len(rows)):
    row = rows[i]
    if row.endswith(',') or row.endswith(';'):
        row = row[:-1]
    if i < len(rows) - 1:
        rows[i] = row + ','
    else:
        rows[i] = row + ';'

output = [
    "-- ============================================",
    "-- Service : analytics-service",
    "-- Table   : booking_stats",
    f"-- File    : database/seeds/analytics-service/06_booking_stats.sql",
    "-- Depends : none",
    f"-- Records : {len(rows)}",
    "-- ============================================",
    "SET session_replication_role = replica;",
    "BEGIN;",
    "  TRUNCATE TABLE booking_stats CASCADE;",
    "INSERT INTO booking_stats (id, station_id, metric_date, bookings_created, bookings_confirmed, bookings_cancelled) VALUES",
    "\n".join(rows),
    "COMMIT;",
    "SET session_replication_role = DEFAULT;",
    "",
]
with open(BASE / "analytics-service" / "06_booking_stats.sql", "w", encoding="utf-8") as f:
    f.write("\n".join(output))
print(f"  Wrote {len(rows)} rows")

# ---- 07_user_behavior_stats ----
print("Generating 07_user_behavior_stats...")
rows = []
seq = 1

user_agg = defaultdict(lambda: {
    'total_sessions': 0, 'total_kwh': 0.0,
    'total_duration': 0.0, 'count_duration': 0,
    'last_session_at': None
})

for s in sessions:
    if not s['user_id']:
        continue
    uid = s['user_id']
    user_agg[uid]['total_sessions'] += 1
    if s['kwh'] is not None:
        user_agg[uid]['total_kwh'] += s['kwh']
    if s['duration_min'] is not None:
        user_agg[uid]['total_duration'] += s['duration_min']
        user_agg[uid]['count_duration'] += 1
    if s['start_time']:
        if user_agg[uid]['last_session_at'] is None or s['start_time'] > user_agg[uid]['last_session_at']:
            user_agg[uid]['last_session_at'] = s['start_time']

for uid in sorted(user_agg.keys()):
    agg = user_agg[uid]
    last_session = agg['last_session_at']
    avg_duration = round(agg['total_duration'] / agg['count_duration'], 2) if agg['count_duration'] > 0 else 0
    
    if agg['total_sessions'] <= 0:
        continue
    
    last_ts = fmt_ts_iso(last_session) if last_session else 'NULL'
    
    rows.append(
        f"  ({gen_id('ebceeeee-0000-4000-8000', seq)}, '{uid}', "
        f"{agg['total_sessions']}, {round(agg['total_kwh'], 2)}, "
        f"{round(agg['total_duration'], 2)}, {avg_duration}, {last_ts})"
    )
    seq += 1

for i in range(len(rows)):
    row = rows[i]
    if row.endswith(',') or row.endswith(';'):
        row = row[:-1]
    if i < len(rows) - 1:
        rows[i] = row + ','
    else:
        rows[i] = row + ';'

output = [
    "-- ============================================",
    "-- Service : analytics-service",
    "-- Table   : user_behavior_stats",
    f"-- File    : database/seeds/analytics-service/07_user_behavior_stats.sql",
    "-- Depends : none",
    f"-- Records : {len(rows)}",
    "-- ============================================",
    "SET session_replication_role = replica;",
    "BEGIN;",
    "  TRUNCATE TABLE user_behavior_stats CASCADE;",
    "INSERT INTO user_behavior_stats (id, user_id, total_sessions, total_kwh, total_duration_min, avg_duration_min, last_session_at) VALUES",
    "\n".join(rows),
    "COMMIT;",
    "SET session_replication_role = DEFAULT;",
    "",
]
with open(BASE / "analytics-service" / "07_user_behavior_stats.sql", "w", encoding="utf-8") as f:
    f.write("\n".join(output))
print(f"  Wrote {len(rows)} rows")

print("Done! All analytics seeds regenerated.")
