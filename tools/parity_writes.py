"""Parity checks for the endpoints that change data.

tools/parity.py cannot cover writes: calling both backends with the same request
would perform the effect twice. So each write is exercised on ONE backend and
verified by READING it back from the OTHER — which also proves the two share a
session and agree on what they wrote. Every object created here is deleted
again, in both directions.

    python tools/dev_session.py                       # get a cookie
    python tools/parity_writes.py --cookie 'connect.sid=...'

Rejections (bad payloads) mutate nothing, so those ARE sent to both backends and
compared directly.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from typing import Any

failures: list[str] = []
checks = 0


def call(base: str, method: str, path: str, cookie: str, body: Any = None) -> tuple[int, Any]:
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(base.rstrip("/") + path, data=data, method=method)
    request.add_header("Cookie", cookie)
    if data:
        request.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            status, raw = response.status, response.read()
    except urllib.error.HTTPError as exc:
        status, raw = exc.code, exc.read()

    text = raw.decode("utf-8", "replace")
    try:
        return status, json.loads(text)
    except json.JSONDecodeError:
        return status, text


def check(label: str, condition: bool, detail: str = "") -> None:
    global checks
    checks += 1
    if condition:
        print(f"ok    {label}")
    else:
        print(f"FAIL  {label}\n      {detail}")
        failures.append(label)


def pick_components(base: str, cookie: str) -> list[dict]:
    """Three combos made of real component names, with no part reused.

    A deck rejects any repeated part, so the three combos must be disjoint.
    """
    _, catalogue = call(base, "GET", "/api/components", cookie)
    blades = catalogue["blades"]
    ratchets = catalogue["ratchets"]
    bits = [b["name"] for b in catalogue["bits"]]

    if len(blades) < 3 or len(ratchets) < 3 or len(bits) < 3:
        raise SystemExit("Not enough components in the database to build a deck")

    return [
        {
            "blade": blades[i],
            "assistBlade": "None",
            "ratchet": ratchets[i],
            "bit": bits[i],
            "lockChip": "None",
        }
        for i in range(3)
    ]


def round_trip_combo(writer: str, reader: str, names: tuple[str, str], combo: dict, cookie: str) -> None:
    """Create on one backend, read from the other, delete from the other."""
    write_name, read_name = names

    status, created = call(writer, "POST", "/api/favorites/combos", cookie, combo)
    check(f"POST /api/favorites/combos on {write_name}", status == 200, f"status {status}: {created}")
    if status != 200:
        return

    combo_id = created["combo"]["id"]

    status, listing = call(reader, "GET", "/api/favorites/combos", cookie)
    found = next((c for c in listing.get("combos", []) if c["id"] == combo_id), None)
    check(
        f"combo written by {write_name} is visible to {read_name}",
        found is not None,
        f"id {combo_id} not in {read_name}'s listing",
    )
    if found is not None:
        check(
            f"{read_name} returns the same fields {write_name} wrote",
            found == created["combo"],
            f"{found} vs {created['combo']}",
        )

    status, _ = call(reader, "DELETE", f"/api/favorites/combos/{combo_id}", cookie)
    check(f"DELETE on {read_name} accepted", status == 200, f"status {status}")

    status, listing = call(writer, "GET", "/api/favorites/combos", cookie)
    gone = all(c["id"] != combo_id for c in listing.get("combos", []))
    check(f"deletion by {read_name} is visible to {write_name}", gone, f"id {combo_id} still present")


def round_trip_deck(writer: str, reader: str, names: tuple[str, str], combos: list[dict], cookie: str) -> None:
    write_name, read_name = names
    payload = {"name": f"parity deck via {write_name}", "combos": combos}

    status, created = call(writer, "POST", "/api/favorites/decks", cookie, payload)
    check(f"POST /api/favorites/decks on {write_name}", status == 200, f"status {status}: {created}")
    if status != 200:
        return

    deck_id = created["deck"]["id"]

    status, listing = call(reader, "GET", "/api/favorites/decks", cookie)
    found = next((d for d in listing.get("decks", []) if d["id"] == deck_id), None)
    check(
        f"deck written by {write_name} is visible to {read_name}",
        found is not None,
        f"id {deck_id} not in {read_name}'s listing",
    )
    if found is not None:
        check(
            f"{read_name} returns the same deck {write_name} wrote",
            found == created["deck"],
            f"{found} vs {created['deck']}",
        )

    status, _ = call(reader, "DELETE", f"/api/favorites/decks/{deck_id}", cookie)
    check(f"DELETE deck on {read_name} accepted", status == 200, f"status {status}")

    status, listing = call(writer, "GET", "/api/favorites/decks", cookie)
    gone = all(d["id"] != deck_id for d in listing.get("decks", []))
    check(f"deck deletion by {read_name} is visible to {write_name}", gone, f"id {deck_id} still present")


def compare_rejection(express: str, fastapi: str, method: str, path: str, body: Any, cookie: str, label: str) -> None:
    """Rejected requests change nothing, so both backends can be asked directly."""
    express_status, express_body = call(express, method, path, cookie, body)
    fastapi_status, fastapi_body = call(fastapi, method, path, cookie, body)
    check(
        label,
        express_status == fastapi_status and express_body == fastapi_body,
        f"express {express_status} {express_body}\n      fastapi {fastapi_status} {fastapi_body}",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    # 127.0.0.1, not "localhost". On Windows localhost resolves to ::1 first,
    # the backends listen on IPv4 only, and urllib waits ~2s per request before
    # falling back — which turns a 30-second run into several minutes.
    parser.add_argument("--express", default="http://127.0.0.1:5000")
    parser.add_argument("--fastapi", default="http://127.0.0.1:8000")
    parser.add_argument("--cookie", required=True, help="connect.sid=... from tools/dev_session.py")
    parser.add_argument(
        "--challonge-cookie",
        help="a second cookie for an account linked to Challonge; without it the alias checks are skipped",
    )
    args = parser.parse_args()

    express, fastapi, cookie = args.express, args.fastapi, args.cookie

    status, whoami = call(express, "GET", "/api/auth/me", cookie)
    if status != 200:
        print(f"The cookie is not valid on Express ({status}). Mint one with tools/dev_session.py.")
        return 1
    print(f"# signed in as {whoami['user']['email']}\n")

    combos = pick_components(express, cookie)

    print("--- favourite combos ---")
    round_trip_combo(fastapi, express, ("fastapi", "express"), combos[0], cookie)
    round_trip_combo(express, fastapi, ("express", "fastapi"), combos[0], cookie)

    print("\n--- favourite decks ---")
    round_trip_deck(fastapi, express, ("fastapi", "express"), combos, cookie)
    round_trip_deck(express, fastapi, ("express", "fastapi"), combos, cookie)

    print("\n--- rejections (no data changes, so both backends are asked) ---")
    compare_rejection(
        express, fastapi, "POST", "/api/favorites/combos",
        {"blade": "NoSuchBlade", "assistBlade": "None", "ratchet": "1-60", "bit": "Hexa", "lockChip": "None"},
        cookie, "POST combo with an unknown component",
    )
    compare_rejection(
        express, fastapi, "POST", "/api/favorites/combos",
        {"blade": "OnlyOneField"},
        cookie, "POST combo with a malformed body",
    )
    compare_rejection(
        express, fastapi, "POST", "/api/favorites/decks",
        {"combos": combos},
        cookie, "POST deck with no name",
    )
    compare_rejection(
        express, fastapi, "POST", "/api/favorites/decks",
        {"name": "two combos", "combos": combos[:2]},
        cookie, "POST deck with the wrong number of combos",
    )
    compare_rejection(
        express, fastapi, "POST", "/api/favorites/decks",
        {"name": "repeated parts", "combos": [combos[0], combos[0], combos[0]]},
        cookie, "POST deck reusing the same parts",
    )
    compare_rejection(
        express, fastapi, "POST", "/api/favorites/decks",
        {"name": "empty part", "combos": [{**combos[0], "blade": ""}, combos[1], combos[2]]},
        cookie, "POST deck with an empty component",
    )
    compare_rejection(
        express, fastapi, "DELETE", "/api/favorites/combos/00000000-0000-0000-0000-000000000000",
        None, cookie, "DELETE a combo that does not exist",
    )

    if args.challonge_cookie:
        print("\n--- aliases (needs an account linked to Challonge) ---")
        alias_cookie = args.challonge_cookie
        name = "parity-alias"

        # Clear any leftover from an interrupted run, on both backends.
        for base in (express, fastapi):
            _, existing = call(base, "GET", "/api/user/aliases", alias_cookie)
            for item in existing if isinstance(existing, list) else []:
                if item["alias"] == name:
                    call(base, "DELETE", f"/api/user/aliases/{item['id']}", alias_cookie)

        status, created = call(fastapi, "POST", "/api/user/aliases", alias_cookie, {"alias": name})
        check("POST /api/user/aliases on fastapi", status == 201, f"status {status}: {created}")

        if status == 201:
            alias_id = created["id"]

            status, listing = call(express, "GET", "/api/user/aliases", alias_cookie)
            mine = next((a for a in listing if a["id"] == alias_id), None)
            check("alias written by fastapi is visible to express", mine is not None, str(listing))
            if mine is not None:
                check("express returns the same alias fastapi wrote", mine == created, f"{mine} vs {created}")

            # Uniqueness is global, so the second claim must be refused by both.
            compare_rejection(
                express, fastapi, "POST", "/api/user/aliases",
                {"alias": name}, alias_cookie, "POST an alias that is already claimed",
            )

            status, _ = call(express, "DELETE", f"/api/user/aliases/{alias_id}", alias_cookie)
            check("DELETE alias on express accepted", status == 200, f"status {status}")

            status, listing = call(fastapi, "GET", "/api/user/aliases", alias_cookie)
            check(
                "alias deletion by express is visible to fastapi",
                all(a["id"] != alias_id for a in listing),
                str(listing),
            )

        compare_rejection(
            express, fastapi, "POST", "/api/user/aliases", {"alias": "   "},
            alias_cookie, "POST an empty alias",
        )
        compare_rejection(
            express, fastapi, "DELETE", "/api/user/aliases/not-a-number", None,
            alias_cookie, "DELETE an alias with a non-numeric id",
        )
        compare_rejection(
            express, fastapi, "DELETE", "/api/user/aliases/999999", None,
            alias_cookie, "DELETE an alias that does not exist",
        )

        # The admin account has no Challonge link, so it must be refused.
        compare_rejection(
            express, fastapi, "POST", "/api/user/aliases", {"alias": "should-be-refused"},
            cookie, "POST an alias without a linked Challonge account",
        )

    print("\n--- without a session ---")
    for path in ("/api/favorites/combos", "/api/favorites/decks", "/api/user/aliases"):
        express_status, express_body = call(express, "GET", path, "")
        fastapi_status, fastapi_body = call(fastapi, "GET", path, "")
        check(
            f"GET {path} anonymously",
            express_status == fastapi_status == 401 and express_body == fastapi_body,
            f"express {express_status} {express_body} / fastapi {fastapi_status} {fastapi_body}",
        )

    print()
    if failures:
        print(f"{len(failures)} of {checks} checks failed")
        return 1
    print(f"all {checks} checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
