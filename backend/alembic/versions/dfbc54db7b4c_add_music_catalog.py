"""Add catalog tables

Revision ID: dfbc54db7b4c
Revises: 0001_initial_schema
Create Date: 2026-02-15 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'dfbc54db7b4c'
down_revision = '0001_initial_schema'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'catalog_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('category_key', sa.String(length=64), nullable=False),
        sa.Column('provider', sa.String(length=64), nullable=False),
        sa.Column('provider_id', sa.String(length=128), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('subtitle', sa.String(length=255), nullable=True),
        sa.Column('logo_url', sa.String(length=512), nullable=False),
        sa.Column('attribution', sa.String(length=255), nullable=True),
        sa.Column('provider_url', sa.String(length=512), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('category_key', 'provider', 'provider_id', name='uq_catalog_item_provider'),
    )
    op.create_index(op.f('ix_catalog_items_category_key'), 'catalog_items', ['category_key'], unique=False)
    op.create_index(op.f('ix_catalog_items_provider'), 'catalog_items', ['provider'], unique=False)
    op.create_table(
        'catalog_likes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('catalog_item_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['catalog_item_id'], ['catalog_items.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('catalog_item_id', 'user_id', name='uq_catalog_like'),
    )
    op.create_index(
        op.f('ix_catalog_likes_catalog_item_id'), 'catalog_likes', ['catalog_item_id'], unique=False
    )
    op.create_index(op.f('ix_catalog_likes_user_id'), 'catalog_likes', ['user_id'], unique=False)

    with op.batch_alter_table('categories') as batch_op:
        batch_op.add_column(sa.Column('builtin_key', sa.String(length=64), nullable=True))
        batch_op.create_unique_constraint('uq_group_builtin_key', ['group_id', 'builtin_key'])
    op.create_index(op.f('ix_categories_builtin_key'), 'categories', ['builtin_key'], unique=False)
    op.add_column('items', sa.Column('logo_url', sa.String(length=255), nullable=True))
    op.add_column('items', sa.Column('subtitle', sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column('items', 'subtitle')
    op.drop_column('items', 'logo_url')
    op.drop_index(op.f('ix_categories_builtin_key'), table_name='categories')
    with op.batch_alter_table('categories') as batch_op:
        batch_op.drop_constraint('uq_group_builtin_key', type_='unique')
        batch_op.drop_column('builtin_key')
    op.drop_index(op.f('ix_catalog_likes_user_id'), table_name='catalog_likes')
    op.drop_index(op.f('ix_catalog_likes_catalog_item_id'), table_name='catalog_likes')
    op.drop_table('catalog_likes')
    op.drop_index(op.f('ix_catalog_items_provider'), table_name='catalog_items')
    op.drop_index(op.f('ix_catalog_items_category_key'), table_name='catalog_items')
    op.drop_table('catalog_items')
