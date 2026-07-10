CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL CHECK (length(trim(username)) > 0),
  bio TEXT NOT NULL DEFAULT '',
  adult INTEGER NOT NULL DEFAULT 0 CHECK (adult IN (0, 1)),
  hide_avatar INTEGER NOT NULL DEFAULT 0 CHECK (hide_avatar IN (0, 1)),
  auto_collapse INTEGER NOT NULL DEFAULT 0 CHECK (auto_collapse IN (0, 1)),
  admin INTEGER NOT NULL DEFAULT 0 CHECK (admin IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE oauth_accounts (
  provider TEXT NOT NULL CHECK (length(trim(provider)) > 0),
  provider_user_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  provider_username TEXT NOT NULL,
  avatar_url TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (provider, provider_user_id),
  UNIQUE (user_id, provider),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX auth_sessions_user_state_idx
  ON auth_sessions(user_id, revoked_at, expires_at);

CREATE INDEX auth_sessions_expiry_idx
  ON auth_sessions(expires_at);

CREATE TABLE shops (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  url TEXT NOT NULL UNIQUE,
  avatar_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  price TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX products_shop_idx
  ON products(shop_id);

CREATE INDEX products_title_nocase_idx
  ON products(title COLLATE NOCASE);

CREATE TABLE product_thumbnails (
  product_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  url TEXT NOT NULL CHECK (length(trim(url)) > 0),
  PRIMARY KEY (product_id, position),
  UNIQUE (product_id, url),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL CHECK (length(trim(content)) > 0),
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 10),
  language TEXT CHECK (language IS NULL OR length(trim(language)) > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (user_id, product_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX comments_product_new_idx
  ON comments(product_id, updated_at DESC, id DESC);

CREATE INDEX comments_user_new_idx
  ON comments(user_id, updated_at DESC, id DESC);

CREATE TABLE comment_votes (
  comment_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  value INTEGER NOT NULL CHECK (value IN (-1, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (comment_id, user_id),
  FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX comment_votes_user_idx
  ON comment_votes(user_id, updated_at DESC);

CREATE TRIGGER users_set_updated_at
AFTER UPDATE ON users
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE users
  SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = OLD.id;
END;

CREATE TRIGGER oauth_accounts_set_updated_at
AFTER UPDATE ON oauth_accounts
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE oauth_accounts
  SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE provider = OLD.provider AND provider_user_id = OLD.provider_user_id;
END;

CREATE TRIGGER auth_sessions_set_updated_at
AFTER UPDATE ON auth_sessions
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE auth_sessions
  SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = OLD.id;
END;

CREATE TRIGGER shops_set_updated_at
AFTER UPDATE ON shops
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE shops
  SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = OLD.id;
END;

CREATE TRIGGER products_set_updated_at
AFTER UPDATE ON products
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE products
  SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = OLD.id;
END;

CREATE TRIGGER comments_set_updated_at
AFTER UPDATE ON comments
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE comments
  SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = OLD.id;
END;

CREATE TRIGGER comment_votes_set_updated_at
AFTER UPDATE ON comment_votes
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE comment_votes
  SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE comment_id = OLD.comment_id AND user_id = OLD.user_id;
END;
