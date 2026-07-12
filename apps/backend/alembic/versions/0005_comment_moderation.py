from alembic import op

revision = "0005_comment_moderation"
down_revision = "0004_multiple_comments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE TABLE IF NOT EXISTS admin_discord_ids ("
        "provider_user_id text PRIMARY KEY, "
        "created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP)"
    )
    op.execute(
        "INSERT INTO admin_discord_ids (provider_user_id) VALUES ('191454176574701568') "
        "ON CONFLICT (provider_user_id) DO NOTHING"
    )
    op.execute(
        "UPDATE users SET admin=true FROM oauth_accounts o "
        "WHERE o.user_id=users.id AND o.provider='discord' "
        "AND o.provider_user_id IN (SELECT provider_user_id FROM admin_discord_ids)"
    )
    op.execute(
        "ALTER TABLE comments ADD COLUMN IF NOT EXISTS "
        "disabled boolean NOT NULL DEFAULT false"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE comments DROP COLUMN IF EXISTS disabled")
    op.execute(
        "UPDATE users SET admin=false FROM oauth_accounts o "
        "WHERE o.user_id=users.id AND o.provider='discord' "
        "AND o.provider_user_id IN (SELECT provider_user_id FROM admin_discord_ids)"
    )
    op.execute("DROP TABLE IF EXISTS admin_discord_ids")
