from __future__ import annotations

import argparse
import csv
import gzip
import heapq
import json
import logging
import re
import shutil
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote_plus, urlencode
from urllib.request import Request, urlopen

logger = logging.getLogger(__name__)

IMDB_BASICS_URL = "https://datasets.imdbws.com/title.basics.tsv.gz"
IMDB_RATINGS_URL = "https://datasets.imdbws.com/title.ratings.tsv.gz"
WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql"

IMDB_CATEGORY_BY_TYPE: dict[str, str] = {
    "movie": "movies",
    "tvMovie": "movies",
    "tvSeries": "tv_shows",
    "tvMiniSeries": "tv_shows",
    "musicVideo": "music",
}


@dataclass(order=True)
class RankedCatalogEntry:
    popularity: int
    key: str
    payload: dict[str, Any] = field(compare=False)


def _normalize_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized or normalized == "\\N":
        return None
    return normalized


def _parse_int(value: str | None) -> int | None:
    text = _normalize_text(value)
    if text is None:
        return None
    try:
        return int(text)
    except ValueError:
        return None


def _parse_float(value: str | None) -> float | None:
    text = _normalize_text(value)
    if text is None:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _placeholder_logo(category_key: str, title: str) -> str:
    safe_text = quote_plus(title[:20])
    color = {
        "music": "0055ff",
        "movies": "d97706",
        "tv_shows": "9333ea",
        "hobbies": "0f766e",
    }.get(category_key, "4c1d95")
    return f"https://dummyimage.com/160x160/{color}/ffffff&text={safe_text}"


def _download_file(url: str, destination: Path) -> Path:
    if destination.exists() and destination.stat().st_size > 0:
        logger.info("Using cached dataset %s", destination)
        return destination

    destination.parent.mkdir(parents=True, exist_ok=True)
    temp_destination = destination.with_suffix(f"{destination.suffix}.part")

    max_attempts = 3
    for attempt in range(1, max_attempts + 1):
        logger.info("Downloading %s (attempt %d/%d)", url, attempt, max_attempts)
        request = Request(url, headers={"User-Agent": "fenn-catalog-builder/1.0"})
        try:
            with urlopen(request, timeout=300) as response, temp_destination.open("wb") as handle:
                shutil.copyfileobj(response, handle)
            temp_destination.replace(destination)
            logger.info("Saved %s (%d bytes)", destination, destination.stat().st_size)
            return destination
        except Exception:
            if temp_destination.exists():
                temp_destination.unlink()
            if attempt >= max_attempts:
                raise

    return destination


