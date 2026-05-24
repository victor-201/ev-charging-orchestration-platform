"""
Regenerate seed data for EV Charging Platform with proper Vietnamese names.
Preserves existing UUIDs, updates names/emails/phones.
"""
import re
import hashlib
import os

# ─── Vietnamese name components ───────────────────────────────────────────────
LAST_NAMES = [
    "Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Huỳnh", "Phan", "Vũ", "Võ",
    "Đặng", "Bùi", "Đỗ", "Hồ", "Ngô", "Dương", "Lý", "Vương", "Trịnh",
    "Đoàn", "Lâm", "Mai", "Phùng", "Tống",
]

MIDDLE_NAMES = [
    "Văn", "Thị", "Đức", "Ngọc", "Quang", "Thu", "Thảo", "Hữu", "Xuân",
    "Kim", "Nguyên", "Khánh", "Hoài", "Như", "Thanh", "Minh", "Công", "Mạnh",
]

FIRST_NAMES = [
    "Thắng", "Quyên", "Sơn", "Tâm", "Tuấn", "Hoa", "Hòa", "Phúc", "Thịnh",
    "Đạt", "Vy", "My", "Phương", "Dung", "Trang", "Linh", "Mai", "Hiếu",
    "Trung", "Dũng", "Hùng", "Mạnh", "Khang", "Phát", "Lộc", "Sang", "Tài",
]

PASSWORD_HASH = "$2b$10$VPk42B6xgQO4n4zTx5Aiae0xXMhk7plrPwLNB0OMj6nq33u8v3TGG"


def remove_diacritics(s):
    """Remove Vietnamese diacritics, return ASCII lowercase."""
    replacements = {
        'à': 'a', 'á': 'a', 'ả': 'a', 'ã': 'a', 'ạ': 'a',
        'ă': 'a', 'ằ': 'a', 'ắ': 'a', 'ẳ': 'a', 'ẵ': 'a', 'ặ': 'a',
        'â': 'a', 'ầ': 'a', 'ấ': 'a', 'ẩ': 'a', 'ẫ': 'a', 'ậ': 'a',
        'è': 'e', 'é': 'e', 'ẻ': 'e', 'ẽ': 'e', 'ẹ': 'e',
        'ê': 'e', 'ề': 'e', 'ế': 'e', 'ể': 'e', 'ễ': 'e', 'ệ': 'e',
        'ì': 'i', 'í': 'i', 'ỉ': 'i', 'ĩ': 'i', 'ị': 'i',
        'ò': 'o', 'ó': 'o', 'ỏ': 'o', 'õ': 'o', 'ọ': 'o',
        'ô': 'o', 'ồ': 'o', 'ố': 'o', 'ổ': 'o', 'ỗ': 'o', 'ộ': 'o',
        'ơ': 'o', 'ờ': 'o', 'ớ': 'o', 'ở': 'o', 'ỡ': 'o', 'ợ': 'o',
        'ù': 'u', 'ú': 'u', 'ủ': 'u', 'ũ': 'u', 'ụ': 'u',
        'ư': 'u', 'ừ': 'u', 'ứ': 'u', 'ử': 'u', 'ữ': 'u', 'ự': 'u',
        'ỳ': 'y', 'ý': 'y', 'ỷ': 'y', 'ỹ': 'y', 'ỵ': 'y',
        'đ': 'd',
        'À': 'A', 'Á': 'A', 'Ả': 'A', 'Ã': 'A', 'Ạ': 'A',
        'Ă': 'A', 'Ằ': 'A', 'Ắ': 'A', 'Ẳ': 'A', 'Ẵ': 'A', 'Ặ': 'A',
        'Â': 'A', 'Ầ': 'A', 'Ấ': 'A', 'Ẩ': 'A', 'Ẫ': 'A', 'Ậ': 'A',
        'È': 'E', 'É': 'E', 'Ẻ': 'E', 'Ẽ': 'E', 'Ệ': 'E',
        'Ê': 'E', 'Ề': 'E', 'Ế': 'E', 'Ể': 'E', 'Ễ': 'E',
        'Ì': 'I', 'Í': 'I', 'Ỉ': 'I', 'Ĩ': 'I', 'Ị': 'I',
        'Ò': 'O', 'Ó': 'O', 'Ỏ': 'O', 'Õ': 'O', 'Ọ': 'O',
        'Ô': 'O', 'Ồ': 'O', 'Ố': 'O', 'Ổ': 'O', 'Ỗ': 'O', 'Ộ': 'O',
        'Ơ': 'O', 'Ờ': 'O', 'Ớ': 'O', 'Ở': 'O', 'Ỡ': 'O', 'Ợ': 'O',
        'Ù': 'U', 'Ú': 'U', 'Ủ': 'U', 'Ũ': 'U', 'Ụ': 'U',
        'Ư': 'U', 'Ừ': 'U', 'Ứ': 'U', 'Ử': 'U', 'Ữ': 'U', 'Ự': 'U',
        'Ỳ': 'Y', 'Ý': 'Y', 'Ỷ': 'Y', 'Ỹ': 'Y', 'Ỵ': 'Y',
        'Đ': 'D',
    }
    result = []
    for ch in s:
        result.append(replacements.get(ch, ch))
    return ''.join(result).lower()


