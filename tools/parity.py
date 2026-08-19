"""Compares the Express and FastAPI backends route by route.

The strangler is only safe if the new backend is indistinguishable from the old
one, so before switching any route over, run this against both services pointed
at the SAME database:

    python tools/parity.py --express http://localhost:5000 --fastapi http://localhost:8000

Exit code is non-zero if any route disagrees, so it can gate a deploy.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROUTES_FILE = Path(__file__).resolve().parent.parent / "strangler-routes.json"


def fetch(base: str, path: str, cookie: str | None) -> tuple[int, Any, str]:
    request = urllib.request.Request(base.rstrip("/") + path)
    if cookie:
        request.add_header("Cookie", cookie)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            status, body = response.status, response.read()
    except urllib.error.HTTPError as exc:
        status, body = exc.code, exc.read()
    except Exception as exc:
        return 0, None, f"request failed: {exc}"

    text = body.decode("utf-8", "replace")
    try:
        return status, json.loads(text), ""
    except json.JSONDecodeError:
        # Not every route is JSON (sitemap.xml, OG images); compare raw text.
        return status, text, ""


def describe_difference(left: Any, right: Any, trail: str = "") -> str | None:
    """First concrete difference between two decoded responses, or None."""
    if type(left) is not type(right):
        return f"{trail or 'root'}: type {type(left).__name__} vs {type(right).__name__}"

    if isinstance(left, dict):
        for key in sorted(set(left) | set(right)):
            if key not in left:
                return f"{trail}.{key}: missing from express"
            if key not in right:
                return f"{trail}.{key}: missing from fastapi"
            found = describe_difference(left[key], right[key], f"{trail}.{key}")
            if found:
                return found
        return None

    if isinstance(left, list):
        if len(left) != len(right):
            return f"{trail or 'root'}: length {len(left)} vs {len(right)}"
        for index, (a, b) in enumerate(zip(left, right)):
            found = describe_difference(a, b, f"{trail}[{index}]")
            if found:
                return found
        return None

    if left != right:
        return f"{trail or 'root'}: {left!r} vs {right!r}"
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--express", default="http://localhost:5000")
    parser.add_argument("--fastapi", default="http://localhost:8000")
    parser.add_argument(
        "--cookie",
        help="connect.sid cookie, to also compare routes that need a session",
    )
    args = parser.parse_args()

    config = json.loads(ROUTES_FILE.read_text(encoding="utf-8"))

    urls: list[str] = []
    for route in config["migrated"]:
        urls.append(route["path"])
        urls.extend(route.get("samples", []))

    failures = 0
    for url in urls:
        express_status, express_body, express_error = fetch(args.express, url, args.cookie)
        fastapi_status, fastapi_body, fastapi_error = fetch(args.fastapi, url, args.cookie)

        if express_error or fastapi_error:
            print(f"FAIL  {url}\n      {express_error or fastapi_error}")
            failures += 1
            continue

        if express_status != fastapi_status:
            print(f"FAIL  {url}\n      status {express_status} (express) vs {fastapi_status} (fastapi)")
            failures += 1
            continue

        difference = describe_difference(express_body, fastapi_body)
        if difference:
            print(f"FAIL  {url}\n      {difference}")
            failures += 1
            continue

        print(f"ok    {url}  [{express_status}]")

    print()
    if failures:
        print(f"{failures} of {len(urls)} routes differ")
        return 1
    print(f"all {len(urls)} routes identical")
    return 0


if __name__ == "__main__":
    sys.exit(main())
