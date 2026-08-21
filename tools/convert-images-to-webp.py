# /// script
# requires-python = ">=3.12"
# dependencies = ["pillow>=11", "boto3>=1.35"]
# ///
"""Adds a WebP version of every component image that only exists as PNG.

The frontend asks for `<name>.webp` first and falls back to `<name>.png`
(BeybladeImage.tsx). Ratchets and bits are stored as WebP, but the blades were
uploaded as PNG only — so every blade costs three failed requests before the
fallback, and then downloads roughly a megabyte instead of forty kilobytes.

This walks the bucket, converts each PNG that has no WebP sibling, and uploads
the result next to it. Nothing is deleted: the PNGs stay as the fallback, so the
change is additive and safe to repeat.

    uv run tools/convert-images-to-webp.py              # report only
    uv run tools/convert-images-to-webp.py --apply      # actually upload

Credentials are read from backend/.env (S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY).
"""

from __future__ import annotations

import argparse
import io as _io
import sys
from pathlib import Path

import boto3
from botocore.config import Config
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / "backend" / ".env"
BUCKET = "beyblades"

# WebP quality. 82 is visually indistinguishable for these renders and lands
# close to the size of the WebP files already in the bucket.
QUALITY = 82


def read_env() -> dict[str, str]:
    values: dict[str, str] = {}
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip()
    return values


def client(env: dict[str, str]):
    endpoint = env.get("S3_ENDPOINT")
    if not endpoint:
        sys.exit("S3_ENDPOINT is not set in backend/.env")
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=env.get("S3_ACCESS_KEY"),
        aws_secret_access_key=env.get("S3_SECRET_KEY"),
        # Garage speaks path-style addressing, like MinIO before it.
        config=Config(s3={"addressing_style": "path"}, retries={"max_attempts": 3}),
        region_name="garage",
    )


def list_all_keys(s3) -> list[tuple[str, int]]:
    keys: list[tuple[str, int]] = []
    token = None
    while True:
        kwargs = {"Bucket": BUCKET, "MaxKeys": 1000}
        if token:
            kwargs["ContinuationToken"] = token
        page = s3.list_objects_v2(**kwargs)
        for item in page.get("Contents", []):
            keys.append((item["Key"], item["Size"]))
        if not page.get("IsTruncated"):
            return keys
        token = page.get("NextContinuationToken")


def to_webp(data: bytes) -> bytes:
    image = Image.open(_io.BytesIO(data))
    # Keep transparency: these are cut-out renders on a transparent background.
    if image.mode not in ("RGBA", "RGB"):
        image = image.convert("RGBA")
    buffer = _io.BytesIO()
    image.save(buffer, format="WEBP", quality=QUALITY, method=6)
    return buffer.getvalue()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="upload; otherwise just report")
    parser.add_argument("--prefix", default="", help="limit to one folder, e.g. blades/")
    args = parser.parse_args()

    s3 = client(read_env())

    print(f"Reading {BUCKET} …")
    everything = list_all_keys(s3)
    sizes = dict(everything)
    existing_webp = {k.rsplit(".", 1)[0] for k, _ in everything if k.lower().endswith(".webp")}

    pngs = [
        (k, size)
        for k, size in everything
        if k.lower().endswith(".png")
        and k.rsplit(".", 1)[0] not in existing_webp
        and k.startswith(args.prefix)
    ]

    if not pngs:
        print("Every PNG already has a WebP sibling — nothing to do.")
        return 0

    by_folder: dict[str, int] = {}
    for key, _ in pngs:
        by_folder[key.split("/")[0] if "/" in key else "(root)"] = (
            by_folder.get(key.split("/")[0] if "/" in key else "(root)", 0) + 1
        )

    print(f"\n{len(pngs)} image(s) without a WebP version:")
    for folder, count in sorted(by_folder.items()):
        print(f"  {folder}: {count}")

    if not args.apply:
        print("\nDry run. Re-run with --apply to convert and upload.")
        print("A sample of what would be created:")
        for key, size in pngs[:5]:
            print(f"  {key}  ({size / 1024:.0f} KB) -> {key.rsplit('.', 1)[0]}.webp")
        return 0

    print()
    before = after = 0
    failures = 0

    for index, (key, size) in enumerate(pngs, start=1):
        target = key.rsplit(".", 1)[0] + ".webp"
        try:
            data = s3.get_object(Bucket=BUCKET, Key=key)["Body"].read()
            converted = to_webp(data)
            s3.put_object(
                Bucket=BUCKET,
                Key=target,
                Body=converted,
                ContentType="image/webp",
                # Hashed names are not in use here, so keep it modest.
                CacheControl="public, max-age=604800",
            )
            before += len(data)
            after += len(converted)
            saved = 100 * (1 - len(converted) / len(data))
            print(
                f"[{index}/{len(pngs)}] {target}  "
                f"{len(data) / 1024:.0f} KB -> {len(converted) / 1024:.0f} KB  (-{saved:.0f}%)"
            )
        except Exception as exc:
            failures += 1
            print(f"[{index}/{len(pngs)}] FAILED {key}: {exc}")

    print()
    if before:
        print(
            f"Converted {len(pngs) - failures} image(s): "
            f"{before / 1024 / 1024:.1f} MB -> {after / 1024 / 1024:.1f} MB "
            f"({100 * (1 - after / before):.0f}% smaller)"
        )
    if failures:
        print(f"{failures} failed")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
