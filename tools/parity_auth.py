"""Checks that a login on one backend is a login on the other.

The strangler routes /api/auth/login to one backend and plenty of authenticated
routes to the other, so a session minted by either has to be accepted by both.
That cannot be verified by comparing responses: the whole point is what happens
when the cookie from one is presented to the other.

It also covers the rejections, which share the `login_attempts` table — a caller
must not be able to dodge the rate limit by being routed to the other backend.

The test account is created here with a known password and removed afterwards.

    python tools/parity_auth.py
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import urllib.error
import urllib.request
from typing import Any

CONTAINER = "beyblade-dev-db"
DATABASE = "beyblade_tracker"
TEST_EMAIL = "parity-auth-probe@example.com"
TEST_PASSWORD = "parity-probe-password"

failures = 0
checks = 0


def psql(sql: str) -> str:
    result = subprocess.run(
        ["docker", "exec", CONTAINER, "psql", "-U", "postgres", "-d", DATABASE,
         "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    if result.returncode != 0:
        raise SystemExit(f"psql failed:\n{result.stderr.strip()}")
    return result.stdout.strip()


def call(base: str, method: str, path: str, cookie: str | None = None,
         body: Any = None) -> tuple[int, Any, str | None]:
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(base.rstrip("/") + path, data=data, method=method)
    if cookie:
        request.add_header("Cookie", cookie)
    if data:
        request.add_header("Content-Type", "application/json")

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            status, raw, headers = response.status, response.read(), response.headers
    except urllib.error.HTTPError as exc:
        status, raw, headers = exc.code, exc.read(), exc.headers
    except Exception as exc:
        return 0, f"request failed: {exc}", None

    set_cookie = headers.get("Set-Cookie") if headers else None
    session_cookie = None
    if set_cookie and "connect.sid=" in set_cookie:
        session_cookie = "connect.sid=" + set_cookie.split("connect.sid=", 1)[1].split(";", 1)[0]

    text_body = raw.decode("utf-8", "replace")
    try:
        return status, json.loads(text_body), session_cookie
    except json.JSONDecodeError:
        return status, text_body, session_cookie


def check(label: str, condition: bool, detail: str = "") -> None:
    global failures, checks
    checks += 1
    if condition:
        print(f"ok    {label}")
    else:
        print(f"FAIL  {label}\n      {detail}")
        failures += 1


def make_user(verified: bool) -> None:
    import bcrypt

    hashed = bcrypt.hashpw(TEST_PASSWORD.encode(), bcrypt.gensalt(rounds=10)).decode()
    psql(f"DELETE FROM users WHERE email = '{TEST_EMAIL}';")
    psql(
        "INSERT INTO users (email, password_hash, display_name, is_verified) "
        f"VALUES ('{TEST_EMAIL}', '{hashed}', 'Parity Probe', {str(verified).lower()});"
    )


def cleanup() -> None:
    psql(f"DELETE FROM session WHERE sess->>'userId' IN "
         f"(SELECT id FROM users WHERE email = '{TEST_EMAIL}');")
    psql(f"DELETE FROM login_attempts WHERE email = '{TEST_EMAIL}';")
    psql(f"DELETE FROM users WHERE email = '{TEST_EMAIL}';")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--express", default="http://127.0.0.1:5000")
    parser.add_argument("--fastapi", default="http://127.0.0.1:8000")
    args = parser.parse_args()

    backends = {"express": args.express, "fastapi": args.fastapi}
    credentials = {"email": TEST_EMAIL, "password": TEST_PASSWORD}

    try:
        print("--- a session from either backend works on both ---")
        for minted_on, base in backends.items():
            make_user(verified=True)
            psql(f"DELETE FROM login_attempts WHERE email = '{TEST_EMAIL}';")

            status, body, cookie = call(base, "POST", "/api/auth/login", body=credentials)
            check(f"login on {minted_on}", status == 200 and cookie is not None,
                  f"status {status}, body {body}, cookie {cookie}")
            if not cookie:
                continue

            for used_on, other in backends.items():
                status, body, _ = call(other, "GET", "/api/auth/me", cookie)
                ok = status == 200 and body.get("user", {}).get("email") == TEST_EMAIL
                check(f"  session from {minted_on} accepted by {used_on}", ok,
                      f"status {status}, body {str(body)[:120]}")

            # Logging out on ONE backend must end the session everywhere.
            logout_on = "fastapi" if minted_on == "express" else "express"
            call(backends[logout_on], "POST", "/api/auth/logout", cookie)
            statuses = {
                name: call(url, "GET", "/api/auth/me", cookie)[0]
                for name, url in backends.items()
            }
            check(f"  logout on {logout_on} ends it for both",
                  all(s == 401 for s in statuses.values()), str(statuses))

        print("\n--- rejections must match ---")
        make_user(verified=True)
        psql(f"DELETE FROM login_attempts WHERE email = '{TEST_EMAIL}';")
        results = {
            name: call(url, "POST", "/api/auth/login",
                       body={"email": TEST_EMAIL, "password": "definitely-not-it"})[:2]
            for name, url in backends.items()
        }
        check("wrong password", results["express"] == results["fastapi"], str(results))

        make_user(verified=False)
        psql(f"DELETE FROM login_attempts WHERE email = '{TEST_EMAIL}';")
        results = {
            name: call(url, "POST", "/api/auth/login", body=credentials)[:2]
            for name, url in backends.items()
        }
        check("unverified account", results["express"] == results["fastapi"], str(results))

        make_user(verified=True)
        psql(f"DELETE FROM login_attempts WHERE email = '{TEST_EMAIL}';")
        results = {
            name: call(url, "POST", "/api/auth/login", body={"email": "not-an-email"})[:2]
            for name, url in backends.items()
        }
        check("malformed body", results["express"] == results["fastapi"], str(results))

        print("\n--- the rate limit is shared, not per backend ---")
        make_user(verified=True)
        psql(f"DELETE FROM login_attempts WHERE email = '{TEST_EMAIL}';")
        # Five failures spread across BOTH backends: if the limit were per
        # process, alternating would never trip it.
        # The wrong password still has to satisfy the schema (8+ characters),
        # otherwise the request is rejected as malformed and never counted.
        for index in range(5):
            base = args.express if index % 2 == 0 else args.fastapi
            call(base, "POST", "/api/auth/login",
                 body={"email": TEST_EMAIL, "password": "wrong-but-long-enough"})

        statuses = {
            name: call(url, "POST", "/api/auth/login", body=credentials)[0]
            for name, url in backends.items()
        }
        check("alternating failures block on both", all(s == 429 for s in statuses.values()),
              f"{statuses} (a correct password should still be refused while blocked)")
    finally:
        cleanup()
        print("\n(test account removed)")

    print()
    if failures:
        print(f"{failures} of {checks} checks failed")
        return 1
    print(f"all {checks} checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
