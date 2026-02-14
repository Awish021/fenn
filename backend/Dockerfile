# syntax=docker/dockerfile:1.7

FROM python:3.14-slim AS catalog-builder

WORKDIR /build

COPY tools ./tools

ARG CATALOG_MIN_VOTES=40
ARG CATALOG_MOVIES_LIMIT=140000
ARG CATALOG_TV_LIMIT=110000
ARG CATALOG_MUSIC_LIMIT=15000
ARG CATALOG_HOBBIES_LIMIT=8000

RUN --mount=type=cache,target=/build/.cache/catalog-build \
    python3 tools/build_realworld_catalog.py \
    --output /build/catalog_seed.realworld.jsonl \
    --metadata-output /build/catalog_seed.realworld.meta.json \
    --cache-dir /build/.cache/catalog-build \
    --min-votes ${CATALOG_MIN_VOTES} \
    --movies-limit ${CATALOG_MOVIES_LIMIT} \
    --tv-limit ${CATALOG_TV_LIMIT} \
    --music-limit ${CATALOG_MUSIC_LIMIT} \
    --hobbies-limit ${CATALOG_HOBBIES_LIMIT}

FROM python:3.14-slim

WORKDIR /app

COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir uv
RUN uv pip install --no-cache-dir --system -r requirements.txt

COPY alembic.ini ./alembic.ini
COPY alembic ./alembic
COPY app ./app
COPY --from=catalog-builder /build/catalog_seed.realworld.jsonl /opt/catalog/catalog_seed.realworld.jsonl
COPY --from=catalog-builder /build/catalog_seed.realworld.meta.json /opt/catalog/catalog_seed.realworld.meta.json

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
