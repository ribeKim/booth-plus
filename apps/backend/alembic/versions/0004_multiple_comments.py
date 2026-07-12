from alembic import op

revision = "0004_multiple_comments"
down_revision = "0003_remove_adult"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_user_id_product_id_key"
    )


def downgrade() -> None:
    op.create_unique_constraint(
        "comments_user_id_product_id_key", "comments", ["user_id", "product_id"]
    )