def _read_json_response(url: str, timeout: int) -> dict[str, Any]:
    max_attempts = 3
    for attempt in range(1, max_attempts + 1):
        request = Request(
            url,
            headers={
                "Accept": "application/sparql-results+json",
                "User-Agent": "fenn-catalog-builder/1.0",
            },
        )
        try:
            with urlopen(request, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception:
            if attempt >= max_attempts:
                raise
            logger.warning("Retrying failed request (attempt %d/%d)", attempt + 1, max_attempts)

    return {}


def _load_imdb_ratings(path: Path, min_votes: int) -> dict[str, tuple[int, float]]:
    logger.info("Loading IMDb ratings from %s", path)
    ratings: dict[str, tuple[int, float]] = {}
    with gzip.open(path, mode="rt", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        for row in reader:
            tconst = _normalize_text(row.get("tconst"))
            if tconst is None:
                continue
            num_votes = _parse_int(row.get("numVotes"))
            average_rating = _parse_float(row.get("averageRating"))
            if num_votes is None or average_rating is None:
                continue
            if num_votes < min_votes:
                continue
            ratings[tconst] = (num_votes, average_rating)
    logger.info("Loaded %d IMDb ratings with at least %d votes", len(ratings), min_votes)
    return ratings


def _push_ranked(
    heap: list[RankedCatalogEntry],
    limit: int,
    popularity: int,
    key: str,
    payload: dict[str, Any],
) -> None:
    candidate = RankedCatalogEntry(popularity=popularity, key=key, payload=payload)
    if len(heap) < limit:
        heapq.heappush(heap, candidate)
        return
    if candidate > heap[0]:
        heapq.heapreplace(heap, candidate)


def _subtitle_from_imdb(year: int | None, genres: str | None, average_rating: float) -> str:
    parts: list[str] = []
    if year is not None:
        parts.append(str(year))
    if genres:
        parts.append(genres.replace(",", " / "))
    parts.append(f"IMDb {average_rating:.1f}/10")
    return " - ".join(parts)


def _build_imdb_catalog_entries(
    basics_path: Path,
    ratings_by_title: dict[str, tuple[int, float]],
    category_limits: dict[str, int],
) -> list[dict[str, Any]]:
    logger.info("Building catalog candidates from %s", basics_path)

    heaps: dict[str, list[RankedCatalogEntry]] = {
        category: [] for category in category_limits
    }

    with gzip.open(basics_path, mode="rt", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        for row in reader:
            title_type = _normalize_text(row.get("titleType"))
            if title_type is None:
                continue
            category_key = IMDB_CATEGORY_BY_TYPE.get(title_type)
            if category_key is None:
                continue

            is_adult = _normalize_text(row.get("isAdult"))
            if is_adult == "1":
                continue

            tconst = _normalize_text(row.get("tconst"))
            if tconst is None:
                continue

            rating_info = ratings_by_title.get(tconst)
            if rating_info is None:
                continue
            num_votes, average_rating = rating_info

            title = _normalize_text(row.get("primaryTitle"))
            if title is None:
                continue

            start_year = _parse_int(row.get("startYear"))
            genres = _normalize_text(row.get("genres"))

            entry = {
                "category_key": category_key,
                "provider": "imdb",
                "provider_id": tconst,
                "title": title,
                "subtitle": _subtitle_from_imdb(start_year, genres, average_rating),
                "logo_url": _placeholder_logo(category_key, title),
                "attribution": "IMDb Non-Commercial Datasets",
                "provider_url": f"https://www.imdb.com/title/{tconst}/",
                "popularity_score": num_votes,
            }
            _push_ranked(
                heaps[category_key],
                limit=category_limits[category_key],
                popularity=num_votes,
                key=tconst,
                payload=entry,
            )

    entries: list[dict[str, Any]] = []
    for category_key, heap in heaps.items():
        ranked = sorted(heap, key=lambda item: (item.popularity, item.key), reverse=True)
        entries.extend(item.payload for item in ranked)
        logger.info("Selected %d IMDb entries for %s", len(ranked), category_key)

    return entries


def _extract_qid(entity_url: str | None) -> str | None:
    if not entity_url:
        return None
    qid = entity_url.rsplit("/", 1)[-1].strip()
    if not qid.startswith("Q"):
        return None
    return qid


def _looks_like_identifier_label(label: str) -> bool:
    return bool(re.fullmatch(r"(?:Q\d+|\d+)", label.strip()))


def _fetch_wikidata_subclass_entries(
    *,
    root_qid: str,
    category_key: str,
    limit: int,
    subtitle_prefix: str,
    relation_path: str = "wdt:P279*",
    chunk_size: int = 2000,
    extra_triples: tuple[str, ...] = (),
) -> list[dict[str, Any]]:
    if limit <= 0:
        return []

    logger.info("Downloading Wikidata subclass entities for %s", root_qid)
    entries: list[dict[str, Any]] = []

    offset = 0
    while len(entries) < limit:
        page_size = min(chunk_size, limit - len(entries))
        extra_filters = "".join(f"\n          {triple}" for triple in extra_triples)
        query = f"""
        SELECT ?item ?itemLabel ?itemDescription ?sitelinks WHERE {{
          ?item {relation_path} wd:{root_qid} .
          {extra_filters}
          ?item wikibase:sitelinks ?sitelinks .
          SERVICE wikibase:label {{ bd:serviceParam wikibase:language \"en\". }}
        }}
        ORDER BY DESC(?sitelinks) ?item
        LIMIT {int(page_size)}
        OFFSET {int(offset)}
        """
        params = urlencode({"query": query, "format": "json"})
        url = f"{WIKIDATA_ENDPOINT}?{params}"
        try:
            payload = _read_json_response(url, timeout=240)
        except Exception:
            logger.warning(
                "Wikidata request failed for %s at offset %d; returning %d partial entries",
                root_qid,
                offset,
                len(entries),
                exc_info=True,
            )
            break

        bindings = payload.get("results", {}).get("bindings", [])
        if not bindings:
            break

        for row in bindings:
            provider_url = row.get("item", {}).get("value")
            provider_id = _extract_qid(provider_url)
            title = _normalize_text(row.get("itemLabel", {}).get("value"))
            if provider_id is None or title is None:
                continue
            if _looks_like_identifier_label(title):
                continue
            subtitle = _normalize_text(row.get("itemDescription", {}).get("value"))
            if subtitle_prefix and subtitle:
                subtitle = f"{subtitle_prefix} - {subtitle}"
            elif subtitle_prefix:
                subtitle = subtitle_prefix
            sitelinks = _parse_int(row.get("sitelinks", {}).get("value")) or 0
            entries.append(
                {
                    "category_key": category_key,
                    "provider": "wikidata",
                    "provider_id": provider_id,
                    "title": title,
                    "subtitle": subtitle,
                    "logo_url": _placeholder_logo(category_key, title),
                    "attribution": "Wikidata (CC0)",
                    "provider_url": provider_url,
                    "popularity_score": sitelinks,
                }
            )
            if len(entries) >= limit:
                break

        offset += page_size

    entries.sort(key=lambda entry: int(entry.get("popularity_score", 0)), reverse=True)
    return entries


def _fetch_hobbies_from_wikidata(limit: int) -> list[dict[str, Any]]:
    sports_limit = max(int(limit * 0.5), 1)
    games_limit = max(int(limit * 0.45), 1)
    hobbies_limit = max(limit - sports_limit - games_limit, 1)

    entries: list[dict[str, Any]] = []
    entries.extend(
        _fetch_wikidata_subclass_entries(
            root_qid="Q349",
            category_key="hobbies",
            limit=sports_limit,
            subtitle_prefix="Sport",
        )
    )
    entries.extend(
        _fetch_wikidata_subclass_entries(
            root_qid="Q11410",
            category_key="hobbies",
            limit=games_limit,
            subtitle_prefix="Game",
        )
    )
    entries.extend(
        _fetch_wikidata_subclass_entries(
            root_qid="Q82594",
            category_key="hobbies",
            limit=hobbies_limit,
            subtitle_prefix="Hobby",
        )
    )

    deduped = _dedupe_entries(entries)
    deduped.sort(key=lambda entry: int(entry.get("popularity_score", 0)), reverse=True)
    result = deduped[:limit]
    logger.info("Loaded %d hobby entries from Wikidata", len(result))
    return result


def _fetch_music_from_wikidata(limit: int) -> list[dict[str, Any]]:
    entries = _fetch_wikidata_subclass_entries(
        root_qid="Q215380",
        category_key="music",
        limit=limit,
        subtitle_prefix="Music",
        relation_path="wdt:P31/wdt:P279*",
        chunk_size=500,
    )
    logger.info("Loaded %d music entries from Wikidata", len(entries))
    return entries


def _fetch_musicians_from_wikidata(limit: int) -> list[dict[str, Any]]:
    entries = _fetch_wikidata_subclass_entries(
        root_qid="Q639669",
        category_key="music",
        limit=limit,
        subtitle_prefix="Musician",
        relation_path="wdt:P106/wdt:P279*",
        chunk_size=500,
    )
    logger.info("Loaded %d musician entries from Wikidata", len(entries))
    return entries


def _fetch_musical_groups_from_wikidata(limit: int) -> list[dict[str, Any]]:
    entries = _fetch_wikidata_subclass_entries(
        root_qid="Q2088357",
        category_key="music",
        limit=limit,
        subtitle_prefix="Band",
        relation_path="wdt:P31/wdt:P279*",
        chunk_size=500,
    )
    logger.info("Loaded %d musical group entries from Wikidata", len(entries))
    return entries


def _fetch_israeli_musicians_from_wikidata(limit: int) -> list[dict[str, Any]]:
    entries = _fetch_wikidata_subclass_entries(
        root_qid="Q639669",
        category_key="music",
        limit=limit,
        subtitle_prefix="Musician from Israel",
        relation_path="wdt:P106/wdt:P279*",
        chunk_size=1000,
        extra_triples=("?item wdt:P27 wd:Q801 .",),
    )
    logger.info("Loaded %d Israeli musician entries from Wikidata", len(entries))
    return entries


def _sort_by_popularity(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        entries,
        key=lambda entry: (
            int(entry.get("popularity_score", 0)),
            str(entry.get("provider", "")),
            str(entry.get("provider_id", "")),
        ),
        reverse=True,
    )


def _build_music_catalog_entries(
    imdb_entries: list[dict[str, Any]],
    *,
    music_limit: int,
    music_israeli_min: int,
) -> list[dict[str, Any]]:
    if music_limit <= 0:
        return []

    imdb_music = [entry for entry in imdb_entries if entry.get("category_key") == "music"]
    reserved_israeli = min(max(music_israeli_min, 0), music_limit)

    selected_by_key: dict[tuple[str, str, str], dict[str, Any]] = {}

    if reserved_israeli > 0:
        israeli_entries = _fetch_israeli_musicians_from_wikidata(reserved_israeli)
        for entry in _sort_by_popularity(_dedupe_entries(israeli_entries)):
            key = (entry["category_key"], entry["provider"], entry["provider_id"])
            selected_by_key[key] = entry

    slots_left = music_limit - len(selected_by_key)
    if slots_left <= 0:
        return _sort_by_popularity(list(selected_by_key.values()))[:music_limit]

    musicians_target = max((slots_left * 2) // 3, 1)
    groups_target = max(slots_left - musicians_target, 1)
    supplemental_wikidata = _dedupe_entries(
        _fetch_musicians_from_wikidata(musicians_target) + _fetch_musical_groups_from_wikidata(groups_target)
    )
    for entry in _sort_by_popularity(supplemental_wikidata):
        key = (entry["category_key"], entry["provider"], entry["provider_id"])
        if key in selected_by_key:
            continue
        selected_by_key[key] = entry
        if len(selected_by_key) >= music_limit:
            break

    slots_left = music_limit - len(selected_by_key)
    if slots_left > 0:
        logger.info("Filling remaining %d music rows from IMDb and generic Wikidata music", slots_left)
        fallback_pool = _dedupe_entries(imdb_music + _fetch_music_from_wikidata(slots_left))
        for entry in _sort_by_popularity(fallback_pool):
            key = (entry["category_key"], entry["provider"], entry["provider_id"])
            if key in selected_by_key:
                continue
            selected_by_key[key] = entry
            if len(selected_by_key) >= music_limit:
                break

    return _sort_by_popularity(list(selected_by_key.values()))[:music_limit]


def _dedupe_entries(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: dict[tuple[str, str, str], dict[str, Any]] = {}
    for entry in entries:
        key = (entry["category_key"], entry["provider"], entry["provider_id"])
        current = deduped.get(key)
        if current is None or int(entry.get("popularity_score", 0)) > int(current.get("popularity_score", 0)):
            deduped[key] = entry
    return list(deduped.values())


def _write_jsonl(entries: list[dict[str, Any]], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    ordered = sorted(
        entries,
        key=lambda row: (
            row["category_key"],
            -int(row.get("popularity_score", 0)),
            row["provider"],
            row["provider_id"],
        ),
    )
    with output_path.open("w", encoding="utf-8") as handle:
        for row in ordered:
            handle.write(json.dumps(row, separators=(",", ":")))
            handle.write("\n")


def _write_metadata(
    output_path: Path,
    metadata_path: Path,
    entries: list[dict[str, Any]],
    category_limits: dict[str, int],
) -> None:
    counts = Counter(entry["category_key"] for entry in entries)
    metadata = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "output": str(output_path),
        "total_entries": len(entries),
        "category_counts": dict(sorted(counts.items())),
        "category_limits": category_limits,
        "sources": {
            "imdb_basics": IMDB_BASICS_URL,
            "imdb_ratings": IMDB_RATINGS_URL,
            "wikidata_hobbies": WIKIDATA_ENDPOINT,
        },
    }
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a large real-world catalog seed dataset")
    parser.add_argument("--output", required=True, help="Path to output JSONL file")
    parser.add_argument("--metadata-output", help="Path to metadata JSON output")
    parser.add_argument("--cache-dir", default=".cache/catalog-build", help="Download cache directory")
    parser.add_argument("--min-votes", type=int, default=40, help="Minimum IMDb vote count to include")
    parser.add_argument("--movies-limit", type=int, default=140000)
    parser.add_argument("--tv-limit", type=int, default=110000)
    parser.add_argument("--music-limit", type=int, default=50000)
    parser.add_argument("--music-israeli-min", type=int, default=1500)
    parser.add_argument("--hobbies-limit", type=int, default=8000)
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    output_path = Path(args.output)
    metadata_path = Path(args.metadata_output) if args.metadata_output else output_path.with_suffix(".meta.json")
    cache_dir = Path(args.cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)

    category_limits = {
        "movies": args.movies_limit,
        "tv_shows": args.tv_limit,
        "music": args.music_limit,
    }
    for category_key, limit in category_limits.items():
        if limit <= 0:
            raise ValueError(f"{category_key} limit must be greater than zero")

    basics_path = _download_file(IMDB_BASICS_URL, cache_dir / "title.basics.tsv.gz")
    ratings_path = _download_file(IMDB_RATINGS_URL, cache_dir / "title.ratings.tsv.gz")

    ratings = _load_imdb_ratings(ratings_path, min_votes=args.min_votes)
    imdb_entries = _build_imdb_catalog_entries(
        basics_path=basics_path,
        ratings_by_title=ratings,
        category_limits=category_limits,
    )

    non_music_entries = [entry for entry in imdb_entries if entry.get("category_key") != "music"]
    music_entries = _build_music_catalog_entries(
        imdb_entries,
        music_limit=args.music_limit,
        music_israeli_min=args.music_israeli_min,
    )

    hobbies = _fetch_hobbies_from_wikidata(args.hobbies_limit)

    combined = _dedupe_entries(non_music_entries + music_entries + hobbies)
    _write_jsonl(combined, output_path)
    _write_metadata(output_path, metadata_path, combined, category_limits)

    counts = Counter(entry["category_key"] for entry in combined)
    logger.info("Catalog seed generated at %s", output_path)
    logger.info("Total entries: %d", len(combined))
    for category_key in sorted(counts):
        logger.info("  %s: %d", category_key, counts[category_key])


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
