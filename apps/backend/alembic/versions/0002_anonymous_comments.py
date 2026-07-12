from alembic import op

revision = "0002_anonymous_comments"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("comments", "user_id", nullable=True)


def downgrade() -> None:
    op.execute("DELETE FROM comments WHERE user_id IS NULL")
    op.alter_column("comments", "user_id", nullable=False)
