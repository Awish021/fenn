"""Add catalog popularity and FTS search

Revision ID: 6b7f9e4d11e2
Revises: dfbc54db7b4c
Create Date: 2026-02-14 14:30:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "6b7f9e4d11e2"
down_revision = "dfbc54db7b4c"
branch_labels = None
depends_on = None


def _create_sqlite_fts() -> None:
    op.execute(
        """
        CREATE VIRTUAL TABLE catalog_items_fts USING fts5(
            title,
            subtitle,
            content='catalog_items',
            content_rowid='id',
            tokenize='unicode61'
        )
        """
    )
    op.execute(
        """
        INSERT INTO catalog_items_fts(rowid, title, subtitle)
        SELECT id, title, COALESCE(subtitle, '')
        FROM catalog_items
        """
    )
    op.execute(
        """
        CREATE TRIGGER catalog_items_fts_ai AFTER INSERT ON catalog_items
        BEGIN
            INSERT INTO catalog_items_fts(rowid, title, subtitle)
            VALUES (new.id, new.title, COALESCE(new.subtitle, ''));
        END
        """
    )
    op.execute(
        """
        CREATE TRIGGER catalog_items_fts_ad AFTER DELETE ON catalog_items
        BEGIN
            INSERT INTO catalog_items_fts(catalog_items_fts, rowid, title, subtitle)
            VALUES ('delete', old.id, old.title, COALESCE(old.subtitle, ''));
        END
        """
    )
    op.execute(
        """
        CREATE TRIGGER catalog_items_fts_au AFTER UPDATE ON catalog_items
        BEGIN
            INSERT INTO catalog_items_fts(catalog_items_fts, rowid, title, subtitle)
            VALUES ('delete', old.id, old.title, COALESCE(old.subtitle, ''));
            INSERT INTO catalog_items_fts(rowid, title, subtitle)
            VALUES (new.id, new.title, COALESCE(new.subtitle, ''));
        END
        """
    )


def _drop_sqlite_fts() -> None:
    op.execute("DROP TRIGGER IF EXISTS catalog_items_fts_au")
    op.execute("DROP TRIGGER IF EXISTS catalog_items_fts_ad")
    op.execute("DROP TRIGGER IF EXISTS catalog_items_fts_ai")
    op.execute("DROP TABLE IF EXISTS catalog_items_fts")


def upgrade() -> None:
    op.add_column(
        "catalog_items",
        sa.Column("popularity_score", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.create_index(
        op.f("ix_catalog_items_popularity_score"),
        "catalog_items",
        ["popularity_score"],
        unique=False,
    )
    op.create_index(
        "ix_catalog_items_category_key_popularity",
        "catalog_items",
        ["category_key", "popularity_score"],
        unique=False,
    )

    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        _create_sqlite_fts()


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        _drop_sqlite_fts()

    op.drop_index("ix_catalog_items_category_key_popularity", table_name="catalog_items")
    op.drop_index(op.f("ix_catalog_items_popularity_score"), table_name="catalog_items")
    with op.batch_alter_table("catalog_items") as batch_op:
        batch_op.drop_column("popularity_score")
