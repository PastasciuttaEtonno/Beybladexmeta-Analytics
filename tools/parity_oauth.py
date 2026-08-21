"""Compares the four OAuth redirect routes, which parity.py cannot check.

`tools/parity.py` follows redirects and diffs JSON bodies. These routes have no
body, and following the first one would leave the machine for challengermode.com,
so they are marked `_skip_parity` in strangler-routes.json and checked here
instead.

What has to match is not a payload but the handshake:

  * the status and the redirect target, with the random state and PKCE
    challenge masked — they differ on every call by design;
  * the authorize URL's parameters, which is what the provider validates;
  * whether a session cookie comes back, and which keys the session row ends up
    holding, since the CSRF state and the PKCE verifier are stored there and a
    callback that cannot find them refuses the login.

Only the parts of the flow that stop before contacting the provider are
exercised: a real code exchange needs a browser and a live consent screen. The
refusals below are exactly the paths an attacker would take, so they are the
ones worth pinning.

    python tools/parity_oauth.py
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

CONTAINER = "beyblade-dev-db"
DATABASE = "beyblade_tracker"

# Masked before comparison: fresh on every request, and unequal by design.
RANDOM_PARAMS = ("state", "code_challenge")

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


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """The point is the redirect itself, so it must not be followed."""

    def redirect_request(self, *args, **kwargs):
        return None


def fetch(base: str, path: str) -> tuple[int, str, str | None]:
    opener = urllib.request.build_opener(NoRedirect)
    try:
        with opener.open(base.rstrip("/") + path, timeout=30) as response:
            headers, status = response.headers, response.status
    except urllib.error.HTTPError as exc:
        headers, status = exc.headers, exc.code

    location = headers.get("Location") or ""
    set_cookie = headers.get("Set-Cookie") or ""
    sid = None
    if "connect.sid=" in set_cookie:
        raw = set_cookie.split("connect.sid=", 1)[1].split(";", 1)[0]
        value = urllib.parse.unquote(raw)
        if value.startswith("s:"):
            sid = value[2:].rsplit(".", 1)[0]
    return status, location, sid


def normalise(location: str, backend_port: str) -> str:
    """Mask the random parameters and the port each backend happens to listen on.

    The redirect_uri is derived from the Host header, so locally it names the
    backend's own port. Behind nginx both receive the same forwarded host and
    produce the same value; the difference here is the test setup, not the code.
    """
    masked = location
    for param in RANDOM_PARAMS:
        masked = re.sub(rf"(?<=[?&]){param}=[^&]*", f"{param}=<random>", masked)
    return masked.replace(urllib.parse.quote(f":{backend_port}", safe=""), "%3A<port>")


def session_keys(sid: str | None) -> list[str]:
    if not sid:
        return []
    raw = psql(
        "SELECT string_agg(k, ',' ORDER BY k) FROM session, "
        f"jsonb_object_keys(sess) AS k WHERE sid = '{sid}';"
    )
    return sorted(raw.split(",")) if raw else []


def check(label: str, left, right, detail: str = "") -> None:
    global failures, checks
    checks += 1
    if left == right:
        print(f"ok    {label}")
    else:
        print(f"FAIL  {label}\n      express: {left}\n      fastapi: {right}"
              + (f"\n      {detail}" if detail else ""))
        failures += 1


CASES = [
    ("/api/challenger/login", "starts the ChallengerMode handshake"),
    ("/api/challonge/login", "starts the Challonge handshake"),
    ("/api/challenger/callback", "ChallengerMode callback with nothing"),
    ("/api/challonge/callback", "Challonge callback with nothing"),
    ("/api/challenger/callback?code=x&state=forged", "ChallengerMode forged state"),
    ("/api/challonge/callback?code=x&state=forged", "Challonge forged state"),
    ("/api/challonge/callback?error=access_denied", "Challonge consent refused"),
    ("/api/challenger/callback?error=access_denied", "ChallengerMode consent refused"),
]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--express", default="http://127.0.0.1:5000")
    parser.add_argument("--fastapi", default="http://127.0.0.1:8000")
    args = parser.parse_args()

    ports = {
        args.express: urllib.parse.urlparse(args.express).port or 80,
        args.fastapi: urllib.parse.urlparse(args.fastapi).port or 80,
    }

    minted: list[str] = []
    try:
        for path, label in CASES:
            results = {}
            for name, base in (("express", args.express), ("fastapi", args.fastapi)):
                status, location, sid = fetch(base, path)
                if sid:
                    minted.append(sid)
                results[name] = (
                    status,
                    normalise(location, str(ports[base])),
                    sid is not None,
                    session_keys(sid),
                )

            express, fastapi = results["express"], results["fastapi"]
            check(f"{label}: status", express[0], fastapi[0])
            check(f"{label}: redirect", express[1], fastapi[1])
            check(f"{label}: session cookie", express[2], fastapi[2])
            check(f"{label}: session keys", express[3], fastapi[3])

        print("\n--- the authorize URLs carry the same parameters ---")
        for path, provider in (("/api/challenger/login", "challengermode.com"),
                               ("/api/challonge/login", "api.challonge.com")):
            sets = {}
            for name, base in (("express", args.express), ("fastapi", args.fastapi)):
                _, location, sid = fetch(base, path)
                if sid:
                    minted.append(sid)
                parsed = urllib.parse.urlparse(location)
                query = urllib.parse.parse_qs(parsed.query)
                sets[name] = (
                    parsed.netloc,
                    parsed.path,
                    sorted(query),
                    query.get("scope"),
                    query.get("response_type"),
                    query.get("code_challenge_method"),
                )
            check(f"{provider}: authorize request", sets["express"], sets["fastapi"])
    finally:
        # These probes create real, empty sessions on both backends.
        for sid in set(minted):
            psql(f"DELETE FROM session WHERE sid = '{sid}';")
        print(f"\n({len(set(minted))} probe sessions removed)")

    print()
    if failures:
        print(f"{failures} of {checks} checks failed")
        return 1
    print(f"all {checks} checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
