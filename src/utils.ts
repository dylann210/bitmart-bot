import type { TelegramUser, TelegramChat } from './types';

export function isAdmin(userId: number, adminIds: string): boolean {
  return adminIds
    .split(',')
    .map((id) => id.trim())
    .includes(String(userId));
}

export function formatMention(user: TelegramUser): string {
  if (user.username) {
    return `@${user.username}`;
  }
  // Inline mention fallback for users without username
  return `[User](tg://user?id=${user.id})`;
}

export function buildWelcomeMessage(
  template: string,
  user: TelegramUser,
  chat: TelegramChat,
  memberCount: number
): string {
  const mention = formatMention(user);
  const groupTitle = chat.title ?? 'nhóm này';

  return template
    .replace(/\{mention\}/g, mention)
    .replace(/\{username\}/g, user.username ? `@${user.username}` : '')
    .replace(/\{tg_id\}/g, String(user.id))
    .replace(/\{group_title\}/g, groupTitle)
    .replace(/\{member_count\}/g, String(memberCount));
}

// Normalize group ID input từ user: đảm bảo có dấu '-' ở đầu
// VD: '1003778466273' → '-1003778466273'
//     '-1003778466273' → '-1003778466273'
export function normalizeGroupId(input: string): string {
  return input.startsWith('-') ? input : `-${input}`;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function unixToISO(unixTimestamp: number): string {
  return new Date(unixTimestamp * 1000).toISOString();
}
