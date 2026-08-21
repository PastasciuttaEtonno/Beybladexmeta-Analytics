"""Bulk-loads scraped Challonge tournaments through the admin import endpoint.

The scraper in ../script_challonge_test writes one JSON per tournament, in
exactly the shape POST /api/admin/import-tournament expects. Nothing had ever
loaded them: challonge_match_results was empty in production while a month and
a half of scraped results sat on disk.

    python tools/import_challonge_json.py --dir ../script_challonge_test/json \\
        --cookie "$(python tools/dev_session.py | tail -1)"

It reports first and imports second. Nothing is sent until --apply is passed,
because a bad scrape is easier to notice in a list than to unpick from the
database afterwards.

Three things are refused rather than sent, all of which the scraper produces:

  * files missing total_players or standings — the endpoint rejects them with a
    400 anyway, so sending them only produces noise;
  * a start_date that is not a date. Some files carry "Inizio" or "Sconosciuto",
    the table header and a placeholder scraped instead of the value. The import
    stores `data` verbatim and would accept them, but the season a tournament
    belongs to is derived from that field later, so a placeholder becomes a
    wrong season rather than an obvious error. Pass --allow-bad-dates to send
    them anyway once you have decided that is what you want;
  * an id that is a URL sub-page rather than a tournament. The scraper reads
    the last path segment, which is right for challonge.com/it/yqof4j2q and
    wrong for a vanity URL like .../HydraCore_Tappa1_Lega_IBNA/standings — that
    yields "standings", and two such files would overwrite each other under the
    same key. --allow-bad-ids sends them regardless.

Each import triggers a full regional recalculation twice server-side, so a
large batch is slow by design. Timings are printed per file.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from pathlib import Path
from typing import Any

REQUIRED = ("id", "tournament_name", "start_date", "total_players", "standings")
ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}")

# The scraper takes the id from the last segment of the tournament URL. That is
# right for challonge.com/it/yqof4j2q, and wrong for a vanity URL ending in a
# sub-page: challonge.com/it/HydraCore_Tappa1_Lega_IBNA/standings yields
# "standings". Two such files would then share an id and overwrite each other.
URL_SUFFIXES = {"standings", "matches", "participants", "log", "module", "groups"}


def load(folder: Path) -> list[tuple[Path, Any]]:
    found = []
    for path in sorted(folder.rglob("*.json")):
        try:
            found.append((path, json.loads(path.read_text(encoding="utf-8"))))
        except Exception as exc:
            found.append((path, exc))
    return found


def classify(entries: list[tuple[Path, Any]]) -> dict[str, list]:
    out: dict[str, list] = {"ready": [], "incomplete": [], "bad_date": [],
                            "bad_id": [], "unreadable": []}
    for path, payload in entries:
        if isinstance(payload, Exception) or not isinstance(payload, dict):
            out["unreadable"].append((path, str(payload)[:60]))
            continue
        missing = [k for k in REQUIRED if not payload.get(k)]
        if missing:
            out["incomplete"].append((path, payload, missing))
        elif str(payload["id"]).lower() in URL_SUFFIXES:
            out["bad_id"].append((path, payload, str(payload["id"])))
        elif not ISO_DATE.match(str(payload["start_date"])):
            out["bad_date"].append((path, payload, str(payload["start_date"])))
        else:
            out["ready"].append((path, payload, None))
    return out


def post(base: str, cookie: str, payload: dict, timeout: int) -> tuple[int, Any]:
    request = urllib.request.Request(
        base.rstrip("/") + "/api/admin/import-tournament",
        data=json.dumps(payload).encode(),
        method="POST",
    )
    request.add_header("Content-Type", "application/json")
    request.add_header("Cookie", cookie)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read()
            status = response.status
    except urllib.error.HTTPError as exc:
        body, status = exc.read(), exc.code
    except Exception as exc:
        return 0, f"request failed: {exc}"
    text = body.decode("utf-8", "replace")
    try:
        return status, json.loads(text)
    except json.JSONDecodeError:
        return status, text[:200]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dir", required=True, help="folder of scraped JSON, searched recursively")
    parser.add_argument("--base", default="http://127.0.0.1:8000")
    parser.add_argument("--cookie", help="connect.sid of an admin session; required with --apply")
    parser.add_argument("--apply", action="store_true", help="actually send them")
    parser.add_argument("--allow-bad-dates", action="store_true")
    parser.add_argument("--allow-bad-ids", action="store_true",
                        help="send files whose id is a URL sub-page anyway; they will "
                             "collide with each other")
    parser.add_argument("--only", action="append", metavar="ID",
                        help="import just this tournament id; repeatable. Useful "
                             "after fixing one scraped file, so the rest are not "
                             "re-sent and the server does not redo a full "
                             "recalculation per tournament.")
    parser.add_argument("--timeout", type=int, default=300)
    args = parser.parse_args()

    folder = Path(args.dir).expanduser()
    if not folder.is_dir():
        sys.exit(f"Not a folder: {folder}")

    groups = classify(load(folder))
    ready = groups["ready"]
    if args.allow_bad_dates:
        ready += groups["bad_date"]
    if args.allow_bad_ids:
        ready += groups["bad_id"]

    print(f"{folder}\n")
    print(f"  ready       {len(groups['ready'])}")
    print(f"  bad date    {len(groups['bad_date'])}"
          + ("  (included: --allow-bad-dates)" if args.allow_bad_dates else "  (skipped)"))
    print(f"  bad id      {len(groups['bad_id'])}  (skipped; see below)")
    print(f"  incomplete  {len(groups['incomplete'])}  (skipped; the endpoint rejects these)")
    print(f"  unreadable  {len(groups['unreadable'])}")

    for path, payload, value in groups["bad_id"]:
        print(f"     id {value!r} is a URL sub-page, not a tournament id — "
              f"{str(payload['tournament_name'])[:40]}")
        print(f"        {path.name[:64]}")
        print("        the real id is the segment before it in the tournament URL; "
              "fix the JSON and re-run.")
    for path, _, value in groups["bad_date"]:
        print(f"     bad date {value!r:16} {path.name[:60]}")
    for path, _, missing in groups["incomplete"]:
        print(f"     missing {','.join(missing):28} {path.name[:52]}")
    for path, why in groups["unreadable"]:
        print(f"     unreadable {path.name[:44]}: {why}")

    # One tournament scraped twice under two filenames overwrites itself. Worth
    # naming, because the second import silently replaces the first.
    seen: dict[str, list[str]] = defaultdict(list)
    for path, payload, _ in ready:
        seen[payload["id"]].append(path.name)
    duplicates = {k: v for k, v in seen.items() if len(v) > 1}
    if duplicates:
        print("\n  the same tournament id appears more than once — the last one wins:")
        for tid, names in duplicates.items():
            print(f"     {tid}: {', '.join(n[:44] for n in names)}")

    if args.only:
        wanted = set(args.only)
        ready = [r for r in ready if r[1]["id"] in wanted]
        unknown = wanted - {r[1]["id"] for r in ready}
        print()
        if unknown:
            print("  --only matched nothing for: " + ", ".join(sorted(unknown)))
        print(f"  --only: narrowed to {len(ready)} of them")

    standings = sum(len(p["standings"]) for _, p, _ in ready)
    print(f"\n  {len(ready)} tournaments, {standings} standings rows would be sent to {args.base}")

    if not args.apply:
        print("\n  Nothing sent. Re-run with --apply to import.")
        return 0
    if not args.cookie:
        sys.exit("--apply needs --cookie (an admin session).")

    print("\n--- importing ---")
    failures = []
    started = time.perf_counter()
    for index, (path, payload, _) in enumerate(ready, start=1):
        began = time.perf_counter()
        status, body = post(args.base, args.cookie, payload, args.timeout)
        elapsed = time.perf_counter() - began
        good = status == 200 and isinstance(body, dict) and body.get("success")
        mark = "ok  " if good else "FAIL"
        print(f"  {mark} [{index:>2}/{len(ready)}] {elapsed:5.1f}s  {payload['id']:<12} "
              f"{str(payload['tournament_name'])[:44]}")
        if not good:
            print(f"       status {status}: {body}")
            failures.append((path.name, status, body))

    total = time.perf_counter() - started
    print(f"\n  {len(ready) - len(failures)}/{len(ready)} imported in {total:.0f}s")
    if failures:
        print(f"  {len(failures)} failed:")
        for name, status, body in failures:
            print(f"     {name[:52]}  [{status}] {body}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