def make_email(middle, first, suffix):
    base = remove_diacritics(middle + first)
    if suffix == 0:
        return f"{base}@gmail.com"
    return f"{base}{suffix}@gmail.com"


def make_phone(user_index):
    """Generate deterministic phone: 08 + 7 digits."""
    phone_int = 800000000 + user_index
    return f"0{phone_int}"


def make_dob(user_index):
    """Generate deterministic date of birth."""
    year = 1990 + (user_index % 10)
    month = 1 + (user_index % 12)
    day = 1 + (user_index % 28)
    return f"{year}-{month:02d}-{day:02d}"


def parse_uuids(filepath):
    """Extract ordered user UUIDs from existing SQL file."""
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    uuids = re.findall(
        r"\(('(?:11111111|22222222)-[^']+')",
        content
    )
    return [u.strip("'") for u in uuids]


def generate_user_data(uuids):
    """Generate (full_name, email, phone, dob) for each UUID."""
    users = []

    # Design (middle, first) combos – 44 combos × 23 last names = 1012, trim to 1000
    combo_pool = [
        ("Văn", "Thắng"), ("Văn", "Sơn"), ("Văn", "Tuấn"), ("Văn", "Hòa"),
        ("Văn", "Đạt"), ("Văn", "Trung"), ("Văn", "Dũng"), ("Văn", "Hùng"),
        ("Văn", "Mạnh"), ("Văn", "Khang"), ("Văn", "Tài"),
        ("Thị", "Quyên"), ("Thị", "Tâm"), ("Thị", "Hoa"), ("Thị", "Phúc"),
        ("Thị", "Phương"), ("Thị", "Dung"), ("Thị", "Trang"), ("Thị", "Linh"),
        ("Thị", "Mai"),
        ("Đức", "Quyên"), ("Đức", "Tuấn"), ("Đức", "Hòa"), ("Đức", "Phúc"),
        ("Đức", "Đạt"), ("Đức", "Mạnh"), ("Đức", "Hiếu"), ("Đức", "Trung"),
        ("Ngọc", "Quyên"), ("Ngọc", "Tuấn"), ("Ngọc", "Hoa"), ("Ngọc", "Phúc"),
        ("Ngọc", "Đạt"), ("Ngọc", "Vy"), ("Ngọc", "My"), ("Ngọc", "Linh"),
        ("Quang", "Quyên"), ("Quang", "Tuấn"), ("Quang", "Phúc"), ("Quang", "Đạt"),
        ("Quang", "Trung"), ("Quang", "Dũng"), ("Quang", "Hùng"), ("Quang", "Sang"),
        ("Thu", "Quyên"), ("Thu", "Tuấn"), ("Thu", "Hoa"), ("Thu", "Phúc"),
        ("Thu", "Đạt"), ("Thu", "Phương"), ("Thu", "Dung"),
        ("Thảo", "Quyên"), ("Thảo", "Hoa"), ("Thảo", "Phúc"), ("Thảo", "Đạt"),
        ("Thảo", "My"), ("Thảo", "Linh"), ("Thảo", "Mai"),
        ("Hữu", "Quyên"), ("Hữu", "Tuấn"), ("Hữu", "Hoa"), ("Hữu", "Phúc"),
        ("Hữu", "Thịnh"), ("Hữu", "Hiếu"),
        ("Xuân", "Quyên"), ("Xuân", "Tuấn"), ("Xuân", "Hoa"), ("Xuân", "Phúc"),
        ("Xuân", "Đạt"), ("Xuân", "Mai"),
        ("Kim", "Quyên"), ("Kim", "Hoa"), ("Kim", "Thịnh"), ("Kim", "Phúc"),
        ("Kim", "Vy"),
        ("Nguyên", "Quyên"), ("Nguyên", "Hoa"), ("Nguyên", "Thịnh"), ("Nguyên", "Phúc"),
        ("Khánh", "Quyên"), ("Khánh", "Hoa"), ("Khánh", "Thịnh"),
        ("Hoài", "Quyên"), ("Hoài", "Tâm"), ("Hoài", "Hoa"), ("Hoài", "Phúc"),
        ("Hoài", "Thịnh"),
        ("Như", "Quyên"), ("Như", "Tâm"), ("Như", "Hoa"), ("Như", "Thịnh"),
        ("Thanh", "Tuấn"), ("Thanh", "Hòa"), ("Thanh", "Phúc"), ("Thanh", "Đạt"),
        ("Minh", "Tuấn"), ("Minh", "Hòa"), ("Minh", "Phúc"), ("Minh", "Đạt"),
        ("Công", "Thắng"), ("Công", "Sơn"), ("Công", "Tuấn"), ("Công", "Hùng"),
        ("Công", "Mạnh"),
        ("Mạnh", "Thắng"), ("Mạnh", "Sơn"), ("Mạnh", "Tuấn"), ("Mạnh", "Hùng"),
        ("Mạnh", "Tài"),
    ]

    # Track email usage for dedup
    email_count = {}

    user_idx = 0
    combo_idx = 0
    while user_idx < len(uuids):
        middle, first = combo_pool[combo_idx % len(combo_pool)]
        last = LAST_NAMES[user_idx % len(LAST_NAMES)]

        # Build email
        mid_first_key = middle + first
        email_count[mid_first_key] = email_count.get(mid_first_key, -1) + 1
        suffix = email_count[mid_first_key]
        email = make_email(middle, first, suffix)

        full_name = f"{last} {middle} {first}"
        phone = make_phone(user_idx)
        dob = make_dob(user_idx)

        users.append((full_name, email, phone, dob))
        user_idx += 1
        combo_idx += 1

    return users


