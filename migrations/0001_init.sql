CREATE TABLE IF NOT EXISTS GroupMembers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id    TEXT NOT NULL,
  tg_id       TEXT NOT NULL,
  username    TEXT,
  joined_at   DATETIME NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(group_id, tg_id)
);

CREATE TABLE IF NOT EXISTS GroupSettings (
  group_id          TEXT PRIMARY KEY,
  group_title       TEXT,
  bot_added_at      DATETIME,
  welcome_message   TEXT,
  airtable_base_id  TEXT,
  airtable_table    TEXT DEFAULT 'Members',
  updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
);
