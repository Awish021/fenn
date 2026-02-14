from __future__ import annotations

import logging
import re

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.builtins import BUILTIN_CATEGORIES
from app.database import get_db
from app.dependencies import get_current_user
from app.models import CatalogItem, CatalogLike, User
from app.schemas import CatalogItemOut, CatalogLikeResponse

router = APIRouter(tags=["catalog"])
logger = logging.getLogger(__name__)


def _validate_builtin(category_key: str) -> None:
    builtin_keys = {builtin.key for builtin in BUILTIN_CATEGORIES}
    if category_key not in builtin_keys:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Catalog not found")


def _catalog_item_query(db: Session, category_key: str, q: str | None):
    query = db.query(CatalogItem).filter(CatalogItem.category_key == category_key)
    if q:
        escaped = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        sanitized = f"%{escaped}%"
        query = query.filter(
            or_(
                CatalogItem.title.ilike(sanitized, escape="\\"),
                CatalogItem.subtitle.ilike(sanitized, escape="\\"),
                CatalogItem.provider_id.ilike(sanitized, escape="\\"),
            )
        )
    return query


def _normalize_search_term(raw: str | None) -> str | None:
    if raw is None:
        return None
    normalized = " ".join(raw.split())
    return normalized or None


def _fts_match_query(search_term: str) -> str | None:
    tokens = re.findall(r"[A-Za-z0-9_]+", search_term.lower())
    if not tokens:
        return None
    return " AND ".join(f"{token}*" for token in tokens[:8])


def _catalog_items_via_fts(
    db: Session,
    category_key: str,
    search_term: str,
    limit: int,
) -> list[CatalogItem] | None:
    bind = db.get_bind()
    if bind.dialect.name != "sqlite":
        return None

    match_query = _fts_match_query(search_term)
    if not match_query:
        return []

    sql = text(
        """
        SELECT catalog_items.id
        FROM catalog_items
        JOIN catalog_items_fts ON catalog_items_fts.rowid = catalog_items.id
        WHERE catalog_items.category_key = :category_key
          AND catalog_items_fts MATCH :match_query
        ORDER BY bm25(catalog_items_fts), catalog_items.popularity_score DESC, catalog_items.title ASC
        LIMIT :limit
        """
    )

    try:
        item_ids = [
            int(row[0])
            for row in db.execute(
                sql,
                {
                    "category_key": category_key,
                    "match_query": match_query,
                    "limit": limit,
                },
            )
        ]
    except OperationalError as exc:
        message = str(exc).lower()
        if "no such table" in message and "catalog_items_fts" in message:
            return None
        logger.warning("Catalog FTS query failed", exc_info=True)
        raise

    if not item_ids:
        return []

    item_map = {
        item.id: item
        for item in db.query(CatalogItem)
        .filter(CatalogItem.id.in_(item_ids))
        .all()
    }
    return [item_map[item_id] for item_id in item_ids if item_id in item_map]


@router.get("/catalog/{category_key}/items", response_model=list[CatalogItemOut])
def list_catalog_items(
    category_key: str,
    q: str | None = Query(None, description="Search term"),
    limit: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CatalogItemOut]:
    _validate_builtin(category_key)
    search_term = _normalize_search_term(q)
    if search_term:
        fts_items = _catalog_items_via_fts(db, category_key, search_term, limit)
        if fts_items is None:
            items = (
                _catalog_item_query(db, category_key, search_term)
                .order_by(CatalogItem.popularity_score.desc(), CatalogItem.title.asc())
                .limit(limit)
                .all()
            )
        else:
            items = fts_items
    else:
        items = (
            _catalog_item_query(db, category_key, None)
            .order_by(CatalogItem.popularity_score.desc(), CatalogItem.title.asc())
            .limit(limit)
            .all()
        )

    if not items:
        return []

    item_ids = [item.id for item in items]
    like_counts = {
        item_id: count
        for item_id, count in (
            db.query(CatalogLike.catalog_item_id, func.count(CatalogLike.user_id))
            .filter(CatalogLike.catalog_item_id.in_(item_ids))
            .group_by(CatalogLike.catalog_item_id)
            .all()
        )
    }

    liked_by_user = {
        item_id
        for (item_id,) in (
            db.query(CatalogLike.catalog_item_id)
            .filter(CatalogLike.catalog_item_id.in_(item_ids), CatalogLike.user_id == current_user.id)
            .all()
        )
    }

    return [
        CatalogItemOut(
            category_key=item.category_key,
            provider=item.provider,
            provider_id=item.provider_id,
            title=item.title,
            subtitle=item.subtitle,
            logo_url=item.logo_url,
            attribution=item.attribution,
            provider_url=item.provider_url,
            popularity_score=item.popularity_score,
            like_count=like_counts.get(item.id, 0),
            liked_by_user=item.id in liked_by_user,
        )
        for item in items
    ]


@router.post(
    "/catalog/{category_key}/items/{provider}/{provider_id}/likes",
    response_model=CatalogLikeResponse,
    status_code=status.HTTP_201_CREATED,
)
def like_catalog_item(
    category_key: str,
    provider: str,
    provider_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CatalogLikeResponse:
    _validate_builtin(category_key)
    item = (
        db.query(CatalogItem)
        .filter(
            CatalogItem.category_key == category_key,
            CatalogItem.provider == provider,
            CatalogItem.provider_id == provider_id,
        )
        .first()
    )
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")

    existing = (
        db.query(CatalogLike)
        .filter(CatalogLike.catalog_item_id == item.id, CatalogLike.user_id == current_user.id)
        .first()
    )
    if existing:
        return CatalogLikeResponse(status="liked")

    db.add(CatalogLike(catalog_item_id=item.id, user_id=current_user.id))
    db.commit()
    return CatalogLikeResponse(status="liked")


@router.delete("/catalog/{category_key}/items/{provider}/{provider_id}/likes", response_model=CatalogLikeResponse)
def unlike_catalog_item(
    category_key: str,
    provider: str,
    provider_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CatalogLikeResponse:
    _validate_builtin(category_key)
    item = (
        db.query(CatalogItem)
        .filter(
            CatalogItem.category_key == category_key,
            CatalogItem.provider == provider,
            CatalogItem.provider_id == provider_id,
        )
        .first()
    )
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")

    existing = (
        db.query(CatalogLike)
        .filter(CatalogLike.catalog_item_id == item.id, CatalogLike.user_id == current_user.id)
        .first()
    )
    if existing:
        db.delete(existing)
        db.commit()
    return CatalogLikeResponse(status="unliked")
