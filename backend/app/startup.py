from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import quote_plus

from sqlalchemy.orm import Session
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app import database
from app.builtins import ensure_group_builtin_categories
from app.models import CatalogItem, Group

logger = logging.getLogger(__name__)

CATALOG_FILE_ENV = "CATALOG_SEED_FILE"
SKIP_SEED_ENV = "SKIP_CATALOG_SEED"


def _should_skip_seed() -> bool:
    return os.getenv(SKIP_SEED_ENV, "").lower() in {"1", "true", "yes", "on"}


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
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(entry, dict):
                    yield entry
        return

    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, list):
        for item in payload:
            if isinstance(item, dict):
                yield item


def _load_catalog_entries() -> list[dict[str, Any]]:
    configured_path = os.getenv(CATALOG_FILE_ENV)
    if not configured_path:
        logger.debug("Skipping catalog seed because %s is not set", CATALOG_FILE_ENV)
        return []

    path = Path(configured_path)
    if not path.exists():
        logger.debug("Catalog seed file %s not found", path)
        return []

    entries: list[dict[str, Any]] = []
    try:
        for raw in _load_seed_payload(path):
            category_key = _normalize_text(raw.get("category_key"))
            provider = _normalize_text(raw.get("provider")) or "local"
            provider_id = _normalize_text(raw.get("provider_id"))
            title = _normalize_text(raw.get("title"))
            if not category_key or not provider_id or not title:
                continue
            logo_url = _normalize_text(raw.get("logo_url"))
            if not logo_url:
                logo_url = _placeholder_logo(category_key, title)
            entry = {
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
            entries.append(entry)
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Failed to read catalog seed file %s: %s", path, exc)
        return []
    return entries


def _seed_catalog(session: Session) -> bool:
    entries = _load_catalog_entries()
    if not entries:
        return False

    bind = session.get_bind()
    if bind.dialect.name == "sqlite":
        batch_size = _non_negative_int(os.getenv("CATALOG_SEED_BATCH_SIZE")) or 5000
        upserted = 0
        for index in range(0, len(entries), batch_size):
            now = datetime.now(timezone.utc)
            batch = entries[index : index + batch_size]
            rows = [
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
                for entry in batch
            ]
            stmt = sqlite_insert(CatalogItem).values(rows)
            session.execute(
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
            upserted += len(rows)

        logger.info("Catalog seed applied via batch upsert: %d rows", upserted)
        return True

    inserted = 0
    updated = 0
    for entry in entries:
        existing = (
            session.query(CatalogItem)
            .filter(
                CatalogItem.category_key == entry["category_key"],
                CatalogItem.provider == entry["provider"],
                CatalogItem.provider_id == entry["provider_id"],
            )
            .first()
        )
        if existing:
            changed = False
            for field in ("title", "subtitle", "logo_url", "attribution", "provider_url", "popularity_score"):
                value = entry.get(field)
                if value is None:
                    continue
                if getattr(existing, field) != value:
                    setattr(existing, field, value)
                    changed = True
            if changed:
                existing.updated_at = datetime.now(timezone.utc)
                updated += 1
            continue

        new_item = CatalogItem(
            category_key=entry["category_key"],
            provider=entry["provider"],
            provider_id=entry["provider_id"],
            title=entry["title"],
            subtitle=entry.get("subtitle"),
            logo_url=entry["logo_url"],
            attribution=entry.get("attribution"),
            provider_url=entry.get("provider_url"),
            popularity_score=entry.get("popularity_score", 0),
        )
        session.add(new_item)
        inserted += 1

    if inserted or updated:
        logger.info("Catalog seed applied: %d inserted, %d updated", inserted, updated)
        return True
    return False


def _ensure_builtin_categories(session: Session) -> bool:
    group_ids = [group_id for (group_id,) in session.query(Group.id).all()]
    changed = False
    for group_id in group_ids:
        if ensure_group_builtin_categories(session, group_id):
            changed = True
    return changed


def run_startup_tasks() -> None:
    skip_catalog_seed = _should_skip_seed()
    if skip_catalog_seed:
        logger.info("Skipping catalog seed because %s is set", SKIP_SEED_ENV)

    if database.SessionLocal is None:
        logger.warning("Database session factory is not configured before startup tasks")
        return

    session = database.SessionLocal()
    try:
        changed = _ensure_builtin_categories(session)
        if not skip_catalog_seed:
            changed |= _seed_catalog(session)
        if changed:
            session.commit()
    except Exception:
        session.rollback()
        logger.exception("Failed to run catalog startup tasks")
    finally:
        session.close()
