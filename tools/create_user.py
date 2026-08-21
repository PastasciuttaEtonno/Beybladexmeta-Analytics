"""Creates an account directly, skipping registration.

Ported from backend/src/create-user.ts, which went away with the Express
backend. Registration through the API needs a captcha and an emailed
verification link, so this stays the way to make the first admin — or any
account — on a fresh database.

    python tools/create_user.py --email a@b.c --password '...' --name 'Jane' --admin

The account is created already verified, because nobody is going to click a
confirmation link for it. bcrypt at cost 10, matching what the login path
expects.
"""

from __future__ import annotations

import argparse
import getpass
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BCRYPT_ROUNDS = 10


def _env_file() -> Path:
    for candidate in (ROOT / "backend-py" / ".env", ROOT / "backend" / ".env"):
        if candidate.exists():
            return candidate
    return ROOT / "backend-py" / ".env"


def _database_url() -> str:
    env = _env_file()
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("DATABASE_URL="):
                url = line.split("=", 1)[1].strip().strip('"').strip("'")
                return url.replace("postgresql+asyncpg://", "postgresql://")
    sys.exit(f"DATABASE_URL is not set in {env}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True, help="display name")
    parser.add_argument("--password", help="prompted for if omitted, which keeps it out of your shell history")
    parser.add_argument("--admin", action="store_true")
    parser.add_argument("--url", help="override the DATABASE_URL from the .env file")
    args = parser.parse_args()

    password = args.password or getpass.getpass("Password: ")
    if len(password) < 8:
        sys.exit("The password must be at least 8 characters; the login schema rejects shorter ones.")

    try:
        import bcrypt
        import psycopg
    except ImportError as exc:
        sys.exit(f"Missing dependency ({exc.name}). Run: uv pip install psycopg[binary] bcrypt")

    url = args.url or _database_url()
    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=BCRYPT_ROUNDS)).decode()

    with psycopg.connect(url) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1 FROM users WHERE email = %s", (args.email,))
            if cursor.fetchone():
                sys.exit(f"A user with email {args.email} already exists.")

            cursor.execute(
                "INSERT INTO users (email, password_hash, display_name, photo_url, "
                "is_admin, is_verified) VALUES (%s, %s, %s, NULL, %s, true) "
                "RETURNING id, email, display_name, is_admin",
                (args.email, hashed, args.name, args.admin),
            )
            user_id, email, name, is_admin = cursor.fetchone()
        connection.commit()

    print("\nUser created.")
    print(f"  id      {user_id}")
    print(f"  email   {email}")
    print(f"  name    {name}")
    print(f"  admin   {'yes' if is_admin else 'no'}")
    print("  verified, so it can sign in immediately.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
