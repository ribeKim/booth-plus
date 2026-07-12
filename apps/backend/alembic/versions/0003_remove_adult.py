from alembic import op

revision = "0003_remove_adult"
down_revision = "0002_anonymous_comments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS adult")


def downgrade() -> None:
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
        "adult boolean NOT NULL DEFAULT false"
    )
