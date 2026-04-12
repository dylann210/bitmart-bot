import type { GroupMember, GroupSettings, Viewer } from '../types';

export async function upsertGroupSettings(
  db: D1Database,
  groupId: string,
  groupTitle: string,
  botAddedAt: string
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO GroupSettings (group_id, group_title, bot_added_at, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(group_id) DO UPDATE SET
         group_title = excluded.group_title,
         bot_added_at = COALESCE(GroupSettings.bot_added_at, excluded.bot_added_at),
         updated_at = CURRENT_TIMESTAMP`
    )
    .bind(groupId, groupTitle, botAddedAt)
    .run();
}

export async function getGroupSettings(
  db: D1Database,
  groupId: string
): Promise<GroupSettings | null> {
  const result = await db
    .prepare('SELECT * FROM GroupSettings WHERE group_id = ?')
    .bind(groupId)
    .first<GroupSettings>();
  return result ?? null;
}

export async function updateWelcomeMessage(
  db: D1Database,
  groupId: string,
  message: string | null
): Promise<void> {
  await db
    .prepare(
      `UPDATE GroupSettings SET welcome_message = ?, updated_at = CURRENT_TIMESTAMP
       WHERE group_id = ?`
    )
    .bind(message, groupId)
    .run();
}

export async function toggleWelcome(
  db: D1Database,
  groupId: string,
  enabled: boolean
): Promise<void> {
  await db
    .prepare(
      `UPDATE GroupSettings SET welcome_enabled = ?, updated_at = CURRENT_TIMESTAMP
       WHERE group_id = ?`
    )
    .bind(enabled ? 1 : 0, groupId)
    .run();
}

export async function insertMember(
  db: D1Database,
  groupId: string,
  tgId: string,
  username: string | null,
  firstName: string | null,
  lastName: string | null,
  joinedAt: string,
  invitorId: string | null,
  invitorUsername: string | null,
  inviteLink: string | null
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO GroupMembers (group_id, tg_id, username, first_name, last_name, joined_at, invitor_id, invitor_username, invite_link)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(group_id, tg_id) DO NOTHING`
    )
    .bind(groupId, tgId, username ?? null, firstName ?? null, lastName ?? null, joinedAt, invitorId, invitorUsername, inviteLink)
    .run();
}

export async function getMemberCount(db: D1Database, groupId: string): Promise<number> {
  const result = await db
    .prepare('SELECT COUNT(*) as count FROM GroupMembers WHERE group_id = ?')
    .bind(groupId)
    .first<{ count: number }>();
  return result?.count ?? 0;
}

export async function getMembersByGroup(
  db: D1Database,
  groupId: string
): Promise<GroupMember[]> {
  const result = await db
    .prepare('SELECT * FROM GroupMembers WHERE group_id = ?')
    .bind(groupId)
    .all<GroupMember>();
  return result.results;
}

export async function addViewer(db: D1Database, tgId: string): Promise<void> {
  await db
    .prepare('INSERT OR IGNORE INTO Viewers (tg_id) VALUES (?)')
    .bind(tgId)
    .run();
}

export async function removeViewer(db: D1Database, tgId: string): Promise<void> {
  await db.prepare('DELETE FROM Viewers WHERE tg_id = ?').bind(tgId).run();
}

export async function isViewer(db: D1Database, tgId: string): Promise<boolean> {
  const result = await db
    .prepare('SELECT 1 FROM Viewers WHERE tg_id = ?')
    .bind(tgId)
    .first();
  return result !== null;
}

export async function getAllGroups(db: D1Database): Promise<GroupSettings[]> {
  const result = await db
    .prepare('SELECT * FROM GroupSettings ORDER BY bot_added_at DESC')
    .all<GroupSettings>();
  return result.results;
}

export async function getAllMembers(db: D1Database): Promise<GroupMember[]> {
  const result = await db
    .prepare('SELECT * FROM GroupMembers ORDER BY joined_at DESC')
    .all<GroupMember>();
  return result.results;
}

export async function getAllViewers(db: D1Database): Promise<Viewer[]> {
  const result = await db
    .prepare('SELECT * FROM Viewers ORDER BY added_at DESC')
    .all<Viewer>();
  return result.results;
}
