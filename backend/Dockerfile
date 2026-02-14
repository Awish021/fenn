FROM python:3.14-slim

WORKDIR /app

COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir uv 
RUN uv pip install --no-cache-dir --system -r requirements.txt

COPY alembic.ini ./alembic.ini
COPY alembic ./alembic
COPY app ./app

EXPOSE 8000

CMD ["sh", "-c", "alembic -c alembic.ini upgrade head && python alembic/bootstrap.py && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000"]
