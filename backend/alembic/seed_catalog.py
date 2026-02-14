from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import quote_plus

from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app import database
from app.models import CatalogItem

logger = logging.getLogger(__name__)

TRUE_VALUES = {"1", "true", "yes", "on"}


def _normalize_text(value: Any) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _non_negative_int(value: Any) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return 0
    return max(parsed, 0)


def _placeholder_logo(category_key: str, title: str) -> str:
    safe_text = quote_plus(title[:20])
    color = {
        "music": "0055ff",
        "movies": "d97706",
        "tv_shows": "9333ea",
        "hobbies": "0f766e",
    }.get(category_key, "4c1d95")
    return f"https://dummyimage.com/160x160/{color}/ffffff&text={safe_text}"


def _load_seed_payload(path: Path) -> Iterable[dict[str, Any]]:
    if path.suffix.lower() == ".jsonl":
        with path.open("r", encoding="utf-8") as handle:
            for raw_line in handle:
                line = raw_line.strip()
                if not line:
                    continue
                try:
                    payload = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(payload, dict):
                    yield payload
        return

    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise ValueError("Catalog seed file must be a JSON list or JSONL file")
    for item in payload:
        if isinstance(item, dict):
            yield item


def _normalize_entry(raw: dict[str, Any]) -> dict[str, Any] | None:
    category_key = _normalize_text(raw.get("category_key"))
    provider = _normalize_text(raw.get("provider")) or "local"
    provider_id = _normalize_text(raw.get("provider_id"))
    title = _normalize_text(raw.get("title"))
    if not category_key or not provider_id or not title:
        return None

    logo_url = _normalize_text(raw.get("logo_url"))
    if not logo_url:
        logo_url = _placeholder_logo(category_key, title)

    return {
        "category_key": category_key,
        "provider": provider,
        "provider_id": provider_id,
        "title": title,
        "subtitle": _normalize_text(raw.get("subtitle")),
        "logo_url": logo_url,
        "attribution": _normalize_text(raw.get("attribution")),
        "provider_url": _normalize_text(raw.get("provider_url")),
        "popularity_score": _non_negative_int(raw.get("popularity_score")),
    }


def _to_rows(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    now = datetime.now(timezone.utc)
    return [
        {
            "category_key": entry["category_key"],
            "provider": entry["provider"],
            "provider_id": entry["provider_id"],
            "title": entry["title"],
            "subtitle": entry.get("subtitle"),
            "logo_url": entry["logo_url"],
            "attribution": entry.get("attribution"),
            "provider_url": entry.get("provider_url"),
            "popularity_score": entry.get("popularity_score", 0),
            "created_at": now,
            "updated_at": now,
        }
        for entry in entries
    ]


def _rebuild_fts_index(db: Session) -> None:
    try:
        db.execute(text("INSERT INTO catalog_items_fts(catalog_items_fts) VALUES ('rebuild')"))
        db.commit()
        logger.info("Rebuilt catalog_items_fts index")
    except OperationalError as exc:
        db.rollback()
        if "no such table" in str(exc).lower():
            return
        raise


def _upsert_batch(db: Session, entries: list[dict[str, Any]]) -> None:
    rows = _to_rows(entries)
    stmt = sqlite_insert(CatalogItem).values(rows)
    db.execute(
        stmt.on_conflict_do_update(
            index_elements=["category_key", "provider", "provider_id"],
            set_={
                "title": stmt.excluded.title,
                "subtitle": stmt.excluded.subtitle,
                "logo_url": stmt.excluded.logo_url,
                "attribution": stmt.excluded.attribution,
                "provider_url": stmt.excluded.provider_url,
                "popularity_score": stmt.excluded.popularity_score,
                "updated_at": stmt.excluded.updated_at,
            },
        )
    )


def _seed_catalog_file(db: Session, seed_file: Path, batch_size: int, truncate_first: bool) -> tuple[int, int]:
    bind = db.get_bind()
    if bind.dialect.name != "sqlite":
        raise RuntimeError("Catalog seeding script currently supports only SQLite backends")

    if truncate_first:
        logger.info("Clearing existing catalog before seed")
        db.execute(text("DELETE FROM catalog_items"))
        db.commit()

    batch: list[dict[str, Any]] = []
    processed = 0
    skipped = 0
    for raw in _load_seed_payload(seed_file):
        entry = _normalize_entry(raw)
        if entry is None:
            skipped += 1
            continue
        batch.append(entry)
        if len(batch) >= batch_size:
            _upsert_batch(db, batch)
            db.commit()
            processed += len(batch)
            if processed % 50000 == 0:
                logger.info("Seed progress: %d records processed", processed)
            batch.clear()

    if batch:
        _upsert_batch(db, batch)
        db.commit()
        processed += len(batch)

    _rebuild_fts_index(db)

    return processed, skipped


def _env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in TRUE_VALUES


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Bulk seed catalog_items from JSON or JSONL file")
    parser.add_argument(
        "--file",
        default=os.getenv("CATALOG_SEED_FILE"),
        help="Path to catalog seed file (JSON list or JSONL)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=int(os.getenv("CATALOG_SEED_BATCH_SIZE", "5000")),
        help="Number of rows per upsert batch",
    )
    parser.add_argument(
        "--truncate",
        action="store_true",
        default=_env_flag("CATALOG_SEED_TRUNCATE", False),
        help="Delete existing catalog rows before seeding",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not args.file:
        raise ValueError("Provide a seed file via --file or CATALOG_SEED_FILE")
    seed_file = Path(args.file)
    if not seed_file.exists():
        raise FileNotFoundError(f"Catalog seed file not found: {seed_file}")
    if args.batch_size <= 0:
        raise ValueError("batch-size must be greater than zero")

    session_local = database.SessionLocal
    if session_local is None:
        raise RuntimeError("Database session is not configured")

    db = session_local()
    try:
        processed, skipped = _seed_catalog_file(db, seed_file=seed_file, batch_size=args.batch_size, truncate_first=args.truncate)
    finally:
        db.close()

    logger.info("Catalog seed complete: processed=%d skipped=%d file=%s", processed, skipped, seed_file)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
