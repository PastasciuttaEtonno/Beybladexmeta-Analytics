"""Mints a development session cookie, the way express-session would.

Inserts a row into the `session` table and prints the signed `connect.sid`
cookie for it, so authenticated endpoints can be exercised from the command line
without going through the login form (which needs reCAPTCHA).

    python tools/dev_session.py                 # first admin user
    python tools/dev_session.py --email a@b.c    # a specific user

Local development only: it needs SESSION_SECRET, and it writes a real session.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import secrets
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
def _env_file() -> Path:
    """Prefer backend-py/.env, fall back to backend/.env.

    Both hold the same values; backend/ is the Express application that is on
    its way out, so this stops pointing at it first and keeps working either
    way while both exist.
    """
    for candidate in (ROOT / "backend-py" / ".env", ROOT / "backend" / ".env"):
        if candidate.exists():
            return candidate
    return ROOT / "backend-py" / ".env"


ENV_FILE = _env_file()
DEFAULT_CONTAINER = "beyblade-dev-db"


def read_env() -> dict[str, str]:
    values: dict[str, str] = {}
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip()
    return values


def psql(container: str, sql: str) -> str:
    result = subprocess.run(
        ["docker", "exec", container, "psql", "-U", "postgres",
         "-d", "beyblade_tracker", "-t", "-A", "-c", sql],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", help="user to sign in as (default: the first admin)")
    parser.add_argument("--container", default=DEFAULT_CONTAINER)
    parser.add_argument("--days", type=int, default=7)
    args = parser.parse_args()

    secret = read_env().get("SESSION_SECRET")
    if not secret:
        print(f"SESSION_SECRET is not set in {ENV_FILE}", file=sys.stderr)
        return 1

    where = f"email = '{args.email}'" if args.email else "is_admin = true"
    row = psql(args.container, f"SELECT id, email FROM users WHERE {where} LIMIT 1")
    if not row:
        print("No matching user", file=sys.stderr)
        return 1
    user_id, email = row.split("|")

    sid = base64.urlsafe_b64encode(secrets.token_bytes(18)).decode().rstrip("=")
    expires = datetime.now(timezone.utc) + timedelta(days=args.days)
    session = {
        "cookie": {
            "originalMaxAge": args.days * 86400 * 1000,
            "expires": expires.isoformat().replace("+00:00", "Z"),
            "secure": False,
            "httpOnly": True,
            "path": "/",
            "sameSite": "lax",
        },
        "userId": user_id,
    }
    psql(
        args.container,
        "INSERT INTO session (sid, sess, expire) VALUES "
        f"('{sid}', '{json.dumps(session)}'::jsonb, '{expires:%Y-%m-%d %H:%M:%S}')",
    )

    digest = hmac.new(secret.encode(), sid.encode(), hashlib.sha256).digest()
    signature = base64.b64encode(digest).decode().rstrip("=")

    print(f"# signed in as {email} ({user_id})")
    print("connect.sid=" + quote(f"s:{sid}.{signature}", safe=""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