def write_users_sql(uuids, users, output_path):
    """Write 04_users.sql."""
    lines = [
        "-- ============================================",
        "-- Service : iam-service",
        "-- Table   : users",
        "-- File    : database/seeds/iam-service/04_users.sql",
        "-- Depends : none",
        "-- Records : 1002",
        "-- ============================================",
        "SET session_replication_role = replica;",
        "BEGIN;",
        "  TRUNCATE TABLE users CASCADE;",
        "",
        "INSERT INTO users (id, email, full_name, phone, date_of_birth, password_hash, status, email_verified, mfa_enabled, failed_login_count) VALUES",
    ]

    # Admins
    lines.append(
        "  ('a0a0a0a0-0000-4000-8000-000000000001', 'admin01@evcharging.vn', 'Admin Quản Trị 1', '0899999901', '1990-01-01', '$2b$10$VPk42B6xgQO4n4zTx5Aiae0xXMhk7plrPwLNB0OMj6nq33u8v3TGG', 'active', true, false, 0),"
    )
    lines.append(
        "  ('a0a0a0a0-0000-4000-8000-000000000002', 'admin02@evcharging.vn', 'Admin Quản Trị 2', '0899999902', '1990-01-01', '$2b$10$VPk42B6xgQO4n4zTx5Aiae0xXMhk7plrPwLNB0OMj6nq33u8v3TGG', 'active', true, false, 0),"
    )

    # Users
    for i, (uid, (full_name, email, phone, dob)) in enumerate(zip(uuids, users)):
        comma = "," if i < len(uuids) - 1 else ";"
        lines.append(
            f"  ('{uid}', '{email}', '{full_name}', '{phone}', '{dob}', '$2b$10$VPk42B6xgQO4n4zTx5Aiae0xXMhk7plrPwLNB0OMj6nq33u8v3TGG', 'active', true, false, 0){comma}"
        )

    lines.extend(["", "", "COMMIT;", "SET session_replication_role = DEFAULT;", ""])

    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"Written {output_path}")


