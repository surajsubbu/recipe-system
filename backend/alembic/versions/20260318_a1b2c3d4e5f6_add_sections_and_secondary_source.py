"""add section to ingredients and steps, secondary_source_url to recipes

Revision ID: a1b2c3d4e5f6
Revises: 5ddd8579f231
Create Date: 2026-03-18

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "a1b2c3d4e5f6"
down_revision = "5ddd8579f231"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ingredients", sa.Column("section", sa.String(255), nullable=True))
    op.add_column("steps", sa.Column("section", sa.String(255), nullable=True))
    op.add_column("recipes", sa.Column("secondary_source_url", sa.String(2048), nullable=True))


def downgrade() -> None:
    op.drop_column("recipes", "secondary_source_url")
    op.drop_column("steps", "section")
    op.drop_column("ingredients", "section")
