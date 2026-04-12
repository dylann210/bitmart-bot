export interface Env {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN: string;
  ADMIN_TG_IDS: string;
  DEFAULT_WELCOME_MESSAGE: string;
  WELCOME_AUTO_DELETE_SECONDS: string;
  GOOGLE_SHEETS_URL: string;
}

// Telegram types
export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  my_chat_member?: TelegramChatMemberUpdated;
  chat_member?: TelegramChatMemberUpdated;
}

export interface TelegramChatInviteLink {
  invite_link: string;
  creator: TelegramUser;
  name?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  new_chat_members?: TelegramUser[];
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  username?: string;
  first_name: string;
  last_name?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
}

export interface TelegramChatMemberUpdated {
  chat: TelegramChat;
  from: TelegramUser;
  date: number;
  old_chat_member: TelegramChatMember;
  new_chat_member: TelegramChatMember;
  invite_link?: TelegramChatInviteLink;
}

export interface TelegramChatMember {
  user: TelegramUser;
  status: 'creator' | 'administrator' | 'member' | 'restricted' | 'left' | 'kicked';
}

// Database types
export interface GroupMember {
  id: number;
  group_id: string;
  tg_id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  joined_at: string;
  created_at: string;
  invitor_id: string | null;
  invitor_username: string | null;
  invite_link: string | null;
}

export interface GroupSettings {
  group_id: string;
  group_title: string | null;
  bot_added_at: string | null;
  welcome_message: string | null;
  welcome_enabled: number; // 1 = bật, 0 = tắt
  updated_at: string;
}

export interface Viewer {
  tg_id: string;
  added_at: string;
}