def write_users_cache_sql(uuids, users, output_path):
    """Write 13_users_cache.sql with same data + role/status/debt fields."""
    lines = [
        "-- ============================================",
        "-- Service : iam-service",
        "-- Table   : users_cache",
        "-- File    : database/seeds/iam-service/13_users_cache.sql",
        "-- Depends : none",
        "-- Records : 1002",
        "-- ============================================",
        "SET session_replication_role = replica;",
        "BEGIN;",
        "  TRUNCATE TABLE users_cache CASCADE;",
        "",
        "INSERT INTO users_cache (user_id, email, full_name, phone, role_name, status, email_verified, has_outstanding_debt, arrears_amount) VALUES",
    ]

    # Admins
    lines.append(
        "  ('a0a0a0a0-0000-4000-8000-000000000001', 'admin01@evcharging.vn', 'Admin Quản Trị 1', '0899999901', 'admin', 'active', true, false, 0),"
    )
    lines.append(
        "  ('a0a0a0a0-0000-4000-8000-000000000002', 'admin02@evcharging.vn', 'Admin Quản Trị 2', '0899999902', 'admin', 'active', true, false, 0),"
    )

    # Determine which users have debt (first ~9% have debt, rest don't)
    debt_count = min(90, len(uuids))
    debt_indices = set(range(debt_count))

    for i, (uid, (full_name, email, phone, _)) in enumerate(zip(uuids, users)):
        comma = "," if i < len(uuids) - 1 else ";"
        has_debt = i in debt_indices
        arrears = (hashlib.md5(uid.encode()).digest()[0] * 1000 + 173) if has_debt else 0
        lines.append(
            f"  ('{uid}', '{email}', '{full_name}', '{phone}', 'user', 'active', true, {'true' if has_debt else 'false'}, {arrears}){comma}"
        )

    lines.extend(["", "", "COMMIT;", "SET session_replication_role = DEFAULT;", ""])

    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"Written {output_path}")


def write_user_read_models_sql(uuids, users, output_path):
    """Write 07_user_read_models.sql (first 500 users only)."""
    lines = [
        "-- ============================================",
        "-- Service : billing-service",
        "-- Table   : user_read_models",
        "-- File    : database/seeds/billing-service/07_user_read_models.sql",
        "-- Depends : users",
        "-- Records : 500",
        "-- ============================================",
        "SET session_replication_role = replica;",
        "BEGIN;",
        "  TRUNCATE TABLE user_read_models CASCADE;",
        "",
        "INSERT INTO user_read_models (user_id, email, full_name, is_active) VALUES",
    ]

    target = uuids[:500]
    for i, (uid, (full_name, email, _, _)) in enumerate(zip(target, users[:500])):
        comma = "," if i < len(target) - 1 else ";"
        lines.append(
            f"  ('{uid}', '{email}', '{full_name}', true){comma}"
        )

    lines.extend(["", "", "COMMIT;", "SET session_replication_role = DEFAULT;", ""])

    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"Written {output_path}")


def validate_emails(uuids, users):
    """Check for duplicate emails."""
    emails = set()
    for uid, (_, email, _, _) in zip(uuids, users):
        if email in emails:
            print(f"WARNING: Duplicate email {email} for {uid}")
        emails.add(email)
    print(f"Total unique emails: {len(emails)}")


def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))

    # Parse UUIDs from existing file
    existing_users_file = os.path.join(base_dir, "iam-service", "04_users.sql")
    uuids = parse_uuids(existing_users_file)
    print(f"Parsed {len(uuids)} user UUIDs")

    # Generate new user data
    users = generate_user_data(uuids)
    print(f"Generated {len(users)} user records")

    # Validate
    validate_emails(uuids, users)

    # Write output files
    write_users_sql(uuids, users,
        os.path.join(base_dir, "iam-service", "04_users.sql"))

    write_users_cache_sql(uuids, users,
        os.path.join(base_dir, "iam-service", "13_users_cache.sql"))

    write_user_read_models_sql(uuids, users,
        os.path.join(base_dir, "billing-service", "07_user_read_models.sql"))

    print("\nDone!")


if __name__ == "__main__":
    main()
