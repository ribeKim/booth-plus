from alembic import context, op

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None

UP_SQL = """
CREATE TABLE users (
  id text PRIMARY KEY,
  username text NOT NULL CHECK (char_length(btrim(username)) > 0),
  bio text NOT NULL DEFAULT '',
  hide_avatar boolean NOT NULL DEFAULT false, auto_collapse boolean NOT NULL DEFAULT false,
  admin boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE oauth_accounts (
  provider text NOT NULL CHECK (char_length(btrim(provider)) > 0), provider_user_id text NOT NULL,
  user_id text NOT NULL, provider_username text NOT NULL, avatar_url text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (provider, provider_user_id), UNIQUE (user_id, provider),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE auth_sessions (
  id text PRIMARY KEY, user_id text NOT NULL, refresh_token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL, last_used_at timestamptz, revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE admin_discord_ids (
  provider_user_id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO admin_discord_ids (provider_user_id) VALUES ('191454176574701568');
CREATE INDEX auth_sessions_user_state_idx ON auth_sessions(user_id, revoked_at, expires_at);
CREATE INDEX auth_sessions_expiry_idx ON auth_sessions(expires_at);
CREATE TABLE shops (
  id text PRIMARY KEY, name text NOT NULL CHECK (char_length(btrim(name)) > 0),
  url text NOT NULL UNIQUE, avatar_url text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE products (
  id text PRIMARY KEY, shop_id text NOT NULL,
  title text NOT NULL CHECK (char_length(btrim(title)) > 0), price text NOT NULL DEFAULT '',
  url text NOT NULL UNIQUE, category text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE RESTRICT
);
CREATE INDEX products_shop_idx ON products(shop_id);
CREATE INDEX products_title_lower_idx ON products(lower(title));
CREATE TABLE product_thumbnails (
  product_id text NOT NULL, position integer NOT NULL CHECK (position >= 0),
  url text NOT NULL CHECK (char_length(btrim(url)) > 0),
  PRIMARY KEY (product_id, position), UNIQUE (product_id, url),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);
CREATE TABLE comments (
  id text PRIMARY KEY, product_id text NOT NULL, user_id text NOT NULL,
  content text NOT NULL CHECK (char_length(btrim(content)) > 0),
  score smallint NOT NULL CHECK (score BETWEEN 1 AND 10),
  language text CHECK (language IS NULL OR char_length(btrim(language)) > 0),
  disabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX comments_product_new_idx ON comments(product_id, updated_at DESC, id DESC);
CREATE INDEX comments_user_new_idx ON comments(user_id, updated_at DESC, id DESC);
CREATE TABLE comment_votes (
  comment_id text NOT NULL, user_id text NOT NULL,
  value smallint NOT NULL CHECK (value IN (-1, 1)),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (comment_id, user_id),
  FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX comment_votes_user_idx ON comment_votes(user_id, updated_at DESC);
CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END;
$$;
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER oauth_accounts_set_updated_at BEFORE UPDATE ON oauth_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER auth_sessions_set_updated_at BEFORE UPDATE ON auth_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER shops_set_updated_at BEFORE UPDATE ON shops
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER comments_set_updated_at BEFORE UPDATE ON comments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER comment_votes_set_updated_at BEFORE UPDATE ON comment_votes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
"""

DOWN_SQL = """
DROP TABLE comment_votes;
DROP TABLE comments;
DROP TABLE product_thumbnails;
DROP TABLE products;
DROP TABLE shops;
DROP TABLE auth_sessions;
DROP TABLE admin_discord_ids;
DROP TABLE oauth_accounts;
DROP TABLE users;
DROP FUNCTION set_updated_at();
"""


def upgrade() -> None:
    _execute_script(UP_SQL)


def downgrade() -> None:
    _execute_script(DOWN_SQL)


def _execute_script(script: str) -> None:
    if context.is_offline_mode():
        op.execute(script)
        return
    driver_connection = op.get_bind().connection.driver_connection
    with driver_connection.cursor() as cursor:
        cursor.execute(script, prepare=False)
