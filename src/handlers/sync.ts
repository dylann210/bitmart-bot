import type { Env } from '../types';
import { getAllGroups, getAllMembers, getAllViewers } from '../db/queries';
import { syncTableToSheets } from '../sheets/api';

const GROUP_MEMBERS_COLS = [
  'id', 'group_id', 'tg_id', 'username', 'first_name', 'last_name',
  'joined_at', 'created_at', 'invitor_id', 'invitor_username', 'invite_link',
];

const GROUP_SETTINGS_COLS = [
  'group_id', 'group_title', 'bot_added_at', 'welcome_message',
  'welcome_enabled', 'updated_at',
];

const VIEWERS_COLS = ['tg_id', 'added_at'];

export async function runSync(env: Env): Promise<string> {
  const [members, settings, viewers] = await Promise.all([
    getAllMembers(env.DB),
    getAllGroups(env.DB),
    getAllViewers(env.DB),
  ]);

  await Promise.all([
    syncTableToSheets(env.GOOGLE_SHEETS_URL, 'GroupMembers', GROUP_MEMBERS_COLS, members),
    syncTableToSheets(env.GOOGLE_SHEETS_URL, 'GroupSettings', GROUP_SETTINGS_COLS, settings),
    syncTableToSheets(env.GOOGLE_SHEETS_URL, 'Viewers', VIEWERS_COLS, viewers),
  ]);

  return `Sync complete: GroupMembers(${members.length}), GroupSettings(${settings.length}), Viewers(${viewers.length})`;
}
