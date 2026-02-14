from __future__ import annotations

from urllib.parse import parse_qs, urlparse

from tools import build_realworld_catalog as builder


def _music_entry(provider: str, provider_id: str, popularity: int) -> dict[str, object]:
    return {
        "category_key": "music",
        "provider": provider,
        "provider_id": provider_id,
        "title": provider_id,
        "subtitle": None,
        "logo_url": "https://example.test/logo.png",
        "attribution": None,
        "provider_url": None,
        "popularity_score": popularity,
    }


def test_build_music_catalog_entries_reserves_israeli_slots_when_imdb_is_full(monkeypatch):
    imdb_entries = [
        _music_entry("imdb", "imdb-1", 100),
        _music_entry("imdb", "imdb-2", 90),
        _music_entry("imdb", "imdb-3", 80),
        _music_entry("imdb", "imdb-4", 70),
        _music_entry("imdb", "imdb-5", 60),
    ]

    monkeypatch.setattr(
        builder,
        "_fetch_israeli_musicians_from_wikidata",
        lambda limit: [
            _music_entry("wikidata", "il-1", 10),
            _music_entry("wikidata", "il-2", 20),
        ][:limit],
    )
    monkeypatch.setattr(builder, "_fetch_music_from_wikidata", lambda limit: [])
    monkeypatch.setattr(builder, "_fetch_musicians_from_wikidata", lambda limit: [])
    monkeypatch.setattr(builder, "_fetch_musical_groups_from_wikidata", lambda limit: [])

    result = builder._build_music_catalog_entries(
        imdb_entries,
        music_limit=4,
        music_israeli_min=2,
    )

    result_ids = {entry["provider_id"] for entry in result}
    assert len(result) == 4
    assert {"il-1", "il-2"}.issubset(result_ids)
    assert len([entry for entry in result if entry["provider"] == "imdb"]) == 2


def test_build_music_catalog_entries_fills_missing_from_multiple_sources(monkeypatch):
    imdb_entries: list[dict[str, object]] = []

    fetch_calls: dict[str, int] = {"music": 0, "musicians": 0, "groups": 0}

    monkeypatch.setattr(
        builder,
        "_fetch_israeli_musicians_from_wikidata",
        lambda limit: [
            _music_entry("wikidata", "il-1", 40),
            _music_entry("wikidata", "il-2", 30),
        ][:limit],
    )

    def _fetch_music(limit: int) -> list[dict[str, object]]:
        fetch_calls["music"] = limit
        return [_music_entry("wikidata", "global-1", 20)]

    def _fetch_musicians(limit: int) -> list[dict[str, object]]:
        fetch_calls["musicians"] = limit
        return [_music_entry("wikidata", "musician-1", 10)]

    def _fetch_groups(limit: int) -> list[dict[str, object]]:
        fetch_calls["groups"] = limit
        return [_music_entry("wikidata", "group-1", 15)]

    monkeypatch.setattr(builder, "_fetch_music_from_wikidata", _fetch_music)
    monkeypatch.setattr(builder, "_fetch_musicians_from_wikidata", _fetch_musicians)
    monkeypatch.setattr(builder, "_fetch_musical_groups_from_wikidata", _fetch_groups)

    result = builder._build_music_catalog_entries(
        imdb_entries,
        music_limit=5,
        music_israeli_min=3,
    )

    result_ids = {entry["provider_id"] for entry in result}
    assert len(result) == 5
    assert {"il-1", "il-2", "global-1", "musician-1", "group-1"} == result_ids
    assert fetch_calls["music"] == 1
    assert fetch_calls["musicians"] == 2
    assert fetch_calls["groups"] == 1


def test_fetch_wikidata_subclass_entries_orders_by_sitelinks(monkeypatch):
    captured_query: dict[str, str] = {}

    def _fake_read_json_response(url: str, timeout: int) -> dict[str, object]:
        query = parse_qs(urlparse(url).query).get("query", [""])[0]
        captured_query["text"] = query
        return {"results": {"bindings": []}}

    monkeypatch.setattr(builder, "_read_json_response", _fake_read_json_response)

    result = builder._fetch_wikidata_subclass_entries(
        root_qid="Q639669",
        category_key="music",
        limit=5,
        subtitle_prefix="Musician",
    )

    assert result == []
    assert "ORDER BY DESC(?sitelinks) ?item" in captured_query["text"]
