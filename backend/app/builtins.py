from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models import Category


@dataclass(frozen=True)
class BuiltinCategory:
    key: str
    name: str


BUILTIN_CATEGORIES: list[BuiltinCategory] = [
    BuiltinCategory(key="music", name="Music"),
    BuiltinCategory(key="movies", name="Movies"),
    BuiltinCategory(key="tv_shows", name="TV Shows"),
    BuiltinCategory(key="hobbies", name="Hobbies"),
]


def ensure_group_builtin_categories(db: Session, group_id: int) -> bool:
    existing_keys = {
        category.builtin_key
        for category in db.query(Category)
        .filter(Category.group_id == group_id, Category.builtin_key.isnot(None))
        .all()
        if category.builtin_key
    }
    new_categories = [
        Category(group_id=group_id, name=builtin.name, builtin_key=builtin.key)
        for builtin in BUILTIN_CATEGORIES
        if builtin.key not in existing_keys
    ]
    if new_categories:
        db.add_all(new_categories)
        db.flush()
        return True
    return False
