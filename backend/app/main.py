from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.bootstrap import bootstrap_admin_user, init_db
from app import database
from app.routers.admin import router as admin_router
from app.routers.auth import router as auth_router
from app.routers.categories import router as categories_router
from app.routers.groups import router as groups_router
from app.config import ALLOWED_ORIGINS


@asynccontextmanager
async def lifespan(_: FastAPI):
    engine = database.engine
    if engine is None:
        raise RuntimeError("Database engine is not configured")
    init_db(engine)
    session_local = database.SessionLocal
    if session_local is None:
        raise RuntimeError("Database session is not configured")
    db = session_local()
    try:
        bootstrap_admin_user(db)
    finally:
        db.close()
    yield


app = FastAPI(title="Fenn Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(groups_router)
app.include_router(categories_router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
