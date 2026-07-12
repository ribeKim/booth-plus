from alembic import op

revision = "0006_anonymous_credentials"
down_revision = "0005_comment_moderation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE comments ADD COLUMN anonymous_id text")
    op.execute("ALTER TABLE comments ADD COLUMN anonymous_password_hash text")
    op.execute(
        "UPDATE comments SET "
        "anonymous_id='anonymous-' || right(id, 8), "
        "anonymous_password_hash='disabled$' || id "
        "WHERE user_id IS NULL"
    )
    op.execute(
        "ALTER TABLE comments ADD CONSTRAINT comments_author_identity_check CHECK ("
        "(user_id IS NOT NULL AND anonymous_id IS NULL AND anonymous_password_hash IS NULL) OR "
        "(user_id IS NULL AND anonymous_id IS NOT NULL AND anonymous_password_hash IS NOT NULL))"
    )
    op.execute(
        "ALTER TABLE comments ADD CONSTRAINT comments_anonymous_id_length_check CHECK ("
        "anonymous_id IS NULL OR char_length(btrim(anonymous_id)) BETWEEN 2 AND 50)"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE comments DROP CONSTRAINT comments_anonymous_id_length_check")
    op.execute("ALTER TABLE comments DROP CONSTRAINT comments_author_identity_check")
    op.execute("ALTER TABLE comments DROP COLUMN anonymous_password_hash")
    op.execute("ALTER TABLE comments DROP COLUMN anonymous_id")
