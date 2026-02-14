from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers.admin import router as admin_router
from app.routers.auth import router as auth_router
from app.routers.categories import router as categories_router
from app.routers.groups import router as groups_router
from app.routers.users import router as users_router
from app.config import ALLOWED_ORIGINS


app = FastAPI(title="Fenn Backend")

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
app.include_router(users_router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
